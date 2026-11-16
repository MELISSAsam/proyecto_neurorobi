import { prisma } from './db';

export async function seedPatients() {
  if (process.env.NODE_ENV === 'production' || process.env.SEED_DEMO_DATA === 'false') return;
  try {
    const existingCount = await prisma.patient.count();
    if (existingCount > 0) {
      console.log(`ℹ️ Pacientes ya existentes en la base de datos (${existingCount}). Omitiendo siembra.`);
      return;
    }

    console.log('🌱 Sembrando pacientes clínicos iniciales para Neurorobi...');

    // Find default specialist
    const specialist = await prisma.specialist.findFirst({
      where: { role: 'PSICOLOGIA_CLINICA' }
    }) || await prisma.specialist.findFirst();

    const specialistId = specialist ? specialist.id : undefined;

    const patient1 = await prisma.patient.create({
      data: {
        name: 'Mateo Benítez',
        age: 6,
        diagnosis: 'Trastorno del Espectro Autista (TEA - Nivel 1)',
        status: 'Listo para Consulta',
        initialObservation: 'Presenta hipersensibilidad táctil leve y conductas repetitivas de balanceo en momentos de sobreestimulación sensorial. Responde positivamente a estímulos propioceptivos suaves.',
        registeredAt: new Date(Date.now() - 7 * 24 * 3600 * 1000)
      }
    });

    const patient2 = await prisma.patient.create({
      data: {
        name: 'Lucía Morales',
        age: 8,
        diagnosis: 'TDAH con Desregulación Sensorial',
        status: 'Listo para Consulta',
        initialObservation: 'Dificultad para autorregulación emocional y atención sostenida. Inquietud motora y agitación cinemática en miembros superiores ante frustración.',
        registeredAt: new Date(Date.now() - 5 * 24 * 3600 * 1000)
      }
    });

    const patient3 = await prisma.patient.create({
      data: {
        name: 'Santiago Ramos',
        age: 5,
        diagnosis: 'Parálisis Cerebral Infantil (Hemiparesia Leve)',
        status: 'Listo para Consulta',
        initialObservation: 'Requiere rehabilitación en agarre bimanual y sincronía táctil. Excelente disposición lúdica ante juguetes terapéuticos.',
        registeredAt: new Date(Date.now() - 3 * 24 * 3600 * 1000)
      }
    });

    const patient4 = await prisma.patient.create({
      data: {
        name: 'Valentina Castro',
        age: 7,
        diagnosis: 'Trastorno de Procesamiento Sensorial (TPS)',
        status: 'Listo para Consulta',
        initialObservation: 'Búsqueda propioceptiva activa mediante presión profunda para calmar estados de hiperalerta. Manifiesta afecto positivo con el peluche terapéutico.',
        registeredAt: new Date(Date.now() - 1 * 24 * 3600 * 1000)
      }
    });

    // Create a demo completed session for Mateo if specialist exists
    if (specialistId) {
      await prisma.clinicalSession.create({
        data: {
          patientId: patient1.id,
          patientName: patient1.name,
          specialistId: specialistId,
          specialistRole: 'PSICOLOGIA_CLINICA',
          date: new Date(Date.now() - 2 * 24 * 3600 * 1000),
          durationSeconds: 320,
          deviceType: 'PULSERA',
          notes: 'Sesión inicial de adaptación. Mateo interactuó de manera calmada con la pulsera durante los primeros 4 minutos. Se observó un pico transitorio de presión afectiva al sonar música rítmica. Regulación autonómica favorable.',
          avgHeartRate: 84,
          maxHeartRate: 118,
          minHeartRate: 72,
          avgHugForce: 42,
          maxHugForce: 78,
          comfortIndex: 88,
          bilateralSync: 79,
          motorFatigueScore: 18,
          stereotypicalCount: 2,
          calmStatePercentage: 86,
          spikesCount: 1,
          sensorHistory: {
            create: [
              { timestamp: '10:00:05', hugForce: 35, rotationX: 2, rotationY: -1, rotationZ: 0, heartRate: 78 },
              { timestamp: '10:01:10', hugForce: 48, rotationX: 12, rotationY: 8, rotationZ: -4, heartRate: 82 },
              { timestamp: '10:02:15', hugForce: 78, rotationX: 18, rotationY: 14, rotationZ: 6, heartRate: 105 },
              { timestamp: '10:03:20', hugForce: 52, rotationX: 5, rotationY: 2, rotationZ: 1, heartRate: 88 },
              { timestamp: '10:04:30', hugForce: 38, rotationX: 3, rotationY: 0, rotationZ: 0, heartRate: 80 },
              { timestamp: '10:05:20', hugForce: 30, rotationX: 1, rotationY: 1, rotationZ: 0, heartRate: 76 }
            ]
          },
          spikesLog: {
            create: [
              {
                id: 'spk-demo-01',
                timestamp: '10:02:15',
                type: 'Presión',
                value: 78,
                alertText: 'Abrazo Afectivo de Alta Intensidad: 78% de presión registrado.',
                severity: 'warning'
              }
            ]
          }
        }
      });
    }

    console.log('✅ Pacientes y sesión clínica de prueba sembrados exitosamente.');
  } catch (error) {
    console.error('❌ Error sembrando pacientes:', error);
  }
}

// If executed directly via CLI
if (require.main === module) {
  seedPatients().then(() => process.exit(0));
}
