import { useCallback, useEffect, useRef, useState } from 'react';
import { BackendCard } from '@/components/BackendCard';
import { Header } from '@/components/Header';
import { ResponseLog, type LogEntry } from '@/components/ResponseLog';
import { useTheme } from '@/hooks/useTheme';
import { ApiError, fetchInfo, type BackendInfo } from '@/lib/api';
import { DEFAULT_CONFIG, loadRuntimeConfig, type RuntimeConfig } from '@/lib/config';

const MAX_LOG_ENTRIES = 5;

export function App() {
  const { theme, setTheme } = useTheme();
  const [config, setConfig] = useState<RuntimeConfig>(DEFAULT_CONFIG);
  const [info, setInfo] = useState<BackendInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [log, setLog] = useState<LogEntry[]>([]);
  const controllerRef = useRef<AbortController | null>(null);
  const nextIdRef = useRef(0);

  const addLogEntry = useCallback((hostname: string, status: string) => {
    nextIdRef.current += 1;
    const entry = { id: nextIdRef.current, time: new Date(), hostname, status };
    setLog((entries) => [entry, ...entries].slice(0, MAX_LOG_ENTRIES));
  }, []);

  const requestInfo = useCallback((): Promise<void> => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    return fetchInfo(controller.signal).then(
      (result) => {
        setInfo(result);
        setError(null);
        setLoading(false);
        addLogEntry(result.hostname, '200');
      },
      (err: unknown) => {
        // A newer request (or unmount) replaced this one; its result is no longer wanted.
        if (controller.signal.aborted) {
          return;
        }
        setError(err instanceof ApiError ? err.message : 'Backend is not reachable');
        setLoading(false);
        addLogEntry('-', err instanceof ApiError ? String(err.status) : 'ERR');
      },
    );
  }, [addLogEntry]);

  const callApi = useCallback(() => {
    setLoading(true);
    void requestInfo();
  }, [requestInfo]);

  useEffect(() => {
    void loadRuntimeConfig().then((loaded) => {
      setConfig(loaded);
      document.title = loaded.appTitle;
    });
  }, []);

  useEffect(() => {
    void requestInfo();
    return () => controllerRef.current?.abort();
  }, [requestInfo]);

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-10">
      <Header title={config.appTitle} environment={config.environment} theme={theme} onThemeChange={setTheme} />
      <main className="flex flex-col gap-6">
        <BackendCard info={info} error={error} loading={loading} onCall={callApi} />
        <ResponseLog entries={log} />
      </main>
      <footer className="mt-auto font-mono text-xs text-neutral-500 dark:text-neutral-400">
        frontend {import.meta.env.VITE_APP_VERSION ?? 'dev'}
      </footer>
    </div>
  );
}
