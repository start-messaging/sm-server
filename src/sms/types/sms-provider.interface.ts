export interface SmsMessage {
  /** Recipient in E.164 format, e.g. `+919876543210`. */
  to: string;
  text: string;
}

/** A pluggable SMS transport. Swap implementations via `SMS_DRIVER`. */
export interface SmsProvider {
  readonly key: string;
  send(message: SmsMessage): Promise<void>;
}
