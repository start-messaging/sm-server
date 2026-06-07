import { Module } from '@nestjs/common';
import { SessionStore } from './session-store.service';

@Module({
  providers: [SessionStore],
  exports: [SessionStore],
})
export class SessionsModule {}
