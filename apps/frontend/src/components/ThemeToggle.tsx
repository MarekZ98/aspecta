import type { Theme } from '@/hooks/useTheme';

const OPTIONS: { value: Theme; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

interface ThemeToggleProps {
  theme: Theme;
  onChange: (theme: Theme) => void;
}

export function ThemeToggle({ theme, onChange }: ThemeToggleProps) {
  return (
    <div
      role="group"
      aria-label="Color theme"
      className="inline-flex rounded-lg border border-neutral-200 p-0.5 text-xs dark:border-neutral-800"
    >
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={theme === option.value}
          onClick={() => {
            onChange(option.value);
          }}
          className="rounded-md px-2.5 py-1 text-neutral-600 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 aria-pressed:bg-neutral-950 aria-pressed:text-neutral-50 motion-safe:transition-colors dark:text-neutral-400 dark:hover:text-neutral-50 dark:focus-visible:outline-neutral-50 dark:aria-pressed:bg-neutral-50 dark:aria-pressed:text-neutral-950"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
