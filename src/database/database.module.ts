import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildTypeOrmOptions } from '../config/database.config';
import type { EnvVars } from '../config/env.validation';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvVars, true>) =>
        buildTypeOrmOptions(config),
    }),
  ],
})
export class DatabaseModule {}
