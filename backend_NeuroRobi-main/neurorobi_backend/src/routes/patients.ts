import { Router } from 'express';
import { prisma } from '../shared/db';
import { handleUpload } from '../middleware/upload';
import { authenticate, actor, patientScope, allowedPatient, auditClinical, audit, managerOnly, fail } from '../shared/security';
const router = Router();
router.use(authenticate);
router.get('/', async (_req, res) => { const u = actor(res); await auditClinical(u, 'patients:list'); res.json(await prisma.patient.findMany({ where: patientScope(u), include: { _count: { select: { sessions: true } } }, orderBy: { registeredAt: 'desc' } })); });
router.get('/:id', async (req, res) => { const u = actor(res), id = String(req.params.id); await allowedPatient(u, id); await auditClinical(u, `patient:${id}`); res.json(await prisma.patient.findUnique({ where: { id }, include: { sessions: { select: { id: true, date: true, durationSeconds: true, specialistRole: true, notes: true }, orderBy: { date: 'desc' } } } })); });
router.post('/', async (req, res) => {
    const u = actor(res);
    if (u.accessLevel === 'SUPERADMINISTRADOR' && !u.clinicalRead)
        fail(403, 'Permiso clinico requerido');
    await handleUpload('profileImage')(req, res);
    const { name, age, diagnosis, initialObservation } = req.body || {};
    if (typeof name !== 'string' || !name.trim() || typeof diagnosis !== 'string' || !diagnosis.trim() || !Number.isInteger(Number(age)) || Number(age) < 1 || Number(age) > 120)
        fail(400, 'Completa nombre, diagnostico y edad entre 1 y 120');
    const patient = await prisma.$transaction(async (tx) => { const p = await tx.patient.create({ data: { name: name.trim().slice(0, 150), age: Number(age), diagnosis: diagnosis.trim().slice(0, 2000), initialObservation: typeof initialObservation === 'string' ? initialObservation.slice(0, 10000) : '', institutionId: u.institutionId, profileImageUrl: req.file ? `/uploads/${req.file.filename}` : null, ...(u.accessLevel === 'TERAPEUTA' ? { assignments: { create: { specialistId: u.id } } } : {}) } }); await audit(u, 'PATIENT_CREATE', p.id, 'SUCCESS', tx); return p; });
    res.status(201).json(patient);
});
router.put('/:id', async (req, res) => {
    const u = actor(res), id = String(req.params.id);
    await allowedPatient(u, id);
    await handleUpload('profileImage')(req, res);
    const b = req.body || {}, data: any = {};
    if (b.name !== undefined) {
        if (typeof b.name !== 'string' || !b.name.trim())
            fail(400, 'Nombre requerido');
        data.name = b.name.trim().slice(0, 150);
    }
    if (b.age !== undefined) {
        if (!Number.isInteger(Number(b.age)) || Number(b.age) < 1 || Number(b.age) > 120)
            fail(400, 'Edad invalida');
        data.age = Number(b.age);
    }
    if (b.diagnosis !== undefined) {
        if (typeof b.diagnosis !== 'string' || !b.diagnosis.trim())
            fail(400, 'Diagnostico requerido');
        data.diagnosis = b.diagnosis.trim().slice(0, 2000);
    }
    if (b.initialObservation !== undefined) {
        if (typeof b.initialObservation !== 'string')
            fail(400, 'Observacion invalida');
        data.initialObservation = b.initialObservation.slice(0, 10000);
    }
    if (req.file)
        data.profileImageUrl = `/uploads/${req.file.filename}`;
    const updated = await prisma.$transaction(async (tx) => { const p = await tx.patient.update({ where: { id }, data }); await audit(u, 'PATIENT_UPDATE', id, 'SUCCESS', tx); return p; });
    res.json(updated);
});
router.put('/:id/status', async (req, res) => { const u = actor(res), id = String(req.params.id); await allowedPatient(u, id); const status = req.body?.status; if (!['Listo para Consulta', 'En Sesi\u00f3n', 'Sesi\u00f3n Completada'].includes(status))
    fail(400, 'Estado invalido'); res.json(await prisma.patient.update({ where: { id }, data: { status } })); });
router.delete('/:id', async (req, res) => { const u = actor(res); managerOnly(u); const id = String(req.params.id); await allowedPatient(u, id); await prisma.$transaction(async (tx) => { const sessions = await tx.clinicalSession.findMany({ where: { patientId: id }, select: { id: true } }); const sessionId = { in: sessions.map(s => s.id) }; await tx.spikesLogItem.deleteMany({ where: { sessionId } }); await tx.sensorReading.deleteMany({ where: { sessionId } }); await tx.clinicalSession.deleteMany({ where: { patientId: id } }); await tx.telemetryPacket.deleteMany({ where: { patientId: id } }); await tx.patient.delete({ where: { id } }); await audit(u, 'PATIENT_DELETE', id, 'SUCCESS', tx); }); res.json({ id, message: 'Paciente eliminado' }); });
export default router;
