import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminModule } from '../admin/admin.module';
import { CountriesModule } from '../countries/countries.module';
import { ServiceCategory } from './entities/service-category.entity';
import { ServiceCountryRate } from './entities/service-country-rate.entity';
import { Service } from './entities/service.entity';
import { ServicePricingController } from './service-pricing.controller';
import { ServicePricingService } from './service-pricing.service';
import { ServicesController } from './services.controller';
import { ServicesService } from './services.service';

@Module({
  // AdminModule: staff JWT strategy + guards for `@StaffAuth`.
  // CountriesModule: validate/lookup a country (+ its currency) before pricing.
  imports: [
    TypeOrmModule.forFeature([Service, ServiceCategory, ServiceCountryRate]),
    AdminModule,
    CountriesModule,
  ],
  controllers: [ServicesController, ServicePricingController],
  providers: [ServicesService, ServicePricingService],
  exports: [ServicesService],
})
export class ServicesModule {}
