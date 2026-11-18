import mediaRoutes from '../../routes/media';
import adminRoutes from '../../routes/admin';
import { errorHandler } from '../../shared/security';
import express from 'express';
import cors from 'cors';
import authRoutes, { seedInitialUser } from '../../routes/auth';
import { registerService } from '../../shared/service-utils';
import * as dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use(express.json());


app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/media',mediaRoutes);
app.use(errorHandler);

const PORT = process.env.AUTH_PORT || 3002;

app.listen(PORT, async () => {
  console.log(`[Auth Service] Running on port ${PORT}`);
  registerService('auth-service', Number(PORT));
  await seedInitialUser();
});
