import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import type { SensorReading, SpikesLogItem } from '../types';

interface UseSensorStreamProps {
  isStreaming: boolean;
  onSpikeTriggered?: (spike: SpikesLogItem) => void;
  patientId?: string; // Need patientId to start stream
  deviceType?: 'pulsera' | 'oso';
  simulate?: boolean; // Generates synthetic sensor data when no ESP32 is connected
}

export const useSensorStream = ({ isStreaming, onSpikeTriggered, patientId, deviceType = 'pulsera', simulate = false }: UseSensorStreamProps) => {
  const [streamData, setStreamData] = useState<SensorReading[]>([]);
  const [spikesLog, setSpikesLog] = useState<SpikesLogItem[]>([]);
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [isDeviceConnected, setIsDeviceConnected] = useState(false);
  const [isFsrConnected, setIsFsrConnected] = useState(false);
  const [isPulseConnected, setIsPulseConnected] = useState(false);
  const [isGyroConnected, setIsGyroConnected] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const [switch1Pressed, setSwitch1Pressed] = useState(false);
  const [switch2Pressed, setSwitch2Pressed] = useState(false);
  const [shakeIntensity, setShakeIntensity] = useState(0);
  const [strongShakeCount, setStrongShakeCount] = useState(0);
  const [switch1HoldSeconds, setSwitch1HoldSeconds] = useState(0);
  const [switch2HoldSeconds, setSwitch2HoldSeconds] = useState(0);
  const switch1HoldSecondsRef = useRef(0);
  const switch2HoldSecondsRef = useRef(0);
  const strongShakeActiveRef = useRef(false);

  // Live aggregates
  const [maxGripForce, setMaxGripForce] = useState(0);
  const [bilateralTouchSync, setBilateralTouchSync] = useState(70);
  const [stereotypicalTicks, setStereotypicalTicks] = useState(0);
  const [avgHeartRate, setAvgHeartRate] = useState(85);
  const [avgHugForce, setAvgHugForce] = useState(35);

  const [socket, setSocket] = useState<Socket | null>(null);

  const renderTimestamp = useCallback(() => {
    return new Date().toLocaleTimeString([], {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  }, []);

  // Keep a mutable ref of the callback to avoid rebuilding effect on every render
  const onSpikeTriggeredRef = useRef(onSpikeTriggered);
  useEffect(() => {
    onSpikeTriggeredRef.current = onSpikeTriggered;
  }, [onSpikeTriggered]);

  const resetStream = useCallback(() => {
    setStreamData([]);
    setSpikesLog([]);
    setSecondsElapsed(0);
    setMaxGripForce(0);
    setBilateralTouchSync(75);
    setStereotypicalTicks(0);
    setAvgHeartRate(82);
    setAvgHugForce(32);
    setIsDeviceConnected(false);
    setIsFsrConnected(false);
    setIsPulseConnected(false);
    setIsGyroConnected(false);
    setStrongShakeCount(0);
    strongShakeActiveRef.current = false;
  }, []);

  const smoothValue = useCallback((newValue: number, previousValue: number, alpha = 0.25) => {
    return Math.round(previousValue + (newValue - previousValue) * alpha);
  }, []);

  // Generates a plausible synthetic sensor reading for demo purposes
  const generateSimulatedPacket = useCallback((): SensorReading => {
    return {
      timestamp: renderTimestamp(),
      deviceType,
      hugForce: 30 + Math.round(Math.random() * 55),
      rotationX: Math.round((Math.random() * 2 - 1) * 35),
      rotationY: Math.round((Math.random() * 2 - 1) * 35),
      rotationZ: Math.round((Math.random() * 2 - 1) * 35),
      heartRate: 78 + Math.round(Math.random() * 22),
      switch1: Math.random() > 0.65,
      switch2: Math.random() > 0.65,
      shakeIntensity: Math.round(Math.random() * 30)
    };
  }, [deviceType, renderTimestamp]);

  // Manually registers a clinical spike (used by the demo injectors)
  const triggerSpike = useCallback((type: 'Presión' | 'Frecuencia Cardíaca' | 'Cinemática', customValue?: number) => {
    const value = customValue ?? (
      type === 'Presión' ? 88 : type === 'Cinemática' ? 145 : 132
    );
    const alertText = type === 'Presión'
      ? `Abrazo Afectivo de Alta Intensidad: ${value}% de presión registrado.`
      : type === 'Cinemática'
        ? `Crisis de Agitación Motora: Rotación acelerada de ${value}°/s.`
        : `Taquicardia transitoria detectada: ${value} lpm. Paciente bajo desregulación autonómica.`;

    const spike: SpikesLogItem = {
      id: `spk-manual-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      deviceType,
      timestamp: renderTimestamp(),
      type,
      value,
      alertText,
      severity: type === 'Frecuencia Cardíaca' ? 'critical' : 'warning'
    };

    setSpikesLog(prev => [spike, ...prev]);
    if (type === 'Cinemática') {
      setStereotypicalTicks(prev => prev + 1);
    }
    if (onSpikeTriggeredRef.current) {
      onSpikeTriggeredRef.current(spike);
    }
  }, [deviceType, renderTimestamp]);

  useEffect(() => {
    if (isStreaming && patientId) {
      resetStream();

      const newSocket = io(import.meta.env.VITE_WS_URL, {
        transports: ['websocket', 'polling']
      });
      setSocket(newSocket);

      newSocket.on('connect', () => {
        setSocketConnected(true);
        newSocket.emit('start-stream', { patientId, deviceType });
      });

      newSocket.on('disconnect', () => {
        setSocketConnected(false);
        setIsDeviceConnected(false);
      });

      newSocket.on('connect_error', () => {
        setSocketConnected(false);
      });

      let localSeconds = 0;

      const handleSensorData = (data: SensorReading) => {
        if (data.deviceType !== deviceType) return;

        localSeconds += 1;
        setSecondsElapsed(localSeconds);

        if (data.switch1) {
          switch1HoldSecondsRef.current += 1;
        } else {
          switch1HoldSecondsRef.current = 0;
        }

        if (data.switch2) {
          switch2HoldSecondsRef.current += 1;
        } else {
          switch2HoldSecondsRef.current = 0;
        }

        setSwitch1HoldSeconds(switch1HoldSecondsRef.current);
        setSwitch2HoldSeconds(switch2HoldSecondsRef.current);

        const rawShake = Number(data.shakeIntensity ?? 0);
        // Sentinel -999 = giroscopio ausente: se ignora para no generar
        // magnitud ni sacudones falsos (pulsera sin MPU6050, oso degradado).
        const sentinelGyro = data.rotationX === -999 || data.rotationY === -999 || data.rotationZ === -999;
        const gx = sentinelGyro ? 0 : Number(data.rotationX || 0);
        const gy = sentinelGyro ? 0 : Number(data.rotationY || 0);
        const gz = sentinelGyro ? 0 : Number(data.rotationZ || 0);
        const rotationMag = Math.round(
          Math.sqrt(gx * gx + gy * gy + gz * gz) / 6
        );
        const shakes = Math.max(rawShake, rotationMag);

        setStreamData(prev => {
          const lastReading = prev[prev.length - 1];
          const smoothedReading = {
            ...data,
            hugForce: lastReading ? smoothValue(data.hugForce, lastReading.hugForce, 0.2) : data.hugForce,
            heartRate: lastReading ? smoothValue(data.heartRate, lastReading.heartRate, 0.18) : data.heartRate,
            rotationX: lastReading ? smoothValue(data.rotationX, lastReading.rotationX, 0.22) : data.rotationX,
            rotationY: lastReading ? smoothValue(data.rotationY, lastReading.rotationY, 0.22) : data.rotationY,
            rotationZ: lastReading ? smoothValue(data.rotationZ, lastReading.rotationZ, 0.22) : data.rotationZ,
            shakeIntensity: lastReading ? smoothValue(shakes, lastReading.shakeIntensity ?? 0, 0.25) : shakes,
            switch1Duration: switch1HoldSecondsRef.current,
            switch2Duration: switch2HoldSecondsRef.current
          };

          const updated = [...prev, smoothedReading];
          if (updated.length > 25) updated.shift();
          return updated;
        });

        setSwitch1Pressed(Boolean(data.switch1));
        setSwitch2Pressed(Boolean(data.switch2));
        setShakeIntensity(shakes);

        const isStrongShake = shakes >= 18;
        if (isStrongShake && !strongShakeActiveRef.current) {
          strongShakeActiveRef.current = true;
          setStrongShakeCount(prev => prev + 1);
        } else if (!isStrongShake) {
          strongShakeActiveRef.current = false;
        }

        const connectedByForce = typeof data.hugForce === 'number' && data.hugForce >= 0;
        if (connectedByForce || data.switch1 || data.switch2) {
          setIsFsrConnected(true);
          setMaxGripForce(prev => Math.max(prev, data.hugForce >= 0 ? data.hugForce : prev));
          setAvgHugForce(prev => {
            const current = data.hugForce >= 0 ? data.hugForce : (data.switch1 || data.switch2 ? 50 : 0);
            return Math.round((prev * 0.9) + (current * 0.1));
          });
        } else {
          setIsFsrConnected(false);
        }

        if (data.heartRate !== -1) {
          setIsPulseConnected(true);
          setAvgHeartRate(prev => Math.round((prev * 0.9) + (data.heartRate * 0.1)));
        } else {
          setIsPulseConnected(false);
        }

        if (!sentinelGyro) {
          setIsGyroConnected(true);
        } else {
          setIsGyroConnected(false);
        }

        setBilateralTouchSync(prev => {
          const delta = -3 + Math.floor(Math.random() * 7);
          return Math.max(50, Math.min(100, prev + delta));
        });
        
        // Mark device connected upon receiving data packet
        setIsDeviceConnected(true);
      };

      newSocket.on('sensor-data', (data: SensorReading) => handleSensorData(data));

      newSocket.on('device-status', ({ deviceType: statusDeviceType, connected }: { deviceType: 'pulsera' | 'oso'; connected: boolean }) => {
        if (statusDeviceType !== deviceType) return;
        setIsDeviceConnected(connected);
        if (!connected) {
          setIsFsrConnected(false);
          setIsPulseConnected(false);
          setIsGyroConnected(false);
        }
      });

      newSocket.on('spike-triggered', (spike: SpikesLogItem) => {
        if (spike.deviceType !== deviceType) return;
        setSpikesLog(prev => [spike, ...prev]);
        if (spike.type === 'Cinemática') {
          setStereotypicalTicks(prev => prev + 1);
        }
        if (onSpikeTriggeredRef.current) {
          onSpikeTriggeredRef.current(spike);
        }
      });

      // Simulation mode: generate synthetic packets when no ESP32 is present
      let simTimer: ReturnType<typeof setInterval> | undefined;
      if (simulate) {
        setIsDeviceConnected(true);
        simTimer = setInterval(() => {
          handleSensorData(generateSimulatedPacket());
        }, 1000);
      }

      return () => {
        if (simTimer) clearInterval(simTimer);
        newSocket.emit('stop-stream');
        newSocket.disconnect();
      };
    } else {
      if (socket) {
        socket.emit('stop-stream');
        socket.disconnect();
        setSocket(null);
      }
    }
  }, [isStreaming, patientId, resetStream, deviceType, simulate, generateSimulatedPacket]);

  return {
    streamData,
    spikesLog,
    secondsElapsed,
    maxGripForce,
    bilateralTouchSync,
    stereotypicalTicks,
    avgHeartRate,
    avgHugForce,
    isDeviceConnected,
    isFsrConnected,
    isPulseConnected,
    isGyroConnected,
    socketConnected,
    switch1Pressed,
    switch2Pressed,
    switch1HoldSeconds,
    switch2HoldSeconds,
    shakeIntensity,
    strongShakeCount,
    resetStream,
    triggerSpike
  };
};