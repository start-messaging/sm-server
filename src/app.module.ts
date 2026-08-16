import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { EnvVars } from './config/env.validation';
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
import { MembersModule } from './members/members.module';
import { PlansModule } from './plans/plans.module';
import { RedisModule } from './redis/redis.module';
import { ReferralModule } from './referral/referral.module';
import { SecurityModule } from './security/security.module';
import { ServicesModule } from './services/services.module';
import { UsersModule } from './users/users.module';
import { PaymentsModule } from './payments/payments.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validationSchema: envValidationSchema,
    }),
    // BullMQ root — reuses the same Redis connection as sessions/cache.
    // Uses REDIS_HOST/PORT/PASSWORD/DB so no additional URL env is required.
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvVars, true>) => ({
        connection: {
          host: config.get('REDIS_HOST', { infer: true }),
          port: config.get('REDIS_PORT', { infer: true }),
          password: config.get('REDIS_PASSWORD', { infer: true }) || undefined,
          db: config.get('REDIS_DB', { infer: true }),
          maxRetriesPerRequest: null,
        },
        prefix: 'sm:bull',
      }),
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
    MembersModule,
    CustomersAdminModule,
    WhatsappModule,
    PaymentsModule,
    NotificationsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
