/**
 * Thin HTTP client for Meta Graph API.
 *
 * Uses Node 18+ native fetch — no extra axios dependency.
 * All calls are namespaced by META_GRAPH_VERSION so we can bump the version
 * in one place.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvVars } from '../../config/env.validation';
import { AppException } from '../../common/exceptions/app.exception';
import { WA_ERR } from '../whatsapp-error-codes';

const GRAPH_BASE = 'https://graph.facebook.com';

interface MetaErrorResponse {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

export interface WabaInfo {
  id: string;
  name: string;
  business_id?: string;
  currency?: string;
  timezone_id?: string;
}

export interface PhoneNumberInfo {
  id: string;
  display_phone_number: string;
  verified_name?: string;
  quality_rating?: string;
  status?: string;
  messaging_limit_tier?: string;
}

@Injectable()
export class MetaGraphClient {
  private readonly logger = new Logger(MetaGraphClient.name);
  private readonly version: string;
  private readonly appId: string;
  private readonly appSecret: string;

  constructor(private readonly config: ConfigService<EnvVars, true>) {
    this.version = config.get('META_GRAPH_VERSION', { infer: true });
    this.appId = config.get('META_APP_ID', { infer: true }) ?? '';
    this.appSecret = config.get('META_APP_SECRET', { infer: true }) ?? '';
  }

  /** Exchange Embedded Signup short-lived code for a long-lived business token. */
  async exchangeCode(
    code: string,
  ): Promise<{ access_token: string; token_type: string }> {
    const url = new URL(`${GRAPH_BASE}/${this.version}/oauth/access_token`);
    url.searchParams.set('client_id', this.appId);
    url.searchParams.set('client_secret', this.appSecret);
    url.searchParams.set('code', code);

    const data = await this.get<{ access_token: string; token_type: string }>(
      url.toString(),
      undefined,
    );
    return data;
  }

  /**
   * Inspect a token to discover which WABA(s) were shared via Embedded Signup.
   * Returns the target_ids from `whatsapp_business_management` scope.
   */
  async getSharedWabaIds(accessToken: string): Promise<string[]> {
    const appToken = `${this.appId}|${this.appSecret}`;
    const url = `${GRAPH_BASE}/${this.version}/debug_token?input_token=${encodeURIComponent(accessToken)}`;
    const data = await this.get<DebugTokenResponse>(url, appToken);

    const scopes = data.data?.granular_scopes ?? [];
    const mgmtScope = scopes.find(
      (s) => s.scope === 'whatsapp_business_management',
    );
    return mgmtScope?.target_ids ?? [];
  }

  /** Fetch WABA details from the Graph API. */
  async getWaba(wabaId: string, accessToken: string): Promise<WabaInfo> {
    const url = `${GRAPH_BASE}/${this.version}/${wabaId}?fields=id,name,business_id,currency,timezone_id`;
    return this.get<WabaInfo>(url, accessToken);
  }

  /** List phone numbers under a WABA. */
  async listPhoneNumbers(
    wabaId: string,
    accessToken: string,
  ): Promise<PhoneNumberInfo[]> {
    const url = `${GRAPH_BASE}/${this.version}/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,status,messaging_limit_tier`;
    const res = await this.get<{ data: PhoneNumberInfo[] }>(url, accessToken);
    return res.data ?? [];
  }

  /** POST /{phoneNumberId}/register — register number for Cloud API. */
  async registerPhone(
    phoneNumberId: string,
    pin: string,
    accessToken: string,
  ): Promise<void> {
    const url = `${GRAPH_BASE}/${this.version}/${phoneNumberId}/register`;
    await this.post<unknown>(
      url,
      { messaging_product: 'whatsapp', pin },
      accessToken,
    );
  }

  /**
   * POST /{wabaId}/subscribed_apps — subscribe our app to WABA webhooks.
   * Tech Provider only — no credit-line APIs.
   */
  async subscribeApp(wabaId: string, accessToken: string): Promise<void> {
    const url = `${GRAPH_BASE}/${this.version}/${wabaId}/subscribed_apps`;
    await this.post<unknown>(url, {}, accessToken);
  }

  // ── Templates ───────────────────────────────────────────────────────────

  /** Fetch all message templates under a WABA. */
  async getTemplates(
    wabaId: string,
    accessToken: string,
  ): Promise<MetaTemplate[]> {
    const url = `${GRAPH_BASE}/${this.version}/${wabaId}/message_templates?fields=id,name,language,category,status,components,rejected_reason&limit=250`;
    const res = await this.get<{ data: MetaTemplate[] }>(url, accessToken);
    return res.data ?? [];
  }

  /** Create a new message template on the WABA. */
  async createTemplate(
    wabaId: string,
    body: MetaCreateTemplateInput,
    accessToken: string,
  ): Promise<MetaTemplateCreated> {
    const url = `${GRAPH_BASE}/${this.version}/${wabaId}/message_templates`;
    return this.post<MetaTemplateCreated>(
      url,
      body as unknown as Record<string, unknown>,
      accessToken,
    );
  }

  /** Delete a template by name from the WABA. */
  async deleteTemplate(
    wabaId: string,
    templateName: string,
    accessToken: string,
  ): Promise<void> {
    const url = `${GRAPH_BASE}/${this.version}/${wabaId}/message_templates?name=${encodeURIComponent(templateName)}`;
    await this.delete(url, accessToken);
  }

  // ── Messaging ───────────────────────────────────────────────────────────

  /** POST /{phoneNumberId}/messages — send text or template message. */
  async sendMessage(
    phoneNumberId: string,
    body: MetaSendMessageInput,
    accessToken: string,
  ): Promise<MetaSendMessageResult> {
    const url = `${GRAPH_BASE}/${this.version}/${phoneNumberId}/messages`;
    return this.post<MetaSendMessageResult>(
      url,
      { messaging_product: 'whatsapp', ...body },
      accessToken,
    );
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private async get<T>(
    url: string,
    accessToken: string | undefined,
  ): Promise<T> {
    const headers: Record<string, string> = {};
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const res = await fetch(url, { method: 'GET', headers });
    return this.parseResponse<T>(res, url);
  }

  private async post<T>(
    url: string,
    body: Record<string, unknown>,
    accessToken: string,
  ): Promise<T> {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    return this.parseResponse<T>(res, url);
  }

  private async delete(url: string, accessToken: string): Promise<void> {
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    await this.parseResponse<unknown>(res, url);
  }

  private async parseResponse<T>(res: Response, url: string): Promise<T> {
    const text = await res.text();
    let json: T & MetaErrorResponse;
    try {
      json = JSON.parse(text) as T & MetaErrorResponse;
    } catch {
      this.logger.error(`Meta Graph non-JSON response from ${url}: ${text}`);
      throw new AppException(
        {
          code: WA_ERR.WABA_CONNECT_FAILED,
          message: 'Unexpected Meta API response',
        },
        502,
      );
    }

    if (!res.ok || json.error) {
      const msg = json.error?.message ?? `Meta API error ${res.status}`;
      this.logger.warn(`Meta Graph error from ${url}: ${msg}`);
      throw new AppException(
        { code: WA_ERR.WABA_CONNECT_FAILED, message: msg, details: json.error },
        502,
      );
    }

    return json;
  }
}

// ── Meta API types ──────────────────────────────────────────────────────────

interface DebugTokenResponse {
  data?: {
    granular_scopes?: Array<{
      scope: string;
      target_ids?: string[];
    }>;
  };
}

export interface MetaTemplate {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  components?: unknown[];
  rejected_reason?: string;
}

export interface MetaCreateTemplateInput {
  name: string;
  language: string;
  category: string;
  components: unknown[];
}

export interface MetaTemplateCreated {
  id: string;
  status: string;
  category: string;
}

export interface MetaSendMessageInput {
  recipient_type?: string;
  to: string;
  type: 'text' | 'template';
  text?: { body: string };
  template?: {
    name: string;
    language: { code: string };
    components?: unknown[];
  };
}

export interface MetaSendMessageResult {
  messaging_product: string;
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string }>;
}
