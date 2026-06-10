import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvVars } from '../config/env.validation';
import { ConsoleSmsProvider } from './providers/console-sms.provider';
import { SMS_PROVIDER } from './sms.constants';
import { SmsService } from './sms.service';
import type { SmsProvider } from './types/sms-provider.interface';

@Module({
  providers: [
    ConsoleSmsProvider,
    {
      provide: SMS_PROVIDER,
      inject: [ConfigService, ConsoleSmsProvider],
      useFactory: (
        config: ConfigService<EnvVars, true>,
        consoleProvider: ConsoleSmsProvider,
      ): SmsProvider => {
        switch (config.get('SMS_DRIVER', { infer: true })) {
          // 'twilio' is not implemented yet → fall back to console.
          default:
            return consoleProvider;
        }
      },
    },
    SmsService,
  ],
  exports: [SmsService],
})
export class SmsModule {}
