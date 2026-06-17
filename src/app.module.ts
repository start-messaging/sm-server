import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminModule } from './admin/admin.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { LoggerModule } from './common/logger/logger.module';
import { ClsConfigModule } from './config/cls.config';
import { envValidationSchema } from './config/env.validation';
import { HttpModule } from './config/http.config';
import { CountriesModule } from './countries/countries.module';
import { CurrenciesModule } from './currencies/currencies.module';
import { CustomersAdminModule } from './customers-admin/customers-admin.module';
import { DatabaseModule } from './database/database.module';
import { MailerModule } from './mailer/mailer.module';
import { PlansModule } from './plans/plans.module';
import { RedisModule } from './redis/redis.module';
import { ReferralModule } from './referral/referral.module';
import { SecurityModule } from './security/security.module';
import { ServicesModule } from './services/services.module';
import { UsersModule } from './users/users.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { WorkspacesModule } from './workspaces/workspaces.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validationSchema: envValidationSchema,
    }),
    DatabaseModule,
    ClsConfigModule,
    LoggerModule,
    HttpModule,
    RedisModule,
    SecurityModule,
    MailerModule,
    UsersModule,
    AuthModule,
    AdminModule,
    ReferralModule,
    CurrenciesModule,
    CountriesModule,
    ServicesModule,
    PlansModule,
    WorkspacesModule,
    CustomersAdminModule,
    WhatsappModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
