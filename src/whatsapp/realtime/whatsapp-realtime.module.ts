import { Module } from '@nestjs/common';
import { InboxRealtimeService } from './inbox-realtime.service';

/** Shared pub/sub for inbox SSE — imported by WhatsApp module + webhook worker. */
@Module({
  providers: [InboxRealtimeService],
  exports: [InboxRealtimeService],
})
export class WhatsappRealtimeModule {}
