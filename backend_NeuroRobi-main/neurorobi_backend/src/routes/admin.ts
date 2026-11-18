import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomBytes, createHash } from 'crypto';
import { prisma } from '../shared/db';
import { authenticate, actor, superOnly, managerOnly, institutionScope, audit, fail, multiUserEnabled } from '../shared/security';
const router = Router();
router.use(authenticate);
const levels = ['SUPERADMINISTRADOR', 'ADMINISTRADOR', 'TERAPEUTA'];
const specialties = ['PSICOLOGIA_CLINICA', 'FISIOTERAPIA', 'EDUCACION_ESPECIAL'];
const userSelect = { id: true, name: true, email: true, role: true, accessLevel: true, institutionId: true, active: true, clinicalRead: true, mustChangePassword: true, createdAt: true, lastLoginAt: true } as const;
const clean = (v: unknown, max = 150) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const pageOf = (q: any) => Math.max(1, Math.min(100000, Math.floor(Number(q.page)) || 1));
const hash = (key: string) => createHash('sha256').update(key).digest('hex');
async function validInstitution(id: string) { const i = await prisma.institution.findUnique({ where: { id } }); if (!i?.active)
    fail(400, 'Selecciona una institucion activa'); }
router.use((req, res, next) => {
    const u = actor(res);
    res.on('finish', () => { if (res.statusCode >= 400)
        void audit(u, `${req.method}_DENIED`, req.path, `HTTP_${res.statusCode}`).catch(() => { }); });
    managerOnly(u);
    next();
});
router.get('/users', async (req, res) => {
    const u = actor(res), institutionId = institutionScope(u, clean(req.query.institutionId));
    const q = clean(req.query.q), level = clean(req.query.level), active = req.query.active;
    const where: any = { ...(institutionId ? { institutionId } : {}), ...(q ? { OR: [{ name: { contains: q } }, { email: { contains: q } }] } : {}), ...(levels.includes(level) ? { accessLevel: level } : {}), ...(active === 'true' || active === 'false' ? { active: active === 'true' } : {}) };
    const page = pageOf(req.query);
    const [items, total] = await Promise.all([prisma.specialist.findMany({ where, select: userSelect, orderBy: { createdAt: 'desc' }, skip: (page - 1) * 25, take: 25 }), prisma.specialist.count({ where })]);
    res.json({ items, total, page });
});
router.post('/users', async (req, res) => {
    const u = actor(res), body = req.body || {};
    const accessLevel = clean(body.accessLevel), email = clean(body.email, 254).toLowerCase(), name = clean(body.name), password = body.password;
    if (!name || !/^\S+@\S+\.\S+$/.test(email) || !levels.includes(accessLevel) || typeof password !== 'string' || password.length < 12 || password.length > 128)
        fail(400, 'Completa nombre, correo, rol y contrasena temporal de 12 a 128 caracteres');
    if (u.accessLevel !== 'SUPERADMINISTRADOR' && accessLevel !== 'TERAPEUTA')
        fail(403, 'Solo puedes crear terapeutas');
    const institutionId = institutionScope(u, clean(body.institutionId)) || u.institutionId;
    await validInstitution(institutionId);
    const role = accessLevel === 'TERAPEUTA' ? clean(body.role) : 'ADMIN';
    if (accessLevel === 'TERAPEUTA' && !specialties.includes(role))
        fail(400, 'Selecciona especialidad');
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await prisma.$transaction(async (tx) => { const user = await tx.specialist.create({ data: { name, email, password: passwordHash, role: role as any, accessLevel: accessLevel as any, institutionId, active: body.active !== false, mustChangePassword: true, temporaryPasswordExpiresAt: new Date(Date.now() + 86400000) }, select: userSelect }); await audit(u, 'USER_CREATE', user.id, 'SUCCESS', tx, institutionId); return user; });
    res.status(201).json(result);
});
router.patch('/users/:id', async (req, res) => {
    const u = actor(res), id = String(req.params.id), body = req.body || {};
    const result = await prisma.$transaction(async (tx) => {
        const target = await tx.specialist.findUnique({ where: { id } });
        if (!target)
            return fail(404, 'Usuario no disponible');
        if (u.accessLevel !== 'SUPERADMINISTRADOR' && (target.institutionId !== u.institutionId || target.accessLevel !== 'TERAPEUTA'))
            fail(403, 'Usuario no autorizado');
        const data: any = { sessionVersion: { increment: 1 } };
        if (body.name !== undefined) {
            data.name = clean(body.name);
            if (!data.name)
                fail(400, 'Nombre requerido');
        }
        if (body.email !== undefined) {
            data.email = clean(body.email, 254).toLowerCase();
            const primary=process.env.SINGLE_USER_USERNAME?.trim().toLowerCase();
            if(target.email===primary&&data.email!==target.email&&!await multiUserEnabled())fail(409,'Activa el modo multiusuario antes de cambiar el identificador principal');
            if (data.email !== target.email && !/^\S+@\S+\.\S+$/.test(data.email))
                fail(400, 'Correo invalido');
        }
        if (body.active !== undefined) {
            if (typeof body.active !== 'boolean')
                fail(400, 'Estado invalido');
            data.active = body.active;
        }
        if (body.accessLevel !== undefined) {
            if (!levels.includes(body.accessLevel))
                fail(400, 'Rol invalido');
            if (u.accessLevel !== 'SUPERADMINISTRADOR' && body.accessLevel !== 'TERAPEUTA')
                fail(403, 'Rol no autorizado');
            data.accessLevel = body.accessLevel;
        }
        if (body.clinicalRead !== undefined) {
            superOnly(u);
            if (typeof body.clinicalRead !== 'boolean')
                fail(400, 'Permiso invalido');
            data.clinicalRead = body.clinicalRead;
        }
        if (body.institutionId && body.institutionId !== target.institutionId) {
            superOnly(u);
            await validInstitution(body.institutionId);
            if (await tx.patientAssignment.count({ where: { specialistId: id } }))
                fail(409, 'Retira las asignaciones antes de cambiar de institucion');
            data.institutionId = body.institutionId;
        }
        const finalLevel = data.accessLevel || target.accessLevel;
        if (finalLevel === 'TERAPEUTA') {
            const role = body.role || target.role;
            if (!specialties.includes(role))
                fail(400, 'Selecciona especialidad');
            data.role = role;
        }
        else
            data.role = 'ADMIN';
        if (target.accessLevel === 'SUPERADMINISTRADOR' && target.active && (data.active === false || finalLevel !== 'SUPERADMINISTRADOR')) {
            if (await tx.specialist.count({ where: { accessLevel: 'SUPERADMINISTRADOR', active: true, institution: { active: true } } }) <= 1)
                fail(409, 'Debe permanecer un Superadministrador activo');
        }
        const updated = await tx.specialist.update({ where: { id }, data, select: userSelect });
        await audit(u, 'USER_UPDATE_ROLE_STATE', id, 'SUCCESS', tx, updated.institutionId);
        return updated;
    });
    res.json(result);
});
router.post('/users/:id/reset', async (req, res) => {
    const u = actor(res), id = String(req.params.id), password = req.body?.password;
    if (typeof password !== 'string' || password.length < 12 || password.length > 128)
        fail(400, 'La contrasena temporal requiere de 12 a 128 caracteres');
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.$transaction(async (tx) => {
        const target = await tx.specialist.findUnique({ where: { id } });
        if (!target)
            return fail(404, 'Usuario no disponible');
        if (u.accessLevel !== 'SUPERADMINISTRADOR' && (target.institutionId !== u.institutionId || target.accessLevel !== 'TERAPEUTA'))
            fail(403, 'Usuario no autorizado');
        await tx.specialist.update({ where: { id }, data: { password: passwordHash, mustChangePassword: true, temporaryPasswordExpiresAt: new Date(Date.now() + 86400000), sessionVersion: { increment: 1 } } });
        await audit(u, 'USER_RESET_ACCESS', id, 'SUCCESS', tx, target.institutionId);
    });
    res.json({ message: 'Acceso temporal valido durante 24 horas. Entrega la contrasena por un canal privado.' });
});
router.get('/institutions', async (req, res) => {
    const u = actor(res), id = institutionScope(u, clean(req.query.institutionId)), page = pageOf(req.query), where = id ? { id } : {};
    const [items, total] = await Promise.all([prisma.institution.findMany({ where, include: { _count: { select: { users: true, patients: true, devices: true } } }, orderBy: { name: 'asc' }, skip: (page - 1) * 25, take: 25 }), prisma.institution.count({ where })]);
    res.json({ items, total, page });
});
router.post('/institutions', async (req, res) => { const u = actor(res); superOnly(u); const name = clean(req.body?.name); if (!name)
    fail(400, 'Nombre requerido'); const i = await prisma.$transaction(async (tx) => { const i = await tx.institution.create({ data: { name, contact: clean(req.body?.contact, 300) } }); await audit(u, 'INSTITUTION_CREATE', i.id, 'SUCCESS', tx, i.id); return i; }); res.status(201).json(i); });
router.patch('/institutions/:id', async (req, res) => {
    const u = actor(res);
    superOnly(u);
    const id = String(req.params.id), b = req.body || {}, data: any = {};
    if (b.name !== undefined) {
        data.name = clean(b.name);
        if (!data.name)
            fail(400, 'Nombre requerido');
    }
    if (b.contact !== undefined)
        data.contact = clean(b.contact, 300);
    if (b.active !== undefined) {
        if (typeof b.active !== 'boolean')
            fail(400, 'Estado invalido');
        data.active = b.active;
    }
    const i = await prisma.$transaction(async (tx) => {
        if (b.active === false && await tx.specialist.count({ where: { institutionId: id, active: true, accessLevel: 'SUPERADMINISTRADOR' } }) > 0) {
            if (await tx.specialist.count({ where: { institutionId: { not: id }, active: true, accessLevel: 'SUPERADMINISTRADOR', institution: { active: true } } }) === 0)
                fail(409, 'La institucion contiene al ultimo Superadministrador activo');
        }
        const value = await tx.institution.update({ where: { id }, data });
        if (b.active !== undefined)
            await tx.specialist.updateMany({ where: { institutionId: id }, data: { sessionVersion: { increment: 1 } } });
        await audit(u, 'INSTITUTION_UPDATE', id, 'SUCCESS', tx, id);
        return value;
    });
    res.json(i);
});
router.get('/assignments', async (req, res) => {
    const u = actor(res);
    if (u.accessLevel === 'SUPERADMINISTRADOR' && !u.clinicalRead)
        fail(403, 'Permiso clinico requerido para consultar asignaciones');
    const institutionId = u.accessLevel === 'SUPERADMINISTRADOR' ? u.institutionId : institutionScope(u, clean(req.query.institutionId)) || u.institutionId;
    const patientPage = pageOf({ page: req.query.patientPage }), therapistPage = pageOf({ page: req.query.therapistPage });
    const patientQuery = clean(req.query.patientQuery), therapistQuery = clean(req.query.therapistQuery);
    const pw = { institutionId, ...(patientQuery ? { name: { contains: patientQuery } } : {}) };
    const tw = { institutionId, accessLevel: 'TERAPEUTA' as const, active: true, ...(therapistQuery ? { name: { contains: therapistQuery } } : {}) };
    const [patients, therapists, patientTotal, therapistTotal] = await Promise.all([prisma.patient.findMany({ where: pw, select: { id: true, name: true, assignments: { select: { specialistId: true } } }, skip: (patientPage - 1) * 25, take: 25, orderBy: { name: 'asc' } }), prisma.specialist.findMany({ where: tw, select: { id: true, name: true }, skip: (therapistPage - 1) * 25, take: 25, orderBy: { name: 'asc' } }), prisma.patient.count({ where: pw }), prisma.specialist.count({ where: tw })]);
    res.json({ patients, therapists, patientTotal, therapistTotal, patientPage, therapistPage });
});
router.put('/assignments', async (req, res) => {
    const u = actor(res), { patientId, specialistId, assigned } = req.body || {};
    if (u.accessLevel === 'SUPERADMINISTRADOR' && !u.clinicalRead)
        fail(403, 'Permiso clinico requerido');
    if (typeof patientId !== 'string' || typeof specialistId !== 'string' || typeof assigned !== 'boolean')
        fail(400, 'Asignacion invalida');
    await prisma.$transaction(async (tx) => { const p = await tx.patient.findUnique({ where: { id: patientId } }), s = await tx.specialist.findUnique({ where: { id: specialistId } }); if (!p || !s || s.accessLevel !== 'TERAPEUTA' || p.institutionId !== s.institutionId)
        fail(400, 'Paciente y terapeuta deben pertenecer a la misma institucion'); institutionScope(u, p!.institutionId); if (u.accessLevel === 'SUPERADMINISTRADOR' && p!.institutionId !== u.institutionId)
        fail(403, 'Permiso clinico limitado a tu institucion'); if (assigned)
        await tx.patientAssignment.upsert({ where: { patientId_specialistId: { patientId, specialistId } }, create: { patientId, specialistId }, update: {} });
    else
        await tx.patientAssignment.deleteMany({ where: { patientId, specialistId } }); await audit(u, assigned ? 'PATIENT_ASSIGN' : 'PATIENT_UNASSIGN', `${patientId}:${specialistId}`, 'SUCCESS', tx, p!.institutionId); });
    res.json({ ok: true });
});
router.get('/devices', async (req, res) => {
    const u = actor(res), institutionId = institutionScope(u, clean(req.query.institutionId)), page = pageOf(req.query), where = institutionId ? { institutionId } : {};
    const [items, total] = await Promise.all([prisma.neuroDevice.findMany({ where, select: { id: true, name: true, institutionId: true, active: true, lastSeenAt: true, leaseExpiresAt: true, createdAt: true }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * 25, take: 25 }), prisma.neuroDevice.count({ where })]);
    res.json({ items: items.map(d => ({ ...d, connected: !!d.lastSeenAt && Date.now() - d.lastSeenAt.getTime() < 6000, therapyActive: !!d.leaseExpiresAt && d.leaseExpiresAt.getTime() > Date.now() })), total, page });
});
router.post('/devices', async (req, res) => {
    const u = actor(res);
    superOnly(u);
    const id = clean(req.body?.id, 64), name = clean(req.body?.name), institutionId = clean(req.body?.institutionId) || u.institutionId;
    if (!/^[a-zA-Z0-9_-]{3,64}$/.test(id) || !name)
        fail(400, 'Identificador de 3 a 64 letras, numeros o guiones y nombre requeridos');
    await validInstitution(institutionId);
    const deviceKey = randomBytes(32).toString('hex');
    await prisma.$transaction(async (tx) => { await tx.neuroDevice.create({ data: { id, name, institutionId, keyHash: hash(deviceKey) } }); await audit(u, 'DEVICE_CREATE', id, 'SUCCESS', tx, institutionId); });
    res.status(201).json({ id, deviceKey, message: 'Guarda esta clave en el firmware. Solo se muestra una vez.' });
});
router.patch('/devices/:id', async (req, res) => {
    const u = actor(res);
    superOnly(u);
    const id = String(req.params.id), b = req.body || {}, data: any = {};
    if (b.name !== undefined) {
        data.name = clean(b.name);
        if (!data.name)
            fail(400, 'Nombre requerido');
    }
    if (b.active !== undefined) {
        if (typeof b.active !== 'boolean')
            fail(400, 'Estado invalido');
        data.active = b.active;
    }
    if (b.institutionId) {
        await validInstitution(b.institutionId);
        data.institutionId = b.institutionId;
    }
    await prisma.$transaction(async (tx) => { const d = await tx.neuroDevice.findUnique({ where: { id } }); if (!d)
        fail(404, 'Dispositivo no disponible'); if (d!.leaseExpiresAt && d!.leaseExpiresAt > new Date())
        fail(409, 'Finaliza la terapia antes de modificar el oso'); await tx.neuroDevice.update({ where: { id }, data }); await audit(u, 'DEVICE_UPDATE', id, 'SUCCESS', tx, data.institutionId || d!.institutionId); });
    res.json({ ok: true });
});
router.post('/devices/:id/rotate-key', async (req, res) => { const u = actor(res); superOnly(u); const id = String(req.params.id), deviceKey = randomBytes(32).toString('hex'); await prisma.$transaction(async (tx) => { const d = await tx.neuroDevice.findUnique({ where: { id } }); if (!d)
    fail(404, 'Dispositivo no disponible'); if (d!.leaseExpiresAt && d!.leaseExpiresAt > new Date())
    fail(409, 'Finaliza la terapia'); await tx.neuroDevice.update({ where: { id }, data: { keyHash: hash(deviceKey) } }); await audit(u, 'DEVICE_KEY_ROTATE', id, 'SUCCESS', tx, d!.institutionId); }); res.json({ deviceKey }); });
router.get('/audit', async (req, res) => { const u = actor(res); superOnly(u); const institutionId = clean(req.query.institutionId), q = clean(req.query.q), page = pageOf(req.query); const where: any = { ...(institutionId ? { institutionId } : {}), ...(q ? { OR: [{ action: { contains: q } }, { actorName: { contains: q } }, { resource: { contains: q } }] } : {}) }; const [items, total] = await Promise.all([prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * 25, take: 25 }), prisma.auditLog.count({ where })]); res.json({ items, total, page }); });
router.get('/settings', async (_req, res) => { superOnly(actor(res)); res.json({ items: await prisma.platformSetting.findMany(), multiUserEnabled: await multiUserEnabled() }); });
router.put('/settings',async(req,res)=>{
    const u=actor(res);superOnly(u);const {key,value}=req.body||{};
    if(key==='sessionHours') {
        if(!Number.isInteger(Number(value))||Number(value)<1||Number(value)>24)fail(400,'Duracion de sesion: de 1 a 24 horas');
    } else if(key==='multiUserEnabled') {
        if(typeof value!=='boolean')fail(400,'Estado de acceso invalido');
        if(!value){const primary=process.env.SINGLE_USER_USERNAME?.trim().toLowerCase();if(!primary||primary!==u.email)fail(409,'Solo la cuenta principal puede volver al acceso unico');}
    } else fail(400,'Configuracion no autorizada');
    await prisma.$transaction(async tx=>{
        await tx.platformSetting.upsert({where:{key},create:{key,value:String(value)},update:{value:String(value)}});
        if(key==='multiUserEnabled')await tx.specialist.updateMany({data:{sessionVersion:{increment:1}}});
        await audit(u,'SETTING_UPDATE',key,'SUCCESS',tx);
    });
    res.json({ok:true,...(key==='multiUserEnabled'?{message:'Modo de acceso actualizado. Vuelve a iniciar sesion.'}:{})});
});
router.get('/overview', async (req, res) => {
    const u = actor(res), institutionId = institutionScope(u, clean(req.query.institutionId)), from = clean(req.query.from), to = clean(req.query.to), date: any = {};
    if (from) {
        const d = new Date(`${from}T00:00:00-05:00`);
        if (!Number.isFinite(d.getTime()))
            fail(400, 'Fecha invalida');
        date.gte = d;
    }
    if (to) {
        const d = new Date(`${to}T23:59:59.999-05:00`);
        if (!Number.isFinite(d.getTime()))
            fail(400, 'Fecha invalida');
        date.lte = d;
    }
    if (date.gte && date.lte && date.gte > date.lte)
        fail(400, 'Rango de fechas invalido');
    const uw = institutionId ? { institutionId } : {}, sw: any = { ...(institutionId ? { patient: { institutionId } } : {}), ...(from || to ? { date } : {}) };
    const [users, patients, sessions, devices, institutions, recent, activity, totals, byInstitution] = await Promise.all([
        prisma.specialist.groupBy({ by: ['accessLevel', 'active'], where: uw, _count: { _all: true } }), prisma.patient.count({ where: uw }), prisma.clinicalSession.count({ where: sw }), prisma.neuroDevice.findMany({ where: uw, select: { id: true, name: true, active: true, lastSeenAt: true, leaseExpiresAt: true } }), prisma.institution.findMany({ where: institutionId ? { id: institutionId } : {}, select: { id: true, name: true, active: true } }), prisma.clinicalSession.findMany({ where: sw, select: { id: true, date: true, durationSeconds: true, deviceId: true, pulses: true, squeezes: true, shakes: true, _count: { select: { sensorHistory: true } }, patient: { select: { institutionId: true } } }, orderBy: { date: 'desc' }, take: 15 }), prisma.auditLog.findMany({ where: uw, orderBy: { createdAt: 'desc' }, take: 10 }), prisma.clinicalSession.aggregate({ where: sw, _sum: { pulses: true, squeezes: true, shakes: true } }), prisma.clinicalSession.findMany({ where: sw, select: { date: true, patient: { select: { institutionId: true } } } })
    ]);
    const grouped = new Map<string, number>(), daily = new Map<string, number>();
    for (const s of byInstitution) {
        grouped.set(s.patient.institutionId, (grouped.get(s.patient.institutionId) || 0) + 1);
        const day = s.date.toLocaleDateString('sv-SE', { timeZone: 'America/Guayaquil' });
        daily.set(day, (daily.get(day) || 0) + 1);
    }
    res.json({ users: users.map(g => ({ ...g, _count: g._count._all })), patients, sessions, institutions, devices: devices.map(d => ({ ...d, connected: !!d.lastSeenAt && Date.now() - d.lastSeenAt.getTime() < 6000, therapyActive: !!d.leaseExpiresAt && d.leaseExpiresAt > new Date() })), recent: recent.map(({ patient, ...s }) => ({ ...s, institutionId: patient.institutionId })), activity, interactions: totals._sum, byInstitution: institutions.map(i => ({ name: i.name, sessions: grouped.get(i.id) || 0 })), byDay: [...daily].sort(([a], [b]) => a.localeCompare(b)).map(([date, sessions]) => ({ date, sessions })) });
});
export default router;
