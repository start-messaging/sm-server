import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import type { EnvVars } from '../../config/env.validation';

@Injectable()
export class R2UploadService {
  private readonly client: S3Client;
  private readonly bucketName: string;
  private readonly publicUrl: string;

  constructor(private readonly configService: ConfigService<EnvVars, true>) {
    const accountId =
      this.configService.get('R2_ACCOUNT_ID', { infer: true }) ?? '';
    this.bucketName =
      this.configService.get('R2_BUCKET_NAME', { infer: true }) ?? '';
    this.publicUrl =
      this.configService.get('R2_PUBLIC_URL', { infer: true }) ?? '';

    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId:
          this.configService.get('R2_ACCESS_KEY_ID', { infer: true }) ?? '',
        secretAccessKey:
          this.configService.get('R2_SECRET_ACCESS_KEY', {
            infer: true,
          }) ?? '',
      },
    });
  }

  async upload(
    key: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );

    return `${this.publicUrl}/${key}`;
  }

  async getObject(key: string) {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      }),
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

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      }),
    );
  }
}
