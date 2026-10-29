import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import * as dotenv from 'dotenv';

dotenv.config();

// SQLite local (dev.db) para desarrollo sin infraestructura externa.
// Para PostgreSQL cambiando a @prisma/adapter-pg y la URL de conexión.
const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL || 'file:./dev.db' });
export const prisma = new PrismaClient({ adapter });