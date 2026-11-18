import React from 'react';
import { Sparkles, AlertCircle, Fingerprint } from 'lucide-react';

interface OccupationalDashboardProps {
  currentHugForce: number;
  maxGripForce: number;
  bilateralTouchSync: number;
  fatigueCheckmarks: Record<string, boolean>;
  onToggleFatigueCheckmark: (key: string) => void;
  // Campos del Peluche
  apreton?: boolean;
  switchIzq?: boolean;
  switchDer?: boolean;
}

export const OccupationalDashboard: React.FC<OccupationalDashboardProps> = ({
  currentHugForce: _currentHugForce,
  maxGripForce: _maxGripForce,
  bilateralTouchSync,
  fatigueCheckmarks,
  onToggleFatigueCheckmark,
  apreton = false,
  switchIzq = false,
  switchDer = false
}) => {

  const fatigueItems = [
    { key: 'forceLoss', label: 'Pérdida súbita de flexión o fuerza de agarre' },
    { key: 'tremors', label: 'Temblores leves detectados al sostener el peluche' },
    { key: 'slowCoordination', label: 'Coordinación motora lenta o asincrónica entre brazos' },
    { key: 'digitRigidity', label: 'Rigidez perceptible al presionar los finales de carrera' }
  ];

  const activeCount = Object.values(fatigueCheckmarks).filter(Boolean).length;
  const calculatedFatigueScore = activeCount * 25;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      
      {/* Widget A: Flexión Brazo Derecho y Switches Bilaterales */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Apreton y coordinacion del peluche</h4>
            <span className="text-emerald-500"><Sparkles size={16} /></span>
          </div>

          {/* Flex Der & Switch status */}
          <div className="grid grid-cols-2 gap-4 mb-5">
            <div className="bg-purple-50/60 border border-purple-100 rounded-xl p-3.5 flex flex-col justify-center">
              <span className="text-[10px] font-bold text-purple-600 uppercase tracking-wide">Apreton del peluche</span>
              <span className="text-2xl font-black text-purple-900 mt-1">{apreton ? "Detectado" : "Sin apreton"}</span>
            </div>
            
            <div className="bg-emerald-50/40 border border-emerald-100/50 rounded-xl p-3.5 flex flex-col justify-center">
              <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide">Pulsaciones de brazos</span>
              <div className="flex items-center gap-2 mt-1">
                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${switchIzq ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                  Izq: {switchIzq ? 'ON' : 'OFF'}
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${switchDer ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                  Der: {switchDer ? 'ON' : 'OFF'}
                </span>
              </div>
              <span className="text-[9px] text-emerald-600 mt-0.5">GPIO 18 / 19</span>
            </div>
          </div>

          {/* Bilateral Touch Sync Scale */}
          <div className="bg-slate-50/50 border border-slate-100 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-slate-700">
                <Fingerprint size={14} className="text-emerald-600" />
                <span className="text-xs font-bold">Sincronía Motora Bilateral</span>
              </div>
              <span className="text-xs font-bold text-emerald-700">{bilateralTouchSync}%</span>
            </div>

            <div className="w-full bg-slate-200 h-3 rounded-full overflow-hidden flex">
              <div 
                className="bg-emerald-500 h-full transition-all duration-500" 
                style={{ width: `${bilateralTouchSync}%` }}
              ></div>
            </div>

            <p className="text-[10px] text-slate-400 font-semibold mt-2 text-center leading-normal">
              Indica activación combinada y coordinada de ambos lados del peluche terapéutico.
            </p>
          </div>
        </div>

        <div className="text-[10px] text-slate-400 font-medium mt-4 pt-4 border-t border-slate-50 flex items-center gap-1">
          <AlertCircle size={10} className="text-emerald-500" /> Un sensor de apreton y dos interruptores de contacto.
        </div>
      </div>

      {/* Widget B: Motor Fatigue Observation Checklist */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Fatiga y Tono Muscular</h4>
            <span className="text-xs font-bold text-slate-400">Puntaje: {calculatedFatigueScore}/100</span>
          </div>

          <div className="space-y-3">
            {fatigueItems.map(item => (
              <label 
                key={item.key} 
                className="flex items-start gap-3 p-2 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <input 
                  type="checkbox"
                  checked={Boolean(fatigueCheckmarks[item.key])}
                  onChange={() => onToggleFatigueCheckmark(item.key)}
                  className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
                <span className="text-xs font-semibold text-slate-600 leading-snug">
                  {item.label}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-50 flex items-center justify-between text-[11px] font-bold">
          <span className="text-slate-400 uppercase tracking-wider">Nivel de Alerta:</span>
          <span className={activeCount > 2 ? 'text-rose-600' : activeCount > 0 ? 'text-amber-600' : 'text-emerald-600'}>
            {activeCount > 2 ? 'Fatiga Severa' : activeCount > 0 ? 'Fatiga Leve Detectada' : 'Tono Normal'}
          </span>
        </div>
      </div>

    </div>
  );
};
