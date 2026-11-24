import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import axios from 'axios';
export interface AuthUser {
    id: string;
    email: string;
    name: string;
    role: string;
    accessLevel: 'SUPERADMINISTRADOR' | 'ADMINISTRADOR' | 'TERAPEUTA';
    institutionId: string;
    clinicalRead: boolean;
    mustChangePassword: boolean;
    profileImageUrl?: string;
}
interface AuthContextType {
    isAuthenticated: boolean;
    loading: boolean;
    userEmail: string | null;
    userId: string | null;
    userName: string | null;
    userRole: string | null;
    token: string | null;
    user: AuthUser | null;
    login: (email: string, password: string) => Promise<boolean>;
    logout: () => void;
    refreshUser: () => Promise<void>;
}
const AuthContext = createContext<AuthContextType | undefined>(undefined);
const API = `${import.meta.env.VITE_API_URL}/api/auth`;
const save = (u: AuthUser) => { localStorage.setItem('neurorobi_user', JSON.stringify(u)); localStorage.setItem('neurorobi_user_id', u.id); localStorage.setItem('neurorobi_user_email', u.email); localStorage.setItem('neurorobi_user_name', u.name); localStorage.setItem('neurorobi_user_role', u.role); };
export function AuthProvider({ children }: {
    children: ReactNode;
}) {
    const [token, setToken] = useState<string | null>(() => localStorage.getItem('neurorobi_auth_token'));
    const [user, setUser] = useState<AuthUser | null>(null), [loading, setLoading] = useState(!!token);
    const logout = useCallback(() => { const old = localStorage.getItem('neurorobi_auth_token'); if (old)
        void axios.post(`${API}/logout`, {}, { headers: { Authorization: `Bearer ${old}` } }).catch(() => { }); setToken(null); setUser(null); for (const k of ['auth_token', 'auth', 'user', 'user_id', 'user_email', 'user_name', 'user_role'])
        localStorage.removeItem(`neurorobi_${k}`); }, []);
    const refreshUser = useCallback(async () => { const { data } = await axios.get<AuthUser>(`${API}/me`); setUser(data); save(data); }, []);
    useEffect(() => { if (!token) {
        setLoading(false);
        return;
    } let alive = true; setLoading(true); axios.get<AuthUser>(`${API}/me`, { headers: { Authorization: `Bearer ${token}` } }).then(({ data }) => { if (alive) {
        setUser(data);
        save(data);
    } }).catch(() => { if (alive)
        logout(); }).finally(() => { if (alive)
        setLoading(false); }); return () => { alive = false; }; }, [token, logout]);
    useEffect(() => { const expire = () => { if (localStorage.getItem('neurorobi_auth_token'))
        logout(); }; window.addEventListener('neurorobi:unauthorized', expire); return () => window.removeEventListener('neurorobi:unauthorized', expire); }, [logout]);
    const login = async (email: string, password: string) => { try {
        const { data } = await axios.post(`${API}/login`, { email: email.trim(), password });
        localStorage.setItem('neurorobi_auth_token', data.token);
        localStorage.setItem('neurorobi_auth', 'true');
        save(data.user);
        setUser(data.user);
        setToken(data.token);
        return true;
    }
    catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 401) return false;
        throw error;
    } };
    return <AuthContext.Provider value={{ isAuthenticated: !!token && !!user, loading, user, token, userEmail: user?.email ?? null, userId: user?.id ?? null, userName: user?.name ?? null, userRole: user?.role ?? null, login, logout, refreshUser }}>{children}</AuthContext.Provider>;
}
export function useAuth() { const c = useContext(AuthContext); if (!c)
    throw new Error('AuthProvider requerido'); return c; }
