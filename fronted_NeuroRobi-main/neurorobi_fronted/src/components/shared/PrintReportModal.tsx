import { X } from 'lucide-react';
import type { ClinicalSession } from '../../types';
import { SessionReportView } from '../reports/SessionReportView';
interface Props {isOpen:boolean;onClose:()=>void;session:ClinicalSession|null;}
export const PrintReportModal=({isOpen,onClose,session}:Props)=> !isOpen||!session?null:(
  <div className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-900/60 p-3 sm:p-8" role="dialog" aria-modal="true" aria-label="Informe de interacciones tactiles"><div className="relative max-w-5xl mx-auto rounded-2xl bg-slate-50 p-4 sm:p-6"><div className="flex justify-between items-center mb-5"><h2 className="font-bold text-slate-800">Informe de interacciones tactiles</h2><button aria-label="Cerrar informe" onClick={onClose} className="rounded-lg bg-white p-2"><X size={20}/></button></div><SessionReportView session={session} readOnly/></div></div>
);
