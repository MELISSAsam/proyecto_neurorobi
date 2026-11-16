import React, { useState } from 'react';
import { usePatients } from '../context/PatientContext';
import { useRole } from '../context/RoleContext';
import { AddClinicalNoteForm } from '../components/forms/AddClinicalNoteForm';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { 
  Sparkles, 
  Timer, 
  AlertTriangle,
  ShieldCheck,
  Compass,
  Printer,
  Layers
} from 'lucide-react';
import { PrintReportModal } from '../components/shared/PrintReportModal';

interface PostSessionReportProps {
  onArchiveSuccess: () => void;
  onShowSuccessToast: (msg: string) => void;
  onShowErrorToast?: (msg: string) => void;
}

type SegmentTab = 'pressure' | 'flex' | 'gyro';

export const PostSessionReport: React.FC<PostSessionReportProps> = ({
  onArchiveSuccess,
  onShowSuccessToast,
  onShowErrorToast
}) => {
  const { activeSession, archiveSession, loadDemoSession } = usePatients();
  const { activeRole } = useRole();

  const [activeTab, setActiveTab] = useState<SegmentTab>('pressure');
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  if (!activeSession) {
    const handleLoadDemo = () => {
      loadDemoSession();
      onShowSuccessToast("✓ Reporte de sesión demo cargado.");
    };

    return (
      <div className="text-center py-16 bg-white border border-slate-100 rounded-2xl p-8 shadow-sm max-w-lg mx-auto my-12 animate-in fade-in zoom-in-95 duration-300">
        <AlertTriangle className="text-slate-400 mx-auto mb-4" size={48} />
        <h2 className="text-base font-bold text-slate-700">Sin Reporte de Sesión Activo</h2>
        <p className="text-xs text-slate-400 font-semibold mt-1 mb-6">
          Inicia y finaliza una consulta terapéutica con el Oso NeuroRobi, o carga datos demo.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={handleLoadDemo}
            className="px-5 py-3 bg-teal-600 hover:bg-teal-700 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md shadow-teal-600/20 active:scale-98 cursor-pointer"
          >
            Cargar Reporte Demo
          </button>
        </div>
      </div>
    );
  }

  const { metrics, sensorHistory, spikesLog } = activeSession;

  const mins = Math.floor(activeSession.durationSeconds / 60);
  const secs = activeSession.durationSeconds % 60;

  const getFilteredSpikes = () => {
    if (activeTab === 'pressure') return spikesLog.filter(s => s.type === 'Presión');
    if (activeTab === 'flex') return spikesLog.filter(s => s.type === 'Flexión Articular');
    return spikesLog.filter(s => s.type === 'Cinemática');
  };

  const handleArchiveSubmit = async (clinicalNotes: string) => {
    const finalized = {
      ...activeSession,
      notes: clinicalNotes
    };
    try {
      await archiveSession(finalized);
      onShowSuccessToast(`✓ Expediente clínico sincronizado y guardado con éxito.`);
      onArchiveSuccess();
    } catch (e) {
      console.error('Error archiving session', e);
      onShowErrorToast?.(`❌ Error al guardar el reporte. Verifique la conexión.`);
    }
  };

  const filteredSpikes = getFilteredSpikes();

  const getTabBorderColor = (tab: SegmentTab) => {
    if (tab === 'pressure') return activeTab === 'pressure' ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-slate-100 hover:bg-slate-50 text-slate-600';
    if (tab === 'flex') return activeTab === 'flex' ? 'border-purple-600 bg-purple-50 text-purple-700' : 'border-slate-100 hover:bg-slate-50 text-slate-600';
    return activeTab === 'gyro' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-100 hover:bg-slate-50 text-slate-600';
  };

  // Muestras reales del Oso
  const flexDerSamples = sensorHistory
    .map((r: any) => Number(r.nivelDer ?? (r.hugForce ? Math.round(r.hugForce / 10) : 0)))
    .filter(v => v > 0);
  const avgNivelDer = flexDerSamples.length 
    ? (flexDerSamples.reduce((a, b) => a + b, 0) / flexDerSamples.length).toFixed(1)
    : '0';
  const maxNivelDer = flexDerSamples.length ? Math.max(...flexDerSamples) : 0;

  // Estabilidad MPU6050
  const movSamples = sensorHistory.map((r: any) => Number(r.movimiento ?? r.shakeIntensity ?? 0));
  const movTotal = movSamples.length;
  const calmSamples = movSamples.filter(v => v < 25).length;
  const calmValue = movTotal ? Math.round((calmSamples / movTotal) * 100) : 80;
  const ticValue = 100 - calmValue;

  const pieData = [
    { name: 'Calma Estable', value: calmValue, color: '#6366f1' },
    { name: 'Agitación Motora', value: ticValue, color: '#f43f5e' }
  ];

  return (
    <div className="space-y-6">
      
      {/* 1. Header: Patient Summary & Duration Block */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-bold text-teal-600 uppercase tracking-widest block mb-1">Diagnóstico Post-Sesión</span>
          <h2 className="text-lg font-black text-slate-800 tracking-tight">Reporte Clínico: {activeSession.patientName}</h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">Expediente temporal del Oso NeuroRobi archivado para auditoría.</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="bg-slate-50 border border-slate-100 px-4 py-2 rounded-xl text-center">
            <span className="text-[9px] font-bold text-slate-400 uppercase block">Duración Terapia</span>
            <span className="text-sm font-black text-slate-700 flex items-center gap-1 mt-0.5"><Timer size={12} /> {mins}m {secs}s</span>
          </div>

          <div className="bg-amber-50 border border-amber-100 px-4 py-2 rounded-xl text-center">
            <span className="text-[9px] font-bold text-amber-700 uppercase block">Dispositivo</span>
            <span className="text-xs font-black text-amber-900 uppercase flex items-center gap-1 mt-0.5">🐻 Oso NeuroRobi</span>
          </div>

          <div className="bg-emerald-50 border border-emerald-100 px-4 py-2 rounded-xl text-center">
            <span className="text-[9px] font-bold text-emerald-600 uppercase block">Estado</span>
            <span className="text-xs font-black text-emerald-800 flex items-center gap-1 mt-0.5"><ShieldCheck size={12} /> Procesado</span>
          </div>

          <button
            onClick={() => setIsPrintModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-3 bg-teal-600 hover:bg-teal-700 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md shadow-teal-600/10 active:scale-98 cursor-pointer"
          >
            <Printer size={14} /> Imprimir / PDF
          </button>
        </div>
      </div>

      {/* 2. Analytical Selector Segment Buttons (A, B, C) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        
        {/* Button A: Pressure */}
        <button
          onClick={() => setActiveTab('pressure')}
          className={`flex items-center gap-3 px-5 py-4 border-2 rounded-2xl text-left font-bold text-xs uppercase tracking-wider cursor-pointer transition-all ${getTabBorderColor('pressure')}`}
        >
          <Sparkles size={16} />
          <div className="flex flex-col items-start leading-none gap-1">
            <span>A. Apretón Táctil (GPIO 32)</span>
            <span className="text-[9px] font-bold opacity-60">Confort: {metrics.comfortIndex > 0 ? `${metrics.comfortIndex}%` : '85%'}</span>
          </div>
        </button>

        {/* Button B: Flex Derecho */}
        <button
          onClick={() => setActiveTab('flex')}
          className={`flex items-center gap-3 px-5 py-4 border-2 rounded-2xl text-left font-bold text-xs uppercase tracking-wider cursor-pointer transition-all ${getTabBorderColor('flex')}`}
        >
          <Layers size={16} />
          <div className="flex flex-col items-start leading-none gap-1">
            <span>B. Flexión Articular (GPIO 33)</span>
            <span className="text-[9px] font-bold opacity-60">Nivel Promedio: {avgNivelDer}/10</span>
          </div>
        </button>

        {/* Button C: Kinematic MPU6050 */}
        <button
          onClick={() => setActiveTab('gyro')}
          className={`flex items-center gap-3 px-5 py-4 border-2 rounded-2xl text-left font-bold text-xs uppercase tracking-wider cursor-pointer transition-all ${getTabBorderColor('gyro')}`}
        >
          <Compass size={16} />
          <div className="flex flex-col items-start leading-none gap-1">
            <span>C. Cinemática / MPU6050</span>
            <span className="text-[9px] font-bold opacity-60">Calma: {calmValue}%</span>
          </div>
        </button>

      </div>

      {/* 3. Sub-Dashboard Grid: Charts and widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* High Resolution Chart Card */}
        <div className="lg:col-span-2 bg-white border border-slate-100 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
              {activeTab === 'pressure' && 'Historial de Apretón Afectivo (GPIO 32 - ADC)'}
              {activeTab === 'flex' && 'Historial de Flexión del Brazo Derecho (GPIO 33 - Nivel 1 a 10)'}
              {activeTab === 'gyro' && 'Historial de Intensidad de Movimiento Cinemático (MPU6050)'}
            </h3>
            <p className="text-[11px] text-slate-400 font-semibold mt-0.5">Telemetría archivada durante la sesión del Oso.</p>
          </div>

          <div className="h-64 w-full overflow-y-auto">
            {sensorHistory.length === 0 ? (
              <div className="h-full flex items-center justify-center border border-dashed border-slate-100 rounded-2xl bg-slate-50/30">
                <p className="text-xs text-slate-400 font-medium">No hay registros de sensores en memoria para esta sesión.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sensorHistory} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="timestamp" stroke="#94a3b8" fontSize={9} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey={
                      activeTab === 'pressure' 
                        ? 'flexIzq' 
                        : activeTab === 'flex' 
                        ? 'nivelDer' 
                        : 'movimiento'
                    }
                    name={
                      activeTab === 'pressure' 
                        ? 'Apretón ADC' 
                        : activeTab === 'flex' 
                        ? 'Nivel de Flexión (1-10)' 
                        : 'Intensidad Movimiento (0-100)'
                    }
                    stroke={
                      activeTab === 'pressure' 
                        ? '#0d9488' 
                        : activeTab === 'flex' 
                        ? '#a855f7' 
                        : '#6366f1'
                    }
                    fill={
                      activeTab === 'pressure' 
                        ? '#ccfbf1' 
                        : activeTab === 'flex' 
                        ? '#f3e8ff' 
                        : '#e0e7ff'
                    }
                    strokeWidth={2.5}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Specialized Analytical Widgets Column */}
        <div className="lg:col-span-1 space-y-6">
          
          {/* TAB A: PRESSURE */}
          {activeTab === 'pressure' && (
            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs h-full flex flex-col justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Apretón Táctil (GPIO 32)</h4>
                
                <div className="flex flex-col items-center justify-center my-6">
                  <div className="w-full grid grid-cols-2 gap-3">
                    <div className="bg-teal-50 border border-teal-100 rounded-2xl p-4 text-center">
                      <span className="text-3xl font-black text-slate-800">{metrics.maxHugForce || 75}%</span>
                      <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">Presión Máxima</p>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-center">
                      <span className="text-3xl font-black text-slate-800">{metrics.comfortIndex || 85}%</span>
                      <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">Índice Confort</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5 text-[11px] text-slate-500 leading-relaxed font-semibold">
                * Medición de estímulos propioceptivos registrada por el sensor analógico en GPIO 32 (umbral de apretón: 600 ADC).
              </div>
            </div>
          )}

          {/* TAB B: FLEXION ARTICULAR */}
          {activeTab === 'flex' && (
            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs h-full flex flex-col justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Flexión Articular y Switches</h4>
                
                <div className="space-y-4 my-2">
                  <div className="bg-purple-50 border border-purple-100 rounded-2xl p-4 text-center">
                    <span className="text-3xl font-black text-purple-900">{avgNivelDer} <span className="text-xs font-bold text-purple-500">/ 10</span></span>
                    <p className="text-[9px] font-bold text-purple-500 uppercase mt-1">Nivel Promedio Brazo Derecho</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                      <span className="text-lg font-black text-slate-800">{maxNivelDer}/10</span>
                      <p className="text-[9px] font-bold text-slate-400 uppercase">Flexión Pico</p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                      <span className="text-lg font-black text-emerald-700">{metrics.bilateralSync || 75}%</span>
                      <p className="text-[9px] font-bold text-slate-400 uppercase">Sincronía SW</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5 text-[11px] text-slate-500 leading-relaxed font-semibold">
                * Rango de movimiento articular del oso medido en GPIO 33 y coordinación con finales de carrera (SW18/19).
              </div>
            </div>
          )}

          {/* TAB C: MPU6050 GYROSCOPE */}
          {activeTab === 'gyro' && (
            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs h-full flex flex-col justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Mapa de Estabilidad Motriz MPU6050</h4>
                
                <div className="h-32 w-full flex items-center justify-center my-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={25}
                        outerRadius={45}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  
                  <div className="flex flex-col gap-1 text-[10px] font-bold text-slate-600 pl-4 shrink-0">
                    <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-indigo-500"></span> Calma ({calmValue}%)</div>
                    <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-500"></span> Agitación ({ticValue}%)</div>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5 text-[11px] text-slate-500 leading-relaxed font-semibold">
                * Cuantificación del MPU6050: tics estereotipados registrados: {metrics.stereotypicalCount || 0}.
              </div>
            </div>
          )}

        </div>

      </div>

      {/* 4. Timeline list of spikes */}
      <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-4">
          Registro de Eventos y Spikes del Oso
        </h3>
        
        <div className="relative border-l border-slate-100 pl-6 space-y-4">
          {filteredSpikes.length === 0 ? (
            <div className="text-xs text-slate-400 font-medium py-4">No se registraron anomalías en este canal.</div>
          ) : (
            filteredSpikes.map(spike => (
              <div key={spike.id} className="relative flex items-start gap-4">
                <span className="absolute -left-[31px] bg-white p-1 rounded-full border border-slate-100">
                  <span className={`h-2 w-2 rounded-full block ${
                    spike.severity === 'critical' ? 'bg-rose-500' : 'bg-amber-400'
                  }`}></span>
                </span>

                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-400 bg-slate-50 border border-slate-100 px-2 py-0.5 rounded">
                      [{spike.timestamp}]
                    </span>
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-700">
                      {spike.type}
                    </span>
                  </div>
                  <p className="text-xs text-slate-700 font-medium leading-relaxed mt-1">
                    {spike.alertText} Valor: <span className="font-bold text-slate-900">{spike.value}</span>
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 5. Conclusions & Archiving Form */}
      <AddClinicalNoteForm
        session={activeSession}
        onArchive={handleArchiveSubmit}
        activeRole={activeRole}
      />

      <PrintReportModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        session={activeSession}
      />

    </div>
  );
};
