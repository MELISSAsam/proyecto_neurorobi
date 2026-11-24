import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString || !/^postgres(ql)?:\/\//i.test(connectionString)) {
  throw new Error('DATABASE_URL debe ser una URL PostgreSQL válida.');
}

const adapter = new PrismaPg({ connectionString, max: 3, idleTimeoutMillis: 10000, connectionTimeoutMillis: 5000 });
export const prisma = new PrismaClient({ adapter });
