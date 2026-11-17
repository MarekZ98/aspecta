import { setTimeout } from 'node:timers/promises';
import { Inject, Injectable, type BeforeApplicationShutdown } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '@/config/env';

@Injectable()
export class ReadinessService implements BeforeApplicationShutdown {
  private ready = true;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  isReady(): boolean {
    return this.ready;
  }

  /** Keeps serving while Kubernetes removes the pod from the Service endpoints. */
  async beforeApplicationShutdown(): Promise<void> {
    this.ready = false;
    await setTimeout(this.config.shutdownDelayMs);
  }
}
