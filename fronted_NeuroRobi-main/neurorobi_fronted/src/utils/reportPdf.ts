import type { ClinicalSession } from '../types';
import { analyze, chartPoints, clock, decimal } from './interactions';
export async function downloadReportPdf(session: ClinicalSession) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const report = analyze(session.sensorHistory || []);
  const issued = new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil' });
  let y = 18;
  const logo = document.querySelector('aside svg');
  if (logo) {
    let url = '';
    try {
      url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(logo)], { type: 'image/svg+xml;charset=utf-8' }));
      const image = new Image(); image.src = url; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 160;
      const context = canvas.getContext('2d');
      if (context) { context.drawImage(image, 0, 0, 160, 160); doc.addImage(canvas.toDataURL('image/png'), 'PNG', 174, 12, 18, 18); }
    } catch { /* El nombre NeuroRobi permanece en el encabezado si el navegador no rasteriza el SVG. */ }
    finally { if (url) URL.revokeObjectURL(url); }
  }
  const space = (height: number) => { if (y + height > 269) { doc.addPage(); y = 20; } };
  const line = (text: string, size = 10, bold = false) => {
    const lines: string[] = doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(size).splitTextToSize(text, 178);
    for (const row of lines) { space(6); doc.setTextColor(23, 51, 76).text(row, 16, y); y += size > 12 ? 8 : 5.5; }
  };
  doc.setTextColor(18, 111, 135).setFontSize(20).text('NEUROROBI', 16, y); y += 8;
  line('Seguimiento de interacciones tactiles', 9); doc.setDrawColor(18, 111, 135).line(16, y, 194, y); y += 12;
  line('INFORME DE INTERACCIONES TACTILES', 15, true);
  line(`Sesion: ${session.id}`, 8); y += 4;
  line('1. Informacion general', 12, true);
  const validDate = Number.isFinite(Date.parse(session.date));
  for (const value of [`Paciente: ${session.patientName}`, `Terapeuta: ${session.specialistName || 'No disponible en el registro'}`, `Fecha: ${validDate ? new Date(session.date).toLocaleString('es-EC', {timeZone:'America/Guayaquil'}) : 'No disponible'}`, `Duracion: ${clock(session.durationSeconds)}`, `Dispositivo: Oso robotico NeuroRobi | ID: ${session.deviceId || 'No registrado'}`]) line(value);
  y += 5; line('2. Resumen de interacciones', 12, true);
  line(`Pulsaciones de brazos: ${report.contacts ?? 'No disponible'} | Sacudidas fuertes: ${report.shakes ?? 'No disponible'}`);
  line(`Apretones del estomago: ${decimal(report.pressureMax)} apretones`);
  line(`Tiempo observado de apreton: ${decimal(report.squeezeDuration)} s`);
  line('Cada activacion del estomago cuenta un apreton. Las duraciones son aproximadas y no incluyen intervalos sin senal.', 8);
  const chart = (field: 'pressure' | 'movement', title: string, max: number, color: [number, number, number]) => {
    space(81); y += 5; line(title, 12, true);
    const top = y + 3, bottom = top + 48, left = 28, width = 160;
    const total = Math.max(1, report.points[report.points.length - 1]?.t ?? 1);
    if (!report.points.some(p => p[field] !== null)) { line('No hay mediciones disponibles.', 10); return; }
    for (let i = 0; i <= 4; i++) { const yy = bottom - i * 12; doc.setDrawColor(225, 233, 239).line(left, yy, left + width, yy); doc.setFontSize(8).setTextColor(101,124,141).text(String(i * max / 4), left - 3, yy + 1, {align:'right'}); }
    let previous: {t:number; value:number} | null = null;
    const gaps = report.points.filter((p, i) => i > 0 && (p.t - report.points[i - 1].t > 2 || p[field] === null || report.points[i - 1][field] === null)).map(p => p.t);
    for (const p of chartPoints(report.points, field)) {
      const value = p[field]; if (value === null) { previous = null; continue; }
      if (previous && !gaps.some(t => t > previous!.t && t <= p.t)) { doc.setDrawColor(...color).setLineWidth(0.55).line(left + previous.t / total * width, bottom - previous.value / max * 48, left + p.t / total * width, bottom - value / max * 48); }
      previous = {t:p.t,value};
    }
    for(let i=0;i<=5;i++) doc.setFontSize(8).setTextColor(101,124,141).text(clock(total*i/5),left+width*i/5,bottom+6,{align:'center'});
    y = bottom + 13;
  };
  chart('pressure', '3. Conteo de apretones durante la sesion', Math.max(4, Math.ceil((report.squeezes ?? 0) / 4) * 4), [17,165,162]);
  chart('movement', '4. Intensidad aproximada de sacudidas (0 a 10)', 10, [237,140,56]);
  space(22); y += 5; line('5. Detalle cronologico de eventos', 12, true);
  const header = () => { space(12); doc.setFillColor(238,247,250).rect(16,y-4,178,8,'F'); doc.setFontSize(8).setTextColor(23,51,76).text('Tipo',18,y+1).text('Inicio / Fin',76,y+1).text('Duracion',111,y+1).text('Max. / Prom.',145,y+1); y+=11; };
  header();
  if (!report.events.length) line('No hay eventos registrados en las mediciones disponibles.');
  for(const event of report.events) {
    if (y > 259) { doc.addPage(); y=20; header(); }
    doc.setFontSize(8).setTextColor(23,51,76).text(event.kind,18,y).text(`${clock(event.start)} / ${clock(event.end)}`,76,y).text(`${event.partial ? '>=' : ''}${event.duration.toFixed(1)} s`,111,y).text(`${decimal(event.max)} / ${decimal(event.avg)} ${event.unit}`,145,y);
    y+=7;
  }
  y+=7; line('6. Observaciones del terapeuta',12,true);
  line(session.notes?.trim() || 'Sin observaciones registradas.');
  const count = doc.getNumberOfPages();
  for (let page=1;page<=count;page++) { doc.setPage(page).setFont('helvetica','normal').setFontSize(7).setTextColor(101,124,141); doc.text('NeuroRobi es una herramienta de apoyo al seguimiento terapeutico. No realiza diagnosticos automaticos.',16,282); doc.text(`Emision: ${issued} | Pagina ${page} de ${count}`,16,287); }
  doc.save(`NeuroRobi-${session.id.replace(/[^a-z0-9_-]/gi,'_')}.pdf`);
}

export async function downloadEvolutionPdf(sessions: ClinicalSession[]) {
  if (sessions.length < 2 || sessions.some(s => s.patientId !== sessions[0].patientId)) throw new Error('Selecciona al menos dos sesiones del mismo paciente.');
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({unit:'mm',format:'a4'});
  const ordered = [...sessions].sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
  const rows = ordered.map(session=>({session, ...analyze(session.sensorHistory || [])}));
  let y=20;
  const text=(value:string,size=10)=>{doc.setFontSize(size); const lines:string[]=doc.splitTextToSize(value,178);for(const line of lines){if(y>266){doc.addPage();y=20;}doc.setTextColor(23,51,76).text(line,16,y);y+=6;}};
  text('NEUROROBI',20);text('Evolucion de interacciones tactiles',15);text(`Paciente: ${ordered[0].patientName}`);text(`Sesiones seleccionadas: ${ordered.length}`);text('Comparacion de registros fisicos: no representa mejoria clinica ni estados emocionales.',9);y+=5;
  for(const row of rows){text(`${new Date(row.session.date).toLocaleString('es-EC',{timeZone:'America/Guayaquil'})} | ${row.session.id}`,9);text(`Pulsaciones: ${row.contacts??'N/D'} | Sacudidas: ${row.shakes??'N/D'} | Apreton observado: ${decimal(row.squeezeDuration)} s`,9);text(`Apretones: ${decimal(row.pressureMax)} apretones`,9);y+=2;}
  const graph=(title:string,series:{label:string;color:[number,number,number];values:(number|null)[]}[],fixedMax?:number)=>{
    if(y+85>267){doc.addPage();y=20;}y+=5;text(title,12);const left=28,top=y+3,bottom=top+48,width=158;
    const values=series.flatMap(s=>s.values.filter((v):v is number=>v!==null));const max=fixedMax??Math.max(1,...values);
    for(let i=0;i<=4;i++){const yy=bottom-i*12;doc.setDrawColor(225,233,239).line(left,yy,left+width,yy);doc.setFontSize(8).setTextColor(101,124,141).text((max*i/4).toFixed(0),left-3,yy+1,{align:'right'});}
    series.forEach(s=>{let previous:{x:number;y:number}|null=null;s.values.forEach((v,i)=>{if(v===null){previous=null;return;}const x=left+i/Math.max(1,rows.length-1)*width,yy=bottom-v/max*48;doc.setDrawColor(...s.color).setFillColor(...s.color);if(previous)doc.line(previous.x,previous.y,x,yy);doc.circle(x,yy,0.8,'F');previous={x,y:yy};});});
    rows.forEach((_,i)=>doc.setFontSize(8).setTextColor(101,124,141).text(String(i+1),left+i/Math.max(1,rows.length-1)*width,bottom+6,{align:'center'}));y=bottom+14;for(const s of series)text(s.label,8);
  };
  graph('Contactos y sacudidas por sesion (orden cronologico)',[{label:'Turquesa: contactos',color:[17,165,162],values:rows.map(r=>r.contacts)},{label:'Naranja: sacudidas fuertes',color:[237,140,56],values:rows.map(r=>r.shakes)}]);
  graph('Conteo de apretones por sesion',[{label:'Azul: apretones',color:[18,111,135],values:rows.map(r=>r.pressureMax)}]);
  text('Observaciones profesionales por sesion',12);for(const row of rows){text(row.session.id,9);text(row.session.notes?.trim()||'Sin observaciones registradas.');y+=3;}
  const count=doc.getNumberOfPages();for(let i=1;i<=count;i++){doc.setPage(i).setFontSize(7).setTextColor(101,124,141).text('Herramienta de apoyo al seguimiento terapeutico. No realiza diagnosticos automaticos.',16,282).text(`Emision: ${new Date().toLocaleDateString('es-EC',{timeZone:'America/Guayaquil'})} | Pagina ${i} de ${count}`,16,287);}
  doc.save(`NeuroRobi-evolucion-${ordered[0].patientId.replace(/[^a-z0-9_-]/gi,'_')}.pdf`);
}
