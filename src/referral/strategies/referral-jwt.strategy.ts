import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { EnvVars } from '../../config/env.validation';
import { SessionStore } from '../../sessions/session-store.service';
import type { ReferralJwtPayload } from '../types/referral-jwt-payload';

export interface AuthenticatedPartner {
  id: string;
  email: string;
  sessionId: string;
}

@Injectable()
export class ReferralJwtStrategy extends PassportStrategy(
  Strategy,
  'referral-jwt',
) {
  constructor(
    config: ConfigService<EnvVars, true>,
    private readonly sessions: SessionStore,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('REFERRAL_JWT_ACCESS_SECRET', { infer: true }),
    });
  }

  async validate(payload: ReferralJwtPayload): Promise<AuthenticatedPartner> {
    if (
      payload.typ !== 'referral' ||
      !(await this.sessions.exists(payload.sid))
    ) {
      throw new UnauthorizedException();
    }
    return { id: payload.sub, email: payload.email, sessionId: payload.sid };
  }
}
