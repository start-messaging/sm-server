import type {
  TemplateButton,
  TemplateCategory,
  TemplateComponent,
  TemplateStatus,
  TemplateSubtype,
  WaTemplate,
} from '../entities/wa-template.entity';

/**
 * Customer-facing shape of a template row. `status` and `category` are always
 * Meta's current values (never what we submitted), so "created" never reads as
 * "sendable" — see the whatsapp-product skill on template lifecycle.
 *
 * `sm-client`'s `WaTemplate` in `types/api.ts` must mirror this exactly.
 */
export class WaTemplateDto {
  id!: string;
  name!: string;
  language!: string;
  category!: TemplateCategory;
  /** What we submitted — differs from `category` when Meta recategorized. */
  submittedCategory!: TemplateCategory | null;
  /** Meta's impending recategorization, null when already applied. */
  correctCategory!: TemplateCategory | null;
  status!: TemplateStatus;
  components!: TemplateComponent[];
  rejectionReason!: string | null;
  hasButtons!: boolean;
  buttons!: TemplateButton[] | null;
  templateSubtype!: TemplateSubtype;
  isCarousel!: boolean;
  /** Fixed at creation — an approved 3-card carousel only ever sends 3 cards. */
  carouselCardCount!: number | null;
  createdAt!: string;
  updatedAt!: string;
}

export class WaTemplateListDto {
  templates!: WaTemplateDto[];
  total!: number;
}

export function toWaTemplateDto(t: WaTemplate): WaTemplateDto {
  return {
    id: t.id,
    name: t.name,
    language: t.language,
    category: t.category,
    submittedCategory: t.submittedCategory,
    correctCategory: t.correctCategory,
    status: t.status,
    components: t.components,
    rejectionReason: t.rejectionReason,
    hasButtons: t.hasButtons,
    buttons: t.buttons,
    templateSubtype: t.templateSubtype,
    isCarousel: t.isCarousel,
    carouselCardCount: t.carouselCardCount,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}
