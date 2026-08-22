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
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { StaffAuth } from '../../admin/decorators/staff-auth.decorator';
import { PlatformRole } from '../../admin/enums/platform-role.enum';
import { AdminPipelineStageTemplatesService } from '../services/admin-pipeline-stage-templates.service';
import { CreatePipelineStageTemplateDto } from '../dto/create-pipeline-stage-template.dto';
import { UpdatePipelineStageTemplateDto } from '../dto/update-pipeline-stage-template.dto';

@ApiTags('admin-whatsapp-pipeline-stage-templates')
@Controller({ path: 'admin/whatsapp/pipeline-stage-templates', version: '1' })
export class AdminPipelineStageTemplatesController {
  constructor(private readonly service: AdminPipelineStageTemplatesService) {}

  @Get()
  @StaffAuth(PlatformRole.SUPER_ADMIN, PlatformRole.ADMIN)
  @ApiOperation({ summary: 'List global pipeline stage templates' })
  list() {
    return this.service.list();
  }

  @Post()
  @StaffAuth(PlatformRole.SUPER_ADMIN, PlatformRole.ADMIN)
  @ApiOperation({ summary: 'Create a pipeline stage template' })
  create(@Body() dto: CreatePipelineStageTemplateDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @StaffAuth(PlatformRole.SUPER_ADMIN, PlatformRole.ADMIN)
  @ApiOperation({
    summary: 'Update a pipeline stage template (name, sortOrder, status)',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePipelineStageTemplateDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @StaffAuth(PlatformRole.SUPER_ADMIN, PlatformRole.ADMIN)
  @HttpCode(204)
  @ApiOperation({ summary: 'Soft-delete a pipeline stage template' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
