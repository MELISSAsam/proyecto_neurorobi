import { useEffect, useState } from 'react';
import axios from 'axios';
export interface AvailableDevice {
    deviceId: string;
    name: string;
    connected: boolean;
    therapyActive: boolean;
}
export function useDeviceAvailability(selectedId = '') {
    const [devices, setDevices] = useState<AvailableDevice[]>([]), [serverConnected, setServerConnected] = useState(false);
    useEffect(() => { let alive = true, pending = false; const poll = async () => { if (pending)
        return; pending = true; try {
        const { data } = await axios.get(`${import.meta.env.VITE_API_URL}/api/telemetry/devices`, { timeout: 5000 });
        if (alive) {
            setDevices(Array.isArray(data) ? data : []);
            setServerConnected(true);
        }
    }
    catch {
        if (alive) {
            setServerConnected(false);
            setDevices([]);
        }
    }
    finally {
        pending = false;
    } }; void poll(); const timer = setInterval(poll, 2000); return () => { alive = false; clearInterval(timer); }; }, []);
    const selected = devices.find(d => d.deviceId === selectedId) || (!selectedId ? devices[0] : undefined);
    return { devices, deviceId: selected?.deviceId || selectedId, connected: serverConnected && !!selected?.connected, serverConnected, inUse: !!selected?.therapyActive };
}
