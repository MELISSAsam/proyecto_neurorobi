const registrationDateFormatter = new Intl.DateTimeFormat('es-EC', {
  timeZone: 'America/Guayaquil',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function formatRegistrationDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : registrationDateFormatter.format(date);
}
