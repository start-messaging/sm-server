/**
 * WhatsApp connect flow — Embedded Signup v4.
 *
 * Flow:
 *   1. Exchange ES code → business access token
 *   2. Fetch WABA info + phone numbers from Graph API
 *   3. Register phone number (POST /{phone_id}/register)
 *   4. Subscribe app to WABA webhooks (POST /{waba_id}/subscribed_apps)
 *   5. Persist WabaAccount (encrypted token) + PhoneNumber rows
 *   6. Flip workspace_services → active
 *
 * Tech Provider: never share a credit line; never debit wallet on connect.
 */
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AppException } from '../../common/exceptions/app.exception';
import { parseMobileOrThrow } from '../../common/phone/parse-mobile';
import {
  WorkspaceService,
  WorkspaceServiceStatus,
} from '../../workspaces/entities/workspace-service.entity';
import { encryptToken, decryptToken } from '../crypto/token-encryption';
import {
  PhoneNumber,
  WaPhoneNumberStatus,
} from '../entities/phone-number.entity';
import {
  WabaAccount,
  WabaAccountStatus,
  WabaVerificationStatus,
} from '../entities/waba-account.entity';
import { WA_ERR } from '../whatsapp-error-codes';
import { MetaGraphClient } from './meta-graph.client';

export interface ConnectWhatsappInput {
  /** Short-lived code from Embedded Signup v4 callback. */
  code: string;
  /** Meta WABA id — auto-discovered from Graph if omitted. */
  wabaId?: string;
  /** Meta phone number id — auto-discovered from Graph if omitted. */
  phoneNumberId?: string;
  /** Two-step verification PIN (6 digits). Required for phone registration. */
  pin?: string;
  workspaceId: string;
}

export interface ConnectWhatsappResult {
  wabaAccountId: string;
  phoneNumberId: string;
  displayNumber: string;
  /** True when connect succeeded but Cloud API register was skipped (no PIN). */
  phoneRegistrationPending: boolean;
}

/** Matches the client's `WabaConnectionStatus` type exactly. */
export interface WabaConnectionStatusResponse {
  status: 'connected' | 'disconnected' | 'not_connected';
  displayName: string | null;
  phoneNumber: string | null;
  metaPaymentReady: boolean | null;
  wabaId: string | null;
  /** True when WABA is linked but phone is not yet Cloud API registered. */
  phoneRegistrationPending: boolean;
}

const SERVICE_KEY = 'whatsapp';
const PROVIDER_KEY = 'meta_cloud';

@Injectable()
export class WhatsappConnectService {
  private readonly logger = new Logger(WhatsappConnectService.name);

  constructor(
    private readonly meta: MetaGraphClient,
    private readonly ds: DataSource,
    @InjectRepository(WabaAccount)
    private readonly wabaAccounts: Repository<WabaAccount>,
    @InjectRepository(PhoneNumber)
    private readonly phoneNumbers: Repository<PhoneNumber>,
  ) {}

  async connect(input: ConnectWhatsappInput): Promise<ConnectWhatsappResult> {
    const { code, workspaceId } = input;

    // 1. Exchange code → token
    this.logger.log(`[connect] Exchanging code for workspace ${workspaceId}`);
    const { access_token: accessToken } = await this.meta.exchangeCode(code);

    // 2. Resolve WABA id — use provided or auto-discover from Graph
    let wabaId = input.wabaId;
    if (!wabaId) {
      this.logger.log(
        '[connect] wabaId not provided — discovering via debug_token',
      );
      const sharedIds = await this.meta.getSharedWabaIds(accessToken);
      if (!sharedIds.length) {
        throw new AppException(
          {
            code: WA_ERR.WABA_CONNECT_FAILED,
            message:
              'No WhatsApp Business Account was shared during Embedded Signup. Please try again.',
          },
          400,
        );
      }
      wabaId = sharedIds[0]!;
      this.logger.log(`[connect] Discovered WABA ${wabaId}`);
    }

    // 3. Fetch WABA info + phone numbers
    const [wabaInfo, phones] = await Promise.all([
      this.meta.getWaba(wabaId, accessToken),
      this.meta.listPhoneNumbers(wabaId, accessToken),
    ]);

    // 4. Resolve phone number — use provided or pick first available
    let resolvedPhoneId = input.phoneNumberId;
    const phoneInfo = resolvedPhoneId
      ? phones.find((p) => p.id === resolvedPhoneId)
      : phones[0];

    if (!phoneInfo) {
      throw new AppException(
        {
          code: WA_ERR.WABA_CONNECT_FAILED,
          message: resolvedPhoneId
            ? `Phone number ${resolvedPhoneId} not found under WABA ${wabaId}`
            : `No phone numbers found under WABA ${wabaId}. Add a number in WhatsApp Manager first.`,
        },
        400,
      );
    }
    resolvedPhoneId = phoneInfo.id;

    // 5. Register phone — requires 6-digit PIN
    const pin = input.pin;
    let phoneStatus = WaPhoneNumberStatus.PENDING;
    let registeredAt: Date | null = null;

    if (pin) {
      this.logger.log(`[connect] Registering phone ${resolvedPhoneId}`);
      await this.meta.registerPhone(resolvedPhoneId, pin, accessToken);
      phoneStatus = WaPhoneNumberStatus.ACTIVE;
      registeredAt = new Date();
    } else {
      this.logger.log(
        '[connect] No PIN provided — phone saved as PENDING (registration skipped)',
      );
    }

    // 6. Subscribe app to webhooks
    this.logger.log(`[connect] Subscribing app to WABA ${wabaId}`);
    await this.meta.subscribeApp(wabaId, accessToken);

    // 7. Persist in a single transaction
    const result = await this.ds.transaction(async (em) => {
      const existing = await em.findOne(WabaAccount, {
        where: { workspaceId, serviceKey: SERVICE_KEY },
      });
      if (existing) {
        throw new AppException(
          {
            code: WA_ERR.WABA_CONNECT_FAILED,
            message:
              'Workspace already has an active WhatsApp connection. Disconnect first.',
          },
          409,
        );
      }

      const encryptedToken = encryptToken(accessToken);

      const waba = em.create(WabaAccount, {
        workspaceId,
        serviceKey: SERVICE_KEY,
        providerKey: PROVIDER_KEY,
        metaWabaId: wabaInfo.id,
        metaBusinessId: wabaInfo.business_id ?? null,
        businessName: wabaInfo.name ?? null,
        accessTokenEncrypted: encryptedToken,
        tokenExpiresAt: null,
        webhookSubscribed: true,
        status: WabaAccountStatus.ACTIVE,
        verificationStatus: WabaVerificationStatus.UNVERIFIED,
        rawMetadata: wabaInfo as unknown as Record<string, unknown>,
      });
      await em.save(waba);

      const rawE164 = phoneInfo.display_phone_number.replace(/[\s\-()]/g, '');
      let e164: string;
      let countryCode: string;
      try {
        const parsed = parseMobileOrThrow(rawE164);
        e164 = parsed.e164;
        countryCode = parsed.countryCode;
      } catch {
        e164 = rawE164.startsWith('+') ? rawE164 : `+${rawE164}`;
        countryCode = 'ZZ';
      }

      const phone = em.create(PhoneNumber, {
        wabaAccountId: waba.id,
        workspaceId,
        metaPhoneNumberId: phoneInfo.id,
        displayNumberE164: e164,
        countryCode,
        verifiedName: phoneInfo.verified_name ?? null,
        status: phoneStatus,
        registeredAt,
      });
      await em.save(phone);

      await em
        .createQueryBuilder()
        .update(WorkspaceService)
        .set({
          status: WorkspaceServiceStatus.ACTIVE,
          activatedAt: new Date(),
        })
        .where('workspace_id = :workspaceId AND service_key = :key', {
          workspaceId,
          key: SERVICE_KEY,
        })
        .execute();

      return {
        wabaAccountId: waba.id,
        phoneNumberId: phone.id,
        displayNumber: e164,
        phoneRegistrationPending: phoneStatus === WaPhoneNumberStatus.PENDING,
      };
    });

    this.logger.log(
      `[connect] workspace ${workspaceId} connected WABA ${wabaId} phone ${resolvedPhoneId}`,
    );
    return result;
  }

  /**
   * Register a PENDING phone with Cloud API using the WABA's encrypted token.
   * Used when connect completed without a PIN.
   */
  async registerPhone(
    workspaceId: string,
    pin: string,
  ): Promise<{ registered: true; displayNumber: string }> {
    const waba = await this.wabaAccounts.findOne({
      where: { workspaceId, serviceKey: SERVICE_KEY, status: WabaAccountStatus.ACTIVE },
    });
    if (!waba) {
      throw new AppException(
        {
          code: WA_ERR.WABA_NOT_CONNECTED,
          message:
            'No WhatsApp Business account is connected to this workspace.',
        },
        404,
      );
    }

    const phone = await this.phoneNumbers.findOne({
      where: { workspaceId },
      order: { createdAt: 'DESC' },
    });
    if (!phone) {
      throw new AppException(
        {
          code: WA_ERR.WABA_PHONE_REGISTER_FAILED,
          message: 'No phone number is linked to this workspace.',
        },
        404,
      );
    }

    if (phone.status === WaPhoneNumberStatus.ACTIVE) {
      return { registered: true, displayNumber: phone.displayNumberE164 };
    }

    const token = decryptToken(waba.accessTokenEncrypted);

    try {
      await this.meta.registerPhone(phone.metaPhoneNumberId, pin, token);
    } catch (err) {
      this.logger.error(
        `[registerPhone] Meta register failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new AppException(
        {
          code: WA_ERR.WABA_PHONE_REGISTER_FAILED,
          message:
            'Phone registration failed. Check the 6-digit PIN and try again.',
        },
        502,
      );
    }

    phone.status = WaPhoneNumberStatus.ACTIVE;
    phone.registeredAt = new Date();
    await this.phoneNumbers.save(phone);

    this.logger.log(
      `[registerPhone] workspace ${workspaceId} phone ${phone.metaPhoneNumberId} ACTIVE`,
    );
    return { registered: true, displayNumber: phone.displayNumberE164 };
  }

  /**
   * Returns the shape the client expects: `WabaConnectionStatus`.
   *
   *   status: 'connected' | 'disconnected' | 'not_connected'
   *   displayName, phoneNumber, wabaId, metaPaymentReady
   */
  async getStatus(workspaceId: string): Promise<WabaConnectionStatusResponse> {
    const waba = await this.wabaAccounts.findOne({
      where: { workspaceId, serviceKey: SERVICE_KEY },
      relations: { workspace: false },
    });

    if (!waba) {
      return {
        status: 'not_connected',
        displayName: null,
        phoneNumber: null,
        metaPaymentReady: null,
        wabaId: null,
        phoneRegistrationPending: false,
      };
    }

    const phone = await this.phoneNumbers.findOne({
      where: { workspaceId },
      order: { createdAt: 'DESC' },
    });

    const status: WabaConnectionStatusResponse['status'] =
      waba.status === WabaAccountStatus.ACTIVE ? 'connected' : 'disconnected';

    return {
      status,
      displayName: waba.businessName ?? phone?.verifiedName ?? null,
      phoneNumber: phone?.displayNumberE164 ?? null,
      metaPaymentReady: null,
      wabaId: waba.metaWabaId,
      phoneRegistrationPending:
        !!phone && phone.status !== WaPhoneNumberStatus.ACTIVE,
    };
  }

  /**
   * Soft-disconnect: mark WABA disconnected, soft-delete, set workspace
   * service back to pending_setup so Embedded Signup can re-run.
   */
  async disconnect(workspaceId: string): Promise<{ disconnected: true }> {
    const waba = await this.wabaAccounts.findOne({
      where: { workspaceId, serviceKey: SERVICE_KEY },
    });
    if (!waba) {
      throw new AppException(
        {
          code: WA_ERR.WABA_NOT_CONNECTED,
          message:
            'No WhatsApp Business account is connected to this workspace.',
        },
        404,
      );
    }

    await this.ds.transaction(async (em) => {
      await em.update(
        WabaAccount,
        { id: waba.id },
        { status: WabaAccountStatus.DISCONNECTED },
      );
      await em.softDelete(WabaAccount, { id: waba.id });
      await em
        .createQueryBuilder()
        .update(WorkspaceService)
        .set({
          status: WorkspaceServiceStatus.PENDING_SETUP,
          activatedAt: null,
        })
        .where('workspace_id = :workspaceId AND service_key = :key', {
          workspaceId,
          key: SERVICE_KEY,
        })
        .execute();
    });

    this.logger.log(`[disconnect] workspace ${workspaceId} WABA soft-deleted`);
    return { disconnected: true };
  }
}
