import { matchesKeyword, selectMatchingRule } from './auto-reply-match';
import type { MatchableRule } from './auto-reply-match';

describe('matchesKeyword', () => {
  it('matches exact ignoring case and surrounding whitespace', () => {
    expect(matchesKeyword('  Hello ', 'hello', 'exact')).toBe(true);
    expect(matchesKeyword('hello there', 'hello', 'exact')).toBe(false);
  });

  it('matches starts_with', () => {
    expect(matchesKeyword('PRICE list please', 'price', 'starts_with')).toBe(
      true,
    );
    expect(matchesKeyword('send me price', 'price', 'starts_with')).toBe(false);
  });

  it('matches contains', () => {
    expect(matchesKeyword('what is the PRICE?', 'price', 'contains')).toBe(
      true,
    );
    expect(matchesKeyword('nothing here', 'price', 'contains')).toBe(false);
  });

  it('never matches empty text or empty keyword', () => {
    expect(matchesKeyword('   ', 'price', 'contains')).toBe(false);
    expect(matchesKeyword('price', '  ', 'contains')).toBe(false);
  });
});

describe('selectMatchingRule', () => {
  const rule = (
    keywords: string[],
    matchType: MatchableRule['matchType'],
    id: string,
  ) => ({ keywords, matchType, id });

  it('returns the first rule in the given order', () => {
    const rules = [
      rule(['price'], 'contains', 'high'),
      rule(['price'], 'exact', 'low'),
    ];
    expect(selectMatchingRule(rules, 'price')?.id).toBe('high');
  });

  it('falls through to a later rule when the earlier one does not match', () => {
    const rules = [
      rule(['hours'], 'exact', 'first'),
      rule(['price', 'cost'], 'contains', 'second'),
    ];
    expect(selectMatchingRule(rules, 'what is the cost')?.id).toBe('second');
  });

  it('matches any keyword in the list', () => {
    const rules = [rule(['hi', 'hello', 'hey'], 'exact', 'greeting')];
    expect(selectMatchingRule(rules, 'HEY')?.id).toBe('greeting');
  });

  it('returns null when nothing matches', () => {
    const rules = [rule(['price'], 'exact', 'only')];
    expect(selectMatchingRule(rules, 'unrelated message')).toBeNull();
  });
});
