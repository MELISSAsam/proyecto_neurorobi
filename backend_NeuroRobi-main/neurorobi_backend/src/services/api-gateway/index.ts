import { errorHandler } from '../../shared/security';
import { corsOptions } from '../../shared/cors-options';
import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import { createProxyMiddleware, RequestHandler } from 'http-proxy-middleware';
import axios from 'axios';
import { createServer } from 'http';

const app = express();
app.set('trust proxy', 1);
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});
app.use(cors(corsOptions));

// Don't use express.json() here globally because it interferes with proxying POST requests.
// We just forward raw requests.

// Serve uploaded profile images directly from the gateway (frontend uses {API_URL}/uploads/...)


const rawRegistryUrl = process.env.REGISTRY_URL || 'http://localhost:4000';
const REGISTRY_URL = rawRegistryUrl.replace(/\/register\/?$/, '').replace(/\/+$/, '');

const defaultRouting: Record<string, string> = {
  'auth-service': process.env.AUTH_SERVICE_URL || 'http://localhost:3002',
  'patient-service': process.env.PATIENT_SERVICE_URL || 'http://localhost:3003',
  'session-service': process.env.SESSION_SERVICE_URL || 'http://localhost:3004',
  'telemetry-service': process.env.TELEMETRY_SERVICE_URL || 'http://localhost:3005',
};

let routingTable: Record<string, string> = { ...defaultRouting };

// Fetch routing table from Registry
async function updateRoutingTable() {
  try {
    const { data } = await axios.get(`${REGISTRY_URL}/services`);
    const newRouting: Record<string, string> = { ...defaultRouting };
    for (const service of data) {
      newRouting[service.name] = `http://${service.host}:${service.port}`;
    }
    routingTable = newRouting;
  } catch (error) {
    // Registry not reached yet; defaultRouting remains active
  }
}

// Update routing table frequently so service routes recover quickly
setInterval(updateRoutingTable, 2000);
updateRoutingTable();

// Dynamic proxy middleware generator with error handling and timeout
const dynamicProxy = (serviceName: string): RequestHandler => {
  return createProxyMiddleware({
    router: () => {
      return routingTable[serviceName] || defaultRouting[serviceName] || 'http://localhost:3000';
    },
    changeOrigin: true,
    proxyTimeout: 8000,
    timeout: 10000,
    on: {
      error: (err, _req, res) => {
        console.error(`[Gateway] Proxy error for ${serviceName}:`, err.message);
        if ('writeHead' in res && !res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Servicio no disponible', service: serviceName }));
        }
      }
    }
  });
};

// Proxy instances (created once)
const authProxy = dynamicProxy('auth-service');
const patientProxy = dynamicProxy('patient-service');
const sessionProxy = dynamicProxy('session-service');
const telemetryProxy = dynamicProxy('telemetry-service');

// Map routes to microservices
app.use('/api/admin', (req,res,next)=>{req.url=req.originalUrl;authProxy(req,res,next);});
app.use('/api/media', (req,res,next)=>{req.url=req.originalUrl;authProxy(req,res,next);});
app.use('/api/auth', (req, res, next) => { req.url = req.originalUrl; authProxy(req, res, next); });
app.use('/api/patients', (req, res, next) => { req.url = req.originalUrl; patientProxy(req, res, next); });
app.use('/api/sessions', (req, res, next) => { req.url = req.originalUrl; sessionProxy(req, res, next); });
app.use('/api/telemetry', (req, res, next) => { req.url = req.originalUrl; telemetryProxy(req, res, next); });
app.use('/api/stats', (req, res, next) => { req.url = req.originalUrl; telemetryProxy(req, res, next); });

// Proxy WebSockets and HTTP handshake for Telemetry Service
const wsProxy = createProxyMiddleware({
  router: () => {
    return routingTable['telemetry-service'] || defaultRouting['telemetry-service'] || 'http://localhost:3005';
  },
  ws: true,
  changeOrigin: true,
  on: { error: (err) => console.error('[Gateway] WS proxy error:', err.message) }
});

// Route HTTP handshake for Socket.IO
app.use('/socket.io', (req, res, next) => {
  req.url = req.originalUrl;
  wsProxy(req, res, next);
});

// Health check for Gateway
app.get('/health', async (_req: Request, res: Response) => {
  const checks = await Promise.all(Object.values(defaultRouting).map(async (url) => {
    try { await axios.get(`${url}/health`, { timeout: 2000 }); return true; }
    catch { return false; }
  }));
  const ready = checks.every(Boolean);
  res.status(ready ? 200 : 503).json({ status: ready ? 'ok' : 'starting', service: 'API Gateway' });
});

app.use(errorHandler);

// Create HTTP server (for WebSocket proxying)
const httpServer = createServer(app);

httpServer.on('upgrade', (req, socket, head) => {
  if (wsProxy.upgrade) {
    wsProxy.upgrade(req, socket as any, head);
  }
});

const PORT = Number(process.env.PORT || process.env.GATEWAY_PORT || 3001);
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`\n======================================`);
  console.log(`🌍 API Gateway running on port ${PORT}`);
  console.log(`======================================\n`);
});

