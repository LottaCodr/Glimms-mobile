/**
 * Visual similarity between a user's own catalog items.
 *
 * Every scanned item gets a CLIP image embedding ("style vector") stored in
 * the vector index under `<userId>:<itemId>`; the catalog row keeps that id in
 * `attributes.vectorId`. This service asks the index for a vector's nearest
 * neighbours and turns the answers back into catalog items.
 *
 * Searches are always filtered to the requesting user, and results are looked
 * up again in the database scoped to that user, so one user's items can never
 * appear in another's results.
 */
import { catalogRepository } from '../repositories';
import type { CatalogItem } from '../models';
import { aiClient } from '../lib/aiClient';
import { getPresignedDownloadUrl } from '../lib/s3';
import { config } from '../config';
import { logger } from '../lib/logger';
import { ServiceUnavailableError } from '../middleware/errorHandler.middleware';
import { catalogService } from './catalog.service';

export const VECTOR_NAMESPACE = 'items';

export interface VectorMatch { id: string; score: number }

/** The vector index, reduced to what this service needs (tests supply a fake). */
export interface VectorIndex {
  /** Neighbours of a stored vector; `found: false` when the id is not stored. */
  neighboursOf(vectorId: string, topK: number, filter: Record<string, unknown>): Promise<{ found: boolean; matches: VectorMatch[] }>;
  nearest(embedding: number[], topK: number, filter: Record<string, unknown>): Promise<VectorMatch[]>;
  remove(vectorIds: string[]): Promise<void>;
}

export type SimilarityMode = 'similar' | 'pairs';

export interface SimilarItem extends CatalogItem {
  /** Cosine similarity of the two style vectors, 0–1. */
  similarity: number;
  imageUrl:   string | null;
}

export interface DuplicateHit { itemId: string; similarity: number }

/** How many new items per scan are checked against the wardrobe. */
const MAX_DUPLICATE_CHECKS = 12;

/** The id of an item's style vector, if it has one that belongs to this user. */
export function vectorIdOf(item: Pick<CatalogItem, 'userId' | 'attributes'>): string | null {
  const id = (item.attributes as Record<string, unknown> | null)?.vectorId;
  // `attributes` can be written by the client, so an id naming someone
  // else's vector is ignored.
  return typeof id === 'string' && id.startsWith(`${item.userId}:`) ? id : null;
}

const round = (score: number) => Math.round(Math.max(0, Math.min(1, score)) * 1000) / 1000;

export function createSimilarityService(
  index: VectorIndex,
  settings: { duplicateThreshold: number; presign?: (key: string) => Promise<string> },
) {
  const presign = settings.presign ?? getPresignedDownloadUrl;

  /** Vector matches → the user's active catalog items, in match order. */
  async function toItems(userId: string, matches: VectorMatch[]): Promise<Array<{ item: CatalogItem; score: number }>> {
    if (!matches.length) return [];
    const rows = await catalogRepository.findActiveByVectorIds(userId, matches.map((match) => match.id));
    const byVector = new Map(rows.map((row) => [vectorIdOf(row), row]));
    return matches.flatMap((match) => {
      const item = byVector.get(match.id);
      return item ? [{ item, score: match.score }] : [];
    });
  }

  return {
    /**
     * Items of the user's that look like this one.
     * - `similar`: the closest matches of any kind (usually the same kind of item).
     * - `pairs`: the closest matches from other categories, i.e. pieces in a
     *   similar colour and style that could be worn or placed with it.
     *
     * `available: false` means this item has no style vector (it was added
     * before vectors were recorded, by hand, or with the AI in fallback mode).
     */
    async forItem(
      itemId: string,
      userId: string,
      options: { mode?: SimilarityMode; limit?: number } = {},
    ): Promise<{ available: boolean; items: SimilarItem[] }> {
      const mode = options.mode ?? 'similar';
      const limit = Math.min(Math.max(options.limit ?? 6, 1), 20);
      const item = await catalogService.findOne(itemId, userId); // 404 / 403

      const vectorId = vectorIdOf(item);
      if (!vectorId) return { available: false, items: [] };

      let result;
      try {
        // Over-fetch: removed items and (for pairs) same-category items are dropped below.
        result = await index.neighboursOf(vectorId, Math.min(limit * 5, 100), { user_id: userId, vertical: item.vertical });
      } catch (err: any) {
        logger.warn({ userId, itemId, err: err?.message }, 'Similarity search failed');
        throw new ServiceUnavailableError('Similar items are temporarily unavailable', 'SIMILARITY_UNAVAILABLE');
      }
      if (!result.found) return { available: false, items: [] };

      const candidates = (await toItems(userId, result.matches))
        .filter(({ item: other }) => other.id !== item.id)
        .filter(({ item: other }) => mode !== 'pairs' || other.category.toLowerCase() !== item.category.toLowerCase())
        .slice(0, limit);

      const items = await Promise.all(candidates.map(async ({ item: other, score }) => ({
        ...other,
        similarity: round(score),
        imageUrl:   await presign(other.thumbnailKey ?? other.imageKey).catch(() => null),
      })));
      return { available: true, items };
    },

    /**
     * For freshly scanned items, finds the ones the user already owns: the
     * nearest existing vector is close enough to be the same physical item.
     * Must run before the new vectors are stored, or each would match itself.
     * Never throws: a scan must not fail because this check could not run.
     */
    async findDuplicates(
      userId: string,
      vertical: string,
      candidates: Array<{ key: string; embedding: number[] }>,
    ): Promise<Map<string, DuplicateHit>> {
      const hits = new Map<string, DuplicateHit>();
      await Promise.all(candidates.slice(0, MAX_DUPLICATE_CHECKS).map(async ({ key, embedding }) => {
        try {
          const [nearest] = await index.nearest(embedding, 1, { user_id: userId, vertical });
          if (!nearest || nearest.score < settings.duplicateThreshold) return;
          const [match] = await toItems(userId, [nearest]);
          if (match) hits.set(key, { itemId: match.item.id, similarity: round(nearest.score) });
        } catch (err: any) {
          logger.warn({ userId, err: err?.message }, 'Duplicate check failed for an item (non-fatal)');
        }
      }));
      return hits;
    },

    /** Drops a removed item's vector so it stops appearing in searches. Never throws. */
    async forget(item: Pick<CatalogItem, 'userId' | 'attributes'>): Promise<void> {
      const vectorId = vectorIdOf(item);
      if (!vectorId) return;
      await index.remove([vectorId]).catch((err: any) => {
        // Harmless if it stays: results are re-checked against active catalog rows.
        logger.warn({ vectorId, err: err?.message }, 'Could not delete the vector of a removed item');
      });
    },
  };
}

const correlation = () => `sim_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const toMatches = (data: any): VectorMatch[] => (Array.isArray(data?.matches) ? data.matches : [])
  .filter((match: any) => typeof match?.id === 'string' && typeof match?.score === 'number')
  .map((match: any) => ({ id: match.id, score: match.score }));

export const similarityService = createSimilarityService(
  {
    async neighboursOf(vectorId, topK, filter) {
      const data: any = await aiClient.searchEmbeddingsById(vectorId, topK, VECTOR_NAMESPACE, filter, correlation());
      return { found: data?.found !== false, matches: toMatches(data) };
    },
    async nearest(embedding, topK, filter) {
      return toMatches(await aiClient.searchEmbeddings(embedding, topK, VECTOR_NAMESPACE, filter, correlation()));
    },
    async remove(vectorIds) {
      await aiClient.deleteEmbeddings(vectorIds, VECTOR_NAMESPACE, correlation());
    },
  },
  { duplicateThreshold: config.duplicateSimilarity },
);
