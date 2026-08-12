import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { EnvVars } from '../../config/env.validation';
import { SessionStore } from '../../sessions/session-store.service';
import type { JwtPayload } from '../types/jwt-payload';

export interface AuthenticatedUser {
  id: string;
  email: string;
  sessionId: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'user-jwt') {
  constructor(
    config: ConfigService<EnvVars, true>,
    private readonly sessions: SessionStore,
  ) {
    super({
      // Bearer for normal API; query `access_token` for EventSource (SSE)
      // which cannot set Authorization headers.
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        ExtractJwt.fromUrlQueryParameter('access_token'),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_ACCESS_SECRET', { infer: true }),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    // Instant logout: the session must still exist in Redis.
    if (payload.typ !== 'user' || !(await this.sessions.exists(payload.sid))) {
      throw new UnauthorizedException();
    }
    return { id: payload.sub, email: payload.email, sessionId: payload.sid };
  }
}
