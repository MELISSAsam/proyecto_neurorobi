import React, { useState } from 'react';
import { Heart, Plus, Tag } from 'lucide-react';

interface PsychologistDashboardProps {
  currentHugForce: number;
  avgHugForce: number;
  onAddTrigger: (trigger: string) => void;
  triggers: string[];
  apreton?: boolean;
  flexIzq?: number;
  movimiento?: number;
}

export const PsychologistDashboard: React.FC<PsychologistDashboardProps> = ({
  currentHugForce,
  avgHugForce,
  onAddTrigger,
  triggers,
  apreton = false,
  flexIzq = 0,
  movimiento = 0
}) => {
  const [newTrigger, setNewTrigger] = useState('');

  // Calculate emotional comfort state based on bear hug force and apretón
  let comfortStatus = 'Estable / Reposo Afectivo';
  let comfortColor = 'text-teal-600 bg-teal-50 border-teal-100';
  
  if (apreton || flexIzq > 600) {
    comfortStatus = 'Abrazo de Co-regulación Afectiva (Apretón ON)';
    comfortColor = 'text-rose-600 bg-rose-50 border-rose-200 animate-pulse font-black';
  } else if (currentHugForce > 40) {
    comfortStatus = 'Buscando Confort / Presión Propioceptiva';
    comfortColor = 'text-amber-600 bg-amber-50 border-amber-100';
  } else if (currentHugForce < 10) {
    comfortStatus = 'Sin Interacción Afectiva Activa';
    comfortColor = 'text-slate-500 bg-slate-50 border-slate-100';
  }

  // Agitation Score directly from MPU6050 movimiento
  const agitationPercentage = Math.min(100, Math.max(0, Math.round(movimiento)));

  const handleAddTriggerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTrigger.trim()) return;
    onAddTrigger(newTrigger.trim());
    setNewTrigger('');
  };

  // Radial progress calculations (0-100 scale based on flexIzq up to 2000 ADC)
  const percentValue = Math.min(100, Math.round((flexIzq / 1500) * 100));
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentValue / 100) * circumference;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      
      {/* Widget A: Hug Intensity Circular Gauge & Agitation Bar */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Afecto y Co-regulación (Oso)</h4>
          <span className="text-rose-500"><Heart size={16} fill={apreton ? 'currentColor' : 'none'} className={apreton ? 'animate-bounce' : ''} /></span>
        </div>

        {/* Circular Gauge */}
        <div className="flex flex-col items-center justify-center py-2">
          <div className="relative flex items-center justify-center">
            <svg className="w-32 h-32 transform -rotate-90">
              <circle
                cx="64"
                cy="64"
                r={radius}
                className="stroke-slate-100"
                strokeWidth="10"
                fill="transparent"
              />
              <circle
                cx="64"
                cy="64"
                r={radius}
                className={`${apreton ? 'stroke-rose-500' : 'stroke-teal-500'} transition-all duration-300 ease-out`}
                strokeWidth="10"
                fill="transparent"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute flex flex-col items-center justify-center">
              <span className={`text-2xl font-black ${apreton ? 'text-rose-600' : 'text-slate-800'}`}>
                {apreton ? 'ON' : 'OFF'}
              </span>
              <span className="text-[9px] font-bold text-slate-400 uppercase">ADC: {flexIzq}</span>
            </div>
          </div>

          <div className={`mt-4 px-3 py-1.5 rounded-full border text-[10px] font-bold text-center ${comfortColor}`}>
            {comfortStatus}
          </div>
        </div>

        {/* Agitation bar from MPU6050 */}
        <div className="mt-4 pt-4 border-t border-slate-50">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-[11px] font-bold text-slate-500 uppercase">Índice de Agitación Cinemática (MPU6050)</span>
            <span className="text-xs font-bold text-slate-700">{agitationPercentage}%</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
            <div 
              className={`h-2.5 rounded-full transition-all duration-300 ${
                agitationPercentage > 50 ? 'bg-rose-500' : agitationPercentage > 25 ? 'bg-amber-500' : 'bg-teal-500'
              }`}
              style={{ width: `${agitationPercentage}%` }}
            ></div>
          </div>
          <span className="text-[9px] text-slate-400 mt-1 block">
            Apretón activo con ADC &gt; 600 en GPIO 32. Promedio sesión: {avgHugForce}%
          </span>
        </div>
      </div>

      {/* Widget B: Clinical Behavioral Triggers */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Desencadenantes Conductuales</h4>
            <span className="text-xs font-bold text-slate-400">{triggers.length} Registrados</span>
          </div>

          <div className="flex flex-wrap gap-2 mb-4 max-h-36 overflow-y-auto">
            {triggers.length === 0 ? (
              <span className="text-xs text-slate-400 italic">No hay triggers emocionales marcados en esta sesión.</span>
            ) : (
              triggers.map((trigger, idx) => (
                <span 
                  key={idx} 
                  className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-50 text-rose-700 border border-rose-100/60 rounded-xl text-xs font-semibold animate-in fade-in"
                >
                  <Tag size={12} />
                  {trigger}
                </span>
              ))
            )}
          </div>
        </div>

        <form onSubmit={handleAddTriggerSubmit} className="mt-4 pt-4 border-t border-slate-50">
          <div className="flex gap-2">
            <input
              type="text"
              value={newTrigger}
              onChange={(e) => setNewTrigger(e.target.value)}
              placeholder="Ej: Llanto al soltar el oso, contacto visual..."
              className="flex-1 text-xs border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-rose-400 transition-colors"
            />
            <button
              type="submit"
              className="px-3 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Plus size={14} /> Anotar
            </button>
          </div>
        </form>
      </div>

    </div>
  );
};
