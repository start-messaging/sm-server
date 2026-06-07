export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** A pluggable email transport. Swap implementations via `MAIL_DRIVER`. */
export interface MailProvider {
  readonly key: string;
  send(message: MailMessage): Promise<void>;
}
