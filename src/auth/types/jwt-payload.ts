/** Claims carried by a customer access token. */
export interface JwtPayload {
  sub: string;
  email: string;
  typ: 'user';
  /** Session id — used by logout to revoke the refresh session. */
  sid: string;
}
