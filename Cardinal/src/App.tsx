import { useEffect, useState } from 'react';
import { initBackend } from './store/backend';
import { usePrefs } from './store/prefs';
import { useLibrary } from './store/library';
import { themeCss } from './theme/tokens';
import { useResolvedTheme } from './theme/useTheme';
import { invalidateTextCache } from './geometry/geometry';
import { useFontEpoch } from './diagram/layout';
import { Home } from './home/Home';
import { EditorPage } from './editor/EditorPage';
import { ToastHost } from './ui/toast';
import { ConfirmHost } from './ui/confirm';
import { Logo } from './ui/Logo';

export function navigate(hash: string) {
  if (location.hash !== hash) location.hash = hash;
}

type Route = { page: 'projects' } | { page: 'recent' } | { page: 'project'; id: string } | { page: 'diagram'; id: string };

function parseHash(): Route {
  const h = location.hash.replace(/^#\/?/, '');
  const [a, b] = h.split('/');
  if (a === 'p' && b) return { page: 'project', id: b };
  if (a === 'd' && b) return { page: 'diagram', id: b };
  if (a === 'recent') return { page: 'recent' };
  return { page: 'projects' };
}

// theme + palette variables, injected once
const style = document.createElement('style');
style.textContent = themeCss();
document.head.appendChild(style);

export function App() {
  const [ready, setReady] = useState(false);
  const [route, setRoute] = useState<Route>(parseHash);
  const themePref = usePrefs((s) => s.prefs.theme);
  const setResolved = useResolvedTheme((s) => s.set);

  useEffect(() => {
    (async () => {
      await initBackend();
      await usePrefs.getState().load();
      await useLibrary.getState().refresh().catch(() => {});
      setReady(true);
    })();
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    document.fonts?.ready.then(() => { invalidateTextCache(); useFontEpoch.getState().bump(); });
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const t = themePref === 'system' ? (mq.matches ? 'dark' : 'light') : themePref;
      document.documentElement.dataset.theme = t;
      setResolved(t);
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [themePref, setResolved]);

  if (!ready) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Logo size={56} />
      </div>
    );
  }

  return (
    <>
      {route.page === 'diagram' ? (
        <EditorPage diagramId={route.id} />
      ) : (
        <Home view={route.page === 'project' ? 'project' : route.page} projectId={route.page === 'project' ? route.id : undefined} />
      )}
      <ToastHost />
      <ConfirmHost />
    </>
  );
}
