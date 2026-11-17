import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
export function useDeviceAvailability() {
  const [connected,setConnected]=useState(false),[serverConnected,setServerConnected]=useState(false),[inUse,setInUse]=useState(false);
  useEffect(()=>{
    const socket=io(import.meta.env.VITE_WS_URL,{transports:['websocket','polling'],auth:cb=>cb({token:localStorage.getItem('neurorobi_auth_token')})});
    socket.on('connect',()=>setServerConnected(true));
    socket.on('disconnect',()=>{setConnected(false);setServerConnected(false);setInUse(false);});
    socket.on('connect_error',()=>{setConnected(false);setServerConnected(false);});
    socket.on('device-status',(status:{deviceType:string;connected:boolean})=>{if(status.deviceType==='oso')setConnected(status.connected);});
    socket.on('therapy-status',(status:{active:boolean})=>setInUse(status.active));
    return()=>{socket.disconnect();};
  },[]);
  return {connected,serverConnected,inUse};
}
