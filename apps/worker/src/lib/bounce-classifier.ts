export interface BounceClassification {
  type: 'hard_bounce' | 'soft_bounce' | 'blocked_policy' | 'rejected' | 'temporary_failure' | 'unknown';
  reason: string;
  shouldSuppress: boolean;
}

const HARD: string[] = [
  'recipient not found', 'user does not exist', 'mailbox does not exist',
  'no such user', 'invalid recipient', 'domain does not exist',
  'address rejected', 'unknown user', 'user unknown', 'bad destination',
  'does not exist', 'address unknown', 'no mailbox', 'invalid address',
  '550 5.1', '551 5.1', '553 5.1',
];

const SOFT: string[] = [
  'mailbox full', 'temporary failure', 'try again later', 'greylisted',
  'rate limited', 'temporarily unavailable', 'connection timeout', 'deferred',
  'over quota', 'insufficient storage', 'service unavailable', 'quota exceeded',
  'try later', '421', '450', '451', '452',
];

const BLOCKED: string[] = [
  'blocked by policy', 'spam detected', 'security policy', 'content rejected',
  'corporate firewall', 'antispam rejection', 'policy violation', 'bulk mail',
  'bulk email', 'spam filter', 'spam score', 'message blocked',
  '550 spam', '554 spam', 'rejected due to', 'blacklisted',
];

function matchesAny(lower: string, patterns: string[]): boolean {
  return patterns.some(p => lower.includes(p));
}

export function classifyDeliveryFailure(message: string): BounceClassification {
  const lower = message.toLowerCase();

  if (matchesAny(lower, HARD)) {
    return { type: 'hard_bounce', reason: message, shouldSuppress: true };
  }
  if (matchesAny(lower, SOFT)) {
    return { type: 'soft_bounce', reason: message, shouldSuppress: false };
  }
  if (matchesAny(lower, BLOCKED)) {
    return { type: 'blocked_policy', reason: message, shouldSuppress: false };
  }
  if (lower.includes('reject') || lower.includes('refused')) {
    return { type: 'rejected', reason: message, shouldSuppress: false };
  }
  if (lower.includes('timeout') || lower.includes('temporary')) {
    return { type: 'temporary_failure', reason: message, shouldSuppress: false };
  }
  return { type: 'unknown', reason: message, shouldSuppress: false };
}
