type SensorReading = {
    [key: string]: any;
    elapsedMs?: number;
    receivedAt?: string;
    timestamp?: string;
    flexIzq?: number;
    movimiento?: number;
    shakeIntensity?: number;
    mpu?: boolean;
    apreton?: boolean;
    switchIzq?: boolean;
    switchDer?: boolean;
    switch1?: boolean;
    switch2?: boolean;
};
export type Kind = 'Apreton' | 'Pulsacion brazo izquierdo' | 'Pulsacion brazo derecho' | 'Sacudida fuerte';
export interface Point {
    t: number;
    pressure: number | null;
    movement: number | null;
    squeeze: boolean | null;
    left: boolean | null;
    right: boolean | null;
}
export interface Interaction {
    id: string;
    kind: Kind;
    start: number;
    end: number;
    duration: number;
    max: number | null;
    avg: number | null;
    partial: boolean;
    unit: string;
}
const numberOrNull = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : null;
export const clock = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
export const decimal = (n: number | null, digits = 1) => n === null ? 'No disponible' : n.toFixed(digits);
export function analyze(readings: Partial<SensorReading>[]) {
    let firstEpoch: number | null = null, firstClock: number | null = null, previousClock: number | null = null, day = 0;
    const points: Point[] = [];
    for (const r of readings) {
        let t: number | null = null;
        if (numberOrNull(r.elapsedMs) !== null && r.elapsedMs! >= 0)
            t = r.elapsedMs! / 1000;
        else if (r.receivedAt && Number.isFinite(Date.parse(r.receivedAt))) {
            const epoch = Date.parse(r.receivedAt);
            firstEpoch ??= epoch;
            t = (epoch - firstEpoch) / 1000;
        }
        else {
            const match = /^(\d{1,2}):(\d{2}):(\d{2})$/.exec(r.timestamp || '');
            if (match) {
                const current = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
                if (previousClock !== null && current < previousClock - 43200)
                    day += 86400;
                previousClock = current;
                firstClock ??= current + day;
                t = current + day - firstClock;
            }
        }
        if (t === null || t < 0 || (points.length > 0 && t < points[points.length - 1].t))
            continue;
        const raw = numberOrNull(r.flexIzq);
        const pressure = null; // Se completa con el conteo acumulado de apretones.
        const motion = numberOrNull(r.movimiento ?? r.shakeIntensity);
        const movement = r.mpu === false || motion === null || motion < 0 || motion > 100 ? null : motion / 10;
        points.push({ t, pressure, movement, squeeze: typeof r.apreton === 'boolean' ? r.apreton : raw !== null ? raw > 600 : null,
            left: typeof r.switchIzq === 'boolean' ? r.switchIzq : typeof r.switch1 === 'boolean' ? r.switch1 : null,
            right: typeof r.switchDer === 'boolean' ? r.switchDer : typeof r.switch2 === 'boolean' ? r.switch2 : null });
    }
    const events: Interaction[] = [];
    const channels: {
        kind: Kind;
        active: (p: Point) => boolean | null;
        value: (p: Point) => number | null;
        unit: string;
    }[] = [
        { kind: 'Apreton', active: p => p.squeeze, value: () => 1, unit: 'apreton' },
        { kind: 'Pulsacion brazo izquierdo', active: p => p.left, value: () => 1, unit: 'activado' },
        { kind: 'Pulsacion brazo derecho', active: p => p.right, value: () => 1, unit: 'activado' },
        { kind: 'Sacudida fuerte', active: p => p.movement === null ? null : p.movement >= 6, value: p => p.movement, unit: '/10' }
    ];
    for (const channel of channels) {
        let start: number | null = null, values: number[] = [], partial = false, last: Point | null = null;
        const close = (end: number, incomplete: boolean) => {
            if (start === null)
                return;
            events.push({ id: `${channel.kind}-${start}-${events.length}`, kind: channel.kind, start, end, duration: Math.max(0, end - start),
                max: values.length ? values.reduce((a, b) => Math.max(a, b)) : null, avg: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
                partial: partial || incomplete, unit: channel.unit });
            start = null;
            values = [];
        };
        for (const point of points) {
            const gap = last !== null && point.t - last.t > 2;
            if (gap)
                close(last!.t, true);
            const active = channel.active(point);
            if (active === null)
                close(last?.t ?? point.t, true);
            else if (active) {
                if (start === null) {
                    start = point.t;
                    partial = last === null || gap || channel.active(last) === null;
                }
                const value = channel.value(point);
                if (value !== null)
                    values.push(value);
            }
            else
                close(point.t, false);
            last = point;
        }
        if (last)
            close(last.t, true);
    }
    events.sort((a, b) => a.start - b.start);
    const squeezeEvents = events.filter(e => e.kind === 'Apreton');
    let squeezeCount = 0;
    for (const point of points) {
        while (squeezeCount < squeezeEvents.length && squeezeEvents[squeezeCount].start <= point.t)
            squeezeCount++;
        point.pressure = point.squeeze === null ? null : squeezeCount;
    }
    const squeezes = points.some(p => p.squeeze !== null) ? events.filter(e => e.kind === 'Apreton').length : null;
    const tactile = events.filter(e => e.kind.startsWith('Pulsacion'));
    const hasContacts = points.some(p => p.left !== null || p.right !== null);
    return { points, events, contacts: hasContacts ? tactile.length : null,
        shakes: points.some(p => p.movement !== null) ? events.filter(e => e.kind === 'Sacudida fuerte').length : null,
        squeezes,
        pressureMax: squeezes,
        pressureAvg: squeezes,
        // Duracion de apreton observada: los contactos simultaneos no se suman.
        squeezeDuration: points.some(p => p.squeeze !== null) ? events.filter(e => e.kind === 'Apreton').reduce((n, e) => n + e.duration, 0) : null,
        hasGaps: points.some((p, i) => i > 0 && p.t - points[i - 1].t > 2) };
}
export type Analysis = ReturnType<typeof analyze>;
// Reducir solo el dibujo conservando picos y puntos de borde. Los calculos usan todas las muestras.
export function chartPoints(points: Point[], field: 'pressure' | 'movement', limit = 450): Point[] {
    if (points.length <= limit)
        return points;
    const result: Point[] = [];
    const size = Math.ceil(points.length / (limit / 4));
    for (let i = 0; i < points.length; i += size) {
        const group = points.slice(i, i + size);
        const valid = group.filter(p => p[field] !== null);
        const min = valid.reduce<Point | null>((p, n) => p === null || n[field]! < p[field]! ? n : p, null);
        const max = valid.reduce<Point | null>((p, n) => p === null || n[field]! > p[field]! ? n : p, null);
        result.push(...Array.from(new Set([group[0], min, max, group[group.length - 1]].filter((p): p is Point => p !== null))).sort((a, b) => a.t - b.t));
    }
    return result;
}
