import { parseMobileOrThrow } from './parse-mobile';

/**
 * Normalize a WhatsApp phone number to E.164. Meta inbound `from` often
 * arrives as digits without a leading `+`; contacts and conversations
 * must always store the canonical E.164 form.
 */
export function normalizeWaE164(raw: string): string {
  const trimmed = raw.trim();
  const withPlus = trimmed.startsWith('+') ? trimmed : `+${trimmed}`;
  const { e164 } = parseMobileOrThrow(withPlus);
  return e164;
}

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/**
 * True when the 24-hour customer-care window is still open — meaning a
 * free-text (non-template) message may be sent.
 */
export function isCustomerCareWindowOpen(
  lastInboundAt: Date | null,
  now: Date = new Date(),
): boolean {
  if (!lastInboundAt) return false;
  return now.getTime() - lastInboundAt.getTime() < TWENTY_FOUR_HOURS_MS;
}
