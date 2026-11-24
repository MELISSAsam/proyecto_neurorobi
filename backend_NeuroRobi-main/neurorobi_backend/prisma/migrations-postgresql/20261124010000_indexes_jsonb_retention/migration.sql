-- Keep high-selectivity relation filters fast as the clinical history grows.
CREATE INDEX "ClinicalSession_specialistId_idx" ON "ClinicalSession"("specialistId");
CREATE INDEX "ClinicalSession_deviceId_idx" ON "ClinicalSession"("deviceId");
CREATE INDEX "PatientAssignment_specialistId_idx" ON "PatientAssignment"("specialistId");
CREATE INDEX "TelemetryPacket_deviceId_idx" ON "TelemetryPacket"("deviceId");

-- Telemetry packets are JSON payloads and should use PostgreSQL's native JSONB.
ALTER TABLE "TelemetryPacket"
  ALTER COLUMN "payload" TYPE JSONB
  USING "payload"::jsonb;
