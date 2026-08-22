/**
 * WhatsappMediaService — orchestrates outbound media:
 *   1. Validate size against Meta's per-type limits.
 *   2. Upload the file to Cloudflare R2.
 *   3. Upload the file to Meta Graph → get a reusable media id.
 *
 * Returns the r2Key, public URL (when configured), Meta media id, mime type,
 * and filename so the caller can persist them on the WaMessage.
 *
 * IMPORTANT: Tech Provider — NEVER debit wallet. Media billing is Meta's.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvVars } from '../../config/env.validation';
import { AppException } from '../../common/exceptions/app.exception';
import { R2UploadService } from '../../common/services/r2-upload.service';
import { MetaGraphClient } from './meta-graph.client';
import { WA_ERR } from '../whatsapp-error-codes';
import type { MessageMediaType } from '../entities/wa-message.entity';

/** Meta per-type size limits in bytes. */
const META_SIZE_LIMITS: Record<string, number> = {
  image: 5 * 1024 * 1024, // 5 MB
  audio: 16 * 1024 * 1024, // 16 MB
  video: 16 * 1024 * 1024, // 16 MB
  document: 100 * 1024 * 1024, // 100 MB
  sticker: 500 * 1024, // 500 KB
};

/** Resolve a MessageMediaType from a MIME type string. */
export function resolveMediaType(mime: string): MessageMediaType {
  const lower = mime.toLowerCase();
  if (lower.startsWith('image/webp')) return 'sticker';
  if (lower.startsWith('image/')) return 'image';
  if (lower.startsWith('audio/')) return 'audio';
  if (lower.startsWith('video/')) return 'video';
  return 'document';
}

export interface MediaUploadResult {
  mediaType: MessageMediaType;
  metaMediaId: string;
  r2Key: string;
  mediaUrl: string | null;
  mediaMime: string;
  mediaFilename: string;
}

@Injectable()
export class WhatsappMediaService {
  private readonly logger = new Logger(WhatsappMediaService.name);
  private readonly r2Configured: boolean;

  constructor(
    private readonly config: ConfigService<EnvVars, true>,
    private readonly r2: R2UploadService,
    private readonly meta: MetaGraphClient,
  ) {
    this.r2Configured = !!(
      this.config.get('R2_ACCOUNT_ID', { infer: true }) &&
      this.config.get('R2_BUCKET_NAME', { infer: true }) &&
      this.config.get('R2_ACCESS_KEY_ID', { infer: true })
    );
  }

  /**
   * Upload a file to R2 then to Meta Graph, returning everything needed to
   * persist on WaMessage and send the outbound media message.
   */
  async uploadForSend(opts: {
    workspaceId: string;
    conversationId: string;
    phoneNumberId: string;
    accessToken: string;
    buffer: Buffer;
    mimeType: string;
    filename: string;
  }): Promise<MediaUploadResult> {
    if (!this.r2Configured) {
      throw new AppException(
        {
          code: WA_ERR.MEDIA_STORAGE_NOT_CONFIGURED,
          message:
            'Media storage (Cloudflare R2) is not configured on this server. ' +
            'Contact your workspace admin to enable file sharing.',
        },
        503,
      );
    }

    const mediaType = resolveMediaType(opts.mimeType);
    this.validateSize(opts.buffer.length, mediaType);

    const r2Key = `wa/${opts.workspaceId}/${opts.conversationId}/${Date.now()}-${opts.filename}`;

    let mediaUrl: string | null = null;
    try {
      mediaUrl = await this.r2.upload(r2Key, opts.buffer, opts.mimeType);
    } catch (err) {
      this.logger.error(`R2 upload failed for ${r2Key}`, err);
      throw new AppException(
        {
          code: WA_ERR.MEDIA_UPLOAD_FAILED,
          message: 'Failed to store media file. Please try again.',
        },
        502,
      );
    }

    let metaMediaId: string;
    try {
      const result = await this.meta.uploadMedia(
        opts.phoneNumberId,
        opts.buffer,
        opts.mimeType,
        opts.filename,
        opts.accessToken,
      );
      metaMediaId = result.id;
    } catch (err) {
      this.logger.error(`Meta media upload failed`, err);
      if (err instanceof AppException) throw err;
      throw new AppException(
        {
          code: WA_ERR.MEDIA_UPLOAD_FAILED,
          message: 'Failed to upload media to WhatsApp. Please try again.',
        },
        502,
      );
    }

    return {
      mediaType,
      metaMediaId,
      r2Key,
      mediaUrl,
      mediaMime: opts.mimeType,
      mediaFilename: opts.filename,
    };
  }

  /**
   * Download inbound media from Meta and upload to R2. Used by the webhook
   * processor. Returns null (and logs) rather than throwing so the webhook
   * 200 ACK is never blocked.
   */
  async downloadAndStore(opts: {
    workspaceId: string;
    conversationId: string;
    wamid: string;
    mediaId: string;
    accessToken: string;
    fallbackMime?: string;
    fallbackFilename?: string;
  }): Promise<{
    r2Key: string;
    mediaUrl: string | null;
    mediaMime: string;
  } | null> {
    if (!this.r2Configured) {
      this.logger.warn(
        `R2 not configured — skipping inbound media download for ${opts.mediaId}`,
      );
      return null;
    }

    let metaUrl: string;
    let mime: string;
    try {
      const info = await this.meta.getMediaUrl(opts.mediaId, opts.accessToken);
      metaUrl = info.url;
      mime = info.mime_type ?? opts.fallbackMime ?? 'application/octet-stream';
    } catch (err) {
      this.logger.warn(
        `Could not get Meta media URL for id=${opts.mediaId}: ${String(err)}`,
      );
      return null;
    }

    let buffer: Buffer;
    try {
      const result = await this.meta.downloadMedia(metaUrl, opts.accessToken);
      buffer = result.buffer;
      mime = result.contentType || mime;
    } catch (err) {
      this.logger.warn(
        `Could not download Meta media for id=${opts.mediaId}: ${String(err)}`,
      );
      return null;
    }

    const ext = mimeToExt(mime);
    const filename =
      opts.fallbackFilename ?? `${opts.wamid}${ext ? `.${ext}` : ''}`;
    const r2Key = `wa/${opts.workspaceId}/${opts.conversationId}/${opts.wamid}`;

    try {
      const url = await this.r2.upload(r2Key, buffer, mime);
      return { r2Key, mediaUrl: url, mediaMime: mime };
    } catch (err) {
      this.logger.error(
        `R2 upload failed for inbound media key=${r2Key}: ${String(err)}`,
      );
      return null;
    }
  }

  private validateSize(bytes: number, mediaType: MessageMediaType): void {
    const limit = META_SIZE_LIMITS[mediaType];
    if (limit !== undefined && bytes > limit) {
      const mb = (limit / (1024 * 1024)).toFixed(0);
      throw new AppException(
        {
          code: WA_ERR.MEDIA_TOO_LARGE,
          message: `${capitalize(mediaType)} files must be smaller than ${mb} MB (Meta limit).`,
        },
        413,
      );
    }
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/aac': 'aac',
    'video/mp4': 'mp4',
    'video/3gp': '3gp',
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'text/plain': 'txt',
  };
  return map[mime.toLowerCase()] ?? '';
}
