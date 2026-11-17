export interface RuntimeConfig {
  appTitle: string;
  environment: string;
}

export const DEFAULT_CONFIG: RuntimeConfig = { appTitle: 'Aspecta', environment: 'unknown' };

function isRuntimeConfig(value: unknown): value is RuntimeConfig {
  return (
    typeof value === 'object' &&
    value !== null &&
    'appTitle' in value &&
    typeof value.appTitle === 'string' &&
    'environment' in value &&
    typeof value.environment === 'string'
  );
}

/** Loaded at runtime so one image works in every environment (the file comes from a ConfigMap). */
export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  try {
    const res = await fetch('/config.json', { cache: 'no-store' });
    if (!res.ok) {
      return DEFAULT_CONFIG;
    }
    const data: unknown = await res.json();
    return isRuntimeConfig(data) ? { appTitle: data.appTitle, environment: data.environment } : DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}
