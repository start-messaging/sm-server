import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StaffAuth } from '../admin/decorators/staff-auth.decorator';
import { AdminStatsService } from './admin-stats.service';

@ApiTags('admin-stats')
@Controller({ path: 'admin/stats', version: '1' })
export class AdminStatsController {
  constructor(private readonly stats: AdminStatsService) {}

  @Get()
  @StaffAuth()
  getStats() {
    return this.stats.getStats();
  }
}
