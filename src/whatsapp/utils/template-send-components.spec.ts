import {
  bodyParameterStyle,
  buildTemplateSendComponents,
  headerMediaKind,
} from './template-send-components';
import type { WaTemplate } from '../entities/wa-template.entity';

function tpl(
  partial: Partial<Pick<WaTemplate, 'components' | 'buttons'>>,
): Pick<WaTemplate, 'components' | 'buttons'> {
  return {
    components: partial.components ?? [],
    buttons: partial.buttons ?? null,
  };
}

describe('headerMediaKind', () => {
  it('reads IMAGE/VIDEO/DOCUMENT from the stored header, not the URL', () => {
    expect(
      headerMediaKind([{ type: 'HEADER', format: 'IMAGE' }]),
    ).toBe('image');
    expect(
      headerMediaKind([{ type: 'HEADER', format: 'DOCUMENT' }]),
    ).toBe('document');
    expect(headerMediaKind([{ type: 'HEADER', format: 'TEXT' }])).toBeNull();
  });
});

describe('bodyParameterStyle', () => {
  it('detects positional vs named vs none', () => {
    expect(bodyParameterStyle('Hello {{1}}, order {{2}}')).toBe('positional');
    expect(bodyParameterStyle('Hello {{first_name}}')).toBe('named');
    expect(bodyParameterStyle('No variables here')).toBe('none');
  });
});

describe('buildTemplateSendComponents', () => {
  it('uses template format and prefers Meta media id over a public link', () => {
    const components = buildTemplateSendComponents({
      template: tpl({
        components: [
          { type: 'HEADER', format: 'IMAGE' },
          { type: 'BODY', text: 'Hello there' },
        ],
      }),
      headerMediaUrl: 'https://cdn.example.com/file-without-extension',
      headerMediaId: 'meta-media-99',
    });
    expect(components).toEqual([
      {
        type: 'header',
        parameters: [{ type: 'image', image: { id: 'meta-media-99' } }],
      },
    ]);
  });

  it('does not emit a body component when the template has no variables', () => {
    const components = buildTemplateSendComponents({
      template: tpl({
        components: [{ type: 'BODY', text: 'Static hello' }],
      }),
      parameters: [{ text: 'ignored' }],
    });
    expect(components).toEqual([]);
  });

  it('adds copy_code / dynamic url / flow button components', () => {
    const components = buildTemplateSendComponents({
      template: tpl({
        components: [{ type: 'BODY', text: 'Deal for {{1}}' }],
        buttons: [
          {
            type: 'URL',
            text: 'Shop',
            url: 'https://shop.example/{{1}}',
            example: ['summer'],
          },
          { type: 'COPY_CODE', example: 'SAVE20' },
          { type: 'FLOW', text: 'Sign up', flow_id: '123' },
        ],
      }),
      parameters: [{ text: 'Aman' }],
    });
    expect(components).toEqual([
      {
        type: 'body',
        parameters: [{ type: 'text', text: 'Aman' }],
      },
      {
        type: 'button',
        sub_type: 'url',
        index: '0',
        parameters: [{ type: 'text', text: 'summer' }],
      },
      {
        type: 'button',
        sub_type: 'copy_code',
        index: '1',
        parameters: [{ type: 'coupon_code', coupon_code: 'SAVE20' }],
      },
      {
        type: 'button',
        sub_type: 'flow',
        index: '2',
        parameters: [{ type: 'action', action: { flow_token: 'unused' } }],
      },
    ]);
  });

  it('sends named body parameters with parameter_name', () => {
    const components = buildTemplateSendComponents({
      template: tpl({
        components: [
          { type: 'BODY', text: 'Thanks {{first_name}}, order {{order_id}}' },
        ],
      }),
      parameters: [
        { parameter_name: 'first_name', text: 'Pablo' },
        { parameter_name: 'order_id', text: '99' },
      ],
    });
    expect(components).toEqual([
      {
        type: 'body',
        parameters: [
          { type: 'text', parameter_name: 'first_name', text: 'Pablo' },
          { type: 'text', parameter_name: 'order_id', text: '99' },
        ],
      },
    ]);
  });
});
