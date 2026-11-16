import React from 'react';
import { Brain, AlertTriangle } from 'lucide-react';

interface NeurologistDashboardProps {
  currentHeartRate?: number;
  avgHeartRate?: number;
  stereotypicalTicks: number;
  secondsElapsed: number;
  // Campos del Oso (MPU6050)
  movimiento?: number;
  mpuOk?: boolean;
  giroX?: number;
  giroY?: number;
  giroZ?: number;
  accX?: number;
  accY?: number;
  accZ?: number;
}

export const NeurologistDashboard: React.FC<NeurologistDashboardProps> = ({
  stereotypicalTicks,
  secondsElapsed,
  movimiento = 0,
  mpuOk = true,
  giroX = 0,
  giroY = 0,
  giroZ = 0
}) => {
  // Índice de Calma y Estabilidad Psicomotora (0 a 100%) derivado del MPU6050
  // Menor movimiento = mayor calma sensorial y autorregulación adaptativa
  const stabilityIndex = Math.max(0, Math.min(100, Math.round(100 - movimiento)));

  let statusLabel = 'Estable / Autorregulación Adaptativa';
  let statusColor = 'text-indigo-600 bg-indigo-50 border-indigo-100';

  if (movimiento > 50) {
    statusLabel = 'Crisis de Agitación Motora / Desregulación Alta';
    statusColor = 'text-rose-600 bg-rose-50 border-rose-100 animate-pulse font-black';
  } else if (movimiento > 25) {
    statusLabel = 'Inquietud Motora / Transición de Alerta';
    statusColor = 'text-amber-600 bg-amber-50 border-amber-100';
  }

  // Calculate ticks per minute rate
  const minutes = Math.max(1, secondsElapsed) / 60;
  const tickRatePerMinute = (stereotypicalTicks / minutes).toFixed(1);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      
      {/* Widget A: Stereotypical Motion Frequency Counter */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Patrones de Movimiento Estereotipado (Oso)</h4>
            <span className="text-indigo-500"><Brain size={16} /></span>
          </div>

          <div className="flex items-center gap-4 bg-slate-50 border border-slate-100 rounded-2xl p-4 mb-4">
            {/* Digital Ticker Counter */}
            <div className="h-16 w-16 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-center shadow-inner">
              <span className="text-3xl font-mono font-black text-indigo-400 tracking-wider">
                {String(stereotypicalTicks).padStart(2, '0')}
              </span>
            </div>
            
            <div className="flex-1">
              <h5 className="text-xs font-bold text-slate-700 uppercase">Frecuencia Total</h5>
              <p className="text-[10px] text-slate-400 font-semibold mt-0.5 uppercase">Tics / sacudones repetitivos</p>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-xs font-bold text-slate-800 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
                  {tickRatePerMinute} / min
                </span>
              </div>
            </div>
          </div>

          <p className="text-[10px] text-slate-400 font-medium leading-normal">
            * El MPU6050 del peluche cuantifica automáticamente sacudones bruscos y variaciones de rotación (&gt;100°/s) que señalan aleteo o crisis de agitación.
          </p>
        </div>

        {stereotypicalTicks > 5 && (
          <div className="mt-4 p-2 bg-rose-50 border border-rose-100/60 rounded-xl flex items-center gap-2 text-rose-700 text-[10px] font-bold">
            <AlertTriangle size={12} className="shrink-0 animate-bounce" /> Agitación estereotipada sobre el límite clínico sugerido.
          </div>
        )}
      </div>

      {/* Widget B: Estabilidad Psicomotora y Cinemática MPU6050 */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Estabilidad Psicomotora (MPU6050)</h4>
            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${mpuOk ? 'bg-indigo-50 text-indigo-700' : 'bg-rose-50 text-rose-700'}`}>
              {mpuOk ? 'MPU OK' : 'SIN MPU'}
            </span>
          </div>

          {/* MPU motion metrics */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Intensidad Movimiento</span>
              <span className="text-2xl font-black text-slate-800">{movimiento.toFixed(1)} <span className="text-xs text-slate-400 font-bold">/ 100</span></span>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Índice Calma Sensorial</span>
              <span className="text-2xl font-black text-indigo-600">{stabilityIndex}%</span>
            </div>
          </div>

          {/* Bar indicator */}
          <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden mb-3">
            <div 
              className={`h-3 rounded-full transition-all duration-300 ${
                movimiento > 50 ? 'bg-rose-500' : movimiento > 25 ? 'bg-amber-500' : 'bg-indigo-500'
              }`}
              style={{ width: `${movimiento}%` }}
            ></div>
          </div>

          <div className={`p-2 rounded-xl border text-[10px] font-bold text-center ${statusColor}`}>
            {statusLabel}
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-50 text-[10px] text-slate-500 flex justify-between">
          <span>Giroscopio (°/s):</span>
          <span className="font-mono font-bold text-slate-700">
            X:{giroX.toFixed(1)} | Y:{giroY.toFixed(1)} | Z:{giroZ.toFixed(1)}
          </span>
        </div>
      </div>

    </div>
  );
};
