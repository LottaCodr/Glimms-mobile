import { catalogRepository } from '../repositories';
import type { CatalogFilters, NewCatalogItem } from '../repositories/catalog.repository';
import { VERTICALS } from '../models';
import type { CatalogItem, ColorInfo, Vertical } from '../models';
import { NotFoundError, ForbiddenError, BadRequestError } from '../middleware/errorHandler.middleware';
import { getPresignedDownloadUrl } from '../lib/s3';
import { logger } from '../lib/logger';
import { isUuid } from '../utils/uuid';

export interface CatalogItemInput {
  vertical:      string;
  label:         string;
  category:      string;
  color:         Record<string, unknown>;
  imageKey:      string;
  thumbnailKey?: string;
  confidence:    number;
  texture?:      string;
  pattern?:      string;
  tags?:         string[];
  styleTags?:    string[];
  attributes?:   Record<string, unknown>;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const optionalText = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;

const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];

/**
 * Turns loosely-typed input (HTTP body or AI pipeline output) into a complete,
 * valid row, applying the defaults the schema promises. Returns a reason
 * instead of a row when the item cannot be stored.
 */
function normaliseItem(userId: string, input: Record<string, unknown>): NewCatalogItem | { invalid: string } {
  const label    = typeof input.label === 'string' ? input.label.trim() : '';
  const category = typeof input.category === 'string' ? input.category.trim() : '';
  if (!VERTICALS.includes(input.vertical as Vertical)) return { invalid: 'vertical' };
  if (!label) return { invalid: 'label' };
  if (!category) return { invalid: 'category' };
  if (typeof input.imageKey !== 'string' || !input.imageKey) return { invalid: 'imageKey' };
  if (typeof input.confidence !== 'number' || !(input.confidence >= 0 && input.confidence <= 1)) {
    return { invalid: 'confidence' };
  }
  if (!isPlainObject(input.color) || !isPlainObject(input.color.dominant)) return { invalid: 'color.dominant' };

  const color: ColorInfo = {
    dominant: input.color.dominant as unknown as ColorInfo['dominant'],
    palette:  Array.isArray(input.color.palette) ? (input.color.palette as ColorInfo['palette']) : [],
    mood:     typeof input.color.mood === 'string' ? input.color.mood : 'neutral',
  };

  return {
    userId,
    vertical:     input.vertical as Vertical,
    label,
    category,
    color,
    texture:      optionalText(input.texture),
    pattern:      optionalText(input.pattern),
    imageKey:     input.imageKey,
    thumbnailKey: optionalText(input.thumbnailKey),
    confidence:   input.confidence,
    attributes:   isPlainObject(input.attributes) ? input.attributes : {},
    tags:         stringList(input.tags),
    styleTags:    stringList(input.styleTags),
  };
}

export const catalogService = {

  async list(
    userId: string,
    filters: CatalogFilters,
    opts: { page: number; limit: number; includeUrls?: boolean } = { page: 1, limit: 20 },
  ) {
    const { page, limit, includeUrls } = opts;

    const [items, total] = await Promise.all([
      catalogRepository.listActive(userId, filters, { page, limit }),
      catalogRepository.countActive(userId, filters),
    ]);

    let enriched: Array<CatalogItem & { imageUrl?: string | null; thumbnailUrl?: string | null }> = items;
    if (includeUrls) {
      enriched = await Promise.all(items.map(async (item) => ({
        ...item,
        imageUrl:     item.imageKey ? await getPresignedDownloadUrl(item.imageKey).catch(() => null) : null,
        thumbnailUrl: item.thumbnailKey ? await getPresignedDownloadUrl(item.thumbnailKey).catch(() => null) : null,
      })));
    }

    return {
      items: enriched,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  },

  async findOne(id: string, userId: string) {
    if (!isUuid(id)) throw new NotFoundError('Catalog item');
    const item = await catalogRepository.findActiveById(id);
    if (!item) throw new NotFoundError('Catalog item');
    if (item.userId !== userId) throw new ForbiddenError('You do not own this item');
    return item;
  },

  async getPresignedUrl(id: string, userId: string) {
    const item = await this.findOne(id, userId);
    return getPresignedDownloadUrl(item.imageKey);
  },

  async create(userId: string, data: CatalogItemInput) {
    const item = normaliseItem(userId, data as unknown as Record<string, unknown>);
    if ('invalid' in item) throw new BadRequestError(`Invalid catalog item: ${item.invalid}`);
    const [created] = await catalogRepository.insertMany([item]);
    return created;
  },

  /**
   * Stores AI-detected items. Detection output is not guaranteed to be
   * complete, so unusable items are skipped (and logged) rather than failing
   * the batch — one bad detection must not lose the rest of a scan.
   */
  async bulkCreate(userId: string, items: Record<string, unknown>[]) {
    if (!items.length) return [];
    const valid: NewCatalogItem[] = [];
    const skipped: string[] = [];
    for (const raw of items) {
      const item = normaliseItem(userId, raw);
      if ('invalid' in item) skipped.push(item.invalid);
      else valid.push(item);
    }
    if (skipped.length) {
      logger.warn({ userId, skipped: skipped.length, reasons: [...new Set(skipped)] }, 'Catalog bulk-create skipped invalid items');
    }
    return catalogRepository.insertMany(valid);
  },

  async update(id: string, userId: string, data: {
    label?:      string;
    tags?:       string[];
    styleTags?:  string[];
    attributes?: Record<string, unknown>;
  }) {
    await this.findOne(id, userId);
    const label = data.label?.trim();
    if (data.label !== undefined && !label) throw new BadRequestError('label must not be empty');
    return catalogRepository.update(id, {
      label,
      tags:       data.tags,
      styleTags:  data.styleTags,
      attributes: data.attributes,
    });
  },

  async remove(id: string, userId: string) {
    await this.findOne(id, userId);
    await catalogRepository.update(id, { isActive: false });
    return { message: 'Item removed from catalog' };
  },
};
