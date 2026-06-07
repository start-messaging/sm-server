import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '../common/logger/app-logger.service';
import { MAIL_PROVIDER } from './mailer.constants';
import type { MailProvider } from './types/mail-provider.interface';

/**
 * Stable facade over whichever `MailProvider` is configured. Callers never
 * change when the underlying provider (console / Mailgun / SMTP / …) does.
 */
@Injectable()
export class MailerService {
  constructor(
    @Inject(MAIL_PROVIDER) private readonly provider: MailProvider,
    private readonly logger: AppLogger,
  ) {}

  async sendOtp(email: string, code: string, purpose: string): Promise<void> {
    await this.provider.send({
      to: email,
      subject: 'Your verification code',
      text: `Your ${purpose} verification code is ${code}. It expires soon.`,
    });
    // Note: the code itself is never logged here — only the console provider
    // (dev only) prints it.
    this.logger.log(
      {
        event: 'mail.otp.sent',
        to: email,
        purpose,
        provider: this.provider.key,
      },
      'Mailer',
    );
  }

  async sendStaffInvite(email: string, token: string): Promise<void> {
    await this.provider.send({
      to: email,
      subject: 'You have been invited to the admin console',
      text: `You've been invited as platform staff. Set your password with this invite token: ${token}`,
    });
    this.logger.log(
      {
        event: 'mail.staff_invite.sent',
        to: email,
        provider: this.provider.key,
      },
      'Mailer',
    );
  }
}
