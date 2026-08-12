import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { Observable } from 'rxjs';
import { REDIS } from '../../redis/redis.constants';
import {
  inboxChannel,
  type InboxRealtimeEvent,
  type InboxRealtimeReason,
  type InboxUpdatedEvent,
} from './inbox-realtime.types';

const HEARTBEAT_MS = 25_000;

/**
 * Fan-out for inbox SSE. Publish on the shared Redis client; each SSE
 * connection gets its own subscriber duplicate so unsubscribe is per-client.
 */
@Injectable()
export class InboxRealtimeService implements OnModuleDestroy {
  private readonly logger = new Logger(InboxRealtimeService.name);
  private readonly subscribers = new Set<Redis>();

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async publishInboxUpdated(
    workspaceId: string,
    conversationId: string,
    reason: InboxRealtimeReason,
  ): Promise<void> {
    const event: InboxUpdatedEvent = {
      type: 'inbox.updated',
      workspaceId,
      conversationId,
      reason,
      at: new Date().toISOString(),
    };
    try {
      await this.redis.publish(
        inboxChannel(workspaceId),
        JSON.stringify(event),
      );
    } catch (err) {
      this.logger.warn(
        `inbox publish failed workspace=${workspaceId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * Observable of parsed inbox events for one workspace (plus heartbeat).
   * Completes/errors when the subscriber disconnects (Nest closes the SSE).
   */
  stream(workspaceId: string): Observable<InboxRealtimeEvent> {
    return new Observable<InboxRealtimeEvent>((observer) => {
      const channel = inboxChannel(workspaceId);
      const sub = this.redis.duplicate();
      this.subscribers.add(sub);

      const onMessage = (ch: string, raw: string) => {
        if (ch !== channel) return;
        try {
          observer.next(JSON.parse(raw) as InboxRealtimeEvent);
        } catch {
          this.logger.warn(`bad inbox SSE payload on ${channel}`);
        }
      };

      void sub
        .subscribe(channel)
        .then(() => {
          sub.on('message', onMessage);
          observer.next({
            type: 'connected',
            at: new Date().toISOString(),
          });
        })
        .catch((err: unknown) => {
          observer.error(err instanceof Error ? err : new Error(String(err)));
        });

      const heartbeat = setInterval(() => {
        observer.next({
          type: 'heartbeat',
          at: new Date().toISOString(),
        });
      }, HEARTBEAT_MS);

      return () => {
        clearInterval(heartbeat);
        sub.off('message', onMessage);
        this.subscribers.delete(sub);
        void sub
          .unsubscribe(channel)
          .catch(() => undefined)
          .finally(() => {
            void sub.quit().catch(() => undefined);
          });
      };
    });
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(
      [...this.subscribers].map(async (sub) => {
        try {
          await sub.quit();
        } catch {
          /* ignore */
        }
      }),
    );
    this.subscribers.clear();
  }
}
