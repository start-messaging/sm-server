import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminModule } from '../admin/admin.module';
import { CurrenciesModule } from '../currencies/currencies.module';
import { CountriesController } from './countries.controller';
import { CountriesPublicController } from './countries-public.controller';
import { CountriesService } from './countries.service';
import { Country } from './entities/country.entity';

@Module({
  // AdminModule: staff JWT guards for `@StaffAuth`. CurrenciesModule: validate
  // a country's currency code before linking. (No AuthModule import — see
  // countries-public.controller.ts; it would be a cycle.)
  imports: [TypeOrmModule.forFeature([Country]), AdminModule, CurrenciesModule],
  controllers: [CountriesController, CountriesPublicController],
  providers: [CountriesService],
  exports: [CountriesService],
})
export class CountriesModule {}
