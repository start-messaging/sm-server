import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminModule } from '../admin/admin.module';
import { ServicesModule } from '../services/services.module';
import { Plan } from './entities/plan.entity';
import { PlansController } from './plans.controller';
import { PlansService } from './plans.service';

@Module({
  // AdminModule: staff JWT strategy + guards for `@StaffAuth`.
  // ServicesModule: validate `serviceKey` when creating a service-scoped plan.
  imports: [TypeOrmModule.forFeature([Plan]), AdminModule, ServicesModule],
  controllers: [PlansController],
  providers: [PlansService],
  exports: [PlansService],
})
export class PlansModule {}
