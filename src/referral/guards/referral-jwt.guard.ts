import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class ReferralJwtGuard extends AuthGuard('referral-jwt') {}
