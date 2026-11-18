import { errorHandler } from '../../shared/security';
import express from 'express';
import cors from 'cors';
import patientRoutes from '../../routes/patients';
import { registerService } from '../../shared/service-utils';
import { seedPatients } from '../../shared/seed-patients';
import * as dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use(express.json({ limit: '5mb' }));


app.use('/api/patients', patientRoutes);
app.use(errorHandler);

const PORT = process.env.PATIENT_PORT || 3003;

app.listen(PORT, async () => {
  console.log(`[Patient Service] Running on port ${PORT}`);
  registerService('patient-service', Number(PORT));
  await seedPatients();
});

