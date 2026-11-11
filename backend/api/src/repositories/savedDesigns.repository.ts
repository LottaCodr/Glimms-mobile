import { getDb, Queryable } from '../db';
import type { SavedDesign } from '../models';
import { Page, toLimitOffset } from './pagination';

// A saved design points at a legacy job OR a v1 session (two nullable foreign
// keys); the entity exposes whichever is set as `jobId`.
const SELECT = `
  id, user_id, coalesce(job_id, session_id) as source_id, title, items, mockup_url,
  explanation, tips, score, is_favorite, tags, created_at`;

interface SavedDesignRow {
  id: string; user_id: string; source_id: string | null; title: string | null;
  items: Record<string, unknown>[]; mockup_url: string | null; explanation: string | null;
  tips: string[]; score: number; is_favorite: boolean; tags: string[]; created_at: Date;
}

function toEntity(row: SavedDesignRow): SavedDesign {
  return {
    id: row.id, userId: row.user_id, jobId: row.source_id, title: row.title, items: row.items,
    mockupUrl: row.mockup_url, explanation: row.explanation, tips: row.tips, score: row.score,
    isFavorite: row.is_favorite, tags: row.tags, createdAt: row.created_at,
  };
}

export type DesignSource = { kind: 'job'; id: string } | { kind: 'session'; id: string };

export interface NewSavedDesign {
  userId: string;
  source: DesignSource;
  title?: string | null;
  items: Record<string, unknown>[];
  mockupUrl?: string | null;
  explanation?: string | null;
  tips?: string[];
  score?: number;
}

export const savedDesignsRepository = {
  async create(data: NewSavedDesign, db: Queryable = getDb()): Promise<SavedDesign> {
    const { rows } = await db.query<SavedDesignRow>(
      `insert into saved_designs
         (user_id, job_id, session_id, title, items, mockup_url, explanation, tips, score)
       values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)
       returning ${SELECT}`,
      [
        data.userId,
        data.source.kind === 'job' ? data.source.id : null,
        data.source.kind === 'session' ? data.source.id : null,
        data.title ?? null,
        JSON.stringify(data.items),
        data.mockupUrl ?? null,
        data.explanation ?? null,
        data.tips ?? [],
        data.score ?? 0,
      ],
    );
    return toEntity(rows[0]);
  },

  async findById(id: string, db: Queryable = getDb()): Promise<SavedDesign | null> {
    const { rows } = await db.query<SavedDesignRow>(`select ${SELECT} from saved_designs where id = $1`, [id]);
    return rows[0] ? toEntity(rows[0]) : null;
  },

  async listByUser(
    userId: string,
    filters: { favorite?: boolean },
    page: Page,
    db: Queryable = getDb(),
  ): Promise<SavedDesign[]> {
    const { limit, offset } = toLimitOffset(page);
    const { rows } = await db.query<SavedDesignRow>(
      `select ${SELECT} from saved_designs
       where user_id = $1 and ($2::boolean is null or is_favorite = $2)
       order by created_at desc, id desc
       limit $3 offset $4`,
      [userId, filters.favorite ?? null, limit, offset],
    );
    return rows.map(toEntity);
  },

  async countByUser(userId: string, filters: { favorite?: boolean } = {}, db: Queryable = getDb()): Promise<number> {
    const { rows } = await db.query<{ total: number }>(
      `select count(*)::int as total from saved_designs
       where user_id = $1 and ($2::boolean is null or is_favorite = $2)`,
      [userId, filters.favorite ?? null],
    );
    return rows[0].total;
  },

  /** Flips the flag in the database, so concurrent toggles cannot lose an update. */
  async toggleFavorite(id: string, db: Queryable = getDb()): Promise<SavedDesign | null> {
    const { rows } = await db.query<SavedDesignRow>(
      `update saved_designs set is_favorite = not is_favorite where id = $1 returning ${SELECT}`,
      [id],
    );
    return rows[0] ? toEntity(rows[0]) : null;
  },

  async delete(id: string, db: Queryable = getDb()): Promise<void> {
    await db.query('delete from saved_designs where id = $1', [id]);
  },
};
