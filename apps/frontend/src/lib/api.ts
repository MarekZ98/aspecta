export interface BackendInfo {
  service: string;
  version: string;
  environment: string;
  greeting: string;
  hostname: string;
  uptimeSeconds: number;
  timestamp: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function isBackendInfo(value: unknown): value is BackendInfo {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    ['service', 'version', 'environment', 'greeting', 'hostname', 'timestamp'].every(
      (key) => typeof record[key] === 'string',
    ) && typeof record.uptimeSeconds === 'number'
  );
}

export async function fetchInfo(signal?: AbortSignal): Promise<BackendInfo> {
  const res = await fetch('/api/info', { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new ApiError(res.status, `Backend returned ${String(res.status)}`);
  }
  const data: unknown = await res.json();
  if (!isBackendInfo(data)) {
    throw new ApiError(res.status, 'Backend returned an unexpected response');
  }
  return data;
}
