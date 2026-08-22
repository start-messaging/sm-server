import {
  Controller,
  MessageEvent,
  Param,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Observable, map } from 'rxjs';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentWorkspace } from '../../workspaces/decorators/current-workspace.decorator';
import {
  WorkspaceMemberGuard,
  type WorkspaceContext,
} from '../../workspaces/guards/workspace-member.guard';
import { InboxRealtimeService } from '../realtime/inbox-realtime.service';

/**
 * Server-Sent Events for live inbox updates.
 *
 * EventSource cannot set Authorization headers — pass the access JWT as
 * `?access_token=` (also accepted by JwtStrategy). Heartbeats keep proxies
 * from idle-closing the stream.
 */
@ApiTags('whatsapp-inbox-events')
@Controller({ path: 'workspaces/:slug/whatsapp', version: '1' })
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
@ApiBearerAuth()
export class WhatsappInboxEventsController {
  constructor(private readonly realtime: InboxRealtimeService) {}

  @Sse('events')
  @ApiOperation({
    summary: 'SSE stream: inbox.updated / heartbeat for this workspace',
  })
  stream(
    @Param('slug') _slug: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
  ): Observable<MessageEvent> {
    return this.realtime.stream(ctx.workspace.id).pipe(
      map(
        (event): MessageEvent => ({
          type: event.type,
          data: event,
        }),
      ),
    );
  }
}
