import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import type { EnvVars } from '../../config/env.validation';

export type R2Bucket = 'public' | 'private';

@Injectable()
export class R2UploadService {
  private readonly client: S3Client;
  private readonly publicBucket: string;
  private readonly privateBucket: string;
  private readonly publicUrl: string;

  constructor(private readonly configService: ConfigService<EnvVars, true>) {
    const accountId =
      this.configService.get('R2_ACCOUNT_ID', { infer: true }) ?? '';
    this.publicBucket =
      this.configService.get('R2_BUCKET_NAME', { infer: true }) ?? '';
    this.privateBucket =
      this.configService.get('R2_PRIVATE_BUCKET_NAME', { infer: true }) ?? this.publicBucket;
    this.publicUrl =
      this.configService.get('R2_PUBLIC_URL', { infer: true }) ?? '';

    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId:
          this.configService.get('R2_ACCESS_KEY_ID', { infer: true }) ?? '',
        secretAccessKey:
          this.configService.get('R2_SECRET_ACCESS_KEY', { infer: true }) ?? '',
      },
    });
  }

  /**
   * Upload a file to R2.
   *
   * @param bucket - 'public' (default) serves the object at R2_PUBLIC_URL/<key>.
   *                 'private' uses R2_PRIVATE_BUCKET_NAME; no public URL is returned.
   * @returns The public URL for 'public' uploads. For 'private', returns the R2 key
   *          so the caller can generate a proxy/signed URL server-side.
   */
  async upload(
    key: string,
    buffer: Buffer,
    contentType: string,
    bucket: R2Bucket = 'public',
  ): Promise<string> {
    const bucketName = bucket === 'private' ? this.privateBucket : this.publicBucket;
    await this.client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );
    return bucket === 'public' ? `${this.publicUrl}/${key}` : key;
  }

  async getObject(key: string, bucket: R2Bucket = 'public') {
    const bucketName = bucket === 'private' ? this.privateBucket : this.publicBucket;
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: bucketName, Key: key }),
    );
    return {
      body: response.Body,
      contentType: response.ContentType,
      contentLength: response.ContentLength,
    };
  }

  extractKeyFromUrl(url: string): string | null {
    if (!this.publicUrl) return null;
    const prefix = this.publicUrl.endsWith('/')
      ? this.publicUrl
      : `${this.publicUrl}/`;
    if (url.startsWith(prefix)) {
      return url.slice(prefix.length);
    }
    return null;
  }

  async delete(key: string, bucket: R2Bucket = 'public'): Promise<void> {
    const bucketName = bucket === 'private' ? this.privateBucket : this.publicBucket;
    await this.client.send(
      new DeleteObjectCommand({ Bucket: bucketName, Key: key }),
    );
  }
}
