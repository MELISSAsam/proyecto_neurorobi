// Indicador relativo del sensor: no representa fuerza ni un diagnostico.
export const shakeLevel = (value: number) => value < 10 ? 'En reposo' : value < 30 ? 'Suave' : value < 60 ? 'Moderada' : 'Fuerte';
export const shakeScore = (value: number) => Math.round(Math.max(0, Math.min(100, value)) / 10);
