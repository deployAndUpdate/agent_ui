import { StrictMode, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { VisualEngine } from './VisualEngine';
import { useDashboardSession } from './hooks/useDashboardSession';
import './styles.css';

function readQuery(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  return new URLSearchParams(window.location.search).get(name) ?? fallback;
}

function App() {
  const sessionId = useMemo(() => readQuery('sessionId', 'demo'), []);
  const apiKey = useMemo(
    () => readQuery('apiKey', '') || import.meta.env.VITE_API_KEY || '',
    [],
  );
  const { manifest, version, status, error, interactions, sendInteraction } = useDashboardSession({
    sessionId,
    apiBase: '',
    wsBase: '',
    apiKey: apiKey || undefined,
  });

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-wide text-teal-300/80">Visual Agent Engine</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Session {sessionId}</h1>
        </div>
        <div className="text-sm opacity-80">
          <span data-testid="connection-status">{status}</span>
          {version > 0 ? <span className="ml-3">v{version}</span> : null}
        </div>
      </header>

      {error ? (
        <p className="mb-4 text-red-300" role="alert">
          {error}
        </p>
      ) : null}

      {manifest ? (
        <VisualEngine manifest={manifest} onInteraction={(e) => void sendInteraction(e)} />
      ) : (
        <p className="opacity-70" data-testid="empty-state">
          Waiting for dashboard manifest…
        </p>
      )}

      <section className="mt-8">
        <h2 className="mb-2 text-lg font-medium">Interactions</h2>
        <pre className="overflow-auto rounded-lg bg-black/30 p-3 text-xs">
          {JSON.stringify(interactions, null, 2)}
        </pre>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
