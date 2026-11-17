import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ReadinessService } from '@/health/readiness.service';

@Controller()
export class HealthController {
  constructor(private readonly readiness: ReadinessService) {}

  @Get('healthz')
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('readyz')
  ready(): { status: 'ready' } {
    if (!this.readiness.isReady()) {
      throw new ServiceUnavailableException({ status: 'shutting-down' });
    }
    return { status: 'ready' };
  }
}
