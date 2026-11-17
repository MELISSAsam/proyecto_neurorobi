import { usePatients } from '../context/PatientContext';
import { SessionReportView } from '../components/reports/SessionReportView';
interface Props { onArchiveSuccess:()=>void; onShowSuccessToast:(message:string)=>void; onShowErrorToast?:(message:string)=>void; }
export const PostSessionReport = ({onArchiveSuccess,onShowSuccessToast,onShowErrorToast}:Props) => {
  const {activeSession,archiveSession}=usePatients();
  if(!activeSession) return <div className="rounded-2xl bg-white border border-slate-100 p-10 text-center"><h1 className="text-xl font-bold text-slate-800">Informe de interacciones</h1><p className="mt-3 text-sm text-slate-500">Finaliza una sesion para preparar el informe. Para consultar sesiones guardadas, abre Historial de sesiones.</p></div>;
  return <div className="space-y-5"><header><p className="text-xs font-bold text-teal-600 uppercase tracking-widest">NeuroRobi</p><h1 className="text-2xl font-black text-slate-800 mt-2">Informe de interacciones táctiles</h1><p className="text-sm text-slate-500 mt-2">Revisa los registros, escribe tus observaciones y guarda la sesion.</p></header><SessionReportView session={activeSession} onSaveNotes={async notes=>{try{await archiveSession({...activeSession,notes});onShowSuccessToast('Sesion e informe guardados en el servidor.');onArchiveSuccess();}catch(error){onShowErrorToast?.('No se pudo guardar la sesion. Conserva tus observaciones e intenta nuevamente.');throw error;}}}/></div>;
};
