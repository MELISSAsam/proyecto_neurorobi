import type { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { prisma } from './db';
import type { Specialist, Prisma } from '@prisma/client';
export type Actor = Specialist;
export class HttpError extends Error {
    constructor(public status: number, message: string) { super(message); }
}
export function fail(status: number, message: string): never { throw new HttpError(status, message); }
export async function multiUserEnabled(): Promise<boolean> {
    const flag=await prisma.platformSetting.findUnique({where:{key:'multiUserEnabled'}});
    return flag ? flag.value==='true' : process.env.MULTI_USER_ENABLED==='true';
}
export async function resolveToken(token: string): Promise<Actor> {
    const data = jwt.verify(token, process.env.JWT_SECRET || 'neurorobi-secret-key-2026') as JwtPayload;
    if (!data || typeof data.id !== 'string')
        return fail(401, 'Sesion invalida');
    const user = await prisma.specialist.findUnique({ where: { id: data.id }, include: { institution: true } });
    const single = await multiUserEnabled() ? null : process.env.SINGLE_USER_USERNAME?.trim().toLowerCase();
    if (!user || !user.active || !user.institution.active || (data.version ?? 0) !== user.sessionVersion || (single && user.email !== single))
        return fail(401, 'Sesion invalida o revocada');
    return { ...user, clinicalRead: user.accessLevel === 'SUPERADMINISTRADOR' || user.clinicalRead };
}
export const actor = (res: Response): Actor => res.locals.actor;
export async function authenticate(req: Request, res: Response, next: NextFunction) {
    try {
        const token = req.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
        if (!token)
            return fail(401, 'Inicia sesion');
        res.locals.actor = await resolveToken(token);
        if (actor(res).mustChangePassword && !['/api/auth/me', '/api/auth/change-password', '/api/auth/logout'].includes(req.originalUrl.split('?')[0]))
            return fail(403, 'Debes cambiar la contrasena temporal');
        next();
    }
    catch (e) {
        next(e instanceof HttpError ? e : new HttpError(401, 'Sesion invalida o expirada'));
    }
}
export const superOnly = (u: Actor) => { if (u.accessLevel !== 'SUPERADMINISTRADOR')
    fail(403, 'Requiere Superadministrador'); };
export const managerOnly = (u: Actor) => { if (u.accessLevel === 'TERAPEUTA')
    fail(403, 'Requiere administrador'); };
export function institutionScope(u: Actor, requested?: string): string | undefined {
    if (u.accessLevel === 'SUPERADMINISTRADOR')
        return requested || undefined;
    if (requested && requested !== u.institutionId)
        fail(403, 'Institucion no autorizada');
    return u.institutionId;
}
export function patientScope(u: Actor): Prisma.PatientWhereInput {
    return { institutionId: u.institutionId, ...(u.accessLevel === 'TERAPEUTA' ? { assignments: { some: { specialistId: u.id } } } : {}) };
}
export async function allowedPatient(u: Actor, id: string) {
    const patient = await prisma.patient.findFirst({ where: { AND: [{ id }, patientScope(u)] } });
    if (!patient)
        return fail(404, 'Paciente no disponible');
    return patient;
}
export async function audit(u: Actor, action: string, resource: string, result = 'SUCCESS', tx: Pick<typeof prisma, 'auditLog'> = prisma, institutionId = u.institutionId) {
    await tx.auditLog.create({ data: { actorId: u.id, actorName: u.name, institutionId, action, resource, result } });
}
export async function auditClinical(u: Actor, resource: string) { if (u.accessLevel === 'SUPERADMINISTRADOR')
    await audit(u, 'CLINICAL_READ', resource); }
export function errorHandler(error: any, _req: Request, res: Response, _next: NextFunction) {
    if (error instanceof HttpError) {
        res.status(error.status).json({ error: error.message });
        return;
    }
    if (error?.code === 'P2002') {
        res.status(409).json({ error: 'El correo o identificador ya existe' });
        return;
    }
    console.error('[API]', error?.message);
    res.status(500).json({ error: 'No se pudo completar la operacion' });
}
