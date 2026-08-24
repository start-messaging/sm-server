import {
  ClassSerializerInterceptor,
  Controller,
  Get,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { StaffAuth } from '../../admin/decorators/staff-auth.decorator';
import { PlatformRole } from '../../admin/enums/platform-role.enum';
import { AdminConnectedWabasService } from '../services/admin-connected-wabas.service';

@ApiTags('admin-whatsapp-connected-wabas')
@UseInterceptors(ClassSerializerInterceptor)
@Controller({ path: 'admin/whatsapp/connected-wabas', version: '1' })
export class AdminConnectedWabasController {
  constructor(private readonly service: AdminConnectedWabasService) {}

  @Get()
  @StaffAuth(PlatformRole.SUPER_ADMIN, PlatformRole.ADMIN)
  @ApiOperation({
    summary: 'List WhatsApp Business Accounts linked to workspaces (ops)',
  })
  list(@Query() query: PaginationQueryDto) {
    return this.service.list(query);
  }
}
