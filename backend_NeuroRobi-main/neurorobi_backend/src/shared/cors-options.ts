import type { CorsOptions } from 'cors';

const configuredOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)
  .map((value) => new URL(value).origin);

if (process.env.NODE_ENV === 'production' && configuredOrigins.length === 0) {
  throw new Error('FRONTEND_URL debe contener el origen HTTPS autorizado para CORS.');
}

export const allowedCorsOrigins = [...new Set([
  ...configuredOrigins,
  ...(process.env.NODE_ENV === 'production' ? [] : ['http://localhost:5173', 'http://127.0.0.1:5173']),
])];

export const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (!origin || allowedCorsOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origen no autorizado por CORS.'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-device-key', 'x-device-id'],
};
