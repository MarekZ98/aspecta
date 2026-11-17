import { setTimeout } from 'node:timers/promises';
import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  InternalServerErrorException,
  NotFoundException,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { APP_CONFIG, type AppConfig } from '@/config/env';

const delaySchema = z
  .string()
  .regex(/^\d{1,4}$/)
  .transform(Number)
  .pipe(z.number().max(5000));

/** Lets demos trigger the error rate and latency alerts on purpose. */
@Controller('chaos')
export class ChaosController {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  @Get('error')
  error(): never {
    this.assertEnabled();
    throw new InternalServerErrorException('Chaos error');
  }

  @Get('slow')
  async slow(@Query('ms') ms: unknown): Promise<{ delayedMs: number }> {
    this.assertEnabled();
    const parsed = delaySchema.safeParse(ms);
    if (!parsed.success) {
      throw new BadRequestException('ms must be an integer from 0 to 5000');
    }
    await setTimeout(parsed.data);
    return { delayedMs: parsed.data };
  }

  private assertEnabled(): void {
    if (!this.config.chaosEnabled) {
      throw new NotFoundException();
    }
  }
}
