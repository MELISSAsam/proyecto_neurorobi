import { authenticate,actor,patientScope,allowedPatient,auditClinical,audit,managerOnly,fail } from '../shared/security';
import { analyze } from '../shared/interactions';
import { Router, Request, Response } from 'express';
import { prisma } from '../shared/db';

const router = Router();
router.use(authenticate);
// Helper function to map flat Prisma metrics into a nested metrics object expected by the frontend
const normalizeDeviceType = (type: any): 'oso' => {
  return 'oso';
};

const normalizeDeviceTypeForPrisma = (type: any): 'OSO' => {
  return 'OSO';
};

function mapSessionResponse(session: any) {
  if (!session) return null;
  return {
    id: session.id,
    patientId: session.patientId,
    deviceId: session.deviceId,
    patientName: session.patientName,
    date: session.date,
    durationSeconds: session.durationSeconds,
    specialistRole: session.specialistRole,
    specialistId: session.specialistId,
    specialistName: session.specialist?.name,
    notes: session.notes,
    deviceType: normalizeDeviceType(session.deviceType),
    sensorHistory: (session.sensorHistory || []).map((reading: any) => ({
      ...reading,
      ...(reading.payload ? JSON.parse(reading.payload) : {}),
      deviceType: normalizeDeviceType(reading.deviceType)
    })),
    spikesLog: (session.spikesLog || []).map((spike: any) => ({
      ...spike,
      deviceType: normalizeDeviceType(spike.deviceType)
    })),
    metrics: {
      avgHeartRate: session.avgHeartRate,
      maxHeartRate: session.maxHeartRate,
      minHeartRate: session.minHeartRate,
      avgHugForce: session.avgHugForce,
      maxHugForce: session.maxHugForce,
      comfortIndex: session.comfortIndex,
      bilateralSync: session.bilateralSync,
      motorFatigueScore: session.motorFatigueScore,
      stereotypicalCount: session.stereotypicalCount,
      calmStatePercentage: session.calmStatePercentage,
      spikesCount: session.spikesCount
    }
  };
}

// ──────────────────────────────────────────
// GET /api/sessions  → All sessions (opt. filter by patientId)
// ──────────────────────────────────────────
router.get('/', async (req: Request, res: Response) => {
  try {
    const patientId = req.query['patientId'] ? String(req.query['patientId']) : undefined;

    const sessions = await prisma.clinicalSession.findMany({
      where: {patient:patientScope(actor(res)), ...(patientId?{patientId}:{})},
      include: {
        specialist: { select: { name: true } },
        sensorHistory: true,
        spikesLog: true
      },
      orderBy: { date: 'desc' }
    });

    await auditClinical(actor(res),'sessions:list');
    res.json(sessions.map(mapSessionResponse));
  } catch (error) {
    if(error instanceof Error && 'status' in error) throw error;
    console.error('[GET /sessions]', error);
    res.status(500).json({ error: 'Error al obtener sesiones' });
  }
});

// ──────────────────────────────────────────
// GET /api/sessions/:id  → Single session with full data
// ──────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params['id']);
    const accessSession=await prisma.clinicalSession.findUnique({where:{id}});
    if(!accessSession) return fail(404,'Sesion no disponible');
    await allowedPatient(actor(res),accessSession.patientId);
    await auditClinical(actor(res),`session:${id}`);

    const session = await prisma.clinicalSession.findUnique({
      where: { id },
      include: {
        specialist: { select: { name: true } },
        sensorHistory: true,
        spikesLog: true
      }
    });

    if (!session) {
      res.status(404).json({ error: 'Sesión no encontrada' });
      return;
    }

    // Using Feign Client to get patient data from Patient Service
    const patient = await allowedPatient(actor(res),session.patientId);
    const sessionWithPatient = {
      ...session,
      patient: patient ? { id: patient.id, name: patient.name, age: patient.age, diagnosis: patient.diagnosis } : null
    };

    res.json(mapSessionResponse(sessionWithPatient));
  } catch (error) {
    if(error instanceof Error && 'status' in error) throw error;
    console.error('[GET /sessions/:id]', error);
    res.status(500).json({ error: 'Error al obtener sesión' });
  }
});

// ──────────────────────────────────────────
// POST /api/sessions  → Save completed session
// ──────────────────────────────────────────
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      patientId,
      patientName,
      durationSeconds,
      specialistRole,
      specialistId: bodySpecialistId,
      notes,
      deviceType,
      metrics,
      sensorHistory,
      spikesLog
    } = req.body as {
      patientId?: string;
      patientName?: string;
      durationSeconds?: number | string;
      specialistRole?: string;
      specialistId?: string;
      notes?: string;
      deviceType?: string;
      metrics?: Record<string, number>;
      sensorHistory?: Array<Record<string, unknown>>;
      spikesLog?: Array<Record<string, unknown>>;
    };

    if (!patientId || typeof patientId !== 'string') {
      res.status(400).json({ error: 'patientId es requerido' });
      return;
    }
    if (!metrics || typeof metrics !== 'object') {
      res.status(400).json({ error: 'metrics es requerido' });
      return;
    }

    const user=actor(res);
    const patient=await allowedPatient(user,patientId);
    const specialistId=user.id;
    const deviceId=typeof req.body.deviceId==='string'?req.body.deviceId:null;
    if(deviceId){const d=await prisma.neuroDevice.findFirst({where:{id:deviceId,institutionId:patient.institutionId}});if(!d)return fail(403,'Dispositivo no autorizado');}
    const duration=Number(durationSeconds??0);
    if(!Number.isFinite(duration)||duration<0||duration>86400)return fail(400,'Duracion invalida');
    if(deviceType && deviceType.toLowerCase()!=='oso')return fail(400,'Solo se admite el oso');
    if(notes!==undefined && (typeof notes!=='string'||notes.length>50000))return fail(400,'Notas invalidas');
    const safeSensorHistory = Array.isArray(sensorHistory) ? sensorHistory : [];
    const safeSpikesLog = Array.isArray(spikesLog) ? spikesLog : [];

    if(safeSensorHistory.some(r=>r.deviceId && r.deviceId!==deviceId))return fail(400,'No se pueden mezclar osos en una sesion');
    const counts=analyze(safeSensorHistory as any);
    const newSession = await prisma.clinicalSession.create({
      data: {
        patientId,
        specialistId,
        deviceId,
        pulses:counts.contacts??0, squeezes:counts.squeezes??0, shakes:counts.shakes??0,
        patientName: patient.name,
        durationSeconds: duration,
        specialistRole: user.accessLevel==='TERAPEUTA'?user.role:(specialistRole ?? 'PSICOLOGIA_CLINICA'),
        notes: notes ?? '',
        deviceType: normalizeDeviceTypeForPrisma(deviceType),
        avgHugForce:         Number(metrics['avgHugForce'])         || 0,
        maxHugForce:         Number(metrics['maxHugForce'])         || 0,
        comfortIndex:        Number(metrics['comfortIndex'])        || 0,
        bilateralSync:       Number(metrics['bilateralSync'])       || 0,
        motorFatigueScore:   Number(metrics['motorFatigueScore'])   || 0,
        stereotypicalCount:  Number(metrics['stereotypicalCount'])  || 0,
        calmStatePercentage: Number(metrics['calmStatePercentage']) || 0,
        spikesCount:         Number(metrics['spikesCount'])         || 0,

        sensorHistory: {
          create: safeSensorHistory.map((s) => ({
            timestamp: String(s['timestamp'] ?? ''),
            deviceType: normalizeDeviceTypeForPrisma(s['deviceType'] || deviceType),
            hugForce:  Number(s['hugForce'])  || 0,
            rotationX: Number(s['rotationX']) || 0,
            rotationY: Number(s['rotationY']) || 0,
            rotationZ: Number(s['rotationZ']) || 0,
            heartRate: -1,
            payload: JSON.stringify(s)
          }))
        },

        spikesLog: {
          create: safeSpikesLog.map((sp) => ({
            ...(sp['id'] && typeof sp['id'] === 'string' ? { id: sp['id'] } : {}),
            timestamp: String(sp['timestamp'] ?? ''),
            deviceType: normalizeDeviceTypeForPrisma(sp['deviceType'] || deviceType),
            type:      String(sp['type']      ?? ''),
            value:     Number(sp['value'])    || 0,
            alertText: String(sp['alertText'] ?? ''),
            severity:  String(sp['severity']  ?? 'info')
          }))
        }
      },
      include: {
        specialist: { select: { name: true } },
        sensorHistory: true,
        spikesLog: true
      }
    });

    await audit(user,'SESSION_SAVE',newSession.id);
    res.status(201).json(mapSessionResponse(newSession));
  } catch (error) {
    if(error instanceof Error && 'status' in error) throw error;
    console.error('[POST /sessions]', error);
    res.status(500).json({ error: 'Error al guardar sesión' });
  }
});

// ──────────────────────────────────────────
// PATCH /api/sessions/:id/notes  → Update notes only
// ──────────────────────────────────────────
router.patch('/:id/notes', async (req: Request, res: Response) => {
  try {
    const id = String(req.params['id']);
    const accessSession=await prisma.clinicalSession.findUnique({where:{id}});
    if(!accessSession) return fail(404,'Sesion no disponible');
    await allowedPatient(actor(res),accessSession.patientId);
    await auditClinical(actor(res),`session:${id}`);
    const { notes } = req.body as { notes?: string };

    if (typeof notes !== 'string') {
      res.status(400).json({ error: 'notes debe ser una cadena de texto' });
      return;
    }

    const existing = await prisma.clinicalSession.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Sesión no encontrada' });
      return;
    }

    const updated = await prisma.clinicalSession.update({
      where: { id },
      data: { notes }
    });

    res.json(updated);
  } catch (error) {
    if(error instanceof Error && 'status' in error) throw error;
    console.error('[PATCH /sessions/:id/notes]', error);
    res.status(500).json({ error: 'Error al actualizar notas de sesión' });
  }
});

// ──────────────────────────────────────────
// DELETE /api/sessions/:id  → Remove session and all related data
// ──────────────────────────────────────────
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params['id']);
    const accessSession=await prisma.clinicalSession.findUnique({where:{id}});
    if(!accessSession) return fail(404,'Sesion no disponible');
    await allowedPatient(actor(res),accessSession.patientId);
    await auditClinical(actor(res),`session:${id}`);

    const existing = await prisma.clinicalSession.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Sesión no encontrada' });
      return;
    }

    managerOnly(actor(res));
    await prisma.spikesLogItem.deleteMany({ where: { sessionId: id } });
    await prisma.sensorReading.deleteMany({ where: { sessionId: id } });
    await prisma.clinicalSession.delete({ where: { id } });

    res.json({ message: 'Sesión eliminada correctamente', id });
  } catch (error) {
    if(error instanceof Error && 'status' in error) throw error;
    console.error('[DELETE /sessions/:id]', error);
    res.status(500).json({ error: 'Error al eliminar sesión' });
  }
});

export default router;
