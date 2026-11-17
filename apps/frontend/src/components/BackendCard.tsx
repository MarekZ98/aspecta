import type { BackendInfo } from '@/lib/api';

interface BackendCardProps {
  info: BackendInfo | null;
  error: string | null;
  loading: boolean;
  onCall: () => void;
}

function formatUptime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours > 0 ? `${String(hours)}h` : '', minutes > 0 ? `${String(minutes)}m` : '', `${String(seconds)}s`]
    .filter(Boolean)
    .join(' ');
}

export function BackendCard({ info, error, loading, onCall }: BackendCardProps) {
  const rows: [string, string][] = info
    ? [
        ['Greeting', info.greeting],
        ['Version', info.version],
        ['Environment', info.environment],
        ['Hostname', info.hostname],
        ['Uptime', formatUptime(info.uptimeSeconds)],
      ]
    : [];

  return (
    <section
      aria-labelledby="backend-title"
      aria-busy={loading}
      className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <h2 id="backend-title" className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
        Backend
      </h2>

      {error && (
        <p role="alert" className="mt-4 rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700">
          {error}
        </p>
      )}

      {!info && loading && (
        <div className="mt-4 space-y-3" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((row) => (
            <div key={row} className="h-4 rounded bg-neutral-100 motion-safe:animate-pulse dark:bg-neutral-800" />
          ))}
        </div>
      )}

      {info && (
        <dl className="mt-4 divide-y divide-neutral-100 text-sm dark:divide-neutral-800">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 py-2">
              <dt className="text-neutral-500 dark:text-neutral-400">{label}</dt>
              <dd className="truncate font-mono">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      <button
        type="button"
        onClick={onCall}
        disabled={loading}
        className="mt-6 rounded-lg bg-neutral-950 px-4 py-2 text-sm font-medium text-neutral-50 hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 disabled:opacity-60 motion-safe:transition-colors dark:bg-neutral-50 dark:text-neutral-950 dark:hover:bg-neutral-200 dark:focus-visible:outline-neutral-50"
      >
        {loading ? 'Calling…' : error ? 'Retry' : 'Call API'}
      </button>
    </section>
  );
}
