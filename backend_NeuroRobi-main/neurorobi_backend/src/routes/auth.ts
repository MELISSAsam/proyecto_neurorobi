import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../shared/db';
import { authenticate, actor, audit, fail, multiUserEnabled } from '../shared/security';
import { handleUpload } from '../middleware/upload';
const router = Router();
const secret = process.env.JWT_SECRET || 'neurorobi-secret-key-2026';
if (process.env.NODE_ENV === 'production' && secret.length < 32)
    throw new Error('JWT_SECRET requiere 32 caracteres');
const safe = (u: any) => ({ id: u.id, email: u.email, name: u.name, role: u.role, accessLevel: u.accessLevel, institutionId: u.institutionId, clinicalRead: u.clinicalRead, mustChangePassword: u.mustChangePassword, profileImageUrl: u.profileImageUrl });
const attempts = new Map<string, {
    count: number;
    until: number;
}>();
router.post('/login', async (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = req.body?.password, bucket = `${req.ip}:${email}`, now = Date.now();
    if (attempts.size > 10000)
        for (const [key, a] of attempts)
            if (a.until < now)
                attempts.delete(key);
    const attempt = attempts.get(bucket);
    if (attempt && attempt.until > now && attempt.count >= 10)
        fail(429, 'Demasiados intentos. Espera 15 minutos');
    attempts.set(bucket, { count: attempt && attempt.until > now ? attempt.count + 1 : 1, until: attempt && attempt.until > now ? attempt.until : now + 900000 });
    if (!email || typeof password !== 'string' || password.length > 128)
        fail(401, 'Credenciales invalidas');
    const u = await prisma.specialist.findUnique({ where: { email }, include: { institution: true } });
    const single = await multiUserEnabled() ? null : process.env.SINGLE_USER_USERNAME?.trim().toLowerCase();
    const valid = u && await bcrypt.compare(password, u.password);
    if (!u || !valid || !u.active || !u.institution.active || (single && email !== single) || (u.mustChangePassword && u.temporaryPasswordExpiresAt && u.temporaryPasswordExpiresAt < new Date()))
        fail(401, 'Credenciales invalidas o acceso temporal vencido');
    attempts.delete(bucket);
    const settings = await prisma.platformSetting.findUnique({ where: { key: 'sessionHours' } });
    const hours = Math.max(1, Math.min(24, Number(settings?.value) || 8));
    const token = jwt.sign({ id: u!.id, email: u!.email, name: u!.name, role: u!.role, version: u!.sessionVersion }, secret, { expiresIn: hours * 3600 });
    await prisma.$transaction(async (tx) => { await tx.specialist.update({ where: { id: u!.id }, data: { lastLoginAt: new Date() } }); await audit(u!, 'LOGIN', u!.id, 'SUCCESS', tx); });
    res.json({ token, user: safe(u) });
});
router.use(authenticate);
router.get('/me', (_req, res) => res.json(safe(actor(res))));
router.post('/logout', async (_req, res) => { const u = actor(res); await prisma.$transaction(async (tx) => { await tx.specialist.update({ where: { id: u.id }, data: { sessionVersion: { increment: 1 } } }); await audit(u, 'LOGOUT', u.id, 'SUCCESS', tx); }); res.json({ ok: true }); });
router.post('/change-password', async (req, res) => {
    const u = actor(res), { currentPassword, password } = req.body || {};
    if (typeof currentPassword !== 'string' || typeof password !== 'string' || password.length < 12 || password.length > 128 || currentPassword === password)
        fail(400, 'Usa una nueva contrasena de 12 a 128 caracteres');
    if (!await bcrypt.compare(currentPassword, u.password))
        fail(403, 'Contrasena actual incorrecta');
    const hashed = await bcrypt.hash(password, 12);
    await prisma.$transaction(async (tx) => { await tx.specialist.update({ where: { id: u.id }, data: { password: hashed, mustChangePassword: false, temporaryPasswordExpiresAt: null, sessionVersion: { increment: 1 } } }); await audit(u, 'PASSWORD_CHANGE', u.id, 'SUCCESS', tx); });
    res.json({ message: 'Contrasena actualizada. Inicia sesion nuevamente.' });
});
router.post('/register', (_req, _res) => fail(403, 'Utiliza Gestion de usuarios'));
router.put('/profile/:id', async (req, res) => {
    const u = actor(res);
    if (String(req.params.id) !== u.id)
        fail(403, 'Solo puedes editar tu perfil');
    await handleUpload('profileImage')(req, res);
    if (req.body?.password)
        fail(400, 'Cambia la contrasena desde Seguridad');
    const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 150) : u.name;
    if (!name)
        fail(400, 'Nombre requerido');
    const updated = await prisma.$transaction(async (tx) => { const updated = await tx.specialist.update({ where: { id: u.id }, data: { name, ...(req.file ? { profileImageUrl: `/uploads/${req.file.filename}` } : {}) } }); await audit(u, 'PROFILE_UPDATE', u.id, 'SUCCESS', tx); return updated; });
    res.json(safe(updated));
});
router.get('/specialists', async (_req, res) => { const u = actor(res); if (u.accessLevel === 'TERAPEUTA')
    fail(403, 'No autorizado'); const items = await prisma.specialist.findMany({ where: u.accessLevel === 'SUPERADMINISTRADOR' ? {} : { institutionId: u.institutionId }, select: { id: true, name: true, role: true } }); res.json(items); });
export async function seedInitialUser() { }
export default router;
