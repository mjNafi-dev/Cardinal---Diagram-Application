import { useEffect, useState } from 'react';
import { Modal } from './Modal';

/**
 * In-app "are you sure?" dialog. Used instead of window.confirm, which the desktop
 * webviews don't show reliably (it can return true without asking).
 */
interface Ask { title: string; text: string; yes: string; resolve: (ok: boolean) => void }
type Listener = (a: Ask | null) => void;
const listeners = new Set<Listener>();

export function askConfirm(title: string, text: string, yes = 'Delete'): Promise<boolean> {
  return new Promise((resolve) => listeners.forEach((l) => l({ title, text, yes, resolve })));
}

export function ConfirmHost() {
  const [ask, setAsk] = useState<Ask | null>(null);
  useEffect(() => {
    listeners.add(setAsk);
    return () => { listeners.delete(setAsk); };
  }, []);
  if (!ask) return null;
  const done = (ok: boolean) => { ask.resolve(ok); setAsk(null); };
  return (
    <Modal title={ask.title} onClose={() => done(false)} width={420}
      footer={<><button className="btn" onClick={() => done(false)}>Cancel</button><button className="btn btn-primary" autoFocus onClick={() => done(true)}>{ask.yes}</button></>}>
      <p style={{ margin: 0 }}>{ask.text}</p>
    </Modal>
  );
}
