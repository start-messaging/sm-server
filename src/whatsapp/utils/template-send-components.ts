import type {
  TemplateButton,
  TemplateComponent,
  WaTemplate,
} from '../entities/wa-template.entity';

export type HeaderMediaKind = 'image' | 'video' | 'document';

export interface TemplateSendButtonParam {
  index: number;
  subType: 'url' | 'copy_code' | 'flow';
  text?: string;
  couponCode?: string;
}

export interface BuildTemplateSendInput {
  template: Pick<WaTemplate, 'components' | 'buttons'>;
  parameters?: Record<string, string>[];
  headerMediaUrl?: string;
  headerMediaId?: string;
  headerFilename?: string;
  buttonParameters?: TemplateSendButtonParam[];
}

const POSITIONAL_VAR_RE = /\{\{(\d+)\}\}/g;
const NAMED_VAR_RE = /\{\{([a-z][a-z0-9_]*)\}\}/gi;

export function headerMediaKind(
  components: TemplateComponent[],
): HeaderMediaKind | null {
  const format = components.find((c) => c.type === 'HEADER')?.format;
  if (format === 'IMAGE') return 'image';
  if (format === 'VIDEO') return 'video';
  if (format === 'DOCUMENT') return 'document';
  return null;
}

export function templateHasMediaHeader(
  components: TemplateComponent[],
): boolean {
  return headerMediaKind(components) != null;
}

export function bodyParameterStyle(
  text: string,
): 'positional' | 'named' | 'none' {
  const named = [...text.matchAll(NAMED_VAR_RE)].map((m) => m[1]);
  const positional = [...text.matchAll(POSITIONAL_VAR_RE)];
  if (named.length > 0 && positional.length === 0) return 'named';
  if (positional.length > 0) return 'positional';
  return 'none';
}

function templateButtons(
  template: Pick<WaTemplate, 'components' | 'buttons'>,
): TemplateButton[] {
  if (template.buttons?.length) return template.buttons;
  return template.components.find((c) => c.type === 'BUTTONS')?.buttons ?? [];
}

function urlNeedsSuffix(url?: string): boolean {
  const value = url ?? '';
  return /\{\{\s*1\s*\}\}/.test(value) || /\{\{[a-z][a-z0-9_]*\}\}/i.test(value);
}

function exampleValue(example?: string | string[]): string | undefined {
  if (!example) return undefined;
  return Array.isArray(example) ? example[0] : example;
}

/**
 * Build the Cloud API `template.components` array for a send.
 *
 * Header media type comes from the stored template, not the URL extension.
 * Prefer a Meta media `id` over a public `link` when both are present.
 * Dynamic URL / COPY_CODE / FLOW buttons get send-time `sub_type` entries —
 * omitting those is what Meta reports as "components sub_type invalid".
 */
export function buildTemplateSendComponents(
  input: BuildTemplateSendInput,
): object[] {
  const components: object[] = [];
  const kind = headerMediaKind(input.template.components);

  if (kind && (input.headerMediaId || input.headerMediaUrl)) {
    const media = input.headerMediaId
      ? { id: input.headerMediaId }
      : {
          link: input.headerMediaUrl!,
          ...(kind === 'document' && input.headerFilename
            ? { filename: input.headerFilename }
            : {}),
        };
    components.push({
      type: 'header',
      parameters: [{ type: kind, [kind]: media }],
    });
  }

  const bodyText =
    input.template.components.find((c) => c.type === 'BODY')?.text ?? '';
  const style = bodyParameterStyle(bodyText);
  if (style !== 'none' && input.parameters?.length) {
    if (style === 'named') {
      const names = [
        ...new Set(
          [...bodyText.matchAll(NAMED_VAR_RE)].map((m) => m[1]!.toLowerCase()),
        ),
      ];
      components.push({
        type: 'body',
        parameters: names.map((name, i) => {
          const p = input.parameters![i] ?? {};
          return {
            type: 'text',
            parameter_name: (p['parameter_name'] ?? p['name'] ?? name)
              .toString()
              .toLowerCase(),
            text: String(p['text'] ?? Object.values(p)[0] ?? ''),
          };
        }),
      });
    } else {
      components.push({
        type: 'body',
        parameters: input.parameters.map((p) => ({
          type: 'text' as const,
          text: String(p['text'] ?? Object.values(p)[0] ?? ''),
        })),
      });
    }
  }

  const buttons = templateButtons(input.template);
  buttons.forEach((b, index) => {
    const override = input.buttonParameters?.find((p) => p.index === index);
    if (b.type === 'URL' && urlNeedsSuffix(b.url)) {
      const suffix = override?.text ?? exampleValue(b.example);
      if (suffix) {
        components.push({
          type: 'button',
          sub_type: 'url',
          index: String(index),
          parameters: [{ type: 'text', text: suffix }],
        });
      }
    }
    if (b.type === 'COPY_CODE') {
      const code = override?.couponCode ?? exampleValue(b.example);
      if (code) {
        components.push({
          type: 'button',
          sub_type: 'copy_code',
          index: String(index),
          parameters: [{ type: 'coupon_code', coupon_code: code }],
        });
      }
    }
    if (b.type === 'FLOW') {
      components.push({
        type: 'button',
        sub_type: 'flow',
        index: String(index),
        parameters: [
          {
            type: 'action',
            action: { flow_token: override?.text || 'unused' },
          },
        ],
      });
    }
  });

  return components;
}
