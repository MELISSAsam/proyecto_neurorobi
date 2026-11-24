// Ejecutar con Docker Compose; la clave se lee por stdin para no guardarla en el historial.
const fs = require('node:fs');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
if (!/^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL || '')) throw new Error('Configura DATABASE_URL con una URL PostgreSQL valida.');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const password = fs.readFileSync(0, 'utf8').trim();
  if (!email?.includes('@') || password.length < 12) throw new Error('Indica un correo y una clave de al menos 12 caracteres por stdin.');
  const institutionId = 'neurorobi-default';
  await prisma.institution.upsert({ where: { id: institutionId }, create: { id: institutionId, name: 'NeuroRobi - Institucion inicial' }, update: {} });
  await prisma.specialist.create({ data: { email, password: await bcrypt.hash(password, 12), name: 'Administrador', role: 'ADMIN', accessLevel: 'SUPERADMINISTRADOR', institutionId } });
  console.log('Administrador creado.');
}
main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
