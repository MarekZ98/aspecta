import { render, screen, within } from '@testing-library/react';
import { App } from '@/App';
import type { BackendInfo } from '@/lib/api';

const info: BackendInfo = {
  service: 'backend',
  version: 'sha-abc1234',
  environment: 'kind',
  greeting: 'Hello from Aspecta',
  hostname: 'webapp-backend-7d9f-x2k4p',
  uptimeSeconds: 3725,
  timestamp: '2026-01-01T00:00:00.000Z',
};

function mockFetch(apiResponse: Response): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.endsWith('/config.json')) {
        return Promise.resolve(Response.json({ appTitle: 'Aspecta Test', environment: 'kind' }));
      }
      return Promise.resolve(apiResponse.clone());
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('App', () => {
  it('renders backend info and runtime config', async () => {
    mockFetch(Response.json(info));
    render(<App />);

    expect(await screen.findByText('Hello from Aspecta')).toBeInTheDocument();
    expect(screen.getByText('1h 2m 5s')).toBeInTheDocument();
    expect(screen.getAllByText('webapp-backend-7d9f-x2k4p')).toHaveLength(2);
    expect(await screen.findByRole('heading', { name: 'Aspecta Test' })).toBeInTheDocument();
    expect(within(screen.getByRole('banner')).getByText('kind')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Call API' })).toBeEnabled();
  });

  it('shows an error state when the backend returns 500', async () => {
    mockFetch(new Response('fail', { status: 500 }));
    render(<App />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Backend returned 500');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
  });
});
