/** Request-derived context attached to a session for audit. */
export interface AuthContext {
  ip?: string | null;
  userAgent?: string | null;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}
