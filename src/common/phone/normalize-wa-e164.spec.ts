import { normalizeWaE164, isCustomerCareWindowOpen } from './normalize-wa-e164';

describe('normalizeWaE164', () => {
  it('normalizes a number without leading +', () => {
    expect(normalizeWaE164('919876543210')).toBe('+919876543210');
  });

  it('normalizes a number with leading +', () => {
    expect(normalizeWaE164('+919876543210')).toBe('+919876543210');
  });

  it('trims whitespace', () => {
    expect(normalizeWaE164('  +14155552671  ')).toBe('+14155552671');
  });

  it('throws on an invalid number', () => {
    expect(() => normalizeWaE164('abc')).toThrow();
  });

  it('throws on an empty string', () => {
    expect(() => normalizeWaE164('')).toThrow();
  });
});

describe('isCustomerCareWindowOpen', () => {
  it('returns false when lastInboundAt is null', () => {
    expect(isCustomerCareWindowOpen(null)).toBe(false);
  });

  it('returns true when last inbound was 1 hour ago', () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    expect(isCustomerCareWindowOpen(oneHourAgo)).toBe(true);
  });

  it('returns true when last inbound was 23h 59m ago', () => {
    const justUnder24h = new Date(Date.now() - (24 * 60 * 60 * 1000 - 60_000));
    expect(isCustomerCareWindowOpen(justUnder24h)).toBe(true);
  });

  it('returns false when last inbound was exactly 24h ago', () => {
    const exactly24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    expect(isCustomerCareWindowOpen(exactly24h)).toBe(false);
  });

  it('returns false when last inbound was 25 hours ago', () => {
    const over24h = new Date(Date.now() - 25 * 60 * 60 * 1000);
    expect(isCustomerCareWindowOpen(over24h)).toBe(false);
  });

  it('uses the provided `now` parameter', () => {
    const inbound = new Date('2024-01-01T12:00:00Z');
    const within = new Date('2024-01-01T20:00:00Z');
    const outside = new Date('2024-01-02T13:00:00Z');

    expect(isCustomerCareWindowOpen(inbound, within)).toBe(true);
    expect(isCustomerCareWindowOpen(inbound, outside)).toBe(false);
  });
});
