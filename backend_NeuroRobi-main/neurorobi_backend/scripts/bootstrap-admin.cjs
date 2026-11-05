const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');

async function main() {
  const username = process.env.SINGLE_USER_USERNAME?.trim().toLowerCase();
  if (username) {
    const password = process.env.SINGLE_USER_PASSWORD;
    if (!password || password.length < 8) throw new Error('SINGLE_USER_PASSWORD requiere al menos 8 caracteres');
    const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL }) });
    try {
      const existing = await prisma.specialist.findUnique({ where: { email: username } });
      const matches = existing && await bcrypt.compare(password, existing.password);
      await prisma.specialist.upsert({
        where: { email: username },
        create: { email: username, password: await bcrypt.hash(password, 12), name: 'Melissa', role: 'ADMIN' },
        update: { role: 'ADMIN', ...(!matches ? { password: await bcrypt.hash(password, 12) } : {}) }
      });
      console.log('Cuenta de acceso unico preparada.');
    } finally { await prisma.$disconnect(); }
    return;
  }
  const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  if (!email && !password) return;
  if (!email?.includes('@') || !password || password.length < 12) {
    throw new Error('Configura INITIAL_ADMIN_EMAIL y INITIAL_ADMIN_PASSWORD (minimo 12 caracteres).');
  }
  const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL }) });
  try {
    const existing = await prisma.specialist.findUnique({ where: { email } });
    if (existing) {
      console.log('El usuario inicial ya existe; se conservan sus credenciales.');
      return;
    }
    await prisma.specialist.create({ data: {
      email,
      password: await bcrypt.hash(password, 12),
      name: 'Administrador',
      role: 'ADMIN',
    } });
    console.log('Administrador inicial creado. Elimina INITIAL_ADMIN_EMAIL e INITIAL_ADMIN_PASSWORD de Railway.');
  } finally {
    await prisma.$disconnect();
  }
}
main().catch(() => {
  console.error('No se pudo preparar el administrador. Revisa las variables iniciales y la conexion a la base de datos.');
  process.exitCode = 1;
});
