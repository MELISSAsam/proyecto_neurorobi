// Ejecutar con Docker Compose; la clave se lee por stdin para no guardarla en el historial.
const fs = require('node:fs');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL }) });
async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const password = fs.readFileSync(0, 'utf8').trim();
  if (!email?.includes('@') || password.length < 12) throw new Error('Indica un correo y una clave de al menos 12 caracteres por stdin.');
  await prisma.specialist.create({ data: { email, password: await bcrypt.hash(password, 12), name: 'Administrador', role: 'ADMIN' } });
  console.log('Administrador creado.');
}
main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
