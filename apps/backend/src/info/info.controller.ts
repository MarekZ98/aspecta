import { hostname } from 'node:os';
import { Controller, Get, Inject } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '@/config/env';

export interface InfoResponse {
  service: 'backend';
  version: string;
  environment: string;
  greeting: string;
  hostname: string;
  uptimeSeconds: number;
  timestamp: string;
}

@Controller('info')
export class InfoController {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  @Get()
  getInfo(): InfoResponse {
    return {
      service: 'backend',
      version: this.config.appVersion,
      environment: this.config.appEnv,
      greeting: this.config.greeting,
      hostname: hostname(),
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
