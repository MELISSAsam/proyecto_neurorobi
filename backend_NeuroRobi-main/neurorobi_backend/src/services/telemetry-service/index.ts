import jwt from 'jsonwebtoken';
import { prisma } from '../../shared/db';
import express, { Request, Response } from 'express';
import cors from 'cors';
import axios from 'axios';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import { registerService } from '../../shared/service-utils';
import { PatientClient } from '../../shared/clients/PatientClient';
import { SessionClient } from '../../shared/clients/SessionClient';
import * as dotenv from 'dotenv';

dotenv.config();

const patientClient = new PatientClient();
const sessionClient = new SessionClient();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
  allowRequest: (req, callback) => callback(null, req.headers.origin !== 'https://proyecto-neurorobi-l9b7ucvwf-melissa-chuquis-projects.vercel.app')
});

app.use(cors());
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use(express.json());

// ────────────────────────────────────
// Dashboard Stats  GET /api/stats
// Using Feign Clients to communicate with Patient and Session Services
// ────────────────────────────────────

let previousSqueeze = false;
let previousStrongShake = false;
type DeviceType = 'oso';
const DEVICE_TYPES: DeviceType[] = ['oso'];
const lastTelemetryTime: Record<DeviceType, number> = { oso: 0 };
const deviceConnections: Record<DeviceType, boolean> = { oso: false };
const devicePatientMap: Record<DeviceType, string | null> = { oso: null };

interface PatientStreamPayload {
  patientId: string;
  deviceType: DeviceType;
}

const getPatientRoom = (patientId: string) => `patient:${patientId}`;
interface TherapyLease { patientId: string; ownerId: string; controllerId: string; expiresAt: number; }
let therapyLease: TherapyLease | null = null;
const LEASE_MS = Math.max(1000, Number(process.env.THERAPY_LEASE_MS) || 12000);
const currentTherapy = () => {
  if (therapyLease && Date.now() >= therapyLease.expiresAt) {
    therapyLease = null; devicePatientMap.oso = null;
    io.emit('therapy-status', { active: false });
  }
  return therapyLease;
};
const deviceStatus = () => ({ connected: deviceConnections.oso, therapyActive: Boolean(currentTherapy()) });
const controllerUser = (req: Request): string => {
  const token = req.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  const user = jwt.verify(token || '', process.env.JWT_SECRET || 'neurorobi-secret-key-2026');
  if (typeof user === 'string' || typeof user.id !== 'string') throw new Error('Invalid token');
  const singleUser = process.env.SINGLE_USER_USERNAME?.trim().toLowerCase();
  if (singleUser && user.email !== singleUser) throw new Error('Inactive account');
  return user.id;
};
app.get('/api/telemetry/status', (req, res) => {
  try { controllerUser(req); res.json(deviceStatus()); }
  catch { res.status(401).json({ error: 'Sesion invalida o expirada' }); }
});
app.post('/api/telemetry/control', async (req, res) => {
  let ownerId: string;
  try { ownerId = controllerUser(req); }
  catch { res.status(401).json({ error: 'Sesion invalida o expirada' }); return; }
  const { action, patientId, controllerId } = req.body || {};
  if (typeof controllerId !== 'string' || controllerId.length < 8 || controllerId.length > 100 || !['start','keepalive','stop'].includes(action)) {
    res.status(400).json({ error: 'Control de terapia invalido' }); return;
  }
  const active = currentTherapy();
  if (active && (active.ownerId !== ownerId || active.controllerId !== controllerId)) {
    res.status(409).json({ error: 'NeuroRobi ya esta en uso en otra terapia' }); return;
  }
  if (action === 'stop') {
    therapyLease = null; devicePatientMap.oso = null;
    previousSqueeze = false; previousStrongShake = false;
    io.emit('therapy-status', { active: false });
    res.json({ therapyActive: false }); return;
  }
  if (action === 'keepalive') {
    if (!active) { res.status(409).json({ error: 'La terapia ya no esta activa' }); return; }
    active.expiresAt = Date.now() + LEASE_MS;
    res.json({ therapyActive: true }); return;
  }
  if (!deviceConnections.oso) { res.status(409).json({ error: 'Conecta el peluche antes de empezar' }); return; }
  if (typeof patientId !== 'string') { res.status(400).json({ error: 'Selecciona un paciente' }); return; }
  try {
    const patient = await prisma.patient.findUnique({ where: { id: patientId }, select: { id: true } });
    if (!patient) { res.status(404).json({ error: 'Paciente no encontrado' }); return; }
    // Volver a comprobar despues de la consulta para evitar dos inicios simultaneos.
    const existing = currentTherapy();
    if (existing && (existing.ownerId !== ownerId || existing.controllerId !== controllerId)) { res.status(409).json({error:'NeuroRobi ya esta en uso'}); return; }
    therapyLease = { patientId, ownerId, controllerId, expiresAt: Date.now() + LEASE_MS };
    devicePatientMap.oso = patientId;
    previousSqueeze = false; previousStrongShake = false;
    io.emit('therapy-status', { active: true });
    res.json({ therapyActive: true });
  } catch { res.status(503).json({ error: 'No se pudo iniciar la terapia' }); }
});

app.get('/api/stats', async (_req: Request, res: Response) => {
  try {
    // Using Feign Clients to get data from other services
    const [totalPatients, activePatients, sessionStats] = await Promise.all([
      patientClient.count(),
      patientClient.countByStatus('En Sesión'),
      sessionClient.getStats()
    ]);

    res.json({
      totalPatients,
      totalSessions: sessionStats.totalSessions,
      activePatients,
      recentSessions: sessionStats.recentSessions
    });
  } catch (error) {
    console.error('[GET /api/stats]', error);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

// Proxy/Poll endpoint for direct ESP32 connection
app.get('/api/telemetry/poll-esp32', async (req: Request, res: Response) => {
  const ip = String(req.query.ip || '192.168.4.1');
  try {
    const response = await axios.get(`http://${ip}/datos`, { timeout: 2000 });
    res.json(response.data);
  } catch (err: any) {
    res.status(502).json({ error: 'No se pudo contactar al ESP32', message: err.message });
  }
});

// HTTP POST endpoint for ESP32 telemetry (Oso NeuroRobi)
app.post('/api/telemetry', async (req: Request, res: Response) => {
  const rawType = String(req.body.deviceType || 'oso').toLowerCase();
  if (rawType !== 'oso') { res.status(400).json({ error: 'Solo se admite el oso' }); return; }
  const deviceType: DeviceType = 'oso';

  // En espera solo se confirma conexion; no se normaliza, almacena ni emite una lectura.
  lastTelemetryTime.oso = Date.now();
  if (!deviceConnections.oso) {
    deviceConnections.oso = true;
    io.emit('device-status', { deviceType: 'oso', connected: true });
  }
  const activeTherapy = currentTherapy();
  if (req.body.heartbeat === true || !activeTherapy) {
    res.json({ status: 'ok', deviceConnected: true, therapyActive: Boolean(activeTherapy), stored: false }); return;
  }

  // 1. Flex Apretón (GPIO 32): flexIzq (ADC), apreton (bool > 600)
  const flexIzq = typeof req.body.flexIzq !== 'undefined'
    ? Number(req.body.flexIzq)
    : Number(req.body.hugForce || 0);
  const apreton = typeof req.body.apreton !== 'undefined'
    ? Boolean(req.body.apreton)
    : flexIzq > 600;

  // 3. Finales de Carrera: switchIzq (GPIO 18), switchDer (GPIO 19)
  const switchIzq = typeof req.body.switchIzq !== 'undefined' ? Boolean(req.body.switchIzq) : Boolean(req.body.switch1);
  const switchDer = typeof req.body.switchDer !== 'undefined' ? Boolean(req.body.switchDer) : Boolean(req.body.switch2);

  // 4. MPU6050: mpu, accX, accY, accZ, giroX, giroY, giroZ, movimiento (0-100)
  const mpu = typeof req.body.mpu !== 'undefined' ? Boolean(req.body.mpu) : true;
  const accX = Number(req.body.accX || 0);
  const accY = Number(req.body.accY || 0);
  const accZ = typeof req.body.accZ !== 'undefined' ? Number(req.body.accZ) : 1.0;
  const giroX = typeof req.body.giroX !== 'undefined' ? Number(req.body.giroX) : Number(req.body.rotationX || 0);
  const giroY = typeof req.body.giroY !== 'undefined' ? Number(req.body.giroY) : Number(req.body.rotationY || 0);
  const giroZ = typeof req.body.giroZ !== 'undefined' ? Number(req.body.giroZ) : Number(req.body.rotationZ || 0);

  const movimiento = typeof req.body.movimiento !== 'undefined'
    ? Number(req.body.movimiento)
    : (typeof req.body.shakeIntensity !== 'undefined'
        ? Number(req.body.shakeIntensity)
        : Math.min(100, Math.max(0, Number((Math.sqrt(giroX * giroX + giroY * giroY + giroZ * giroZ) / 3.0).toFixed(1)))));

  // Mapeo retrocompatible
  const hForce = apreton ? 100 : 0;
  const hRate = -1; // Este hardware no mide frecuencia cardiaca.

  // Mark device as connected and update timestamp
  lastTelemetryTime[deviceType] = Date.now();
  if (!deviceConnections[deviceType]) {
    deviceConnections[deviceType] = true;
    console.log(`[Telemetry] ${deviceType.toUpperCase()} conectado y transmitiendo datos vía HTTP POST`);
  }

  const nowStr = new Date().toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });

  const dataPayload = {
    timestamp: nowStr,
    receivedAt: new Date().toISOString(),
    deviceType,
    // Métricas del Oso NeuroRobi
    flexIzq,
    apreton,
    switchIzq,
    switchDer,
    mpu,
    accX,
    accY,
    accZ,
    giroX,
    giroY,
    giroZ,
    movimiento,
    // Retrocompatibilidad
    hugForce: hForce,
    rotationX: giroX,
    rotationY: giroY,
    rotationZ: giroZ,
    heartRate: hRate,
    switch1: switchIzq,
    switch2: switchDer,
    shakeIntensity: movimiento
  };

  try {
    await prisma.telemetryPacket.create({ data: { patientId: activeTherapy.patientId, payload: JSON.stringify(dataPayload) } });
  } catch (error) {
    console.error('[Telemetry storage]', error);
    res.status(503).json({ error: 'No se pudo almacenar la lectura' });
    return;
  }

  const targetPatientId = activeTherapy.patientId;
  if (targetPatientId) {
    const targetRoom = getPatientRoom(targetPatientId);
    io.to(targetRoom).emit('sensor-data', dataPayload);
    io.to(targetRoom).emit('device-status', { deviceType, connected: true });
  } else {
    io.emit('sensor-data', dataPayload);
    io.emit('device-status', { deviceType, connected: true });
  }

  // Spikes clínicos basados en el Oso
  if (apreton && !previousSqueeze) {
    io.to(getPatientRoom(activeTherapy.patientId)).emit('spike-triggered', {
      id: `spk-real-press-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      deviceType,
      timestamp: nowStr,
      type: 'Presión',
      value: flexIzq,
      alertText: `Apretón Afectivo en Oso: ADC ${flexIzq} (Umbral > 600). Estímulo táctil/propioceptivo registrado.`,
      severity: 'warning'
    });
  }

  if (mpu && movimiento >= 60 && !previousStrongShake) {
    io.to(getPatientRoom(activeTherapy.patientId)).emit('spike-triggered', {
      id: `spk-real-rot-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      deviceType,
      timestamp: nowStr,
      type: 'Cinemática',
      value: Math.round(movimiento),
      alertText: `Sacudida fuerte del peluche (intensidad aproximada ${Math.round(movimiento / 10)}/10).`,
      severity: 'warning'
    });
  }


  previousSqueeze = apreton;
  previousStrongShake = mpu && movimiento >= 60;
  res.status(200).json({ status: 'ok', deviceConnected: true, therapyActive: Boolean(currentTherapy()), stored: true });
});

const HEARTBEAT_TIMEOUT_MS = 6000;
const HEARTBEAT_CHECK_INTERVAL_MS = 500;

// Periodic heartbeat checker: runs every second
setInterval(() => {
  const now = Date.now();
  currentTherapy();
  DEVICE_TYPES.forEach(deviceType => {
    if (deviceConnections[deviceType] && now - lastTelemetryTime[deviceType] > HEARTBEAT_TIMEOUT_MS) {
      deviceConnections[deviceType] = false;
      console.log(`[Heartbeat] ${deviceType.toUpperCase()} connection lost (no data for ${HEARTBEAT_TIMEOUT_MS / 1000}s)`);
      io.emit('device-status', { deviceType, connected: false });
    }
  });
}, HEARTBEAT_CHECK_INTERVAL_MS);

io.use((socket, next) => {
  try {
    if (socket.handshake.headers.origin === 'https://proyecto-neurorobi-l9b7ucvwf-melissa-chuquis-projects.vercel.app') throw new Error('Version antigua');
    const user = jwt.verify(socket.handshake.auth.token, process.env.JWT_SECRET || 'neurorobi-secret-key-2026');
    const singleUser = process.env.SINGLE_USER_USERNAME?.trim().toLowerCase();
    if (singleUser && (typeof user === 'string' || user.email !== singleUser)) throw new Error('Inactive account');
    if (typeof user === 'string' || !user.id) throw new Error('Invalid user');
    socket.data.userId = user.id;
    next();
  } catch {
    next(new Error('Sesion invalida o expirada'));
  }
});

io.on('connection', (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);
  socket.emit('device-status', { deviceType: 'oso', connected: deviceConnections.oso });
  socket.emit('therapy-status', { active: Boolean(currentTherapy()) });

  socket.on('start-stream', (payload: PatientStreamPayload) => {
    const { patientId } = payload || {};
    const active = currentTherapy();
    if (!active || active.patientId !== patientId || active.ownerId !== socket.data.userId) return;
    const deviceType: DeviceType = 'oso';
    const patientRoom = getPatientRoom(patientId);

    console.log(`[Socket] Starting telemetry stream for patient: ${patientId}, device: ${deviceType}`);

    if (socket.data.patientRoom && socket.data.patientRoom !== patientRoom) {
      socket.leave(socket.data.patientRoom);
    }

    socket.join(patientRoom);
    socket.data.patientId = patientId;
    socket.data.patientRoom = patientRoom;
    socket.data.deviceType = deviceType;
    devicePatientMap[deviceType] = patientId;

    DEVICE_TYPES.forEach(statusDeviceType => {
      socket.emit('device-status', { deviceType: statusDeviceType, connected: deviceConnections[statusDeviceType] });
    });
  });

  const cleanupPatientStream = async (socket: Socket) => {
    const patientRoom = socket.data.patientRoom as string | undefined;
    const deviceType = socket.data.deviceType as DeviceType | undefined;

    if (patientRoom && deviceType) {
      socket.leave(patientRoom);
      const remaining = await io.in(patientRoom).allSockets();
      if (remaining.size === 0) {
        if (!currentTherapy()) devicePatientMap[deviceType] = null;
      }
    }
  };

  socket.on('stop-stream', async () => {
    console.log(`[Socket] Stream stopped by client: ${socket.id}`);
    await cleanupPatientStream(socket);
  });

  socket.on('disconnect', async () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
    await cleanupPatientStream(socket);
  });
});

const PORT = process.env.TELEMETRY_PORT || 3005;

httpServer.listen(PORT, () => {
  console.log(`[Telemetry Service] Running on port ${PORT}`);
  registerService('telemetry-service', Number(PORT));
});
