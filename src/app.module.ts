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
import { DatabaseModule } from './database/database.module';
import { MailerModule } from './mailer/mailer.module';
import { RedisModule } from './redis/redis.module';
import { ReferralModule } from './referral/referral.module';
import { SecurityModule } from './security/security.module';
import { UsersModule } from './users/users.module';

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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
