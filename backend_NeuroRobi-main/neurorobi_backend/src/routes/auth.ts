import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHmac } from 'crypto';
import { prisma } from '../shared/db';
import { authenticate, actor, audit, fail, multiUserEnabled, JWT_SECRET } from '../shared/security';
import { handleUpload } from '../middleware/upload';
const router = Router();
const safe = (u: any) => ({ id: u.id, email: u.email, name: u.name, role: u.role, accessLevel: u.accessLevel, institutionId: u.institutionId, clinicalRead: u.accessLevel === 'SUPERADMINISTRADOR' || u.clinicalRead, mustChangePassword: u.mustChangePassword, profileImageUrl: u.profileImageUrl });
const pruneLoginAttempts = () => prisma.loginAttempt.deleteMany({ where: { windowStartedAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }).catch((error) => console.error('[Login rate limit cleanup]', error?.message));
void pruneLoginAttempts();
const loginAttemptCleanup = setInterval(pruneLoginAttempts, 60 * 60 * 1000);
loginAttemptCleanup.unref();
router.post('/login', async (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = req.body?.password, ip = req.ip || req.socket.remoteAddress || 'unknown';
    const ipHash = createHmac('sha256', JWT_SECRET).update(ip).digest('hex');
    const attempts = await prisma.$queryRaw<{ count: number }[]>`
        INSERT INTO "LoginAttempt" ("ipHash", "count", "windowStartedAt")
        VALUES (${ipHash}, 1, CURRENT_TIMESTAMP)
        ON CONFLICT ("ipHash") DO UPDATE SET
          "count" = CASE WHEN "LoginAttempt"."windowStartedAt" <= CURRENT_TIMESTAMP - INTERVAL '15 minutes' THEN 1 ELSE "LoginAttempt"."count" + 1 END,
          "windowStartedAt" = CASE WHEN "LoginAttempt"."windowStartedAt" <= CURRENT_TIMESTAMP - INTERVAL '15 minutes' THEN CURRENT_TIMESTAMP ELSE "LoginAttempt"."windowStartedAt" END
        RETURNING "count"
    `;
    if ((attempts[0]?.count ?? 11) > 10)
        fail(429, 'Demasiados intentos. Espera 15 minutos');
    if (!email || typeof password !== 'string' || password.length > 128)
        fail(401, 'Credenciales invalidas');
    const u = await prisma.specialist.findUnique({ where: { email }, include: { institution: true } });
    const single = await multiUserEnabled() ? null : process.env.SINGLE_USER_USERNAME?.trim().toLowerCase();
    const valid = u && await bcrypt.compare(password, u.password);
    if (!u || !valid || !u.active || !u.institution.active || (single && email !== single) || (u.mustChangePassword && u.temporaryPasswordExpiresAt && u.temporaryPasswordExpiresAt < new Date()))
        fail(401, 'Credenciales invalidas o acceso temporal vencido');
    await prisma.loginAttempt.deleteMany({ where: { ipHash } });
    const settings = await prisma.platformSetting.findUnique({ where: { key: 'sessionHours' } });
    const hours = Math.max(1, Math.min(24, Number(settings?.value) || 8));
    const token = jwt.sign({ id: u!.id, email: u!.email, name: u!.name, role: u!.role, version: u!.sessionVersion }, JWT_SECRET, { expiresIn: hours * 3600 });
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
