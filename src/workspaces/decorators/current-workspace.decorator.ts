import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type {
  WorkspaceContext,
  WorkspaceScopedRequest,
} from '../guards/workspace-member.guard';

/** The workspace + membership resolved by WorkspaceMemberGuard. */
export const CurrentWorkspace = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): WorkspaceContext => {
    const req = ctx.switchToHttp().getRequest<WorkspaceScopedRequest>();
    return req.workspaceCtx;
  },
);
