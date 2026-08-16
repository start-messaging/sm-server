import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { StaffAuth } from '../../admin/decorators/staff-auth.decorator';
import { PlatformRole } from '../../admin/enums/platform-role.enum';
import { CreateTemplateExampleDto } from '../dto/create-template-example.dto';
import { ListTemplateExamplesQueryDto } from '../dto/list-template-examples-query.dto';
import { UpdateTemplateExampleDto } from '../dto/update-template-example.dto';
import { WaTemplateExamplesService } from '../services/wa-template-examples.service';

@ApiTags('admin-whatsapp-template-examples')
@Controller({ path: 'admin/whatsapp/template-examples', version: '1' })
export class AdminTemplateExamplesController {
  constructor(private readonly service: WaTemplateExamplesService) {}

  @Get()
  @StaffAuth(PlatformRole.SUPER_ADMIN, PlatformRole.ADMIN)
  @ApiOperation({ summary: 'List all template examples (admin)' })
  list(@Query() query: ListTemplateExamplesQueryDto) {
    return this.service.listAll(query);
  }

  @Post()
  @StaffAuth(PlatformRole.SUPER_ADMIN, PlatformRole.ADMIN)
  @ApiOperation({ summary: 'Create a template example' })
  create(@Body() dto: CreateTemplateExampleDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @StaffAuth(PlatformRole.SUPER_ADMIN, PlatformRole.ADMIN)
  @ApiOperation({ summary: 'Update a template example' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTemplateExampleDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @StaffAuth(PlatformRole.SUPER_ADMIN, PlatformRole.ADMIN)
  @HttpCode(204)
  @ApiOperation({ summary: 'Soft-delete a template example' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
