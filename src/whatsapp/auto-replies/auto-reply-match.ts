import type { AutoReplyMatchType } from './wa-auto-reply-rule.entity';

export interface MatchableRule {
  keywords: string[];
  matchType: AutoReplyMatchType;
}

/**
 * Case-insensitive keyword match. Inbound text and keywords are both trimmed,
 * so trailing whitespace from a phone keyboard never breaks an `exact` rule.
 */
export function matchesKeyword(
  inboundText: string,
  keyword: string,
  matchType: AutoReplyMatchType,
): boolean {
  const text = inboundText.trim().toLowerCase();
  const kw = keyword.trim().toLowerCase();
  if (!text || !kw) return false;

  switch (matchType) {
    case 'exact':
      return text === kw;
    case 'starts_with':
      return text.startsWith(kw);
    case 'contains':
      return text.includes(kw);
    default:
      return false;
  }
}

export function ruleMatches(rule: MatchableRule, inboundText: string): boolean {
  return rule.keywords.some((kw) =>
    matchesKeyword(inboundText, kw, rule.matchType),
  );
}

/**
 * First match wins — callers pass rules already ordered by priority ASC,
 * createdAt ASC.
 */
export function selectMatchingRule<T extends MatchableRule>(
  orderedRules: T[],
  inboundText: string,
): T | null {
  return orderedRules.find((rule) => ruleMatches(rule, inboundText)) ?? null;
}
