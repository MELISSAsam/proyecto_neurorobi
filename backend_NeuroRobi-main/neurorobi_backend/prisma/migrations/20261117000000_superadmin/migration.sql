-- CreateTable
CREATE TABLE "Institution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "contact" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "Institution" ("id", "name") VALUES ('neurorobi-default', 'NeuroRobi - Institucion inicial');

-- CreateTable
CREATE TABLE "PatientAssignment" (
    "patientId" TEXT NOT NULL,
    "specialistId" TEXT NOT NULL,

    PRIMARY KEY ("patientId", "specialistId"),
    CONSTRAINT "PatientAssignment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PatientAssignment_specialistId_fkey" FOREIGN KEY ("specialistId") REFERENCES "Specialist" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NeuroDevice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL DEFAULT 'neurorobi-default',
    "keyHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leasePatientId" TEXT,
    "leaseOwnerId" TEXT,
    "leaseVersion" INTEGER,
    "leaseControllerId" TEXT,
    "leaseExpiresAt" DATETIME,
    "previousSqueeze" BOOLEAN NOT NULL DEFAULT false,
    "previousLeft" BOOLEAN NOT NULL DEFAULT false,
    "previousRight" BOOLEAN NOT NULL DEFAULT false,
    "previousShake" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "NeuroDevice_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "institutionId" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PlatformSetting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Patient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "diagnosis" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Listo para Consulta',
    "initialObservation" TEXT NOT NULL,
    "profileImageUrl" TEXT,
    "institutionId" TEXT NOT NULL DEFAULT 'neurorobi-default',
    "registeredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Patient_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Patient" ("age", "diagnosis", "id", "initialObservation", "name", "profileImageUrl", "registeredAt", "status") SELECT "age", "diagnosis", "id", "initialObservation", "name", "profileImageUrl", "registeredAt", "status" FROM "Patient";
DROP TABLE "Patient";
ALTER TABLE "new_Patient" RENAME TO "Patient";
CREATE TABLE "new_ClinicalSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patientId" TEXT NOT NULL,
    "patientName" TEXT NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationSeconds" INTEGER NOT NULL,
    "specialistRole" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "deviceType" TEXT NOT NULL DEFAULT 'OSO',
    "deviceId" TEXT,
    "pulses" INTEGER NOT NULL DEFAULT 0,
    "squeezes" INTEGER NOT NULL DEFAULT 0,
    "shakes" INTEGER NOT NULL DEFAULT 0,
    "avgHeartRate" REAL NOT NULL DEFAULT 0,
    "maxHeartRate" REAL NOT NULL DEFAULT 0,
    "minHeartRate" REAL NOT NULL DEFAULT 0,
    "avgHugForce" REAL NOT NULL DEFAULT 0,
    "maxHugForce" REAL NOT NULL DEFAULT 0,
    "comfortIndex" REAL NOT NULL DEFAULT 0,
    "bilateralSync" REAL NOT NULL DEFAULT 0,
    "motorFatigueScore" REAL NOT NULL DEFAULT 0,
    "stereotypicalCount" REAL NOT NULL DEFAULT 0,
    "calmStatePercentage" REAL NOT NULL DEFAULT 0,
    "spikesCount" REAL NOT NULL DEFAULT 0,
    "specialistId" TEXT NOT NULL,
    CONSTRAINT "ClinicalSession_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "NeuroDevice" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ClinicalSession_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ClinicalSession_specialistId_fkey" FOREIGN KEY ("specialistId") REFERENCES "Specialist" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ClinicalSession" ("avgHeartRate", "avgHugForce", "bilateralSync", "calmStatePercentage", "comfortIndex", "date", "deviceType", "durationSeconds", "id", "maxHeartRate", "maxHugForce", "minHeartRate", "motorFatigueScore", "notes", "patientId", "patientName", "specialistId", "specialistRole", "spikesCount", "stereotypicalCount") SELECT "avgHeartRate", "avgHugForce", "bilateralSync", "calmStatePercentage", "comfortIndex", "date", "deviceType", "durationSeconds", "id", "maxHeartRate", "maxHugForce", "minHeartRate", "motorFatigueScore", "notes", "patientId", "patientName", "specialistId", "specialistRole", "spikesCount", "stereotypicalCount" FROM "ClinicalSession";
DROP TABLE "ClinicalSession";
ALTER TABLE "new_ClinicalSession" RENAME TO "ClinicalSession";
CREATE TABLE "new_Specialist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "profileImageUrl" TEXT,
    "accessLevel" TEXT NOT NULL DEFAULT 'TERAPEUTA',
    "institutionId" TEXT NOT NULL DEFAULT 'neurorobi-default',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "clinicalRead" BOOLEAN NOT NULL DEFAULT false,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "temporaryPasswordExpiresAt" DATETIME,
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Specialist_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Specialist" ("createdAt", "email", "id", "name", "password", "profileImageUrl", "role") SELECT "createdAt", "email", "id", "name", "password", "profileImageUrl", "role" FROM "Specialist";
DROP TABLE "Specialist";
ALTER TABLE "new_Specialist" RENAME TO "Specialist";
CREATE UNIQUE INDEX "Specialist_email_key" ON "Specialist"("email");
CREATE TABLE "new_TelemetryPacket" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deviceId" TEXT,
    "patientId" TEXT,
    "payload" TEXT NOT NULL,
    CONSTRAINT "TelemetryPacket_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "NeuroDevice" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TelemetryPacket" ("id", "patientId", "payload", "receivedAt") SELECT "id", "patientId", "payload", "receivedAt" FROM "TelemetryPacket";
DROP TABLE "TelemetryPacket";
ALTER TABLE "new_TelemetryPacket" RENAME TO "TelemetryPacket";
CREATE INDEX "TelemetryPacket_receivedAt_idx" ON "TelemetryPacket"("receivedAt");
CREATE INDEX "TelemetryPacket_patientId_idx" ON "TelemetryPacket"("patientId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "NeuroDevice_keyHash_key" ON "NeuroDevice"("keyHash");

-- CreateIndex
CREATE INDEX "AuditLog_institutionId_createdAt_idx" ON "AuditLog"("institutionId", "createdAt");


UPDATE "Specialist" SET "accessLevel" = 'ADMINISTRADOR' WHERE "role" = 'ADMIN';
INSERT OR IGNORE INTO "PatientAssignment" ("patientId", "specialistId") SELECT DISTINCT "patientId", "specialistId" FROM "ClinicalSession" WHERE "specialistId" IN (SELECT "id" FROM "Specialist" WHERE "accessLevel" = 'TERAPEUTA');

CREATE INDEX "Patient_institutionId_idx" ON "Patient"("institutionId");
CREATE INDEX "Specialist_institutionId_accessLevel_active_idx" ON "Specialist"("institutionId", "accessLevel", "active");
CREATE INDEX "NeuroDevice_institutionId_active_idx" ON "NeuroDevice"("institutionId", "active");
CREATE INDEX "ClinicalSession_patientId_date_idx" ON "ClinicalSession"("patientId", "date");
CREATE INDEX "SensorReading_sessionId_idx" ON "SensorReading"("sessionId");
CREATE INDEX "SpikesLogItem_sessionId_idx" ON "SpikesLogItem"("sessionId");
