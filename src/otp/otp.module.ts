import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OtpVerification } from './entities/otp-verification.entity';
import { OtpService } from './otp.service';

@Module({
  imports: [TypeOrmModule.forFeature([OtpVerification])],
  providers: [OtpService],
  exports: [OtpService],
})
export class OtpModule {}
