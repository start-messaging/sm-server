import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
  ValidatorConstraint,
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
  type ValidatorConstraintInterface,
} from 'class-validator';
import type {
  TemplateButtonType,
  TemplateCategory,
  TemplateSubtype,
} from '../entities/wa-template.entity';

export type CarouselButtonType = 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';

export const BUTTON_LABEL_MAX = 25;
export const BUTTON_URL_MAX = 2000;
export const COPY_CODE_MAX = 15;
export const CAROUSEL_MIN_CARDS = 2;
export const CAROUSEL_MAX_CARDS = 10;

const CAROUSEL_BUTTON_TYPES: TemplateButtonType[] = [
  'QUICK_REPLY',
  'URL',
  'PHONE_NUMBER',
];

const BUTTON_MAX_PER_TYPE: Record<TemplateButtonType, number> = {
  QUICK_REPLY: 10,
  URL: 2,
  PHONE_NUMBER: 1,
  COPY_CODE: 1,
  REQUEST_CONTACT_INFO: 1,
  OTP: 1,
};

/** Types whose label Meta controls — a client-supplied `text` is ignored. */
const FIXED_LABEL_BUTTON_TYPES: TemplateButtonType[] = [
  'COPY_CODE',
  'REQUEST_CONTACT_INFO',
  'OTP',
];

function hasFixedLabel(type: TemplateButtonType): boolean {
  return FIXED_LABEL_BUTTON_TYPES.includes(type);
}

// ── Cross-field template shape rules ────────────────────────────────────────
//
// Declared before the DTO classes because `@ValidTemplateShape()` runs at
// class-definition time and would otherwise hit the constraint class in TDZ.

/** The subset of `CreateTemplateDto` the shape rules read. */
export interface TemplateShapeInput {
  category: TemplateCategory;
  subtype?: TemplateSubtype;
  components?: TemplateComponentDto[];
  buttons?: TemplateButtonDto[];
  carouselCards?: CarouselCardDto[];
  carouselCardCount?: number;
  carouselHeaderFormat?: 'IMAGE' | 'VIDEO';
  carouselButtonType?: CarouselButtonType;
}

/** The message-level buttons, wherever the caller put them. */
export function collectTemplateButtons(
  input: TemplateShapeInput,
): TemplateButtonDto[] {
  if (input.buttons?.length) return input.buttons;
  const component = (input.components ?? []).find((c) => c.type === 'BUTTONS');
  return component?.buttons ?? [];
}

export function resolveTemplateSubtype(
  input: TemplateShapeInput,
): TemplateSubtype {
  if (input.subtype) return input.subtype;
  if (input.carouselCards?.length) return 'carousel';
  if (hasComponent(input, 'LIMITED_TIME_OFFER')) return 'lto';
  if (input.category === 'AUTHENTICATION') return 'authentication';
  return 'standard';
}

/**
 * Returns a human-readable reason Meta would reject the payload, or null when
 * it is valid. Used by the ValidationPipe (400 carrying this message) and
 * again by the service as a defensive re-check before the Graph call.
 */
export function findTemplateShapeViolation(
  input: TemplateShapeInput,
): string | null {
  const subtype = resolveTemplateSubtype(input);
  const componentGroups = (input.components ?? [])
    .filter((c) => c.type === 'BUTTONS')
    .map((c) => c.buttons ?? []);

  if (input.buttons?.length && componentGroups.some((g) => g.length > 0)) {
    return 'Send buttons either as `buttons` or as a BUTTONS component, not both.';
  }
  if (componentGroups.length > 1) {
    return 'A template may only have one BUTTONS component.';
  }

  for (const group of [input.buttons ?? [], ...componentGroups]) {
    const violation = findButtonGroupViolation(group, input.category);
    if (violation) return violation;
  }
  return findSubtypeViolation(input, subtype);
}

function findButtonGroupViolation(
  buttons: TemplateButtonDto[],
  category: TemplateCategory,
): string | null {
  for (const [type, max] of Object.entries(BUTTON_MAX_PER_TYPE)) {
    const count = buttons.filter((b) => b.type === type).length;
    if (count > max) {
      const plural = max === 1 ? '' : 's';
      return `Meta allows at most ${max} ${type} button${plural} per template (received ${count}).`;
    }
  }

  const quickReplyPositions = buttons
    .map((b, i) => (b.type === 'QUICK_REPLY' ? i : -1))
    .filter((i) => i !== -1);
  if (quickReplyPositions.length > 1) {
    const first = quickReplyPositions[0] ?? 0;
    const last = quickReplyPositions[quickReplyPositions.length - 1] ?? 0;
    if (last - first + 1 !== quickReplyPositions.length) {
      return 'Quick reply buttons must be grouped together and cannot be interleaved with call-to-action buttons.';
    }
  }

  for (const b of buttons) {
    if (!hasFixedLabel(b.type) && !b.text?.trim()) {
      return `${b.type} buttons require a label.`;
    }
    if (b.text && b.text.length > BUTTON_LABEL_MAX) {
      return `Button labels are limited to ${BUTTON_LABEL_MAX} characters.`;
    }
    if (b.type === 'URL') {
      if (!b.url?.trim()) return 'URL buttons require a url.';
      if (b.url.length > BUTTON_URL_MAX) {
        return `Button urls are limited to ${BUTTON_URL_MAX} characters.`;
      }
    }
    if (
      b.type === 'PHONE_NUMBER' &&
      !(b.phone_number ?? b.phoneNumber)?.trim()
    ) {
      return 'PHONE_NUMBER buttons require a phone number.';
    }
    if (b.type === 'COPY_CODE') {
      if (category !== 'MARKETING') {
        return 'COPY_CODE buttons are only allowed on MARKETING templates.';
      }
      const sample = b.example?.[0];
      if (sample && sample.length > COPY_CODE_MAX) {
        return `Coupon codes are limited to ${COPY_CODE_MAX} characters.`;
      }
    }
    if (b.type === 'OTP' && category !== 'AUTHENTICATION') {
      return 'OTP buttons are only allowed on AUTHENTICATION templates.';
    }
  }

  const dynamicUrls = buttons.filter(
    (b) => b.type === 'URL' && /\{\{1\}\}/.test(b.url ?? ''),
  ).length;
  if (dynamicUrls > 1) {
    return 'Only one URL button may contain a {{1}} variable suffix.';
  }
  return null;
}

function findSubtypeViolation(
  input: TemplateShapeInput,
  subtype: TemplateSubtype,
): string | null {
  const buttons = collectTemplateButtons(input);

  if (subtype !== 'carousel' && input.carouselCards?.length) {
    return "carouselCards are only allowed when subtype is 'carousel'.";
  }

  if (subtype === 'lto') {
    if (input.category !== 'MARKETING') {
      return 'Limited time offer templates must use the MARKETING category.';
    }
    if (!hasComponent(input, 'LIMITED_TIME_OFFER')) {
      return 'Limited time offer templates require a LIMITED_TIME_OFFER component.';
    }
    if (hasComponent(input, 'FOOTER')) {
      return 'Limited time offer templates cannot include a FOOTER component.';
    }
    if (
      !buttons.some((b) => b.type === 'COPY_CODE') ||
      !buttons.some((b) => b.type === 'URL')
    ) {
      return 'Limited time offer templates require both a COPY_CODE and a URL button.';
    }
  }

  if (subtype === 'authentication') {
    if (input.category !== 'AUTHENTICATION') {
      return 'Authentication templates must use the AUTHENTICATION category.';
    }
    if (buttons.some((b) => b.type !== 'OTP')) {
      return 'Authentication templates only support a single OTP button.';
    }
  }

  if (subtype === 'carousel') return findCarouselViolation(input);
  return null;
}

function findCarouselViolation(input: TemplateShapeInput): string | null {
  if (input.category !== 'MARKETING') {
    return 'Carousel templates must use the MARKETING category.';
  }
  const cards = input.carouselCards ?? [];
  if (cards.length < CAROUSEL_MIN_CARDS || cards.length > CAROUSEL_MAX_CARDS) {
    return `Carousel templates require between ${CAROUSEL_MIN_CARDS} and ${CAROUSEL_MAX_CARDS} cards.`;
  }
  if (
    input.carouselCardCount != null &&
    input.carouselCardCount !== cards.length
  ) {
    return `carouselCardCount (${input.carouselCardCount}) does not match the number of carouselCards (${cards.length}).`;
  }
  if (hasComponent(input, 'FOOTER')) {
    return 'Carousel templates cannot include a FOOTER component.';
  }

  // Meta rejects a carousel whose cards do not share one structure.
  const withMedia = cards.filter((c) => c.headerMediaHandle?.trim()).length;
  if (withMedia !== 0 && withMedia !== cards.length) {
    return 'Either every carousel card has header media, or none may.';
  }
  if (withMedia > 0 && !input.carouselHeaderFormat) {
    return 'carouselHeaderFormat is required when carousel cards include header media.';
  }
  const withBody = cards.filter((c) => c.bodyText?.trim()).length;
  if (withBody !== 0 && withBody !== cards.length) {
    return 'Either every carousel card has body text, or none may.';
  }

  const buttonTypes = [
    ...new Set(cards.flatMap((c) => c.buttons.map((b) => b.type))),
  ];
  if (buttonTypes.length > 1) {
    return 'Carousel cards must all use the same button type.';
  }
  const cardButtonType = buttonTypes[0];
  if (cardButtonType && !CAROUSEL_BUTTON_TYPES.includes(cardButtonType)) {
    return 'Carousel card buttons must be QUICK_REPLY, URL, or PHONE_NUMBER.';
  }
  if (
    input.carouselButtonType &&
    cardButtonType &&
    cardButtonType !== input.carouselButtonType
  ) {
    return `Carousel card buttons must all be ${input.carouselButtonType} to match carouselButtonType.`;
  }

  for (const [index, card] of cards.entries()) {
    const violation = findButtonGroupViolation(card.buttons, input.category);
    if (violation) return `Carousel card ${index + 1}: ${violation}`;
  }
  return null;
}

function hasComponent(
  input: TemplateShapeInput,
  type: TemplateComponentDto['type'],
): boolean {
  return (input.components ?? []).some((c) => c.type === type);
}

@ValidatorConstraint({ name: 'templateShape', async: false })
class TemplateShapeConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    return (
      findTemplateShapeViolation(args.object as TemplateShapeInput) === null
    );
  }

  defaultMessage(args: ValidationArguments): string {
    return (
      findTemplateShapeViolation(args.object as TemplateShapeInput) ??
      'Invalid template component mix'
    );
  }
}

function ValidTemplateShape(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return (target, propertyKey) => {
    registerDecorator({
      name: 'templateShape',
      target: target.constructor,
      propertyName: propertyKey as string,
      options: validationOptions,
      validator: TemplateShapeConstraint,
    });
  };
}

// ── DTOs ────────────────────────────────────────────────────────────────────

/** Nested sample values Meta requires when the component text has {{n}}. */
export class TemplateComponentExampleDto {
  @IsOptional()
  @IsArray()
  body_text?: string[][];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  header_text?: string[];

  /** Media header: the asset handle returned by Meta's upload endpoint. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  header_handle?: string[];
}

/**
 * One button inside a BUTTONS component.
 *
 * Meta shapes (Business Management API):
 *   QUICK_REPLY          → { type, text }
 *   URL                  → { type, text, url, example?: [suffix] }
 *   PHONE_NUMBER         → { type, text, phone_number }
 *   COPY_CODE            → { type, example: "250FF" }   (marketing only)
 *   REQUEST_CONTACT_INFO → { type }                     (label fixed by Meta)
 *   OTP                  → { type, otp_type, ... }      (authentication only)
 *
 * `phoneNumber` is accepted as an alias of `phone_number`: the client contract
 * is camelCase while the Graph payload is snake_case, and the global
 * ValidationPipe runs with `forbidNonWhitelisted`, so both must be declared.
 */
export class TemplateButtonDto {
  @IsString()
  @IsIn([
    'QUICK_REPLY',
    'URL',
    'PHONE_NUMBER',
    'COPY_CODE',
    'REQUEST_CONTACT_INFO',
    'OTP',
  ])
  type!: TemplateButtonType;

  /**
   * Button label — max 25 chars per Meta. Not required for the types whose
   * label Meta fixes (COPY_CODE, REQUEST_CONTACT_INFO, OTP).
   */
  @ValidateIf((o: TemplateButtonDto) => !hasFixedLabel(o.type))
  @IsString()
  @IsNotEmpty()
  @MaxLength(BUTTON_LABEL_MAX)
  text?: string;

  /** URL buttons only. Supports one {{1}} variable at the end of the URL. */
  @IsOptional()
  @IsString()
  @MaxLength(BUTTON_URL_MAX)
  url?: string;

  /**
   * URL buttons: sample value for the {{1}} variable in `url`.
   * COPY_CODE buttons: sample coupon code.
   * A bare string is accepted and normalised to a single-element array.
   */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? [value] : value,
  )
  @IsArray()
  @IsString({ each: true })
  example?: string[];

  /** PHONE_NUMBER buttons only. E.164 format. */
  @IsOptional()
  @IsString()
  phone_number?: string;

  /** camelCase alias of `phone_number`. */
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  /** OTP buttons only (authentication templates). */
  @IsOptional()
  @IsIn(['ONE_TAP', 'COPY_CODE', 'ZERO_TAP'])
  otp_type?: 'ONE_TAP' | 'COPY_CODE' | 'ZERO_TAP';

  /** OTP ONE_TAP only: label shown on the autofill button. */
  @IsOptional()
  @IsString()
  @MaxLength(BUTTON_LABEL_MAX)
  autofill_text?: string;

  /** OTP ONE_TAP / ZERO_TAP only: Android package allowed to autofill. */
  @IsOptional()
  @IsString()
  package_name?: string;

  /** OTP ONE_TAP / ZERO_TAP only: signing-key hash of `package_name`. */
  @IsOptional()
  @IsString()
  signature_hash?: string;
}

/** LIMITED_TIME_OFFER component payload — Meta caps the text at 16 chars. */
export class TemplateLimitedTimeOfferDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  text!: string;

  @IsOptional()
  @IsBoolean()
  has_expiration?: boolean;
}

/** Nested component — must be decorated or ValidationPipe whitelist strips fields. */
export class TemplateComponentDto {
  @IsString()
  @IsIn(['HEADER', 'BODY', 'FOOTER', 'BUTTONS', 'LIMITED_TIME_OFFER'])
  type!: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS' | 'LIMITED_TIME_OFFER';

  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsIn(['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT'])
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';

  /**
   * HEADER format IMAGE/VIDEO/DOCUMENT only: publicly-accessible media URL,
   * passed through to the Graph API unchanged. Customer hosts the media —
   * we do not upload or proxy it.
   *
   * OPEN ISSUE: Meta's real Template Creation API for media headers expects
   * an uploaded media handle in `example.header_handle` (via the Resumable
   * Upload API), not a bare URL on the component. This field is wired
   * through as specified by the plan; whether Meta's Graph API accepts it
   * as-is is unverified.
   */
  @IsOptional()
  @IsString()
  link?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => TemplateComponentExampleDto)
  example?: TemplateComponentExampleDto;

  /**
   * BUTTONS component only: up to 10 buttons (Meta's cap on quick replies).
   * Must use @ValidateNested + @Type so ValidationPipe whitelist does not strip nested fields.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => TemplateButtonDto)
  buttons?: TemplateButtonDto[];

  /** LIMITED_TIME_OFFER component only. */
  @IsOptional()
  @ValidateNested()
  @Type(() => TemplateLimitedTimeOfferDto)
  limited_time_offer?: TemplateLimitedTimeOfferDto;

  /** AUTHENTICATION BODY only: appends Meta's "do not share this code" line. */
  @IsOptional()
  @IsBoolean()
  add_security_recommendation?: boolean;

  /** AUTHENTICATION FOOTER only: appends Meta's code-expiry warning. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  code_expiration_minutes?: number;
}

/**
 * One carousel card. All cards must share the same structure — Meta rejects a
 * carousel where only some cards carry body text or media.
 */
export class CarouselCardDto {
  /** Asset handle from Meta's media upload; required when the carousel has media. */
  @IsOptional()
  @IsString()
  headerMediaHandle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  bodyText?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => TemplateButtonDto)
  buttons!: TemplateButtonDto[];
}

export class CreateTemplateDto {
  /** Meta: lowercase alphanumeric + underscore only, max 512. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  @Matches(/^[a-z0-9_]+$/, {
    message:
      'Template name may only contain lowercase letters, digits, and underscores',
  })
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  language!: string;

  @IsString()
  @IsIn(['MARKETING', 'UTILITY', 'AUTHENTICATION'])
  category!: TemplateCategory;

  /**
   * The button/subtype/carousel mix is validated as a whole by
   * `@ValidTemplateShape()` because the rules are cross-field (category gates
   * COPY_CODE, subtype gates footers, quick replies must not be interleaved).
   * It hangs off `components` rather than `buttons` because `@IsOptional()`
   * skips every validator on an absent property.
   */
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TemplateComponentDto)
  @ValidTemplateShape()
  components!: TemplateComponentDto[];

  /**
   * Message-level buttons. Preferred over nesting a BUTTONS component in
   * `components` — send one or the other, never both.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => TemplateButtonDto)
  buttons?: TemplateButtonDto[];

  /** Omit to let the server derive it from the payload. */
  @IsOptional()
  @IsIn(['standard', 'lto', 'authentication', 'carousel'])
  subtype?: TemplateSubtype;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(CAROUSEL_MIN_CARDS)
  @ArrayMaxSize(CAROUSEL_MAX_CARDS)
  @ValidateNested({ each: true })
  @Type(() => CarouselCardDto)
  carouselCards?: CarouselCardDto[];

  /** Redundant with `carouselCards.length`; must agree when both are sent. */
  @IsOptional()
  @IsInt()
  @Min(CAROUSEL_MIN_CARDS)
  @Max(CAROUSEL_MAX_CARDS)
  carouselCardCount?: number;

  /** Must be identical across every card — Meta has no per-card format. */
  @IsOptional()
  @IsIn(['IMAGE', 'VIDEO'])
  carouselHeaderFormat?: 'IMAGE' | 'VIDEO';

  /** Must be identical across every card. */
  @IsOptional()
  @IsIn(['QUICK_REPLY', 'URL', 'PHONE_NUMBER'])
  carouselButtonType?: CarouselButtonType;
}
