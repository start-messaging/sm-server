import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExcludeEndpoint,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentWorkspace } from '../../workspaces/decorators/current-workspace.decorator';
import { WorkspaceMemberGuard } from '../../workspaces/guards/workspace-member.guard';
import type { WorkspaceContext } from '../../workspaces/guards/workspace-member.guard';
import { WhatsappBillingService } from '../services/whatsapp-billing.service';

@ApiTags('billing')
@Controller({ version: '1' })
export class WhatsappBillingController {
  constructor(private readonly billingService: WhatsappBillingService) {}

  @Get('workspaces/:slug/billing/subscription')
  @UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current subscription status' })
  getSubscription(
    @Param('slug') _slug: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
  ) {
    return this.billingService.getSubscription(ctx.workspace.id);
  }

  @Get('workspaces/:slug/billing/plans')
  @UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List available plans' })
  listPlans(
    @Param('slug') _slug: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
  ) {
    return this.billingService.listPlans(ctx.workspace.id);
  }

  @Post('workspaces/:slug/billing/checkout')
  @UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create checkout session' })
  createCheckout(
    @Param('slug') _slug: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Body() body: { planCode: string },
  ) {
    return this.billingService.createCheckout(ctx.workspace.id, body.planCode);
  }

  /** Razorpay webhook — public (no JWT). */
  @Post('webhooks/razorpay')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async razorpayWebhook(
    @Req() _req: RawBodyRequest<Request>,
    @Headers('x-razorpay-signature') _signature: string | undefined,
    @Body() body: Record<string, unknown>,
  ): Promise<{ received: true }> {
    await this.billingService.handleWebhookEvent(body);
    return { received: true };
  }
}
