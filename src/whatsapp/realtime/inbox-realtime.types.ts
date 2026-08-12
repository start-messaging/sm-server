/** Events pushed to open inbox tabs via SSE (Redis pub/sub fan-out). */
export type InboxRealtimeReason = 'inbound' | 'status' | 'outbound';

export interface InboxUpdatedEvent {
  type: 'inbox.updated';
  workspaceId: string;
  conversationId: string;
  reason: InboxRealtimeReason;
  at: string;
}

export interface InboxHeartbeatEvent {
  type: 'heartbeat';
  at: string;
}

export interface InboxConnectedEvent {
  type: 'connected';
  at: string;
}

export type InboxRealtimeEvent =
  | InboxUpdatedEvent
  | InboxHeartbeatEvent
  | InboxConnectedEvent;

export function inboxChannel(workspaceId: string): string {
  return `wa:inbox:${workspaceId}`;
}
