import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/inter/wght.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/700.css';
import './styles/global.css';
import { App } from './App';

// Pre-set the theme before first paint to avoid a light flash in dark mode.
try {
  const saved = JSON.parse(localStorage.getItem('cardinal.prefs') || '{}');
  const t = saved.theme === 'dark' || saved.theme === 'light' ? saved.theme : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = t;
} catch {
  document.documentElement.dataset.theme = 'light';
}

// Dev-only: expose stores for debugging from the console.
if (import.meta.env.DEV) {
  Promise.all([import('./store/editor'), import('./diagram/layout'), import('./store/library')]).then(([e, l, lib]) => {
    (window as any).__cardinal = { useEditor: e.useEditor, layoutRef: l.layoutRef, useLibrary: lib.useLibrary };
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
