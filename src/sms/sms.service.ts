import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '../common/logger/app-logger.service';
import { SMS_PROVIDER } from './sms.constants';
import type { SmsProvider } from './types/sms-provider.interface';

/**
 * Stable facade over whichever `SmsProvider` is configured. Callers never
 * change when the underlying provider (console / Twilio / MSG91 / …) does.
 */
@Injectable()
export class SmsService {
  constructor(
    @Inject(SMS_PROVIDER) private readonly provider: SmsProvider,
    private readonly logger: AppLogger,
  ) {}

  async sendOtp(toE164: string, code: string, purpose: string): Promise<void> {
    await this.provider.send({
      to: toE164,
      text: `Your ${purpose} verification code is ${code}. It expires soon.`,
    });
    // The code itself is never logged here — only the console provider
    // (dev only) prints it.
    this.logger.log(
      {
        event: 'sms.otp.sent',
        to: toE164,
        purpose,
        provider: this.provider.key,
      },
      'Sms',
    );
  }
}
