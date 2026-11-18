import { Router } from 'express';
import path from 'path';
import { prisma } from '../shared/db';
import { authenticate, actor, patientScope, auditClinical, fail } from '../shared/security';
const router = Router();
router.use(authenticate);
router.get('/:filename', async (req, res) => {
    const filename = String(req.params.filename);
    if (!/^[a-zA-Z0-9_.-]+$/.test(filename) || filename === '.' || filename === '..')
        fail(404, 'Archivo no disponible');
    const u = actor(res), url = `/uploads/${filename}`;
    const own = u.profileImageUrl === url;
    const patient = await prisma.patient.findFirst({ where: { AND: [{ profileImageUrl: url }, patientScope(u)] }, select: { id: true } });
    if (!own && !patient)
        fail(404, 'Archivo no disponible');
    if (patient)
        await auditClinical(u, `patient-photo:${patient.id}`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(filename, { root: path.resolve(process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads')) });
});
export default router;
