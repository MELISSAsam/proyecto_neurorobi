import { useMemo, useState } from 'react';
import type { SensorReading } from '../../types';
import { analyze, chartPoints, clock, decimal } from '../../utils/interactions';
import type { Analysis, Point } from '../../utils/interactions';
export function SensorChart({ analysis, field, title, staticView = false }: { analysis: Analysis; field: 'pressure' | 'movement'; title: string; staticView?: boolean }) {
  const [selected, setSelected] = useState<number | null>(null);
  const points = analysis.points, max = field === 'pressure' ? 100 : 10;
  const color = field === 'pressure' ? '#11a5a2' : '#ed8c38', unit = field === 'pressure' ? '% ADC' : '/10';
  const samples = useMemo(() => chartPoints(points, field), [points, field]);
  const total = Math.max(1, points[points.length - 1]?.t || 1);
  const x = (t: number) => 50 + t / total * 720, y = (v: number) => 195 - v / max * 165;
  const gaps = points.filter((p, i) => i > 0 && (p.t - points[i - 1].t > 2 || p[field] === null || points[i - 1][field] === null)).map(p => p.t);
  let path = '', last: Point | null = null;
  for (const p of samples) {
    if (p[field] === null) { last = null; continue; }
    path += `${last && !gaps.some(t => t > last!.t && t <= p.t) ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p[field]!).toFixed(1)} `;
    last = p;
  }
  const chosen = selected === null ? null : points[Math.min(selected, points.length - 1)];
  const event = chosen && analysis.events.find(e => e.start <= chosen.t && e.end >= chosen.t && (field === 'pressure' ? e.kind === 'Apreton' : e.kind === 'Sacudida fuerte'));
  return <section className="interaction-chart rounded-2xl border border-slate-100 bg-white p-4 sm:p-6 shadow-sm">
    <div className="flex flex-wrap justify-between gap-2"><h3 className="font-bold text-slate-800">{title}</h3><span className="text-xs text-slate-500">{field === 'pressure' ? 'Nivel relativo del sensor (% ADC)' : 'Intensidad aproximada (0 a 10)'}</span></div>
    {!points.some(p => p[field] !== null) ? <p className="py-16 text-center text-sm text-slate-500">Sin mediciones disponibles para este sensor.</p> : <>
      <svg viewBox="0 0 800 230" className="w-full min-h-44 touch-pan-y" role="img" aria-label={title}
        onPointerMove={e => { if (staticView) return; const box = e.currentTarget.getBoundingClientRect(); const t = Math.max(0, Math.min(total, ((e.clientX - box.left) / box.width * 800 - 50) / 720 * total)); let low = 0, high = points.length - 1; while (low < high) { const middle = Math.floor((low + high) / 2); if (points[middle].t < t) low = middle + 1; else high = middle; } const index = low > 0 && Math.abs(points[low - 1].t - t) < Math.abs(points[low].t - t) ? low - 1 : low; setSelected(index); }}>
        {[0, 1, 2, 3, 4].map(i => <g key={i}><line x1="50" x2="770" y1={y(i * max / 4)} y2={y(i * max / 4)} stroke="#e5edf2"/><text x="40" y={y(i * max / 4) + 4} textAnchor="end" fontSize="11" fill="#657c8d">{i * max / 4}</text></g>)}
        {[0, 1, 2, 3, 4, 5].map(i => <text key={i} x={x(total * i / 5)} y="217" textAnchor="middle" fontSize="11" fill="#657c8d">{clock(total * i / 5)}</text>)}
        <path d={path} stroke={color} strokeWidth="2.2" fill="none" strokeLinejoin="round"/>
        {samples.length < 80 && samples.filter(p => p[field] !== null).map((p, i) => <circle key={i} cx={x(p.t)} cy={y(p[field]!)} r="2.7" fill={color}/>)}
        {chosen && chosen[field] !== null && <g><line x1={x(chosen.t)} x2={x(chosen.t)} y1="25" y2="195" stroke={color} strokeDasharray="4 4"/><circle cx={x(chosen.t)} cy={y(chosen[field]!)} r="5" fill={color} stroke="white" strokeWidth="2"/></g>}
      </svg>
      {!staticView && <div className="rounded-xl border border-cyan-100 bg-cyan-50/60 p-3 text-xs text-slate-600 leading-relaxed" aria-live="polite">
        {chosen ? <><strong className="text-cyan-800">Instante {clock(chosen.t)}</strong> · Valor: {decimal(chosen[field])} {unit}
          {event ? <p>{event.kind} · Inicio {clock(event.start)} · Fin observado {clock(event.end)} · Duración {event.partial ? 'al menos ' : ''}{event.duration.toFixed(1)} s · Máximo {decimal(event.max)} {event.unit} · Promedio {decimal(event.avg)} {event.unit}</p> : <p>Sin evento de este tipo en el instante seleccionado.</p>}</> : 'Mueve el cursor o toca la gráfica para consultar un instante y su evento.'}
      </div>}
    </>}
    <p className="text-[11px] text-slate-400 mt-3">{field === 'pressure' ? 'Escala ADC 0-4095 convertida a porcentaje: no representa fuerza ni presión calibrada.' : 'Indicador fisico de movimiento. No determina emociones ni diagnósticos.'}</p>
  </section>;
}
export function InteractionCharts({ readings, staticView = false }: { readings: Partial<SensorReading>[]; staticView?: boolean }) {
  const analysis = useMemo(() => analyze(readings), [readings]);
  return <div className="grid gap-5"><SensorChart analysis={analysis} field="pressure" title="Apreton a lo largo del tiempo" staticView={staticView}/><SensorChart analysis={analysis} field="movement" title="Intensidad de sacudidas" staticView={staticView}/></div>;
}
