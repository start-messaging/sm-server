import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WaTemplateExamplesService } from '../services/wa-template-examples.service';

/**
 * Public endpoint for authenticated clients — returns published examples only.
 * No workspace context required; examples are global curated recipes.
 */
@ApiTags('whatsapp-template-examples')
@Controller({ path: 'whatsapp/template-examples', version: '1' })
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WhatsappTemplateExamplesController {
  constructor(private readonly service: WaTemplateExamplesService) {}

  @Get()
  @ApiOperation({ summary: 'List published template examples (gallery)' })
  list() {
    return this.service.listPublished();
  }
}
