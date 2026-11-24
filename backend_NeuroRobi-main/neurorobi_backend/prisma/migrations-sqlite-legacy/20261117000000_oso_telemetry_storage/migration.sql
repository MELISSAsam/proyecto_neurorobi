ALTER TABLE "SensorReading" ADD COLUMN "payload" TEXT;
CREATE TABLE "TelemetryPacket" ("id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "patientId" TEXT, "payload" TEXT NOT NULL);
CREATE INDEX "TelemetryPacket_receivedAt_idx" ON "TelemetryPacket"("receivedAt");
CREATE INDEX "TelemetryPacket_patientId_idx" ON "TelemetryPacket"("patientId");