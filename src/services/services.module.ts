import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminModule } from '../admin/admin.module';
import { AuthModule } from '../auth/auth.module';
import { CountriesModule } from '../countries/countries.module';
import { UsersModule } from '../users/users.module';
import { ServiceCategory } from './entities/service-category.entity';
import { ServiceCountryRate } from './entities/service-country-rate.entity';
import { Service } from './entities/service.entity';
import { ServicePricingController } from './service-pricing.controller';
import { ServicePricingService } from './service-pricing.service';
import { ServicesController } from './services.controller';
import { ServicesPublicController } from './services-public.controller';
import { ServicesPublicService } from './services-public.service';
import { ServicesService } from './services.service';

@Module({
  // AdminModule: staff JWT strategy + guards for `@StaffAuth`.
  // CountriesModule: validate/lookup a country (+ its currency) before pricing.
  // AuthModule + UsersModule: the customer-facing list (user JWT guard + the
  // user's country for availability filtering).
  imports: [
    TypeOrmModule.forFeature([Service, ServiceCategory, ServiceCountryRate]),
    AdminModule,
    CountriesModule,
    AuthModule,
    UsersModule,
  ],
  controllers: [
    ServicesController,
    ServicePricingController,
    ServicesPublicController,
  ],
  providers: [ServicesService, ServicePricingService, ServicesPublicService],
  exports: [ServicesService],
})
export class ServicesModule {}
