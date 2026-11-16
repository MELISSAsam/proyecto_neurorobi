import axios from 'axios';

export function registerService(name: string, port: number) {
  const rawRegistry = process.env.REGISTRY_URL || 'http://localhost:4000/register';
  const REGISTRY_URL = rawRegistry.endsWith('/register')
    ? rawRegistry
    : `${rawRegistry.replace(/\/+$/, '')}/register`;
  const HOSTNAME = process.env.SERVICE_HOSTNAME || 'localhost';

  const register = () => {
    axios.post(REGISTRY_URL, {
      name,
      host: HOSTNAME,
      port
    }).catch(() => {
      console.log(`[${name}] Could not reach Registry at ${REGISTRY_URL}. Retrying...`);
    });
  };

  // Register immediately and then every 10 seconds
  register();
  setInterval(register, 10000);
}

