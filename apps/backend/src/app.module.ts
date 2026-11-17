import { Module, type DynamicModule, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AdminController } from '@/admin/admin.controller';
import { AdminTokenGuard } from '@/admin/admin-token.guard';
import { ChaosController } from '@/chaos/chaos.controller';
import { JsonLogger } from '@/common/logger';
import { RequestContextMiddleware } from '@/common/request-context.middleware';
import { APP_CONFIG, type AppConfig } from '@/config/env';
import { HealthController } from '@/health/health.controller';
import { ReadinessService } from '@/health/readiness.service';
import { InfoController } from '@/info/info.controller';
import { MetricsServer } from '@/metrics/metrics';

@Module({})
export class AppModule implements NestModule {
  static forRoot(config: AppConfig, logger: JsonLogger): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController, InfoController, AdminController, ChaosController],
      providers: [
        { provide: APP_CONFIG, useValue: config },
        { provide: JsonLogger, useValue: logger },
        ReadinessService,
        AdminTokenGuard,
        MetricsServer,
      ],
    };
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}

/** Shared by main.ts and the e2e tests so both serve the same routes. */
export function configureApp(app: NestExpressApplication): void {
  app.setGlobalPrefix('api', { exclude: ['healthz', 'readyz'] });
  app.disable('x-powered-by');
}
