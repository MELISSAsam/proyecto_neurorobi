import React, { useState } from 'react';
import { usePatients } from '../context/PatientContext';
import { useSensorStream } from '../hooks/useSensorStream';
import { useRole } from '../context/RoleContext';
import { PsychologistDashboard } from '../components/dashboards/PsychologistDashboard';
import { OccupationalDashboard } from '../components/dashboards/OccupationalDashboard';
import { NeurologistDashboard } from '../components/dashboards/NeurologistDashboard';

import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend,
  ReferenceLine
} from 'recharts';
import { 
  Wifi, 
  Activity, 
  Timer,
  Square,
  Sparkles,
  Play
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
  const { activeRole } = useRole();

  const [isStreaming, setIsStreaming] = useState(true);
  const [triggers, setTriggers] = useState<string[]>([]);
  const [fatigueCheckmarks, setFatigueCheckmarks] = useState<Record<string, boolean>>({});

  const handleSpikeTriggered = (spike: any) => {
    onShowSuccessToast(`⚠️ ${spike.type}: ${spike.alertText}`);
  };

  // Stream exclusivo del Peluche NeuroRobi
  const oso = useSensorStream({
    isStreaming,
    onSpikeTriggered: handleSpikeTriggered,
    patientId: activePatient?.id,
    deviceType: 'oso',
    simulate: false,
    directEsp32Ip: null
  });

  if (!activePatient) {
    const handleStartDemo = () => {
      const demoPatient = patients[0];
      if (!demoPatient) {
        onShowSuccessToast(`ℹ️ No hay pacientes registrados. Registra uno primero.`);
        return;
      }
      startSession(demoPatient.id);
      onShowSuccessToast(`✓ Sesión terapéutica iniciada con ${demoPatient.name}.`);
    };

    return (
      <div className="text-center py-16 bg-white border border-slate-100 rounded-2xl p-8 shadow-sm max-w-lg mx-auto my-12 animate-in fade-in zoom-in-95 duration-300">
        <Activity className="text-teal-600 mx-auto mb-4 animate-pulse" size={48} />
        <h2 className="text-base font-bold text-slate-700">Sin Paciente Activo</h2>
        <p className="text-xs text-slate-400 font-semibold mt-1 mb-6">
          Selecciona o inicia una sesión con un paciente para transmitir la telemetría del Peluche NeuroRobi.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={handleStartDemo}
            className="px-5 py-3 bg-teal-600 hover:bg-teal-700 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md shadow-teal-600/20 active:scale-98 cursor-pointer flex items-center justify-center gap-2"
          >
            <Play size={14} /> Iniciar Sesión Terapéutica
          </button>
        </div>
      </div>
    );
  }

  const latestReading = oso.streamData[oso.streamData.length - 1] || {
    flexIzq: oso.flexIzq,
    flexDer: oso.flexDer,
    apreton: oso.apreton,
    nivelDer: oso.nivelDer,
    switchIzq: oso.switch1Pressed,
    switchDer: oso.switch2Pressed,
    mpu: oso.mpuOk,
    accX: oso.accX,
    accY: oso.accY,
    accZ: oso.accZ,
    giroX: oso.giroX,
    giroY: oso.giroY,
    giroZ: oso.giroZ,
    movimiento: oso.movimiento
  };

  const currentFlexIzq = latestReading.flexIzq ?? oso.flexIzq ?? 0;
  const currentFlexDer = latestReading.flexDer ?? oso.flexDer ?? 0;
  const currentApreton = Boolean(latestReading.apreton ?? oso.apreton);
  const currentNivelDer = latestReading.nivelDer ?? oso.nivelDer ?? 1;
  const currentSwIzq = Boolean(latestReading.switchIzq ?? oso.switch1Pressed);
  const currentSwDer = Boolean(latestReading.switchDer ?? oso.switch2Pressed);
  const currentMpu = Boolean(latestReading.mpu ?? oso.mpuOk);
  const currentMovimiento = Number(latestReading.movimiento ?? oso.movimiento ?? 0);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleEndSession = () => {
    if (!oso.isDeviceConnected && oso.streamData.length === 0) {
      onShowSuccessToast(`❌ No se puede finalizar sesión: No se han recibido lecturas del Peluche.`);
      return;
    }

    if (!activeSession) {
      onShowSuccessToast(`❌ No hay sesión activa.`);
      return;
    }
    
    setIsStreaming(false);

    const hugValues = oso.streamData.map(r => Number(r.nivelDer || 1) * 10);
    const avgHug = hugValues.length ? Math.round(hugValues.reduce((a, b) => a + b, 0) / hugValues.length) : 0;
    const maxHug = hugValues.length ? Math.max(...hugValues) : 0;

    const finalMetrics = {
      avgHeartRate: 0,
      maxHeartRate: 0,
      minHeartRate: 0,
      avgHugForce: avgHug,
      maxHugForce: maxHug,
      comfortIndex: currentApreton ? 90 : 65,
      bilateralSync: oso.bilateralTouchSync,
      motorFatigueScore: Object.values(fatigueCheckmarks).filter(Boolean).length * 25,
      stereotypicalCount: oso.stereotypicalTicks,
      calmStatePercentage: Math.max(0, Math.min(100, Math.round(100 - currentMovimiento))),
      spikesCount: oso.spikesLog.length
    };

    endSession(
      activeSession.notes || '',
      oso.secondsElapsed,
      finalMetrics,
      oso.streamData,
      oso.spikesLog,
      'oso'
    );
    onEndSessionSuccess();
  };

  return (
    <div className="space-y-6">
      
      {/* ─── Top Control Bar: Estado del Peluche y Conexión ─── */}
      <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
        
        {/* Dispositivo y Paciente */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-xl">
            🐻
          </div>
          <div>
            <h2 className="text-sm font-black text-slate-800 flex items-center gap-2">
              Peluche NeuroRobi · Telemetría Clínica
            </h2>
            <p className="text-[11px] text-slate-400 font-bold">
              Paciente: <span className="text-teal-700">{activePatient.name}</span> ({activePatient.diagnosis})
            </p>
          </div>
        </div>

        {/* Indicadores de Conexión */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
          
          {/* Estado Hardware Oso */}
          {oso.isDeviceConnected ? (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-1.5 rounded-xl shadow-xs">
              <span className="h-2.5 w-2.5 bg-emerald-500 rounded-full animate-ping"></span>
              <span className="text-[10px] font-black uppercase tracking-wider">PELUCHE CONECTADO</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-800 px-3 py-1.5 rounded-xl shadow-xs">
              <span className="h-2.5 w-2.5 bg-rose-500 rounded-full animate-pulse"></span>
              <span className="text-[10px] font-black uppercase tracking-wider">PELUCHE DESCONECTADO</span>
            </div>
          )}

          {/* Wi-Fi Señal */}
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] ${
            oso.isDeviceConnected ? 'bg-teal-50 border-teal-100 text-teal-700' : 'bg-slate-50 border-slate-200 text-slate-400'
          }`}>
            <Wifi size={13} className={oso.isDeviceConnected ? 'animate-pulse' : ''} />
            <span>{oso.isDeviceConnected ? 'Señal Activa' : 'Buscando Señal'}</span>
          </div>

          {/* Socket.IO */}
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] ${
            oso.socketConnected ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-400'
          }`}>
            <span className={`h-2 w-2 rounded-full ${oso.socketConnected ? 'bg-emerald-500 animate-ping' : 'bg-slate-400'}`} />
            <span>{oso.socketConnected ? 'Socket OK' : 'Socket Desconectado'}</span>
          </div>

          {/* Cronómetro */}
          <div className="flex items-center gap-1.5 bg-slate-900 text-teal-400 px-3.5 py-1.5 rounded-xl font-mono text-xs font-black shadow-xs">
            <Timer size={13} />
            <span>{formatTime(oso.secondsElapsed)}</span>
          </div>


        </div>

      </div>

      {/* Si no hay datos ni conexión */}
      {!oso.isDeviceConnected ? (
        <div className="bg-white border border-rose-100 rounded-3xl p-8 shadow-md max-w-2xl mx-auto text-center space-y-6 py-10 animate-in fade-in zoom-in-95 duration-300">
          <div className="relative mx-auto w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center text-amber-500 border border-amber-200 text-4xl">
            🐻
            <span className="absolute bottom-0 right-0 h-4 w-4 bg-rose-500 rounded-full border-2 border-white animate-ping"></span>
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-black text-slate-800">Esperando conexión del Peluche NeuroRobi</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
              Enciende el peluche y espera su conexion a Internet. Las lecturas aparecen al recibir la senal del dispositivo.
            </p>
          </div>

          <div className="flex justify-center items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-400 pt-2">
            <span className="h-2 w-2 rounded-full bg-amber-500 animate-ping"></span>
            <span>Escuchando sensores del peluche (ADC 32, 33 / SW 18, 19 / MPU6050)...</span>
          </div>
        </div>
      ) : (
        <>
          {/* ─── 4 Tarjetas de Sensores del Peluche (Conforme al código ESP32) ─── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            
            {/* Tarjeta 1: Apretón - GPIO 32 */}
            <div className={`p-5 rounded-2xl border transition-all ${
              currentApreton 
                ? 'bg-emerald-500 text-white border-emerald-600 shadow-md shadow-emerald-500/20' 
                : 'bg-white border-slate-100 shadow-xs'
            }`}>
              <div className="flex justify-between items-center mb-2">
                <span className={`text-[10px] font-bold uppercase tracking-wider ${currentApreton ? 'text-emerald-100' : 'text-slate-400'}`}>
                  Apretón Táctil (GPIO 32)
                </span>
                <span className={`text-xs font-black px-2 py-0.5 rounded-full ${
                  currentApreton ? 'bg-white text-emerald-700' : 'bg-slate-100 text-slate-500'
                }`}>
                  {currentApreton ? 'APRETÓN ON' : 'OFF'}
                </span>
              </div>
              <div className="mt-2">
                <span className={`text-3xl font-black ${currentApreton ? 'text-white' : 'text-slate-800'}`}>
                  {currentFlexIzq}
                </span>
                <span className={`text-xs ml-1 font-bold ${currentApreton ? 'text-emerald-100' : 'text-slate-400'}`}>
                  ADC
                </span>
              </div>
              <div className="mt-3">
                <div className={`w-full rounded-full h-2 overflow-hidden ${currentApreton ? 'bg-emerald-600' : 'bg-slate-100'}`}>
                  <div 
                    className={`h-2 rounded-full transition-all duration-200 ${currentApreton ? 'bg-white' : 'bg-teal-500'}`}
                    style={{ width: `${Math.min(100, (currentFlexIzq / 1500) * 100)}%` }}
                  ></div>
                </div>
                <div className="flex justify-between items-center mt-1 text-[9px] font-semibold opacity-75">
                  <span>0</span>
                  <span>Umbral: 600</span>
                  <span>4095</span>
                </div>
              </div>
            </div>

            {/* Tarjeta 2: Flex Derecho - GPIO 33 */}
            <div className="p-5 rounded-2xl bg-white border border-slate-100 shadow-xs">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Flex Derecho (GPIO 33)
                </span>
                <span className="text-xs font-black text-purple-700 bg-purple-50 border border-purple-100 px-2 py-0.5 rounded-full">
                  Nivel {currentNivelDer}/10
                </span>
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <div>
                  <span className="text-3xl font-black text-slate-800">{currentNivelDer}</span>
                  <span className="text-xs text-slate-400 font-bold ml-1">/ 10</span>
                </div>
                <span className="text-xs font-mono font-bold text-purple-600">ADC: {currentFlexDer}</span>
              </div>
              {/* Curvatura dinámica del flex */}
              <div className="mt-2">
                <svg className="w-full h-9" viewBox="0 0 260 50">
                  <path 
                    d={`M 15 25 Q 130 ${25 + currentNivelDer * 2.5} 245 25`}
                    stroke="#a855f7" 
                    strokeWidth="5" 
                    strokeLinecap="round" 
                    fill="none" 
                  />
                </svg>
                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className="bg-purple-600 h-1.5 rounded-full transition-all duration-200"
                    style={{ width: `${currentNivelDer * 10}%` }}
                  ></div>
                </div>
              </div>
            </div>

            {/* Tarjeta 3: Finales de Carrera (GPIO 18 y GPIO 19) */}
            <div className="p-5 rounded-2xl bg-white border border-slate-100 shadow-xs flex flex-col justify-between">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Finales de Carrera
                </span>
                <span className="text-[9px] font-black text-slate-400 uppercase">GPIO 18 / 19</span>
              </div>
              
              <div className="grid grid-cols-2 gap-2 mt-2">
                {/* Switch Izquierdo */}
                <div className={`p-2.5 rounded-xl border text-center transition-all ${
                  currentSwIzq 
                    ? 'bg-emerald-500 text-white border-emerald-600 shadow-xs' 
                    : 'bg-slate-50 text-slate-600 border-slate-200'
                }`}>
                  <span className="text-[9px] font-black block uppercase tracking-wider opacity-80">Brazo Izq (18)</span>
                  <span className="text-sm font-black mt-0.5 block">{currentSwIzq ? 'ACTIVADO' : 'LIBRE'}</span>
                </div>

                {/* Switch Derecho */}
                <div className={`p-2.5 rounded-xl border text-center transition-all ${
                  currentSwDer 
                    ? 'bg-emerald-500 text-white border-emerald-600 shadow-xs' 
                    : 'bg-slate-50 text-slate-600 border-slate-200'
                }`}>
                  <span className="text-[9px] font-black block uppercase tracking-wider opacity-80">Brazo Der (19)</span>
                  <span className="text-sm font-black mt-0.5 block">{currentSwDer ? 'ACTIVADO' : 'LIBRE'}</span>
                </div>
              </div>

              <span className="text-[9px] text-slate-400 font-semibold mt-2 text-center block">
                Sincronía bilateral: {oso.bilateralTouchSync}%
              </span>
            </div>

            {/* Tarjeta 4: MPU6050 Movimiento y Giro */}
            <div className="p-5 rounded-2xl bg-white border border-slate-100 shadow-xs flex flex-col justify-between">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Cinemática MPU6050
                </span>
                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
                  currentMpu ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : 'bg-rose-50 text-rose-700'
                }`}>
                  {currentMpu ? 'MPU OK' : 'SIN MPU'}
                </span>
              </div>

              <div className="mt-1 flex items-baseline justify-between">
                <div>
                  <span className="text-3xl font-black text-slate-800">{currentMovimiento.toFixed(1)}</span>
                  <span className="text-xs text-slate-400 font-bold ml-1">/ 100</span>
                </div>
                <span className="text-[10px] font-bold uppercase text-indigo-600">
                  {currentMovimiento > 40 ? 'Agitación' : currentMovimiento > 15 ? 'Moderado' : 'Calma'}
                </span>
              </div>

              <div className="mt-2">
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div 
                    className={`h-2 rounded-full transition-all duration-200 ${
                      currentMovimiento > 50 ? 'bg-rose-500' : currentMovimiento > 25 ? 'bg-amber-500' : 'bg-indigo-600'
                    }`}
                    style={{ width: `${Math.min(100, currentMovimiento)}%` }}
                  ></div>
                </div>
                <div className="flex justify-between items-center text-[9px] font-mono text-slate-500 mt-1">
                  <span>Giro X:{latestReading.giroX?.toFixed(0) || 0}°</span>
                  <span>Y:{latestReading.giroY?.toFixed(0) || 0}°</span>
                  <span>Z:{latestReading.giroZ?.toFixed(0) || 0}°</span>
                </div>
              </div>
            </div>

          </div>

          {/* ─── Vistas Especializadas (Psicología, Fisioterapia, Neurología) ─── */}
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-teal-600" />
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                  Panel de Especialidad: {activeRole.replace('_', ' ')}
                </h3>
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase">
                Evaluación en tiempo real para el Oso
              </span>
            </div>

            {activeRole === 'PSICOLOGIA_CLINICA' && (
              <PsychologistDashboard
                currentHugForce={currentNivelDer * 10}
                avgHugForce={oso.avgHugForce}
                onAddTrigger={(trigger) => setTriggers(prev => [...prev, trigger])}
                triggers={triggers}
                apreton={currentApreton}
                flexIzq={currentFlexIzq}
                movimiento={currentMovimiento}
              />
            )}

            {activeRole === 'FISIOTERAPIA' && (
              <OccupationalDashboard
                currentHugForce={currentNivelDer * 10}
                maxGripForce={oso.maxGripForce}
                bilateralTouchSync={oso.bilateralTouchSync}
                fatigueCheckmarks={fatigueCheckmarks}
                onToggleFatigueCheckmark={(key) => setFatigueCheckmarks(prev => ({ ...prev, [key]: !prev[key] }))}
                nivelDer={currentNivelDer}
                flexDer={currentFlexDer}
                switchIzq={currentSwIzq}
                switchDer={currentSwDer}
              />
            )}

            {activeRole === 'EDUCACION_ESPECIAL' && (
              <NeurologistDashboard
                stereotypicalTicks={oso.stereotypicalTicks}
                secondsElapsed={oso.secondsElapsed}
                movimiento={currentMovimiento}
                mpuOk={currentMpu}
                giroX={latestReading.giroX || 0}
                giroY={latestReading.giroY || 0}
                giroZ={latestReading.giroZ || 0}
                accX={latestReading.accX || 0}
                accY={latestReading.accY || 0}
                accZ={latestReading.accZ || 1}
              />
            )}

            {activeRole === 'ADMIN' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="font-bold text-slate-700 block mb-1">Afecto / Apretón (GPIO 32)</span>
                  <p className="text-[11px] text-slate-500">
                    Lectura ADC: {currentFlexIzq} | Estado: {currentApreton ? 'Apretón Detectado' : 'Libre'}
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="font-bold text-slate-700 block mb-1">Flexión Articular (GPIO 33)</span>
                  <p className="text-[11px] text-slate-500">
                    Nivel Clínico: {currentNivelDer}/10 | ADC: {currentFlexDer}
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="font-bold text-slate-700 block mb-1">Cinemática MPU6050</span>
                  <p className="text-[11px] text-slate-500">
                    Movimiento: {currentMovimiento.toFixed(1)}/100 | Tics: {oso.stereotypicalTicks}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* ─── Gráficos en Tiempo Real Recharts (Peluche NeuroRobi) ─── */}
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Activity size={16} className="text-teal-600 animate-pulse" />
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                  Dinámica de Telemetría Continua (Peluche NeuroRobi)
                </h3>
              </div>
              <div className="flex items-center gap-3 text-[10px] font-bold uppercase text-slate-400">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500"></span> Apretón ADC</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-purple-500"></span> Flex Derecho</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-indigo-500"></span> Movimiento MPU</span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Gráfico 1: Flexión y Apretón Táctil */}
              <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-xs">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-2">
                  1. Apretón Táctil (GPIO 32) y Flexión Derecha (GPIO 33)
                </span>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={oso.streamData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorFlexIzq" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.25}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorFlexDer" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#a855f7" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="timestamp" stroke="#94a3b8" fontSize={9} tickLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} />
                      <Tooltip />
                      <Legend verticalAlign="top" height={30} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10, fontWeight: 'bold' }} />
                      <ReferenceLine y={600} stroke="#f43f5e" strokeDasharray="3 3" label={{ value: 'Umbral Apretón (600)', fill: '#f43f5e', fontSize: 9 }} />
                      <Area
                        type="monotone"
                        name="Apretón ADC (GPIO 32)"
                        dataKey="flexIzq"
                        stroke="#10b981"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorFlexIzq)"
                        isAnimationActive={false}
                      />
                      <Area
                        type="monotone"
                        name="Flex Derecho ADC (GPIO 33)"
                        dataKey="flexDer"
                        stroke="#a855f7"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorFlexDer)"
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Gráfico 2: Cinemática e Intensidad de Movimiento MPU6050 */}
              <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-xs">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-2">
                  2. Intensidad de Movimiento Relativo (MPU6050 / 100)
                </span>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={oso.streamData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorMov" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25}/>
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="timestamp" stroke="#94a3b8" fontSize={9} tickLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} domain={[0, 100]} />
                      <Tooltip />
                      <Legend verticalAlign="top" height={30} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10, fontWeight: 'bold' }} />
                      <ReferenceLine y={50} stroke="#f43f5e" strokeDasharray="3 3" label={{ value: 'Alerta Agitación (50)', fill: '#f43f5e', fontSize: 9 }} />
                      <Area
                        type="monotone"
                        name="Movimiento / Agitación (0-100)"
                        dataKey="movimiento"
                        stroke="#6366f1"
                        strokeWidth={2.5}
                        fillOpacity={1}
                        fill="url(#colorMov)"
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

            </div>
          </div>

          {/* ─── Control Maestro: Finalizar Sesión Terapéutica ─── */}
          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs flex flex-col justify-center items-center max-w-xl mx-auto">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">
              Control de Sesión Clínica (Peluche NeuroRobi)
            </span>
            
            <button
              onClick={handleEndSession}
              className="w-full flex items-center justify-center gap-2.5 py-4 px-5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-rose-600/20 active:scale-98 transition-all cursor-pointer"
            >
              <Square size={14} fill="currentColor" />
              Finalizar Sesión Terapéutica y Guardar Reporte
            </button>
            
            <span className="text-[9px] text-slate-400 mt-2 font-bold uppercase tracking-wider text-center">
              Consolida métricas del peluche en el expediente del paciente
            </span>
          </div>
        </>
      )}

    </div>
  );
};
