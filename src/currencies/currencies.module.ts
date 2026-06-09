import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminModule } from '../admin/admin.module';
import { CurrenciesController } from './currencies.controller';
import { CurrenciesService } from './currencies.service';
import { Currency } from './entities/currency.entity';

@Module({
  // AdminModule provides the staff JWT strategy + guards that `@StaffAuth`
  // routes here rely on.
  imports: [TypeOrmModule.forFeature([Currency]), AdminModule],
  controllers: [CurrenciesController],
  providers: [CurrenciesService],
  // Exported so `countries` (and later pricing) can validate a currency code.
  exports: [CurrenciesService],
})
export class CurrenciesModule {}
