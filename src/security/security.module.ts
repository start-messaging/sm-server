import { Global, Module } from '@nestjs/common';
import { HashService } from './hash.service';
import { PasswordService } from './password.service';

/**
 * Cross-cutting cryptographic helpers. Global so any feature can inject
 * `PasswordService` / `HashService` without importing this module.
 */
@Global()
@Module({
  providers: [PasswordService, HashService],
  exports: [PasswordService, HashService],
})
export class SecurityModule {}
