import { hostname } from 'node:os';
import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from '@/admin/admin-token.guard';
import { countRequests } from '@/metrics/metrics';

export interface AdminStatsResponse {
  hostname: string;
  uptimeSeconds: number;
  requestsTotal: number;
  memoryRssBytes: number;
}

@Controller('admin')
@UseGuards(AdminTokenGuard)
export class AdminController {
  @Get('stats')
  async stats(): Promise<AdminStatsResponse> {
    return {
      hostname: hostname(),
      uptimeSeconds: Math.floor(process.uptime()),
      requestsTotal: await countRequests(),
      memoryRssBytes: process.memoryUsage.rss(),
    };
  }
}
