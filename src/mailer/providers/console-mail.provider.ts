import { Injectable } from '@nestjs/common';
import { AppLogger } from '../../common/logger/app-logger.service';
import { MailMessage, MailProvider } from '../types/mail-provider.interface';

/** Dev transport — logs the message (including the code) instead of sending. */
@Injectable()
export class ConsoleMailProvider implements MailProvider {
  readonly key = 'console';

  constructor(private readonly logger: AppLogger) {}

  send(message: MailMessage): Promise<void> {
    this.logger.log(
      {
        event: 'mail.console',
        to: message.to,
        subject: message.subject,
        text: message.text,
      },
      'Mailer',
    );
    return Promise.resolve();
  }
}
