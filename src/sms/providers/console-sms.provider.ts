import { Injectable } from '@nestjs/common';
import { AppLogger } from '../../common/logger/app-logger.service';
import { SmsMessage, SmsProvider } from '../types/sms-provider.interface';

/** Dev transport — logs the message (including the code) instead of sending. */
@Injectable()
export class ConsoleSmsProvider implements SmsProvider {
  readonly key = 'console';

  constructor(private readonly logger: AppLogger) {}

  send(message: SmsMessage): Promise<void> {
    this.logger.log(
      { event: 'sms.console', to: message.to, text: message.text },
      'Sms',
    );
    return Promise.resolve();
  }
}
