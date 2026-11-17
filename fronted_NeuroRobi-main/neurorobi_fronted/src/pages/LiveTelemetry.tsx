import axios from 'axios';
import { useDeviceAvailability } from '../hooks/useDeviceAvailability';
import React, { useState, useEffect, useRef } from 'react';
import { shakeLevel, shakeScore } from '../utils/movement';
import { usePatients } from '../context/PatientContext';
import { useSensorStream } from '../hooks/useSensorStream';
import { useRole } from '../context/RoleContext';
import { PsychologistDashboard } from '../components/dashboards/PsychologistDashboard';
import { OccupationalDashboard } from '../components/dashboards/OccupationalDashboard';
import { NeurologistDashboard } from '../components/dashboards/NeurologistDashboard';

import { InteractionCharts } from '../components/reports/InteractionCharts';
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
  const { activePatient, activeSession, endSession, startSession, clearActiveSession, patients } = usePatients();
  const { activeRole } = useRole();

  const [isStreaming, setIsStreaming] = useState(false);
  const availability = useDeviceAvailability();
  const controllerId = useRef(crypto.randomUUID());
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [starting, setStarting] = useState(false);
  const [controlError, setControlError] = useState('');
  const control = (action: string, patientId?: string) => axios.post(`${import.meta.env.VITE_API_URL}/api/telemetry/control`, { action, patientId, controllerId: controllerId.current }, { timeout: 5000 });
  useEffect(() => {
    if (!isStreaming) return;
    let pending = false;
    const timer = setInterval(async () => {
      if (pending) return;
      pending = true;
      try { await control('keepalive'); }
      catch { setIsStreaming(false); setControlError('La terapia se detuvo al perder comunicacion con el servidor. Guarda los registros disponibles.'); }
      finally { pending = false; }
    }, 3000);
    return () => { clearInterval(timer); void control('stop').catch(() => {}); };
  }, [isStreaming]);
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

  const latestReading = oso.streamData[oso.streamData.length - 1] || {
    flexIzq: oso.flexIzq,
    apreton: oso.apreton,
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
  const currentApreton = Boolean(latestReading.apreton ?? oso.apreton);
  const currentSwIzq = Boolean(latestReading.switchIzq ?? oso.switch1Pressed);
  const currentSwDer = Boolean(latestReading.switchDer ?? oso.switch2Pressed);
  const currentMpu = Boolean(latestReading.mpu ?? oso.mpuOk);
  const currentMovimiento = Number(latestReading.movimiento ?? oso.movimiento ?? 0);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleEndSession = async () => {
    if (oso.streamData.length === 0) {
      setIsStreaming(false);
      try { await control('stop'); } catch { /* El permiso vence automaticamente. */ }
      await clearActiveSession();
      onShowSuccessToast('Terapia detenida. No se recibieron mediciones para generar un informe.');
      return;
    }

    if (!activeSession) {
      onShowSuccessToast(`❌ No hay sesión activa.`);
      return;
    }

    setIsStreaming(false);
    try { await control('stop'); } catch { /* El permiso vence automaticamente si se pierde conexion. */ }

    const hugValues: number[] = oso.streamData.map(r => r.apreton ? 100 : 0);
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

  if (!isStreaming || !activePatient) {
    const patientId = selectedPatientId || activePatient?.id || '';
    const hasRecords = oso.streamData.length > 0 && Boolean(activeSession);
    const pendingReport = Boolean(activeSession?.completedAt || Number(activeSession?.durationSeconds) > 0);
    return <section className="max-w-2xl mx-auto rounded-3xl border border-slate-100 bg-white p-7 sm:p-12 shadow-sm text-center space-y-5 my-8">
      <Activity size={48} className={`mx-auto ${availability.connected ? 'text-teal-500' : 'text-slate-300'}`}/>
      <p className="text-[10px] uppercase tracking-widest font-bold text-teal-600">Modo de espera</p>
      <h1 className="text-2xl font-black text-slate-800">{availability.connected ? 'NeuroRobi listo para utilizar' : 'Esperando conexion de NeuroRobi'}</h1>
      <p className="text-sm text-slate-500">{availability.connected ? 'Selecciona un paciente y pulsa Empezar terapia. En espera no se leen ni guardan mediciones terapeuticas.' : 'Enciende el peluche y espera su conexion al servidor.'}</p>
      <p className="text-xs text-slate-400">{availability.serverConnected ? 'Servidor conectado' : 'Conectando con el servidor...'}</p>
      {controlError && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">{controlError}</p>}
      {hasRecords ? <button onClick={handleEndSession} className="rounded-xl bg-teal-600 px-5 py-3 text-sm font-bold text-white">Finalizar y guardar registros disponibles</button> : <>
        <select aria-label="Paciente para terapia" value={patientId} onChange={e=>setSelectedPatientId(e.target.value)} className="w-full rounded-xl border border-slate-200 p-3 text-sm text-slate-700"><option value="">Selecciona un paciente</option>{patients.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <button disabled={!availability.connected || availability.inUse || !patientId || starting || pendingReport} onClick={async()=>{
          setStarting(true);setControlError('');
          try {
            await control('start', patientId);
            try { await startSession(patientId); } catch (error) { await control('stop'); throw error; }
            setIsStreaming(true);onShowSuccessToast('Terapia iniciada. NeuroRobi esta registrando las interacciones.');
          } catch(error) { setControlError(axios.isAxiosError(error) ? error.response?.data?.error || 'No se pudo empezar la terapia.' : 'No se pudo empezar la terapia.'); }
          finally { setStarting(false); }
        }} className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-6 py-3 text-sm font-bold text-white disabled:opacity-40"><Play size={16}/>{starting ? 'Iniciando...' : 'Empezar terapia'}</button>
        {pendingReport && <p className="text-xs text-amber-700">Hay un informe pendiente. Guardalo en Auditoria y Reporte antes de empezar otra terapia.</p>}
        {availability.inUse && <p className="text-xs text-amber-700">NeuroRobi esta en uso en otra terapia.</p>}
      </>}
      <p className="text-[11px] text-slate-400">Las mediciones comienzan solo al iniciar la terapia y se detienen al finalizar o salir de esta vista.</p>
    </section>;
  }

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
            <span>Escuchando sensores del peluche (apreton, contactos y sacudidas)...</span>
          </div>
        </div>
      ) : (
        <>
          {/* ─── 4 Tarjetas de Sensores del Peluche (Conforme al código ESP32) ─── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">

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
                  Sacudidas del peluche
                </span>
                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
                  currentMpu ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : 'bg-rose-50 text-rose-700'
                }`}>
                  {currentMpu ? 'Sensor activo' : 'Sin sensor'}
                </span>
              </div>

              <div className="mt-1 flex items-baseline justify-between">
                <div>
                  <span className="text-3xl font-black text-slate-800">{currentMpu ? shakeScore(currentMovimiento) : "--"}</span>
                  <span className="text-xs text-slate-400 font-bold ml-1">/ 10</span>
                </div>
                <span className="text-[10px] font-bold uppercase text-indigo-600">
                  {currentMpu ? shakeLevel(currentMovimiento) : "Sin lectura"}
                </span>
              </div>

              <div className="mt-2">
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-2 rounded-full transition-all duration-200 ${
                      currentMovimiento >= 60 ? 'bg-rose-500' : currentMovimiento >= 30 ? 'bg-amber-500' : 'bg-indigo-600'
                    }`}
                    style={{ width: `${Math.min(100, currentMovimiento)}%` }}
                  ></div>
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
                currentHugForce={currentApreton ? 100 : 0}
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
                currentHugForce={currentApreton ? 100 : 0}
                maxGripForce={oso.maxGripForce}
                bilateralTouchSync={oso.bilateralTouchSync}
                fatigueCheckmarks={fatigueCheckmarks}
                onToggleFatigueCheckmark={(key) => setFatigueCheckmarks(prev => ({ ...prev, [key]: !prev[key] }))}
                apreton={currentApreton}
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
                  <span className="font-bold text-slate-700 block mb-1">Sacudidas del peluche</span>
                  <p className="text-[11px] text-slate-500">
                    Sacudida: {currentMpu ? shakeLevel(currentMovimiento) : "Sin sensor"} | Sacudidas fuertes: {oso.stereotypicalTicks}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* ─── Gráficos en Tiempo Real Recharts (Peluche NeuroRobi) ─── */}
          <InteractionCharts readings={oso.streamData}/>

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
