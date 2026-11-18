import { errorHandler } from '../../shared/security';
import express from 'express';
import cors from 'cors';
import sessionRoutes from '../../routes/sessions';
import { registerService } from '../../shared/service-utils';
import * as dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use(express.json({ limit: '5mb' }));


app.use('/api/sessions', sessionRoutes);
app.use(errorHandler);

const PORT = process.env.SESSION_PORT || 3004;

app.listen(PORT, () => {
  console.log(`[Session Service] Running on port ${PORT}`);
  registerService('session-service', Number(PORT));
});
