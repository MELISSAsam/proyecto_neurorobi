const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');

async function main() {
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
