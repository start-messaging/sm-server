import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminModule } from '../admin/admin.module';
import { CurrenciesModule } from '../currencies/currencies.module';
import { CountriesController } from './countries.controller';
import { CountriesService } from './countries.service';
import { Country } from './entities/country.entity';

@Module({
  // AdminModule: staff JWT guards for `@StaffAuth`. CurrenciesModule: validate
  // a country's currency code before linking.
  imports: [TypeOrmModule.forFeature([Country]), AdminModule, CurrenciesModule],
  controllers: [CountriesController],
  providers: [CountriesService],
  exports: [CountriesService],
})
export class CountriesModule {}
