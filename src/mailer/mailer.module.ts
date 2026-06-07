import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvVars } from '../config/env.validation';
import { MailerService } from './mailer.service';
import { ConsoleMailProvider } from './providers/console-mail.provider';
import { MAIL_PROVIDER } from './mailer.constants';
import { MailgunMailProvider } from './providers/mailgun-mail.provider';
import type { MailProvider } from './types/mail-provider.interface';

@Module({
  providers: [
    ConsoleMailProvider,
    MailgunMailProvider,
    {
      provide: MAIL_PROVIDER,
      inject: [ConfigService, ConsoleMailProvider, MailgunMailProvider],
      useFactory: (
        config: ConfigService<EnvVars, true>,
        consoleProvider: ConsoleMailProvider,
        mailgunProvider: MailgunMailProvider,
      ): MailProvider => {
        switch (config.get('MAIL_DRIVER', { infer: true })) {
          case 'mailgun':
            return mailgunProvider;
          // 'smtp' is not implemented yet → fall back to console.
          default:
            return consoleProvider;
        }
      },
    },
    MailerService,
  ],
  exports: [MailerService],
})
export class MailerModule {}
