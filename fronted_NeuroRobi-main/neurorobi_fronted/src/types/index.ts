// Absolute TypeScript safety interfaces for Neurorobi IoT clinical platform

export type SpecialistRole = 'PSICOLOGIA_CLINICA' | 'EDUCACION_ESPECIAL' | 'FISIOTERAPIA' | 'ADMIN';

export type ClinicalDiagnosis = string;

export type PatientStatus = 
  | 'Listo para Consulta' 
  | 'En Sesión' 
  | 'Sesión Completada';

export interface Patient {
  id: string;
  name: string;
  age: number;
  diagnosis: ClinicalDiagnosis;
  status: PatientStatus;
  initialObservation: string;
  profileImageUrl?: string | null;
  registeredAt: string;
}

export interface SensorReading {
  receivedAt?: string;
  elapsedMs?: number;
  timestamp: string; // HH:MM:SS
  deviceType: 'oso';
  // Métricas del Peluche NeuroRobi (ESP32)
  flexIzq?: number;    // ADC GPIO 32 (Apretón)
  flexDer?: number;    // ADC GPIO 33 (Flexión derecha)
  apreton?: boolean;   // true si flexIzq > 600
  nivelDer?: number;   // 1 a 10
  switchIzq?: boolean; // Final de carrera izquierdo (GPIO 18)
  switchDer?: boolean; // Final de carrera derecho (GPIO 19)
  mpu?: boolean;       // MPU6050 OK
  accX?: number;       // Acelerómetro X (g)
  accY?: number;       // Acelerómetro Y (g)
  accZ?: number;       // Acelerómetro Z (g)
  giroX?: number;      // Giroscopio X (°/s)
  giroY?: number;      // Giroscopio Y (°/s)
  giroZ?: number;      // Giroscopio Z (°/s)
  movimiento?: number; // 0 a 100
  // Campos heredados / mapeados
  hugForce: number; // 0 to 100
  rotationX: number; // -180 to 180
  rotationY: number; // -180 to 180
  rotationZ: number; // -180 to 180
  heartRate: number; // -1 cuando no hay pulsómetro
  switch1?: boolean;
  switch2?: boolean;
  switch1Duration?: number;
  switch2Duration?: number;
  shakeIntensity?: number;
}

export interface SpikesLogItem {
  deviceType: 'oso';
  id: string;
  timestamp: string; // HH:MM:SS
  type: 'Presión' | 'Frecuencia Cardíaca' | 'Cinemática' | 'Flexión Articular';
  value: number;
  alertText: string;
  severity: 'warning' | 'critical';
}

export interface SessionMetrics {
  avgHeartRate: number;
  maxHeartRate: number;
  minHeartRate: number;
  avgHugForce: number;
  maxHugForce: number;
  comfortIndex: number; // Calculated % (Psicólogo)
  bilateralSync: number; // Calculated % (Terapeuta Ocupacional)
  motorFatigueScore: number; // (Terapeuta Ocupacional checkmarks)
  stereotypicalCount: number; // Counts of rapid rotations (Neurólogo)
  calmStatePercentage: number; // % of time with stable gyroscope (Neurólogo)
  spikesCount: number;
}

export interface ClinicalSession {
  id: string;
  patientId: string;
  patientName: string;
  specialistId?: string;
  specialistName?: string;
  deviceId?: string;
  date: string;
  durationSeconds: number;
  specialistRole: SpecialistRole;
  notes: string;
  deviceType: 'oso';
  metrics: SessionMetrics;
  sensorHistory: SensorReading[];
  spikesLog: SpikesLogItem[];
}
