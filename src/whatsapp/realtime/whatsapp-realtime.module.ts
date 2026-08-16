import { Module } from '@nestjs/common';
import { NotificationsModule } from '../../notifications/notifications.module';
import { InboxRealtimeService } from './inbox-realtime.service';

/** Shared pub/sub for inbox SSE — imported by WhatsApp module + webhook worker. */
@Module({
  imports: [NotificationsModule],
  providers: [InboxRealtimeService],
  exports: [InboxRealtimeService],
})
export class WhatsappRealtimeModule {}
