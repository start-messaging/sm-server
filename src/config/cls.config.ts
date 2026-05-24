import { Module } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ClsModule, ClsService } from 'nestjs-cls';
import { CLS_KEYS } from '../common/context/cls.keys';
import {
  REQUEST_ID_HEADER,
  resolveRequestId,
} from '../common/context/request-id';

@Module({
  imports: [
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        generateId: false,
        setup: (cls: ClsService, req: Request, res: Response) => {
          const requestId = resolveRequestId(req);
          cls.set(CLS_KEYS.REQUEST_ID, requestId);
          res.setHeader(REQUEST_ID_HEADER, requestId);
        },
      },
    }),
  ],
  exports: [ClsModule],
})
export class ClsConfigModule {}
