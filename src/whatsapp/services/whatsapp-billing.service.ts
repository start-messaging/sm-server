import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppException } from '../../common/exceptions/app.exception';
import { Plan, PlanStatus } from '../../plans/entities/plan.entity';
import { WaSubscription } from '../entities/wa-subscription.entity';
import { WA_ERR } from '../whatsapp-error-codes';
import { BillingProviderService } from './billing-provider.service';

@Injectable()
export class WhatsappBillingService {
  private readonly logger = new Logger(WhatsappBillingService.name);

  constructor(
    @InjectRepository(WaSubscription)
    private readonly subscriptions: Repository<WaSubscription>,
    @InjectRepository(Plan)
    private readonly plans: Repository<Plan>,
    private readonly billingProvider: BillingProviderService,
  ) {}

  async getSubscription(workspaceId: string) {
    const sub = await this.subscriptions.findOne({ where: { workspaceId } });
    if (!sub) {
      return {
        status: 'none' as const,
        planCode: 'FREE',
        currentPeriodEnd: null,
        trialEnd: null,
        razorpaySubscriptionId: null,
      };
    }

    return {
      status: sub.status,
      planCode: sub.planCode,
      currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
      trialEnd: sub.trialEnd?.toISOString() ?? null,
      razorpaySubscriptionId: sub.providerSubscriptionId,
    };
  }

  async listPlans(workspaceId: string) {
    const plans = await this.plans.find({
      where: [
        { serviceKey: 'whatsapp', status: PlanStatus.ACTIVE },
        { serviceKey: null as unknown as string, status: PlanStatus.ACTIVE },
      ],
      order: { tier: 'ASC' },
    });

    return plans.map((p) => ({
      code: p.code,
      name: p.name,
      priceMicros: this.getPriceMicros(p),
      currency: 'INR',
      features: p.features,
      limits: p.limits,
    }));
  }

  async createCheckout(workspaceId: string, planCode: string) {
    const plan = await this.plans.findOne({
      where: [
        { code: planCode, serviceKey: 'whatsapp', status: PlanStatus.ACTIVE },
        {
          code: planCode,
          serviceKey: null as unknown as string,
          status: PlanStatus.ACTIVE,
        },
      ],
    });
    if (!plan) {
      throw new AppException(
        { code: 'PLAN_NOT_FOUND', message: 'Plan not found' },
        404,
      );
    }

    if (plan.code === 'FREE') {
      throw new AppException(
        { code: 'PLAN_INVALID', message: 'Cannot checkout the free plan' },
        400,
      );
    }

    const result = await this.billingProvider.createSubscriptionCheckout({
      planCode: plan.code,
      workspaceId,
    });

    return { checkoutUrl: result.checkoutUrl };
  }

  async handleWebhookEvent(event: Record<string, unknown>): Promise<void> {
    const eventType = event['event'] as string | undefined;
    const payload = event['payload'] as Record<string, unknown> | undefined;

    if (!eventType || !payload) return;

    if (
      eventType === 'subscription.activated' ||
      eventType === 'subscription.charged'
    ) {
      const subscription = payload['subscription'] as
        | Record<string, unknown>
        | undefined;
      if (!subscription) return;

      const subscriptionId = subscription['id'] as string;
      const notes = subscription['notes'] as Record<string, string> | undefined;
      const workspaceId = notes?.['workspace_id'];
      const planCode = notes?.['plan_code'];

      if (!workspaceId || !planCode) return;

      let sub = await this.subscriptions.findOne({ where: { workspaceId } });
      if (!sub) {
        sub = this.subscriptions.create({
          workspaceId,
          planCode,
          providerKey: 'razorpay',
        });
      }
      sub.status = 'active';
      sub.planCode = planCode;
      sub.providerSubscriptionId = subscriptionId;
      sub.currentPeriodEnd = subscription['current_end']
        ? new Date((subscription['current_end'] as number) * 1000)
        : null;
      sub.trialEnd = null;
      await this.subscriptions.save(sub);
      this.logger.log(
        `Subscription activated for workspace ${workspaceId} plan=${planCode}`,
      );
    }
  }

  private getPriceMicros(plan: Plan): string {
    // Price stored in plan limits/features or a separate pricing table in future
    // For now, return a marker based on tier
    const priceMap: Record<string, string> = {
      FREE: '0',
      BASIC: '49900000', // ₹499/mo in micros
      ADVANCED: '149900000',
      GROWTH: '149900000',
      BUSINESS: '499900000',
    };
    return priceMap[plan.code] ?? '0';
  }
}
