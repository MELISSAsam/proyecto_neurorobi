-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AccessLevel" AS ENUM ('SUPERADMINISTRADOR', 'ADMINISTRADOR', 'TERAPEUTA');

-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('OSO');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('PSICOLOGIA_CLINICA', 'EDUCACION_ESPECIAL', 'FISIOTERAPIA', 'ADMIN');

-- CreateTable
CREATE TABLE "Institution" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Institution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Patient" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "diagnosis" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Listo para Consulta',
    "initialObservation" TEXT NOT NULL,
    "profileImageUrl" TEXT,
    "institutionId" TEXT NOT NULL DEFAULT 'neurorobi-default',
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalSession" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "patientName" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationSeconds" INTEGER NOT NULL,
    "specialistRole" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "deviceType" "DeviceType" NOT NULL DEFAULT 'OSO',
    "deviceId" TEXT,
    "pulses" INTEGER NOT NULL DEFAULT 0,
    "squeezes" INTEGER NOT NULL DEFAULT 0,
    "shakes" INTEGER NOT NULL DEFAULT 0,
    "avgHeartRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxHeartRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minHeartRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgHugForce" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxHugForce" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "comfortIndex" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bilateralSync" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "motorFatigueScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "stereotypicalCount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "calmStatePercentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "spikesCount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "specialistId" TEXT NOT NULL,

    CONSTRAINT "ClinicalSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SensorReading" (
    "id" SERIAL NOT NULL,
    "sessionId" TEXT NOT NULL,
    "timestamp" TEXT NOT NULL,
    "deviceType" "DeviceType" NOT NULL DEFAULT 'OSO',
    "hugForce" DOUBLE PRECISION NOT NULL,
    "rotationX" DOUBLE PRECISION NOT NULL,
    "rotationY" DOUBLE PRECISION NOT NULL,
    "rotationZ" DOUBLE PRECISION NOT NULL,
    "payload" TEXT,
    "heartRate" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "SensorReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpikesLogItem" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "timestamp" TEXT NOT NULL,
    "deviceType" "DeviceType" NOT NULL DEFAULT 'OSO',
    "type" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "alertText" TEXT NOT NULL,
    "severity" TEXT NOT NULL,

    CONSTRAINT "SpikesLogItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Specialist" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "profileImageUrl" TEXT,
    "accessLevel" "AccessLevel" NOT NULL DEFAULT 'TERAPEUTA',
    "institutionId" TEXT NOT NULL DEFAULT 'neurorobi-default',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "clinicalRead" BOOLEAN NOT NULL DEFAULT false,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "temporaryPasswordExpiresAt" TIMESTAMP(3),
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Specialist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientAssignment" (
    "patientId" TEXT NOT NULL,
    "specialistId" TEXT NOT NULL,

    CONSTRAINT "PatientAssignment_pkey" PRIMARY KEY ("patientId","specialistId")
);

-- CreateTable
CREATE TABLE "NeuroDevice" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL DEFAULT 'neurorobi-default',
    "keyHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leasePatientId" TEXT,
    "leaseOwnerId" TEXT,
    "leaseVersion" INTEGER,
    "leaseControllerId" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "previousSqueeze" BOOLEAN NOT NULL DEFAULT false,
    "previousLeft" BOOLEAN NOT NULL DEFAULT false,
    "previousRight" BOOLEAN NOT NULL DEFAULT false,
    "previousShake" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "NeuroDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "institutionId" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "TelemetryPacket" (
    "id" SERIAL NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deviceId" TEXT,
    "patientId" TEXT,
    "payload" TEXT NOT NULL,

    CONSTRAINT "TelemetryPacket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Patient_institutionId_idx" ON "Patient"("institutionId");

-- CreateIndex
CREATE INDEX "ClinicalSession_patientId_date_idx" ON "ClinicalSession"("patientId", "date");

-- CreateIndex
CREATE INDEX "SensorReading_sessionId_idx" ON "SensorReading"("sessionId");

-- CreateIndex
CREATE INDEX "SpikesLogItem_sessionId_idx" ON "SpikesLogItem"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Specialist_email_key" ON "Specialist"("email");

-- CreateIndex
CREATE INDEX "Specialist_institutionId_accessLevel_active_idx" ON "Specialist"("institutionId", "accessLevel", "active");

-- CreateIndex
CREATE UNIQUE INDEX "NeuroDevice_keyHash_key" ON "NeuroDevice"("keyHash");

-- CreateIndex
CREATE INDEX "NeuroDevice_institutionId_active_idx" ON "NeuroDevice"("institutionId", "active");

-- CreateIndex
CREATE INDEX "AuditLog_institutionId_createdAt_idx" ON "AuditLog"("institutionId", "createdAt");

-- CreateIndex
CREATE INDEX "TelemetryPacket_receivedAt_idx" ON "TelemetryPacket"("receivedAt");

-- CreateIndex
CREATE INDEX "TelemetryPacket_patientId_idx" ON "TelemetryPacket"("patientId");

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalSession" ADD CONSTRAINT "ClinicalSession_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "NeuroDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalSession" ADD CONSTRAINT "ClinicalSession_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalSession" ADD CONSTRAINT "ClinicalSession_specialistId_fkey" FOREIGN KEY ("specialistId") REFERENCES "Specialist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SensorReading" ADD CONSTRAINT "SensorReading_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ClinicalSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpikesLogItem" ADD CONSTRAINT "SpikesLogItem_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ClinicalSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Specialist" ADD CONSTRAINT "Specialist_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientAssignment" ADD CONSTRAINT "PatientAssignment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientAssignment" ADD CONSTRAINT "PatientAssignment_specialistId_fkey" FOREIGN KEY ("specialistId") REFERENCES "Specialist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NeuroDevice" ADD CONSTRAINT "NeuroDevice_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelemetryPacket" ADD CONSTRAINT "TelemetryPacket_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "NeuroDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
