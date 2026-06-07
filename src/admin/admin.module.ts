import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { EnvVars } from '../config/env.validation';
import { MailerModule } from '../mailer/mailer.module';
import { SessionsModule } from '../sessions/sessions.module';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { PlatformStaff } from './entities/platform-staff.entity';
import { PlatformAdminGuard } from './guards/platform-admin.guard';
import { StaffJwtGuard } from './guards/staff-jwt.guard';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';
import { StaffJwtStrategy } from './strategies/staff-jwt.strategy';

@Module({
  imports: [
    TypeOrmModule.forFeature([PlatformStaff]),
    SessionsModule,
    MailerModule,
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvVars, true>) => ({
        secret: config.get('ADMIN_JWT_ACCESS_SECRET', { infer: true }),
        signOptions: {
          expiresIn: config.get('ADMIN_JWT_ACCESS_TTL', { infer: true }),
        },
      }),
    }),
  ],
  controllers: [AdminAuthController, StaffController],
  providers: [
    AdminAuthService,
    StaffService,
    StaffJwtStrategy,
    StaffJwtGuard,
    PlatformAdminGuard,
  ],
  // Exported so later feature modules can host `@StaffAuth` routes.
  exports: [StaffJwtStrategy, StaffJwtGuard, PlatformAdminGuard, JwtModule],
})
export class AdminModule {}
