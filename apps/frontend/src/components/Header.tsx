import { ThemeToggle } from '@/components/ThemeToggle';
import type { Theme } from '@/hooks/useTheme';

interface HeaderProps {
  title: string;
  environment: string;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
}

export function Header({ title, environment, theme, onThemeChange }: HeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <div className="flex items-center gap-3">
        <span className="rounded-full border border-neutral-300 px-2.5 py-0.5 font-mono text-xs text-neutral-600 dark:border-neutral-700 dark:text-neutral-400">
          <span className="sr-only">Environment: </span>
          {environment}
        </span>
        <ThemeToggle theme={theme} onChange={onThemeChange} />
      </div>
    </header>
  );
}
