import axios from 'axios'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Attach the current session only to this application's backend requests.
axios.interceptors.request.use((config) => {
  const base = import.meta.env.VITE_API_URL?.replace(/\/+$/, '');
  const token = localStorage.getItem('neurorobi_auth_token');
  if (base !== undefined && token && config.url?.startsWith(`${base}/api/`)) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

axios.interceptors.response.use(response=>response,error=>{if(error.response?.status===401&&!error.config?.url?.endsWith('/login'))window.dispatchEvent(new Event('neurorobi:unauthorized'));return Promise.reject(error);});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
