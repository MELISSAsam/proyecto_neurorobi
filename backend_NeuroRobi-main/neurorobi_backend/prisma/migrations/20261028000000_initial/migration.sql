-- CreateTable
CREATE TABLE "Patient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "diagnosis" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Listo para Consulta',
    "initialObservation" TEXT NOT NULL,
    "profileImageUrl" TEXT,
    "registeredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ClinicalSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patientId" TEXT NOT NULL,
    "patientName" TEXT NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationSeconds" INTEGER NOT NULL,
    "specialistRole" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "deviceType" TEXT NOT NULL DEFAULT 'PULSERA',
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
    CONSTRAINT "ClinicalSession_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ClinicalSession_specialistId_fkey" FOREIGN KEY ("specialistId") REFERENCES "Specialist" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SensorReading" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sessionId" TEXT NOT NULL,
    "timestamp" TEXT NOT NULL,
    "deviceType" TEXT NOT NULL DEFAULT 'PULSERA',
    "hugForce" REAL NOT NULL,
    "rotationX" REAL NOT NULL,
    "rotationY" REAL NOT NULL,
    "rotationZ" REAL NOT NULL,
    "heartRate" REAL NOT NULL,
    CONSTRAINT "SensorReading_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ClinicalSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SpikesLogItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "timestamp" TEXT NOT NULL,
    "deviceType" TEXT NOT NULL DEFAULT 'PULSERA',
    "type" TEXT NOT NULL,
    "value" REAL NOT NULL,
    "alertText" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    CONSTRAINT "SpikesLogItem_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ClinicalSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Specialist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "profileImageUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Specialist_email_key" ON "Specialist"("email");
