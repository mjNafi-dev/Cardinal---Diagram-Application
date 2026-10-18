import { useEffect, useState } from 'react';

type Listener = (msg: string | null) => void;
const listeners = new Set<Listener>();
let timer: number | undefined;

export function toast(msg: string) {
  listeners.forEach((l) => l(msg));
  clearTimeout(timer);
  timer = window.setTimeout(() => listeners.forEach((l) => l(null)), 2200);
}

export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    listeners.add(setMsg);
    return () => { listeners.delete(setMsg); };
  }, []);
  return msg ? <div className="toast">{msg}</div> : null;
}
