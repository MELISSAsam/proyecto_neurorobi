import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import type { SensorReading, SpikesLogItem } from '../types';

interface UseSensorStreamProps {
  isStreaming: boolean;
  onSpikeTriggered?: (spike: SpikesLogItem) => void;
  patientId?: string;
  deviceId?: string;
  deviceType?: 'oso';
  simulate?: boolean;
}

export const useSensorStream = ({
  isStreaming,
  onSpikeTriggered,
  patientId,
  deviceId,
  deviceType = 'oso',
  simulate = false,
}: UseSensorStreamProps) => {
  const [streamData, setStreamData] = useState<SensorReading[]>([]);
  const [spikesLog, setSpikesLog] = useState<SpikesLogItem[]>([]);
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [isDeviceConnected, setIsDeviceConnected] = useState(false);
  const [isFsrConnected, setIsFsrConnected] = useState(false);
  const [isGyroConnected, setIsGyroConnected] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  
  // Switches (Finales de carrera GPIO 18 y GPIO 19)
  const [switch1Pressed, setSwitch1Pressed] = useState(false);
  const [switch2Pressed, setSwitch2Pressed] = useState(false);
  const [switch1HoldSeconds, setSwitch1HoldSeconds] = useState(0);
  const [switch2HoldSeconds, setSwitch2HoldSeconds] = useState(0);
  const switch1HoldSecondsRef = useRef(0);
  const switch2HoldSecondsRef = useRef(0);

  // MPU6050 y Cinemática
  const [shakeIntensity, setShakeIntensity] = useState(0);
  const [strongShakeCount, setStrongShakeCount] = useState(0);
  const strongShakeActiveRef = useRef(false);

  // Métricas específicas del Peluche NeuroRobi
  const [flexIzq, setFlexIzq] = useState(0);
  const [flexDer, setFlexDer] = useState(0);
  const [apreton, setApreton] = useState(false);
  const [nivelDer, setNivelDer] = useState(1);
  const [mpuOk, setMpuOk] = useState(false);
  const [accX, setAccX] = useState(0);
  const [accY, setAccY] = useState(0);
  const [accZ, setAccZ] = useState(1);
  const [giroX, setGiroX] = useState(0);
  const [giroY, setGiroY] = useState(0);
  const [giroZ, setGiroZ] = useState(0);
  const [movimiento, setMovimiento] = useState(0);

  // Live aggregates
  const [maxGripForce, setMaxGripForce] = useState(0);
  const [bilateralTouchSync, setBilateralTouchSync] = useState(70);
  const [stereotypicalTicks, setStereotypicalTicks] = useState(0);
  const [avgHugForce, setAvgHugForce] = useState(30);

  const [socket, setSocket] = useState<Socket | null>(null);

  const renderTimestamp = useCallback(() => {
    return new Date().toLocaleTimeString([], {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  }, []);

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
    setAvgHugForce(30);
    setIsDeviceConnected(false);
    setIsFsrConnected(false);
    setIsGyroConnected(false);
    setStrongShakeCount(0);
    strongShakeActiveRef.current = false;
    setFlexIzq(0);
    setFlexDer(0);
    setApreton(false);
    setNivelDer(1);
    setMpuOk(false);
    setMovimiento(0);
  }, []);

  const smoothValue = useCallback((newValue: number, previousValue: number, alpha = 0.25) => {
    return Math.round(previousValue + (newValue - previousValue) * alpha);
  }, []);

  // Generates synthetic reading matching Peluche NeuroRobi ESP32
  const generateSimulatedPacket = useCallback((): SensorReading => {
    const sFlexIzq = 450 + Math.round(Math.random() * 300);
    const sApreton = sFlexIzq > 600;
    const sFlexDer = 720 + Math.round(Math.random() * 500);
    const sNivelDer = Math.min(10, Math.max(1, Math.round(1.0 + ((sFlexDer - 700) * 9.0) / 600.0)));
    const sSwIzq = Math.random() > 0.8;
    const sSwDer = Math.random() > 0.8;
    const sGiroX = Number(((Math.random() * 2 - 1) * 20).toFixed(2));
    const sGiroY = Number(((Math.random() * 2 - 1) * 20).toFixed(2));
    const sGiroZ = Number(((Math.random() * 2 - 1) * 20).toFixed(2));
    const sMovimiento = Number((Math.min(100, Math.sqrt(sGiroX*sGiroX + sGiroY*sGiroY + sGiroZ*sGiroZ) / 3.0)).toFixed(1));

    return {
      timestamp: renderTimestamp(),
      deviceType,
      flexIzq: sFlexIzq,
      flexDer: sFlexDer,
      apreton: sApreton,
      nivelDer: sNivelDer,
      switchIzq: sSwIzq,
      switchDer: sSwDer,
      mpu: true,
      accX: 0.05,
      accY: -0.02,
      accZ: 0.98,
      giroX: sGiroX,
      giroY: sGiroY,
      giroZ: sGiroZ,
      movimiento: sMovimiento,
      hugForce: sApreton ? 100 : 0,
      rotationX: sGiroX,
      rotationY: sGiroY,
      rotationZ: sGiroZ,
      heartRate: -1,
      switch1: sSwIzq,
      switch2: sSwDer,
      shakeIntensity: sMovimiento
    };
  }, [renderTimestamp]);

  const triggerSpike = useCallback((type: 'Presión' | 'Frecuencia Cardíaca' | 'Cinemática' | 'Flexión Articular', customValue?: number) => {
    const value = customValue ?? (
      type === 'Presión' ? 750 : type === 'Cinemática' ? 65 : type === 'Flexión Articular' ? 9 : 125
    );
    const alertText = type === 'Presión'
      ? `Apretón Afectivo Detectado en Oso: ADC ${value} (Umbral > 600).`
      : type === 'Flexión Articular'
        ? `Flexión Máxima del Brazo Derecho: Nivel ${value}/10 registrado.`
        : type === 'Cinemática'
          ? `Crisis de Agitación Motora: Intensidad ${value}/100 en MPU6050.`
          : `Alerta clínica: ${value} lpm.`;

    const spike: SpikesLogItem = {
      id: `spk-manual-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      deviceType: 'oso',
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
  }, [renderTimestamp]);

  useEffect(() => {
    if (isStreaming && patientId) {
      resetStream();

      const newSocket = io(import.meta.env.VITE_API_URL, {
        transports: ['websocket', 'polling'],
        auth: (cb) => cb({ token: localStorage.getItem('neurorobi_auth_token') })
      });
      setSocket(newSocket);

      newSocket.on('connect', () => {
        setSocketConnected(true);
        newSocket.emit('start-stream', { patientId, deviceId, deviceType: 'oso' });
      });

      newSocket.on('disconnect', () => {
        setSocketConnected(false);
        setIsDeviceConnected(false);
      });

      newSocket.on('connect_error', () => {
        setSocketConnected(false);
      });

      const startedAt = Date.now();

      const handleSensorData = (data: SensorReading) => {
        const localSeconds = Math.floor((Date.now() - startedAt) / 1000);
        setSecondsElapsed(localSeconds);

        const sFlexIzq = typeof data.flexIzq !== 'undefined' ? data.flexIzq : data.hugForce;
        const sFlexDer = typeof data.flexDer !== 'undefined' ? data.flexDer : 0;
        const sApreton = typeof data.apreton !== 'undefined' ? data.apreton : sFlexIzq > 600;
        const sNivelDer = typeof data.nivelDer !== 'undefined'
          ? data.nivelDer
          : Math.min(10, Math.max(1, Math.round(1.0 + ((sFlexDer - 700) * 9.0) / 600.0)));
        const sSwIzq = typeof data.switchIzq !== 'undefined' ? data.switchIzq : Boolean(data.switch1);
        const sSwDer = typeof data.switchDer !== 'undefined' ? data.switchDer : Boolean(data.switch2);
        const sMpu = typeof data.mpu !== 'undefined' ? data.mpu : true;
        const sMovimiento = typeof data.movimiento !== 'undefined' ? data.movimiento : Number(data.shakeIntensity || 0);

        setFlexIzq(sFlexIzq);
        setFlexDer(sFlexDer);
        setApreton(sApreton);
        setNivelDer(sNivelDer);
        setMpuOk(sMpu);
        setAccX(data.accX ?? 0);
        setAccY(data.accY ?? 0);
        setAccZ(data.accZ ?? 1);
        setGiroX(data.giroX ?? data.rotationX ?? 0);
        setGiroY(data.giroY ?? data.rotationY ?? 0);
        setGiroZ(data.giroZ ?? data.rotationZ ?? 0);
        setMovimiento(sMovimiento);

        if (sSwIzq) {
          switch1HoldSecondsRef.current += 1;
        } else {
          switch1HoldSecondsRef.current = 0;
        }

        if (sSwDer) {
          switch2HoldSecondsRef.current += 1;
        } else {
          switch2HoldSecondsRef.current = 0;
        }

        setSwitch1HoldSeconds(switch1HoldSecondsRef.current);
        setSwitch2HoldSeconds(switch2HoldSecondsRef.current);

        setStreamData(prev => {
          const lastReading = prev[prev.length - 1];
          const smoothedReading: SensorReading = {
            ...data,
            elapsedMs: Date.now() - startedAt,
            deviceType: 'oso',
            flexIzq: sFlexIzq,
            flexDer: sFlexDer,
            apreton: sApreton,
            nivelDer: sNivelDer,
            switchIzq: sSwIzq,
            switchDer: sSwDer,
            mpu: sMpu,
            movimiento: sMovimiento,
            hugForce: sApreton ? 100 : 0,
            rotationX: lastReading ? smoothValue(data.giroX ?? data.rotationX ?? 0, lastReading.rotationX, 0.22) : (data.giroX ?? 0),
            rotationY: lastReading ? smoothValue(data.giroY ?? data.rotationY ?? 0, lastReading.rotationY, 0.22) : (data.giroY ?? 0),
            rotationZ: lastReading ? smoothValue(data.giroZ ?? data.rotationZ ?? 0, lastReading.rotationZ, 0.22) : (data.giroZ ?? 0),
            shakeIntensity: sMovimiento,
            switch1Duration: switch1HoldSecondsRef.current,
            switch2Duration: switch2HoldSecondsRef.current
          };

          const updated = [...prev, smoothedReading];
          // Conservar todas las lecturas para archivar la sesion completa.
          return updated;
        });

        setSwitch1Pressed(sSwIzq);
        setSwitch2Pressed(sSwDer);
        setShakeIntensity(sMovimiento);

        const isStrongShake = sMpu && sMovimiento >= 60;
        if (isStrongShake && !strongShakeActiveRef.current) {
          strongShakeActiveRef.current = true;
          setStrongShakeCount(prev => prev + 1);
        } else if (!isStrongShake) {
          strongShakeActiveRef.current = false;
        }

        setIsFsrConnected(true);
        setMaxGripForce(prev => Math.max(prev, sApreton ? 100 : 0));
        setAvgHugForce(prev => Math.round((prev * 0.9) + ((sApreton ? 100 : 0) * 0.1)));
        setIsGyroConnected(sMpu);

        // Coordinación táctil bilateral: si ambos switches están o estuvieron activos
        setBilateralTouchSync(prev => {
          const bothActive = sSwIzq && sSwDer;
          const target = bothActive ? 95 : (sSwIzq || sSwDer ? 75 : 60);
          return Math.round(prev + (target - prev) * 0.2);
        });

        setIsDeviceConnected(true);
      };

      newSocket.on('sensor-data', (data: SensorReading) => {if(!deviceId||data.deviceId===deviceId)handleSensorData(data);});

      newSocket.on('device-status', ({ deviceType: statusDeviceType, deviceId:statusId, connected }: { deviceType: string; deviceId?:string; connected: boolean }) => {
        if (statusDeviceType === 'oso' && (!deviceId||deviceId===statusId)) {
          setIsDeviceConnected(connected);
          if (!connected) {
            setIsFsrConnected(false);
            setIsGyroConnected(false);
          }
        }
      });

      newSocket.on('spike-triggered', (spike: SpikesLogItem) => {
        setSpikesLog(prev => [spike, ...prev]);
        if (spike.type === 'Cinemática') {
          setStereotypicalTicks(prev => prev + 1);
        }
        if (onSpikeTriggeredRef.current) {
          onSpikeTriggeredRef.current(spike);
        }
      });
      // Simulation mode
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
  }, [isStreaming, patientId, deviceId, resetStream, simulate, generateSimulatedPacket, renderTimestamp]);

  return {
    streamData,
    spikesLog,
    secondsElapsed,
    maxGripForce,
    bilateralTouchSync,
    stereotypicalTicks,
    avgHugForce,
    isDeviceConnected,
    isFsrConnected,
    isGyroConnected,
    socketConnected,
    switch1Pressed,
    switch2Pressed,
    switch1HoldSeconds,
    switch2HoldSeconds,
    shakeIntensity,
    strongShakeCount,
    // Específicos del Peluche
    flexIzq,
    flexDer,
    apreton,
    nivelDer,
    mpuOk,
    accX,
    accY,
    accZ,
    giroX,
    giroY,
    giroZ,
    movimiento,
    resetStream,
    triggerSpike
  };
};
