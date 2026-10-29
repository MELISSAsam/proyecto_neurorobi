import express from 'express';
import cors from 'cors';
import patientRoutes from '../../routes/patients';
import { registerService } from '../../shared/service-utils';
import { seedPatients } from '../../shared/seed-patients';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

app.use('/uploads', express.static(process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads')));
app.use('/api/patients', patientRoutes);

const PORT = process.env.PATIENT_PORT || 3003;

app.listen(PORT, async () => {
  console.log(`[Patient Service] Running on port ${PORT}`);
  registerService('patient-service', Number(PORT));
  await seedPatients();
});

