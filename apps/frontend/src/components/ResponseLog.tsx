export interface LogEntry {
  id: number;
  time: Date;
  hostname: string;
  status: string;
}

interface ResponseLogProps {
  entries: LogEntry[];
}

export function ResponseLog({ entries }: ResponseLogProps) {
  return (
    <section
      aria-labelledby="log-title"
      className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <h2 id="log-title" className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
        Last responses
      </h2>
      {entries.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">No responses yet.</p>
      ) : (
        <ol aria-live="polite" className="mt-4 space-y-1 font-mono text-sm">
          {entries.map((entry) => (
            <li key={entry.id} className="flex gap-4">
              <time dateTime={entry.time.toISOString()} className="text-neutral-500 dark:text-neutral-400">
                {entry.time.toLocaleTimeString()}
              </time>
              <span className="w-10">{entry.status}</span>
              <span className="truncate">{entry.hostname}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
