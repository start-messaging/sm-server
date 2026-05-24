import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LoggerModule } from './common/logger/logger.module';
import { ClsConfigModule } from './config/cls.config';
import { HttpModule } from './config/http.config';
import { UsersModule } from './users/users.module';

@Module({
  imports: [ClsConfigModule, LoggerModule, HttpModule, UsersModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
