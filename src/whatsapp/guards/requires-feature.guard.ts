import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppException } from '../../common/exceptions/app.exception';
import type { WorkspaceScopedRequest } from '../../workspaces/guards/workspace-member.guard';
import { WA_ERR } from '../whatsapp-error-codes';
import { REQUIRES_FEATURE_KEY } from './requires-feature.decorator';

/**
 * Entitlement gate for the @RequiresFeature key on a route. An absent feature
 * key (or one set to false / '') is OFF — plans grant, they never revoke.
 * Reads the plan off the workspace context, so it must run AFTER
 * WorkspaceMemberGuard:
 * `@UseGuards(JwtAuthGuard, WorkspaceMemberGuard, RequiresFeatureGuard)`.
 * Routes without the decorator pass through untouched.
 */
@Injectable()
export class RequiresFeatureGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const feature = this.reflector.getAllAndOverride<string | undefined>(
      REQUIRES_FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!feature) return true;

    const req = context.switchToHttp().getRequest<WorkspaceScopedRequest>();
    const plan = req.workspaceCtx?.workspace?.plan;
    if (!plan?.features?.[feature]) {
      throw new AppException(
        {
          code: WA_ERR.PLAN_FEATURE_REQUIRED,
          message:
            'Your CRM plan does not include this feature. Please upgrade.',
          details: { feature, currentPlan: plan?.code ?? null },
        },
        403,
      );
    }
    return true;
  }
}
