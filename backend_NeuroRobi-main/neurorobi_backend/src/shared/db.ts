import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import * as dotenv from 'dotenv';

dotenv.config();

// SQLite local (dev.db) para desarrollo sin infraestructura externa.
// Para PostgreSQL cambiando a @prisma/adapter-pg y la URL de conexión.
const dbUrl = (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('file:'))
  ? process.env.DATABASE_URL
  : 'file:./dev.db';

const adapter = new PrismaBetterSqlite3({ url: dbUrl });
export const prisma = new PrismaClient({ adapter });