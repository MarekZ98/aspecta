import '@testing-library/jest-dom/vitest';

// jsdom has no matchMedia; useTheme needs it for the "system" theme.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) =>
    ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }) as Partial<MediaQueryList> as MediaQueryList,
});
