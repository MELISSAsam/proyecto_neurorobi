import React, { useState } from 'react';
import { usePatients } from '../context/PatientContext';
import { useSensorStream } from '../hooks/useSensorStream';
// Dashboard views rendered directly in telemetry panels

import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend
} from 'recharts';
import { 
  Wifi, 
  Activity, 
  Heart, 
  Timer,
  Square
} from 'lucide-react';


interface LiveTelemetryProps {
  onEndSessionSuccess: () => void;
  onShowSuccessToast: (msg: string) => void;
}

export const LiveTelemetry: React.FC<LiveTelemetryProps> = ({
  onEndSessionSuccess,
  onShowSuccessToast
}) => {
  const { activePatient, activeSession, endSession, startSession, patients } = usePatients();


  // Active streaming state (both devices on the same screen)
  const [isStreaming, setIsStreaming] = useState(true);


  // Callback whenever a spike is triggered by the hook (real clinical alert)
  const handleSpikeTriggered = (spike: any) => {
    onShowSuccessToast(`⚠️ ${spike.type} Spike: ${spike.alertText}`);
  };

  // Two parallel streams: one per device type, both live on the same screen
  const oso = useSensorStream({
    isStreaming,
    onSpikeTriggered: handleSpikeTriggered,
    patientId: activePatient?.id,
    deviceType: 'oso',
    simulate: false
  });

  const pulsera = useSensorStream({
    isStreaming,
    onSpikeTriggered: handleSpikeTriggered,
    patientId: activePatient?.id,
    deviceType: 'pulsera',
    simulate: false
  });

  if (!activePatient) {
    const handleStartDemo = () => {
      const demoPatient = patients[0] || { id: 'pat-101' };
      if (!patients[0]) {
        onShowSuccessToast(`ℹ️ No hay pacientes registrados. Registra uno en la sección de Gestión de Pacientes primero.`);
        return;
      }
      startSession(demoPatient.id);
      onShowSuccessToast(`✓ Sesión terapéutica demo iniciada.`);
    };

    return (
      <div className="text-center py-16 bg-white border border-slate-100 rounded-2xl p-8 shadow-sm max-w-lg mx-auto my-12 animate-in fade-in zoom-in-95 duration-300">
        <Activity className="text-teal-600 mx-auto mb-4 animate-pulse" size={48} />
        <h2 className="text-base font-bold text-slate-700">Sin Paciente Activo</h2>
        <p className="text-xs text-slate-400 font-semibold mt-1 mb-6">
          Se requiere iniciar una sesión terapéutica con un paciente en el Directorio para transmitir telemetría desde el juguete.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={handleStartDemo}
            className="px-5 py-3 bg-teal-600 hover:bg-teal-700 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md shadow-teal-600/20 active:scale-98 cursor-pointer"
          >
            Iniciar Sesión Demo
          </button>
        </div>
      </div>
    );
  }

  // Calculate current/latest values per device
  const osoLatest = oso.streamData[oso.streamData.length - 1] || {
    deviceType: 'oso',
    hugForce: 0,
    rotationX: 0,
    rotationY: 0,
    rotationZ: 0,
    heartRate: -1,
    switch1: false,
    switch2: false,
    shakeIntensity: 0
  };

  const pulseraLatest = pulsera.streamData[pulsera.streamData.length - 1] || {
    deviceType: 'pulsera',
    hugForce: 0,
    rotationX: 0,
    rotationY: 0,
    rotationZ: 0,
    heartRate: 80,
    switch1: false,
    switch2: false,
    shakeIntensity: 0
  };

  const currentHugForce = osoLatest.hugForce >= 0
    ? osoLatest.hugForce
    : osoLatest.switch1 || osoLatest.switch2
      ? 55
      : 0;

  const forceIsActive = currentHugForce > 0 || osoLatest.switch1 || osoLatest.switch2;
  const currentShakeIntensity = osoLatest.shakeIntensity ?? oso.shakeIntensity;

  // Calculate rotation magnitude for any reading (sentinel -999 = no gyro)
  const calcRotMag = (r: any) => {
    const x = r.rotationX === -999 ? 0 : Number(r.rotationX || 0);
    const y = r.rotationY === -999 ? 0 : Number(r.rotationY || 0);
    const z = r.rotationZ === -999 ? 0 : Number(r.rotationZ || 0);
    return Math.round(Math.sqrt(x * x + y * y + z * z));
  };

  const osoRotationMagnitude = calcRotMag(osoLatest);

  // Chart data with a computed rotationMagnitude key for the oso (MPU6050 del peluche)
  const osoChartData = oso.streamData.map((r: any) => ({
    ...r,
    rotationMagnitude: calcRotMag(r)
  }));

  // Chart data with a computed rotationMagnitude key for the pulsera
  const pulseraChartData = pulsera.streamData.map((r: any) => ({
    ...r,
    rotationMagnitude: calcRotMag(r)
  }));

  // Either device connected means we can show live panels
  const anyoneConnected = oso.isDeviceConnected || pulsera.isDeviceConnected;
  const socketAlive = oso.socketConnected || pulsera.socketConnected;

  // Formatter for timer display
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Triggered when completing the therapy session
  const handleEndSession = () => {
    if (!anyoneConnected) {
      onShowSuccessToast(`❌ No se puede finalizar sesión: Ningún dispositivo ESP32 está conectado.`);
      return;
    }

    if (!activeSession) {
      onShowSuccessToast(`❌ No hay sesión activa para finalizar.`);
      return;
    }
    
    setIsStreaming(false);

    // ─── REGLA DE ORO: fidelidad absoluta a los datos ─────────────
    // Solo se archivan valores REALES medidos por el hardware.
    // Nada de promedios derivados, índices inventados ni estimaciones.
    // Los campos no medidos quedan en 0 y se reportan como [No proporcionado].
    const osoHugValues = oso.streamData.map(r => Number(r.hugForce) || 0).filter(v => v >= 0);
    const pulseraHRValues = pulsera.streamData.map(r => Number(r.heartRate) || 0).filter(v => v > 0);

    const realAvgHug = osoHugValues.length
      ? Math.round(osoHugValues.reduce((a, b) => a + b, 0) / osoHugValues.length)
      : 0;
    const realMaxHug = osoHugValues.length ? Math.max(...osoHugValues) : 0;
    const realAvgHR = pulseraHRValues.length
      ? Math.round(pulseraHRValues.reduce((a, b) => a + b, 0) / pulseraHRValues.length)
      : 0;
    const realMinHR = pulseraHRValues.length ? Math.min(...pulseraHRValues) : 0;
    const realMaxHR = pulseraHRValues.length ? Math.max(...pulseraHRValues) : 0;

    // El dispositivo del peluche (oso) es la sesión principal; la pulsera,
    // solo monitoreo. Los datos de la sesión se guardan del dispositivo que
    // realmente corre la sesión (oso si conectado, si no pulsera).
    const savedDevice = oso.isDeviceConnected ? 'oso' : 'pulsera';
    const isOsoSession = savedDevice === 'oso';

    const finalMetrics = {
      avgHeartRate: realAvgHR,
      maxHeartRate: isOsoSession ? 0 : realMaxHR,
      minHeartRate: isOsoSession ? 0 : realMinHR,
      avgHugForce: isOsoSession ? realAvgHug : 0,
      maxHugForce: isOsoSession ? realMaxHug : 0,
      comfortIndex: 0,
      bilateralSync: 0,
      motorFatigueScore: 0,
      stereotypicalCount: (isOsoSession ? oso : pulsera).spikesLog.filter(s => s.type === 'Cinemática').length,
      calmStatePercentage: 0,
      spikesCount: (isOsoSession ? oso : pulsera).spikesLog.length
    };

    // Solo se archivan los datos del dispositivo que corre la sesión
    const sessionData = isOsoSession ? oso.streamData : pulsera.streamData;
    const sessionSpikes = isOsoSession ? oso.spikesLog : pulsera.spikesLog;

    const realShakeCount = isOsoSession ? oso.strongShakeCount : 0;
    const realTicks = finalMetrics.stereotypicalCount;

    const notesSummary = [
      'REPORTE CLÍNICO — NEUROROBI',
      `• Datos del Paciente e Identificación: ${activePatient?.name || '[No proporcionado]'} (${activePatient?.age != null ? `${activePatient.age} años` : '[No proporcionado]'}). Diagnóstico registrado: ${activePatient?.diagnosis || '[No proporcionado]'}.`,
      `• Motivo de Consulta / Anamnesis: [No proporcionado]`,
      isOsoSession
        ? `• Hallazgos Clínicos y Exploración: Dispositivo Oso. Lecturas reales registradas: ${osoHugValues.length} muestras de presión (promedio ${realAvgHug}%, máxima ${realMaxHug}%), ${realShakeCount} sacudones fuertes, ${realTicks} eventos de agitación motora (giroscopio MPU6050).`
        : `• Hallazgos Clínicos y Exploración: Dispositivo Pulsera. Lecturas reales registradas: ${pulseraHRValues.length} muestras de pulso (promedio ${realAvgHR} bpm, mínima ${realMinHR} bpm, máxima ${realMaxHR} bpm), ${realTicks} eventos de agitación motora.`,
      `• Diagnóstico / Criterio Médico: [No proporcionado]`,
      `• Plan / Tratamiento: [No proporcionado]`
    ].join('\n');

    endSession(
      notesSummary,
      secondsElapsed,
      finalMetrics,
      sessionData,
      sessionSpikes,
      savedDevice as 'oso' | 'pulsera'
    );

    onShowSuccessToast(`✓ Sesión finalizada con éxito. Procesando reporte clínico...`);
    onEndSessionSuccess();
  };

  const secondsElapsed = Math.max(oso.secondsElapsed, pulsera.secondsElapsed);

// Fatigue checkmarks and trigger logs cleared as direct sensor view is now active

  return (
    <div className="space-y-6">
      
      {/* Top Section: Active Patient Info & Flashing Device Status */}
      <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4 bg-white border border-slate-100 rounded-2xl p-5 shadow-xs">
        
        {/* Patient Capsule */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-teal-50 flex items-center justify-center text-teal-600 font-bold">
            {activePatient?.name?.charAt(0) || 'P'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-black text-slate-800">{activePatient?.name}</h2>
              <span className="text-[10px] bg-slate-100 font-semibold px-2 py-0.5 rounded-full">{activePatient?.age} años</span>
            </div>
            <p className="text-[11px] text-slate-400 font-semibold mt-0.5">Diagnóstico: <span className="text-teal-600">{activePatient?.diagnosis}</span></p>
          </div>
        </div>

        {/* Dual Device Status (Pulsera + Oso) */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-100 border border-slate-200 px-3.5 py-2 rounded-xl text-slate-700 text-[10px] font-black uppercase tracking-wider">
            <span className="text-slate-400">Transmisión doble:</span>
            <span className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${pulsera.isDeviceConnected ? 'bg-emerald-500 animate-ping' : 'bg-rose-500'}`}></span>
              Pulsera
            </span>
            <span className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${oso.isDeviceConnected ? 'bg-emerald-500 animate-ping' : 'bg-rose-500'}`}></span>
              Oso
            </span>
          </div>
        </div>

        {/* Telemetry Status Controller */}
        <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-slate-500">
          
          {/* Oso Connection Flag */}
          {oso.isDeviceConnected ? (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 px-3.5 py-2 rounded-xl">
              <span className="h-2.5 w-2.5 bg-emerald-500 rounded-full animate-ping"></span>
              <span className="text-emerald-800 font-black tracking-wider text-[10px] uppercase">OSO CONECTADO</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-rose-50 border border-rose-100 px-3.5 py-2 rounded-xl">
              <span className="h-2.5 w-2.5 bg-rose-500 rounded-full animate-pulse"></span>
              <span className="text-rose-800 font-black tracking-wider text-[10px] uppercase">OSO DESCONECTADO</span>
            </div>
          )}

          {/* Pulsera Connection Flag */}
          {pulsera.isDeviceConnected ? (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 px-3.5 py-2 rounded-xl">
              <span className="h-2.5 w-2.5 bg-emerald-500 rounded-full animate-ping"></span>
              <span className="text-emerald-800 font-black tracking-wider text-[10px] uppercase">PULSERA CONECTADA</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-rose-50 border border-rose-100 px-3.5 py-2 rounded-xl">
              <span className="h-2.5 w-2.5 bg-rose-500 rounded-full animate-pulse"></span>
              <span className="text-rose-800 font-black tracking-wider text-[10px] uppercase">PULSERA DESCONECTADA</span>
            </div>
          )}

          {/* Wi-Fi Wave Indicator */}
          <div className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border ${
            anyoneConnected ? 'bg-teal-50 border-teal-100 text-teal-700' : 'bg-slate-50 border-slate-100 text-slate-400'
          }`}>
            <Wifi size={14} className={anyoneConnected ? 'animate-pulse' : ''} />
            <span>{anyoneConnected ? 'Señal Activa' : 'Sin Señal'}</span>
          </div>

          <div className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border ${
            socketAlive ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-rose-50 border-rose-100 text-rose-700'
          }`}>
            <span className={`h-2.5 w-2.5 rounded-full ${socketAlive ? 'bg-emerald-500 animate-ping' : 'bg-rose-500 animate-pulse'}`} />
            <span>{socketAlive ? 'Socket Conectado' : 'Socket Desconectado'}</span>
          </div>

          {/* Live Timer Counter */}
          <div className="flex items-center gap-2 bg-teal-50 border border-teal-100 px-3.5 py-2 rounded-xl text-teal-700">
            <Timer size={14} />
            <span className="font-mono text-sm leading-none">{formatTime(secondsElapsed)}</span>
          </div>

        </div>

      </div>


      {!anyoneConnected ? (
        <div className="bg-white border border-rose-100 rounded-3xl p-8 shadow-md max-w-2xl mx-auto text-center space-y-6 py-12 animate-in fade-in zoom-in-95 duration-300">
          <div className="relative mx-auto w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center text-rose-500 border border-rose-100">
            <Wifi size={40} className="animate-pulse" />
            <span className="absolute bottom-0 right-0 h-4 w-4 bg-rose-500 rounded-full border-2 border-white animate-ping"></span>
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-black text-slate-800">⚠️ Dispositivos Neurorobi Desconectados</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
              La interfaz está en modo <strong>ESP32 Real</strong> pero el servidor no está recibiendo datos. Enciende el juguete (oso y/o pulsera) y verifica la conexión para continuar la terapia.
            </p>
          </div>

          <div className="border border-slate-100 bg-slate-50 rounded-2xl p-5 text-left text-xs space-y-4 max-w-lg mx-auto">
            <h4 className="font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wider text-[10px]">
              📋 Guía de Conexión del Hardware:
            </h4>
            
            <ol className="list-decimal list-inside space-y-2 text-slate-600">
              <li>El ESP32 y esta computadora deben estar en la <strong>misma red Wi-Fi</strong>.</li>
              <li>Configura tu sketch de ESP32 para hacer peticiones <strong>HTTP POST</strong> a:
                <div className="mt-1 font-mono bg-white px-3 py-1.5 rounded-lg border border-slate-200 text-teal-600 font-bold select-all overflow-x-auto whitespace-nowrap">
                  http://&lt;IP_DE_TU_PC&gt;:3001/api/telemetry
                </div>
                <span className="text-[10px] text-slate-400 font-semibold mt-1 block">
                  💡 (Ej: Abre una terminal en tu PC y escribe <code className="bg-slate-200 px-1 rounded">ipconfig</code> para buscar tu dirección IPv4 local, ej: <code className="bg-slate-200 px-1 rounded">192.168.20.119</code>).
                </span>
              </li>
              <li>El ESP32 debe transmitir un JSON cada 1 segundo con la siguiente estructura:
                <pre className="mt-1 bg-slate-900 text-slate-200 font-mono text-[10px] p-3 rounded-lg overflow-x-auto">
{`{
  "hugForce": 45,      // Presión (0 a 100)
  "rotationX": 15,     // Giroscopio X
  "rotationY": -5,     // Giroscopio Y
  "rotationZ": 8,      // Giroscopio Z
  "heartRate": 85      // Pulso (bpm)
}`}
                </pre>
              </li>
            </ol>
          </div>

          <div className="flex justify-center items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-400">
            <span className="h-2 w-2 rounded-full bg-rose-500 animate-ping"></span>
            <span>Escuchando en puerto 3001...</span>
          </div>
        </div>
      ) : (
        <>
          {/* Main Grid: Recharts Fluid AreaChart continuous stream */}
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <Activity className="text-teal-600 animate-pulse" size={18} />
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
                  Flujo de Sensores en Tiempo Real (ESP32 Real)
                </h3>
              </div>
              
              {/* Quick indicators for both devices */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-teal-500"></span> Oso · Presión: {currentHugForce}%</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500"></span> Brazo Izq: {osoLatest.switch1 ? 'ACTIVO' : 'INACTIVO'}</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-fuchsia-500"></span> Brazo Der: {osoLatest.switch2 ? 'ACTIVO' : 'INACTIVO'}</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-indigo-500"></span> Sacudón: {currentShakeIntensity} pts</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500"></span> Pulsera · Pulso: {pulseraLatest.heartRate} bpm</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-pink-500"></span> Oso · Cinemática: {osoRotationMagnitude}°/s</span>
              </div>
            </div>

            {/* Recharts panel split into separate telemetry charts (both devices) */}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 w-full">
              <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-xs">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                  🐻 Oso · Duración de Presionado de Brazos
                </span>
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 mt-4">
                  <div className="h-72 bg-white rounded-2xl p-2 border border-slate-100">
                    <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-2">Brazo Izquierdo</div>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={oso.streamData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorLeftArm" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="timestamp" stroke="#94a3b8" fontSize={9} tickLine={false} />
                        <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} domain={[0, 'dataMax + 1']} />
                        <Tooltip />
                        <Area
                          type="monotone"
                          name="Izquierdo"
                          dataKey="switch1Duration"
                          stroke="#f59e0b"
                          strokeWidth={2.5}
                          fillOpacity={1}
                          fill="url(#colorLeftArm)"
                          activeDot={{ r: 5 }}
                          isAnimationActive={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="h-72 bg-white rounded-2xl p-2 border border-slate-100">
                    <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-2">Brazo Derecho</div>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={oso.streamData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorRightArm" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#c026d3" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="#c026d3" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="timestamp" stroke="#94a3b8" fontSize={9} tickLine={false} />
                        <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} domain={[0, 'dataMax + 1']} />
                        <Tooltip />
                        <Area
                          type="monotone"
                          name="Derecho"
                          dataKey="switch2Duration"
                          stroke="#c026d3"
                          strokeWidth={2.5}
                          fillOpacity={1}
                          fill="url(#colorRightArm)"
                          activeDot={{ r: 5 }}
                          isAnimationActive={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-xs">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                  💓 Pulsera · Pulso Cardíaco
                </span>
                <div className="h-72 mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={pulseraChartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorLeftArmPulse" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#e11d48" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#e11d48" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="timestamp" stroke="#94a3b8" fontSize={9} tickLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} domain={[0, 'dataMax + 10']} />
                      <Tooltip />
                      <Legend verticalAlign="top" height={36} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10, fontWeight: 'bold' }} />
                      <Area
                        type="monotone"
                        name="Pulso Cardíaco (bpm)"
                        dataKey="heartRate"
                        stroke="#e11d48"
                        strokeWidth={2.5}
                        fillOpacity={1}
                        fill="url(#colorLeftArmPulse)"
                        activeDot={{ r: 5 }}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-xs">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                  🐻 Oso · Intensidad de Sacudón
                </span>
                <div className="h-72 mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={oso.streamData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorShake" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="timestamp" stroke="#94a3b8" fontSize={9} tickLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} domain={[0, 100]} />
                      <Tooltip />
                      <Legend verticalAlign="top" height={36} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10, fontWeight: 'bold' }} />
                      <Area
                        type="monotone"
                        name="Sacudón"
                        dataKey="shakeIntensity"
                        stroke="#6366f1"
                        strokeWidth={2.5}
                        fillOpacity={1}
                        fill="url(#colorShake)"
                        activeDot={{ r: 5 }}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-xs">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                  📐 Oso · Magnitud de Rotación (MPU6050)
                </span>
                <div className="h-72 mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={osoChartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorMotion" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ec4899" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#ec4899" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="timestamp" stroke="#94a3b8" fontSize={9} tickLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} domain={[0, 150]} />
                      <Tooltip />
                      <Legend verticalAlign="top" height={36} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10, fontWeight: 'bold' }} />
                      <Area
                        type="monotone"
                        name="Magnitud de Rotación"
                        dataKey="rotationMagnitude"
                        stroke="#ec4899"
                        strokeWidth={2.5}
                        fillOpacity={1}
                        fill="url(#colorMotion)"
                        activeDot={{ r: 5 }}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>

          {/* Device-specific dashboard panels */}
          <h3 className="text-[11px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full bg-amber-200"></span>
            1 · Panel del Peluche Oso
          </h3>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="space-y-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                🤗 1. Presión / Abrazos del Peluche
              </span>
              <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-600">Fuerza del Abrazo</span>
                  <span className={`text-teal-600 font-bold text-[10px] bg-teal-50 border border-teal-100 px-2.5 py-0.5 rounded-full ${forceIsActive ? 'bg-teal-50 text-teal-600 border-teal-100' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                    {forceIsActive ? 'ACTIVO' : 'INACTIVO'}
                  </span>
                </div>

                <div className="text-center py-4">
                  <span className="text-5xl font-black text-slate-800">{currentHugForce}%</span>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Intensidad de Apretón</p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-slate-50 border border-slate-100 p-3 text-xs font-medium text-slate-700">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold">Brazo Izquierdo</span>
                      <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase ${osoLatest.switch1 ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                        {osoLatest.switch1 ? 'PRESIONADO' : 'LIBRE'}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500">Estado de toque lateral izquierdo.</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 border border-slate-100 p-3 text-xs font-medium text-slate-700">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold">Brazo Derecho</span>
                      <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase ${osoLatest.switch2 ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                        {osoLatest.switch2 ? 'PRESIONADO' : 'LIBRE'}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500">Estado de toque lateral derecho.</p>
                  </div>
                </div>

                <div className="bg-slate-50 rounded-xl p-3.5 text-xs text-slate-500 font-medium">
                  <div className="flex justify-between mb-2">
                    <span>Abrazo Promedio:</span>
                    <span className="font-bold text-slate-700">{oso.avgHugForce}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Calidad de Contacto:</span>
                    <span className="font-bold text-teal-600">{currentHugForce > 60 ? 'Fuerte' : currentHugForce > 20 ? 'Moderado' : 'Suave'}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                🖐️ 2. Switches Izquierdo/Derecho
              </span>
              <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between px-3 py-3 rounded-2xl bg-slate-50 border border-slate-100">
                  <span className="text-xs font-bold text-slate-600">Brazo Izquierdo (SW1)</span>
                  <span className={`text-xs font-black uppercase px-3 py-1 rounded-full ${osoLatest.switch1 ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                    {osoLatest.switch1 ? 'PRESIONADO' : 'LIBRE'}
                  </span>
                </div>

                <div className="flex items-center justify-between px-3 py-3 rounded-2xl bg-slate-50 border border-slate-100">
                  <span className="text-xs font-bold text-slate-600">Brazo Derecho (SW2)</span>
                  <span className={`text-xs font-black uppercase px-3 py-1 rounded-full ${osoLatest.switch2 ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                    {osoLatest.switch2 ? 'PRESIONADO' : 'LIBRE'}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                🌪️ 3. Sacudón / Agitación
              </span>
              <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-600">Intensidad de Sacudón</span>
                  <span className={`text-xs font-black uppercase px-3 py-1 rounded-full ${currentShakeIntensity > 80 ? 'bg-rose-100 text-rose-700 border border-rose-200' : 'bg-emerald-100 text-emerald-700 border border-emerald-200'}`}>
                    {currentShakeIntensity > 0 ? `${currentShakeIntensity} pts` : 'SIN SACUDIDA'}
                  </span>
                </div>

                <div className="bg-slate-50 rounded-xl p-3.5 text-xs text-slate-500 font-medium">
                  <div className="flex justify-between">
                    <span>Último evento:</span>
                    <span className="font-bold text-slate-800">{currentShakeIntensity > 0 ? 'Detectado' : 'No detectado'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Alerta de movimiento:</span>
                    <span className={`font-bold ${currentShakeIntensity > 80 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {currentShakeIntensity > 80 ? 'Alta' : 'Estable'}
                    </span>
                  </div>
                  <div className="flex flex-col items-center justify-between pt-3 border-t border-slate-100 gap-2">
                    <span className="text-[10px] uppercase tracking-[0.25em] text-slate-400">Sacudones fuertes</span>
                    <span className="text-4xl font-black text-slate-900 leading-none">{oso.strongShakeCount}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                📐 4. Giroscopio (MPU6050 del Peluche)
              </span>
              {oso.isGyroConnected ? (
                <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-600">Cinemática MPU6050</span>
                    <span className="text-indigo-600 font-bold text-[10px] bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 rounded-full">
                      ACTIVO
                    </span>
                  </div>

                  <div className="flex items-center justify-around py-2">
                    <div className="text-center">
                      <span className="text-3xl font-black text-slate-800">{osoRotationMagnitude} <span className="text-xs text-slate-400 font-bold">°/s</span></span>
                      <p className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">Magnitud Actual</p>
                    </div>
                    <div className="h-8 w-px bg-slate-100"></div>
                    <div className="text-center">
                      <span className="text-3xl font-black text-indigo-600">{oso.stereotypicalTicks}</span>
                      <p className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">Tics Motores</p>
                    </div>
                  </div>

                  <div className="bg-slate-50 rounded-xl p-3.5 text-[10px] text-slate-500 font-medium space-y-1">
                    <div className="flex justify-between">
                      <span>Coordenadas Ejes:</span>
                      <span className="font-mono font-bold text-slate-700">
                        X: {osoLatest.rotationX}°/s | Y: {osoLatest.rotationY}°/s | Z: {osoLatest.rotationZ}°/s
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Estado de Movimiento:</span>
                      <span className={`font-bold ${osoRotationMagnitude > 130 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {osoRotationMagnitude > 130 ? 'Agitación / Crisis' : 'Estable'}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white border border-rose-100 rounded-2xl p-8 shadow-xs text-center text-rose-700 font-bold text-xs flex flex-col justify-center items-center gap-2 min-h-[220px]">
                  <Wifi size={28} className="text-rose-400 animate-pulse" />
                  <span>MPU6050 Desconectado</span>
                  <p className="text-[10px] text-slate-400 font-normal max-w-[160px]">
                    No se detectó comunicación I2C con el giroscopio del peluche.
                  </p>
                </div>
              )}
            </div>
          </div>

          <h3 className="text-[11px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full bg-rose-200"></span>
            2 · Panel de la Pulsera
          </h3>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="space-y-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                ❤️ 1. Ritmo Cardíaco (Latido en Vivo)
              </span>
              {pulsera.isPulseConnected ? (
                <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs space-y-4">
                  <style>{`
                    @keyframes nrb-heartbeat {
                      0%, 100% { transform: scale(1); }
                      14% { transform: scale(1.28); }
                      28% { transform: scale(1); }
                      42% { transform: scale(1.16); }
                      70% { transform: scale(1); }
                    }
                  `}</style>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-600">Latido del Corazón</span>
                    <span className="text-emerald-600 font-bold text-[10px] bg-emerald-50 border border-emerald-100 px-2.5 py-0.5 rounded-full">
                      ACTIVO
                    </span>
                  </div>

                  <div className="flex items-center justify-around py-2">
                    <div className="text-center">
                      <Heart
                        size={44}
                        fill="currentColor"
                        className={pulseraLatest.heartRate > 115 ? 'text-rose-500' : 'text-rose-400'}
                        style={{
                          animation: `nrb-heartbeat ${60000 / Math.max(30, pulseraLatest.heartRate)}ms infinite`
                        }}
                      />
                      <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">Latido</p>
                    </div>
                    <div className="h-10 w-px bg-slate-100"></div>
                    <div className="text-center">
                      <span className="text-3xl font-black text-slate-800">{pulseraLatest.heartRate} <span className="text-xs text-slate-400 font-bold">bpm</span></span>
                      <p className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">Ritmo Actual</p>
                    </div>
                    <div className="h-10 w-px bg-slate-100"></div>
                    <div className="text-center">
                      <span className="text-3xl font-black text-emerald-600">{pulsera.avgHeartRate} <span className="text-xs text-slate-400 font-bold">bpm</span></span>
                      <p className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">Ritmo Promedio</p>
                    </div>
                  </div>

                  <div className="bg-slate-50 rounded-xl p-3.5 text-xs text-slate-500 font-medium">
                    <div className="flex justify-between">
                      <span>Tono de Regulación:</span>
                      <span className={`font-bold ${pulseraLatest.heartRate > 115 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {pulseraLatest.heartRate > 115 ? 'Taquicardia' : 'Normal'}
                      </span>
                    </div>
                    <div className="flex justify-between mt-1">
                      <span>Sincronizado con el pulso real:</span>
                      <span className="font-mono font-bold text-slate-700">
                        {(60000 / Math.max(30, pulseraLatest.heartRate)).toFixed(0)} ms/latido
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white border border-rose-100 rounded-2xl p-8 shadow-xs text-center text-rose-700 font-bold text-xs flex flex-col justify-center items-center gap-2 min-h-[220px]">
                  <Heart size={28} className="text-slate-300" />
                  <span>Sin Detección de Pulso</span>
                  <p className="text-[10px] text-slate-400 font-normal max-w-[160px]">
                    Ponga el dedo sobre el sensor MAX30102 para ver el latido en vivo.
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                💓 2. Sensor de Pulso (Ritmo Cardíaco)
              </span>
              {pulsera.isPulseConnected ? (
                <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-600">Pulso Cardíaco</span>
                    <span className="text-emerald-600 font-bold text-[10px] bg-emerald-50 border border-emerald-100 px-2.5 py-0.5 rounded-full">
                      ACTIVO
                    </span>
                  </div>

                  <div className="flex items-center justify-around py-2">
                    <div className="text-center">
                      <span className="text-3xl font-black text-slate-800">{pulseraLatest.heartRate} <span className="text-xs text-slate-400 font-bold">bpm</span></span>
                      <p className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">Ritmo Actual</p>
                    </div>
                    <div className="h-8 w-px bg-slate-100"></div>
                    <div className="text-center">
                      <span className="text-3xl font-black text-emerald-600">{pulsera.avgHeartRate} <span className="text-xs text-slate-400 font-bold">bpm</span></span>
                      <p className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">Ritmo Promedio</p>
                    </div>
                  </div>

                  <div className="bg-slate-50 rounded-xl p-3.5 text-xs text-slate-500 font-medium">
                    <div className="flex justify-between">
                      <span>Tono de Regulación:</span>
                      <span className={`font-bold ${pulseraLatest.heartRate > 115 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {pulseraLatest.heartRate > 115 ? 'Taquicardia' : 'Normal'}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white border border-rose-100 rounded-2xl p-8 shadow-xs text-center text-rose-700 font-bold text-xs flex flex-col justify-center items-center gap-2 min-h-[220px]">
                  <Activity size={28} className="text-rose-400 animate-pulse" />
                  <span>Sensor de Pulso Desconectado</span>
                  <p className="text-[10px] text-slate-400 font-normal max-w-[160px]">
                    El canal analógico 35 no reporta señal del ritmo cardíaco.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Master Session Stop */}
          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs flex flex-col justify-center items-center max-w-xl mx-auto">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Control Maestro de Sesión</span>
            
            <button
              onClick={handleEndSession}
              className="w-full flex items-center justify-center gap-2.5 py-4 px-5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-rose-600/20 active:scale-98 transition-all animate-pulse"
            >
              <Square size={14} fill="currentColor" />
              Finalizar Sesión Terapéutica
            </button>
            
            <span className="text-[9px] text-slate-400 mt-2 font-bold uppercase tracking-wider text-center">
              Congela el flujo y procesa promedios
            </span>
          </div>
        </>
      )}

    </div>
  );
};