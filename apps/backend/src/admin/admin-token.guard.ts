import { createHash, timingSafeEqual } from 'node:crypto';
import {
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { APP_CONFIG, type AppConfig } from '@/config/env';

// timingSafeEqual needs equal lengths; hashing both sides also hides the token length.
function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

@Injectable()
export class AdminTokenGuard implements CanActivate {
  private readonly expected: Buffer;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.expected = digest(config.adminToken);
  }

  canActivate(context: ExecutionContext): boolean {
    const header = context.switchToHttp().getRequest<Request>().header('authorization') ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token || !timingSafeEqual(digest(token), this.expected)) {
      throw new UnauthorizedException({ message: 'Unauthorized' });
    }
    return true;
  }
}
