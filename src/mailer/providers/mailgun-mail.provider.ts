import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../../common/exceptions/app.exception';
import { AppLogger } from '../../common/logger/app-logger.service';
import type { EnvVars } from '../../config/env.validation';
import { MailMessage, MailProvider } from '../types/mail-provider.interface';

/** Mailgun transport via the HTTP API. Activated when `MAIL_DRIVER=mailgun`. */
@Injectable()
export class MailgunMailProvider implements MailProvider {
  readonly key = 'mailgun';

  constructor(
    private readonly config: ConfigService<EnvVars, true>,
    private readonly logger: AppLogger,
  ) {}

  async send(message: MailMessage): Promise<void> {
    const apiKey = this.config.get('MAILGUN_API_KEY', { infer: true });
    const domain = this.config.get('MAILGUN_DOMAIN', { infer: true });
    const from = this.config.get('MAIL_FROM', { infer: true });
    if (!apiKey || !domain) {
      throw new AppException(
        { code: 'MAIL_NOT_CONFIGURED', message: 'Mailgun is not configured' },
        500,
      );
    }

    const body = new URLSearchParams({
      from,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
    if (message.html) body.set('html', message.html);

    const res = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
      method: 'POST',
      headers: {
        Authorization:
          'Basic ' + Buffer.from(`api:${apiKey}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!res.ok) {
      this.logger.error(
        { event: 'mail.mailgun.failed', status: res.status, to: message.to },
        'Mailer',
      );
      throw new AppException(
        { code: 'MAIL_SEND_FAILED', message: 'Failed to send email' },
        502,
      );
    }
    this.logger.log(
      { event: 'mail.mailgun.sent', to: message.to, subject: message.subject },
      'Mailer',
    );
  }
}
