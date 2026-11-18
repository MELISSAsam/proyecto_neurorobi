import { useState } from 'react';
import axios from 'axios';
import { LockKeyhole } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
export function PasswordChange() {
    const { user, logout } = useAuth();
    const [currentPassword, setCurrent] = useState(''), [password, setPassword] = useState(''), [confirm, setConfirm] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    return <section className="max-w-lg mx-auto bg-white rounded-2xl border border-slate-100 p-7 space-y-5 my-8"><LockKeyhole className="text-teal-600"/><h1 className="text-xl font-black">{user?.mustChangePassword ? 'Activa tu acceso' : 'Seguridad de tu cuenta'}</h1><p className="text-sm text-slate-500">Elige una contrasena nueva de al menos 12 caracteres. Al guardarla se cerraran tus sesiones anteriores.</p><form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); setError(''); if (password !== confirm) {
        setError('Las contrasenas no coinciden');
        return;
    } setBusy(true); try {
        await axios.post(`${import.meta.env.VITE_API_URL}/api/auth/change-password`, { currentPassword, password });
        logout();
    }
    catch (err) {
        setError(axios.isAxiosError(err) ? err.response?.data?.error || 'No se pudo cambiar la contrasena' : 'No se pudo cambiar la contrasena');
    }
    finally {
        setBusy(false);
    } }}>{[['Contrasena actual o temporal', currentPassword, setCurrent], ['Nueva contrasena', password, setPassword], ['Confirmar nueva contrasena', confirm, setConfirm]].map(([label, value, set], i) => <label key={i} className="block text-sm font-semibold">{label as string}<input required type="password" minLength={i ? 12 : 1} maxLength={128} autoComplete={i ? 'new-password' : 'current-password'} value={value as string} onChange={e => (set as (v: string) => void)(e.target.value)} className="mt-2 w-full border border-slate-200 rounded-xl p-3 font-normal"/></label>)}{error && <p role="alert" className="text-sm text-rose-600">{error}</p>}<button disabled={busy} className="rounded-xl bg-teal-600 text-white font-bold p-3 disabled:opacity-40">{busy ? 'Guardando...' : 'Guardar contrasena y volver a ingresar'}</button></form><button onClick={logout} className="text-xs text-slate-500">Cerrar sesion</button></section>;
}
