import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { EnvVars } from '../../config/env.validation';
import { SessionStore } from '../../sessions/session-store.service';
import { PlatformRole } from '../enums/platform-role.enum';
import type { StaffJwtPayload } from '../types/staff-jwt-payload';

export interface AuthenticatedStaff {
  id: string;
  email: string;
  platformRole: PlatformRole;
  sessionId: string;
}

@Injectable()
export class StaffJwtStrategy extends PassportStrategy(Strategy, 'staff-jwt') {
  constructor(
    config: ConfigService<EnvVars, true>,
    private readonly sessions: SessionStore,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('ADMIN_JWT_ACCESS_SECRET', { infer: true }),
    });
  }

  async validate(payload: StaffJwtPayload): Promise<AuthenticatedStaff> {
    if (payload.typ !== 'staff' || !(await this.sessions.exists(payload.sid))) {
      throw new UnauthorizedException();
    }
    return {
      id: payload.sub,
      email: payload.email,
      platformRole: payload.platformRole,
      sessionId: payload.sid,
    };
  }
}
