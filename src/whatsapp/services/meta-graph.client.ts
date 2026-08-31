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
    is_transient?: boolean;
    error_user_title?: string;
    error_user_msg?: string;
    fbtrace_id?: string;
  };
}

export interface WabaInfo {
  id: string;
  name: string;
  business_id?: string;
  currency?: string;
  timezone_id?: string;
  /** Pending/Approved/Rejected review result for the WABA itself. */
  account_review_status?: string;
  /** Business Manager verification state (NOT number-level). */
  business_verification_status?: string;
  /** Account-level health signal object from Graph. */
  health_status?: { can_send_message?: string; entities?: unknown[] };
  payment_method_attached?: boolean;
}

export interface PhoneNumberInfo {
  id: string;
  display_phone_number: string;
  verified_name?: string;
  quality_rating?: string;
  status?: string;
  /**
   * Current daily-conversation cap (replaces the deprecated
   * `messaging_limit_tier` string enum which Meta removed in v20+).
   * Values: 0 (unverified), 1000, 10000, 100000, unlimited (-1).
   */
  whatsapp_business_manager_messaging_limit?: number;
  /** Display name review state, e.g. 'APPROVED' | 'PENDING' | 'DECLINED'. */
  name_status?: string;
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
    const url = `${GRAPH_BASE}/${this.version}/${wabaId}?fields=id,name,business_id,currency,timezone_id,account_review_status,business_verification_status,health_status,payment_method_attached`;
    return this.get<WabaInfo>(url, accessToken);
  }

  /** List phone numbers under a WABA. */
  async listPhoneNumbers(
    wabaId: string,
    accessToken: string,
  ): Promise<PhoneNumberInfo[]> {
    const url = `${GRAPH_BASE}/${this.version}/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,status,whatsapp_business_manager_messaging_limit,name_status`;
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

  // ── Flows ────────────────────────────────────────────────────────────────

  /** Fetch all WhatsApp Flows under a WABA. */
  async listMetaFlows(
    wabaId: string,
    accessToken: string,
  ): Promise<MetaFlowInfo[]> {
    const url = `${GRAPH_BASE}/${this.version}/${wabaId}/flows?fields=id,name,status,categories,validation_errors`;
    const res = await this.get<{ data: MetaFlowInfo[] }>(url, accessToken);
    return res.data ?? [];
  }

  // ── Templates ───────────────────────────────────────────────────────────

  /** Fetch all message templates under a WABA. */
  async getTemplates(
    wabaId: string,
    accessToken: string,
  ): Promise<MetaTemplate[]> {
    const url = `${GRAPH_BASE}/${this.version}/${wabaId}/message_templates?fields=id,name,language,category,correct_category,status,components,rejected_reason&limit=250`;
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

  // ── Media ───────────────────────────────────────────────────────────────

  /**
   * GET /{mediaId} — retrieve the temporary download URL + metadata for a media
   * object. The returned `url` is only valid for ~5 minutes (Meta CDN).
   */
  async getMediaUrl(
    mediaId: string,
    accessToken: string,
  ): Promise<MetaMediaInfo> {
    const url = `${GRAPH_BASE}/${this.version}/${mediaId}`;
    return this.get<MetaMediaInfo>(url, accessToken);
  }

  /**
   * Download raw media bytes from Meta's CDN using the URL returned by
   * `getMediaUrl`. The Bearer token is required — CDN URLs are not public.
   */
  async downloadMedia(
    mediaUrl: string,
    accessToken: string,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    const res = await fetch(mediaUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      this.logger.warn(`Meta media download failed: ${res.status} ${mediaUrl}`);
      throw new AppException(
        {
          code: WA_ERR.MEDIA_UPLOAD_FAILED,
          message: `Failed to download media from Meta (${res.status})`,
        },
        502,
      );
    }
    const arrayBuffer = await res.arrayBuffer();
    const contentType =
      res.headers.get('content-type') ?? 'application/octet-stream';
    return { buffer: Buffer.from(arrayBuffer), contentType };
  }

  /**
   * POST /{phoneNumberId}/media — upload a file to Meta and get back a
   * reusable `id` that can be referenced in `sendMessage`.
   *
   * Meta requires multipart/form-data with the fields:
   *   messaging_product=whatsapp, type=<mime-type>, file=<binary>
   */
  async uploadMedia(
    phoneNumberId: string,
    buffer: Buffer,
    mimeType: string,
    filename: string,
    accessToken: string,
  ): Promise<{ id: string }> {
    const url = `${GRAPH_BASE}/${this.version}/${phoneNumberId}/media`;

    // Use the standard FormData / Blob API available in Node 18+.
    const formData = new FormData();
    formData.append('messaging_product', 'whatsapp');
    formData.append('type', mimeType);
    formData.append(
      'file',
      new Blob([new Uint8Array(buffer)], { type: mimeType }),
      filename,
    );

    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: formData,
    });

    const result = await this.parseResponse<{ id: string }>(res, url);
    return result;
  }

  /**
   * Upload media to Meta using the Resumable Upload API.
   * Returns the upload handle (e.g. "upload:...") used as example.header_handle.
   */
  async resumableUploadTemplateMedia(
    wabaId: string,
    accessToken: string,
    fileBuffer: Buffer,
    mimeType: string,
    fileLength: number,
  ): Promise<string> {
    const sessionUrl = `${GRAPH_BASE}/${this.version}/${wabaId}/uploads?file_length=${fileLength}&file_type=${encodeURIComponent(mimeType)}&access_token=${accessToken}`;
    const sessionRes = await fetch(sessionUrl, { method: 'POST' });
    const session = await this.parseResponse<{ id: string }>(
      sessionRes,
      sessionUrl,
    );

    const uploadUrl = `${GRAPH_BASE}/${this.version}/${session.id}`;
    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `OAuth ${accessToken}`,
        file_offset: '0',
        'Content-Type': mimeType,
      },
      body: new Uint8Array(fileBuffer),
    });
    if (!uploadRes.ok) {
      const errBody: unknown = await uploadRes.json().catch(() => ({}));
      throw new AppException(
        {
          code: WA_ERR.MEDIA_UPLOAD_FAILED,
          message: `Template media upload failed: ${JSON.stringify(errBody)}`,
        },
        502,
      );
    }
    const result = (await uploadRes.json()) as { h: string };
    return result.h;
  }

  // ── Messaging ───────────────────────────────────────────────────────────

  /** POST /{phoneNumberId}/messages — send interactive (button/list) message. */
  async sendInteractiveMessage(
    phoneNumberId: string,
    to: string,
    interactive: MetaInteractivePayload,
    accessToken: string,
  ): Promise<MetaSendMessageResult> {
    const url = `${GRAPH_BASE}/${this.version}/${phoneNumberId}/messages`;
    return this.post<MetaSendMessageResult>(
      url,
      { messaging_product: 'whatsapp', to, type: 'interactive', interactive },
      accessToken,
    );
  }

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
      // Prefer Meta's end-user copy when present (e.g. reserved sample names).
      const msg =
        json.error?.error_user_msg ??
        json.error?.error_user_title ??
        json.error?.message ??
        `Meta API error ${res.status}`;
      this.logger.warn(
        `Meta Graph error from ${url}: ${json.error?.message ?? msg}` +
          (json.error?.error_subcode != null
            ? ` (subcode ${json.error.error_subcode})`
            : ''),
      );
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
  /** Present when Meta will recategorize (or has already aligned). */
  correct_category?: string | null;
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

export type MetaMediaMessageType = 'image' | 'audio' | 'video' | 'document';

export interface MetaMediaObject {
  /** Reusable media id from an uploaded buffer. */
  id?: string;
  /** Public URL Meta fetches directly — mutually exclusive with `id`. */
  link?: string;
  /** Optional caption — supported by image, video, document. */
  caption?: string;
  /** Filename hint for document downloads. */
  filename?: string;
}

export interface MetaSendMessageInput {
  recipient_type?: string;
  to: string;
  type: 'text' | 'template' | MetaMediaMessageType;
  text?: { body: string };
  template?: {
    name: string;
    language: { code: string };
    components?: unknown[];
  };
  /** Present when type = 'image'. */
  image?: MetaMediaObject;
  /** Present when type = 'audio' (no caption supported by Meta). */
  audio?: MetaMediaObject;
  /** Present when type = 'video'. */
  video?: MetaMediaObject;
  /** Present when type = 'document'. */
  document?: MetaMediaObject;
}

export interface MetaMediaInfo {
  id: string;
  url: string;
  mime_type: string;
  sha256: string;
  file_size: number;
  messaging_product: string;
}

export interface MetaSendMessageResult {
  messaging_product: string;
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string }>;
}

export interface MetaFlowInfo {
  id: string;
  name: string;
  status: 'DRAFT' | 'PUBLISHED' | 'DEPRECATED' | 'BLOCKED' | 'THROTTLED';
  categories: string[];
  validation_errors?: { error_type: string; message: string }[];
}

export interface MetaInteractivePayload {
  type: 'button' | 'list';
  body: { text: string };
  header?:
    | { type: 'text'; text: string }
    | { type: 'image' | 'video' | 'document'; [key: string]: unknown };
  footer?: { text: string };
  action:
    | {
        buttons: Array<{ type: 'reply'; reply: { id: string; title: string } }>;
      }
    | {
        button: string;
        sections: Array<{
          title?: string;
          rows: Array<{ id: string; title: string; description?: string }>;
        }>;
      };
}
