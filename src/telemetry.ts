/**
 * OpenTelemetry SDK bootstrap — must be imported before any other module.
 *
 * Exports logs to PostHog following:
 * https://posthog.com/docs/logs/installation/nodejs
 *
 * No-ops silently when POSTHOG_API_KEY is absent (dev / CI without PostHog).
 */
import 'dotenv/config';

import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { resourceFromAttributes } from '@opentelemetry/resources';

const apiKey = process.env.POSTHOG_API_KEY;
const host = process.env.POSTHOG_HOST ?? 'https://us.i.posthog.com';

let sdk: NodeSDK | null = null;

if (apiKey) {
  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      'service.name': 'sm-server',
      'service.version': process.env.npm_package_version ?? '0.0.1',
      'deployment.environment': process.env.NODE_ENV ?? 'development',
    }),
    logRecordProcessor: new BatchLogRecordProcessor({
      exporter: new OTLPLogExporter({
        url: `${host}/i/v1/logs`,
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      }),
    }),
  });

  sdk.start();
  console.log(
    '[telemetry] OTEL SDK started — logs will be exported to PostHog',
  );
}

export async function shutdownTelemetry(): Promise<void> {
  if (sdk) await sdk.shutdown();
}
