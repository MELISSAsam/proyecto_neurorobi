import React from 'react';
import { shakeLevel, shakeScore } from '../../utils/movement';
interface Props { stereotypicalTicks: number; secondsElapsed: number; movimiento?: number; mpuOk?: boolean; }
export const NeurologistDashboard: React.FC<Props> = ({ stereotypicalTicks, secondsElapsed, movimiento = 0, mpuOk = false }) => (
  <div className="grid md:grid-cols-2 gap-6">
    <div className="p-5 rounded-2xl border border-slate-100 bg-white">
      <h4 className="font-bold text-slate-700">Sacudidas fuertes registradas</h4>
      <p className="text-3xl font-black text-indigo-600 my-4">{stereotypicalTicks}</p>
      <p className="text-xs text-slate-500">Durante {Math.floor(secondsElapsed / 60)} min {secondsElapsed % 60} s de sesion.</p>
    </div>
    <div className="p-5 rounded-2xl border border-slate-100 bg-white">
      <h4 className="font-bold text-slate-700">Movimiento del peluche</h4>
      <p className="text-2xl font-black my-4">{mpuOk ? shakeLevel(movimiento) : 'Sensor no disponible'}</p>
      {mpuOk && <p className="text-indigo-600 font-bold">Intensidad aproximada: {shakeScore(movimiento)}/10</p>}
      <p className="text-xs text-slate-500 mt-3">Referencia relativa de movimiento; no es una medida de fuerza ni un diagnostico.</p>
    </div>
  </div>
);
