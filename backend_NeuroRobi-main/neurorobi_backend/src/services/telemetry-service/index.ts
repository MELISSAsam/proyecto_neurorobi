import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { createHash } from 'crypto';
import { Server } from 'socket.io';
import { prisma } from '../../shared/db';
import { authenticate, actor, resolveToken, allowedPatient, patientScope, audit, fail, errorHandler } from '../../shared/security';
import { registerService } from '../../shared/service-utils';
import type { NeuroDevice } from '@prisma/client';
const app = express();
app.use(cors());
app.use(express.json({ limit: '256kb' }));
const server = createServer(app), io = new Server(server, { cors: { origin: '*' } });
const LEASE_MS = Math.max(1000, Number(process.env.THERAPY_LEASE_MS) || 12000);
const deviceRoom = (id: string) => `device:${id}`, patientRoom = (id: string, deviceId: string) => `patient:${id}:device:${deviceId}`;
const clearLease = { leasePatientId: null, leaseOwnerId: null, leaseVersion: null, leaseControllerId: null, leaseExpiresAt: null, previousSqueeze: false, previousLeft: false, previousRight: false, previousShake: false };
const status = (d: NeuroDevice) => ({ deviceId: d.id, deviceType: 'oso', name: d.name, connected: d.active && !!d.lastSeenAt && Date.now() - d.lastSeenAt.getTime() < 6000, therapyActive: !!d.leaseExpiresAt && d.leaseExpiresAt.getTime() > Date.now() });
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
async function deviceForUser(res: express.Response, id: unknown) {
    const u = actor(res), where = { institutionId: u.institutionId, active: true, institution: { active: true } };
    const d = typeof id === 'string' && id ? await prisma.neuroDevice.findFirst({ where: { ...where, id } }) : await prisma.neuroDevice.findFirst({ where, orderBy: { createdAt: 'asc' } });
    if (!d)
        return fail(404, 'Oso no disponible en tu institucion');
    return d;
}
async function validLease(d: NeuroDevice) {
    if (!d.leasePatientId || !d.leaseOwnerId || !d.leaseExpiresAt || d.leaseExpiresAt <= new Date())
        return false;
    const owner = await prisma.specialist.findUnique({ where: { id: d.leaseOwnerId }, include: { institution: true } });
    if (!owner || !owner.active || !owner.institution.active || owner.mustChangePassword || owner.sessionVersion !== d.leaseVersion || owner.institutionId !== d.institutionId)
        return false;
    try {
        await allowedPatient(owner, d.leasePatientId);
        return true;
    }
    catch {
        return false;
    }
}
app.get('/api/telemetry/devices', authenticate, async (_req, res) => {
    const items = await prisma.neuroDevice.findMany({ where: { institutionId: actor(res).institutionId, active: true }, orderBy: { createdAt: 'asc' } });
    res.json(items.map(status));
});
app.get('/api/telemetry/status', authenticate, async (req, res) => res.json(status(await deviceForUser(res, req.query.deviceId))));
app.post('/api/telemetry/control', authenticate, async (req, res) => {
    const u = actor(res), { action, controllerId, patientId, deviceId } = req.body || {};
    if (typeof controllerId !== 'string' || controllerId.length < 8 || controllerId.length > 100 || !['start', 'stop', 'keepalive'].includes(action))
        fail(400, 'Control invalido');
    const result = await prisma.$transaction(async (tx) => {
        const d = await deviceForUser(res, deviceId), active = await validLease(d);
        if (active && (d.leaseOwnerId !== u.id || d.leaseControllerId !== controllerId))
            fail(409, 'Este oso ya esta en uso');
        if (action === 'stop') {
            await tx.neuroDevice.update({ where: { id: d.id }, data: clearLease });
            await audit(u, 'THERAPY_STOP', d.id, 'SUCCESS', tx);
            return { ...status(d), therapyActive: false };
        }
        if (action === 'keepalive') {
            if (!active)
                fail(409, 'La terapia ya no esta activa');
            await tx.neuroDevice.update({ where: { id: d.id }, data: { leaseExpiresAt: new Date(Date.now() + LEASE_MS) } });
            return { ...status(d), therapyActive: true };
        }
        if (typeof patientId !== 'string')
            fail(400, 'Selecciona un paciente');
        await allowedPatient(u, patientId);
        if (!status(d).connected)
            fail(409, 'Conecta el oso antes de empezar');
        if (active && d.leasePatientId !== patientId)
            fail(409, 'Finaliza la terapia anterior');
        const updated = await tx.neuroDevice.updateMany({ where: { id: d.id, active: true, OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: new Date() } }, { leaseOwnerId: u.id, leaseControllerId: controllerId }] }, data: { ...clearLease, leasePatientId: patientId, leaseOwnerId: u.id, leaseVersion: u.sessionVersion, leaseControllerId: controllerId, leaseExpiresAt: new Date(Date.now() + LEASE_MS) } });
        if (updated.count !== 1)
            fail(409, 'Este oso ya esta en uso');
        await audit(u, 'THERAPY_START', d.id, 'SUCCESS', tx);
        return { ...status(d), therapyActive: true };
    });
    io.to(deviceRoom(result.deviceId)).emit('therapy-status', { deviceId: result.deviceId, active: result.therapyActive });
    res.json(result);
});
app.get('/api/stats', authenticate, async (_req, res) => {
    const scope = patientScope(actor(res));
    const [totalPatients, totalSessions, recentSessions] = await Promise.all([prisma.patient.count({ where: scope }), prisma.clinicalSession.count({ where: { patient: scope } }), prisma.clinicalSession.findMany({ where: { patient: scope }, select: { id: true, date: true, durationSeconds: true }, orderBy: { date: 'desc' }, take: 10 })]);
    res.json({ totalPatients, totalSessions, activePatients: 0, recentSessions });
});
// Each device is authenticated here as well as at the gateway. Legacy firmware is identified by its key.
app.post('/api/telemetry', async (req, res) => {
    const key = req.get('x-device-key');
    if (!key || key.length > 256)
        fail(401, 'Credencial de dispositivo requerida');
    if(!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) fail(400,'Paquete JSON requerido');
    const d = await prisma.neuroDevice.findUnique({ where: { keyHash: createHash('sha256').update(key).digest('hex') }, include: { institution: true } });
    const supplied = req.get('x-device-id') || req.body?.deviceId;
    if (!d || !d.active || !d.institution.active || (supplied && supplied !== d.id))
        fail(401, 'Dispositivo no autorizado');
    if (req.body?.deviceType && String(req.body.deviceType).toLowerCase() !== 'oso')
        fail(400, 'Solo se admite el oso');
    await prisma.neuroDevice.update({ where: { id: d.id }, data: { lastSeenAt: new Date() } });
    const s = { ...status({ ...d, lastSeenAt: new Date() }), connected: true };
    io.to(deviceRoom(d.id)).emit('device-status', s);
    const active = await validLease(d);
    if (!active && d.leaseExpiresAt) {
        await prisma.neuroDevice.update({ where: { id: d.id }, data: clearLease });
        io.to(deviceRoom(d.id)).emit('therapy-status', { deviceId: d.id, active: false });
    }
    if (req.body.heartbeat === true || !active) {
        res.json({ status: 'ok', deviceId: d.id, deviceConnected: true, therapyActive: active, stored: false });
        return;
    }
    const raw=req.body;
    const validNumber=(value:unknown)=>typeof value==='number' && Number.isFinite(value);
    if((typeof raw.apreton!=='boolean' && !(validNumber(raw.flexIzq)&&raw.flexIzq>=0&&raw.flexIzq<=4095)) ||
       (typeof raw.switchIzq!=='boolean'&&typeof raw.switch1!=='boolean') ||
       (typeof raw.switchDer!=='boolean'&&typeof raw.switch2!=='boolean') ||
       typeof raw.mpu!=='boolean' ||
       (raw.mpu && (!validNumber(raw.movimiento??raw.shakeIntensity)||(raw.movimiento??raw.shakeIntensity)<0||(raw.movimiento??raw.shakeIntensity)>100)))
        fail(400,'Lectura incompleta o fuera de rango');
    const finite = (value: unknown, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
    const flexIzq = finite(req.body.flexIzq), apreton = typeof req.body.apreton === 'boolean' ? req.body.apreton : flexIzq > 600;
    const switchIzq = typeof req.body.switchIzq === 'boolean' ? req.body.switchIzq : req.body.switch1 === true;
    const switchDer = typeof req.body.switchDer === 'boolean' ? req.body.switchDer : req.body.switch2 === true;
    const mpu = req.body.mpu !== false, movimiento = Math.max(0, Math.min(100, finite(req.body.movimiento ?? req.body.shakeIntensity)));
    const giroX = finite(req.body.giroX ?? req.body.rotationX), giroY = finite(req.body.giroY ?? req.body.rotationY), giroZ = finite(req.body.giroZ ?? req.body.rotationZ);
    const receivedAt = new Date().toISOString(), timestamp = new Date().toLocaleTimeString('en-GB', { timeZone: 'America/Guayaquil' });
    const payload = { deviceId: d.id, deviceType: 'oso', receivedAt, timestamp, flexIzq, apreton, switchIzq, switchDer, mpu, movimiento, accX: finite(req.body.accX), accY: finite(req.body.accY), accZ: finite(req.body.accZ, 1), giroX, giroY, giroZ, hugForce: apreton ? 100 : 0, rotationX: giroX, rotationY: giroY, rotationZ: giroZ, heartRate: -1, switch1: switchIzq, switch2: switchDer, shakeIntensity: movimiento };
    await prisma.$transaction(async (tx) => { await tx.telemetryPacket.create({ data: { deviceId: d.id, patientId: d.leasePatientId, payload: JSON.stringify(payload) } }); await tx.neuroDevice.update({ where: { id: d.id }, data: { previousSqueeze: apreton, previousLeft: switchIzq, previousRight: switchDer, previousShake: mpu && movimiento >= 60 } }); });
    const room = patientRoom(d.leasePatientId!, d.id);
    io.to(room).emit('sensor-data', payload);
    if (apreton && !d.previousSqueeze)
        io.to(room).emit('spike-triggered', { id: `squeeze-${d.id}-${Date.now()}`, deviceType: 'oso', timestamp, type: 'Presion', value: 1, alertText: 'Apreton del estomago registrado.', severity: 'warning' });
    if (mpu && movimiento >= 60 && !d.previousShake)
        io.to(room).emit('spike-triggered', { id: `shake-${d.id}-${Date.now()}`, deviceType: 'oso', timestamp, type: 'Cinematica', value: movimiento, alertText: 'Sacudida fuerte registrada.', severity: 'warning' });
    res.json({ status: 'ok', deviceConnected: true, deviceId: d.id, therapyActive: true, stored: true });
});
io.use(async (socket, next) => { try {
    const u = await resolveToken(socket.handshake.auth.token || '');
    if (u.mustChangePassword)
        fail(403, 'Cambia tu contrasena');
    socket.data.user = u;
    next();
}
catch {
    next(new Error('Sesion invalida o expirada'));
} });
io.on('connection', async (socket) => {
    const u = socket.data.user;
    const devices = await prisma.neuroDevice.findMany({ where: { institutionId: u.institutionId, active: true } });
    for (const d of devices) {
        await socket.join(deviceRoom(d.id));
        socket.emit('device-status', status(d));
        socket.emit('therapy-status', { deviceId: d.id, active: status(d).therapyActive });
    }
    socket.on('start-stream', async (payload: any) => {
        try {
            const user = await resolveToken(socket.handshake.auth.token || '');
            const p = await allowedPatient(user, payload?.patientId);
            const d = await prisma.neuroDevice.findFirst({ where: { ...(payload?.deviceId ? { id: String(payload.deviceId) } : {}), institutionId: p.institutionId, leasePatientId: p.id, leaseOwnerId: user.id } });
            if (!d || !await validLease(d))
                return;
            if (socket.data.patientRoom)
                await socket.leave(socket.data.patientRoom);
            socket.data.patientRoom = patientRoom(p.id, d.id);
            socket.data.deviceId = d.id;
            await socket.join(socket.data.patientRoom);
            socket.emit('device-status', status(d));
        }
        catch {
            socket.disconnect(true);
        }
    });
    socket.on('stop-stream', async () => { if (socket.data.patientRoom)
        await socket.leave(socket.data.patientRoom); socket.data.patientRoom = null; });
});
let checking = false;
setInterval(async () => {
    if (checking)
        return;
    checking = true;
    try {
        // Revalidate idle sockets too, so revocations do not require another user action.
        for (const socket of io.sockets.sockets.values()) {
            try {
                const user = await resolveToken(socket.handshake.auth.token || '');
                if (user.mustChangePassword)
                    throw new Error();
                if (socket.data.patientRoom) {
                    const d = await prisma.neuroDevice.findUnique({ where: { id: socket.data.deviceId } });
                    if (!d || !await validLease(d) || d.leaseOwnerId !== user.id)
                        throw new Error();
                }
            }
            catch {
                socket.disconnect(true);
            }
        }
        const devices = await prisma.neuroDevice.findMany();
        for (const d of devices) {
            const active = await validLease(d);
            if (d.leaseExpiresAt && !active) {
                await prisma.neuroDevice.update({ where: { id: d.id }, data: clearLease });
                io.to(deviceRoom(d.id)).emit('therapy-status', { deviceId: d.id, active: false });
            }
            io.to(deviceRoom(d.id)).emit('device-status', status(d));
        }
    }
    catch (e) {
        console.error('[Telemetry status]', e instanceof Error ? e.message : 'Error');
    }
    finally {
        checking = false;
    }
}, 1000);
app.use(errorHandler);
server.listen(Number(process.env.TELEMETRY_PORT) || 3005, () => registerService('telemetry-service', Number(process.env.TELEMETRY_PORT) || 3005));
