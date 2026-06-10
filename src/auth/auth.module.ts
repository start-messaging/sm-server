import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import type { EnvVars } from '../config/env.validation';
import { CountriesModule } from '../countries/countries.module';
import { MailerModule } from '../mailer/mailer.module';
import { OtpModule } from '../otp/otp.module';
import { SessionsModule } from '../sessions/sessions.module';
import { SmsModule } from '../sms/sms.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { MobileVerificationService } from './mobile-verification.service';
import { OtpResendService } from './otp-resend.service';

@Module({
  imports: [
    UsersModule,
    OtpModule,
    SessionsModule,
    MailerModule,
    // SmsModule + CountriesModule: mobile verification sends SMS OTPs and
    // validates the phone-derived country against the reference table.
    SmsModule,
    CountriesModule,
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvVars, true>) => ({
        secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
        signOptions: {
          expiresIn: config.get('JWT_ACCESS_TTL', { infer: true }),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    MobileVerificationService,
    OtpResendService,
    JwtStrategy,
  ],
  // PassportModule registers the `user-jwt` strategy other modules' guards use.
  exports: [PassportModule],
})
export class AuthModule {}
