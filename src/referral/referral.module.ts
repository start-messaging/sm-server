import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { EnvVars } from '../config/env.validation';
import { MailerModule } from '../mailer/mailer.module';
import { OtpModule } from '../otp/otp.module';
import { SessionsModule } from '../sessions/sessions.module';
import { ReferralPartner } from './entities/referral-partner.entity';
import { ReferralAuthController } from './referral-auth.controller';
import { ReferralAuthService } from './referral-auth.service';
import { ReferralJwtStrategy } from './strategies/referral-jwt.strategy';

@Module({
  imports: [
    TypeOrmModule.forFeature([ReferralPartner]),
    OtpModule,
    SessionsModule,
    MailerModule,
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvVars, true>) => ({
        secret: config.get('REFERRAL_JWT_ACCESS_SECRET', { infer: true }),
        signOptions: {
          expiresIn: config.get('REFERRAL_JWT_ACCESS_TTL', { infer: true }),
        },
      }),
    }),
  ],
  controllers: [ReferralAuthController],
  providers: [ReferralAuthService, ReferralJwtStrategy],
})
export class ReferralModule {}
