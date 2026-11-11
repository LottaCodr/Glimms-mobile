import { getDb, Queryable } from '../db';
import { TableMapper } from '../db/tableMapper';
import type { DesignSession, StepStatus } from '../models';
import { Page, toLimitOffset } from './pagination';

const designSessions = new TableMapper<DesignSession>('design_sessions', {
  // Writable: the service generates the id up front because S3 object keys embed it.
  id:              'id',
  userId:          'user_id',
  vertical:        'vertical',
  status:          'status',
  progress:        'progress',
  steps:           { column: 'steps', json: true },
  inputContext:    { column: 'input_context', json: true },
  inferredContext: { column: 'inferred_context', json: true },
  sourceImages:    { column: 'source_images', json: true },
  pipelineVersion: 'pipeline_version',
  correlationId:   'correlation_id',
  warnings:        'warnings',
  designs:         { column: 'designs', json: true },
  artifacts:       { column: 'artifacts', json: true },
  error:           { column: 'error', json: true },
  completedAt:     'completed_at',
  createdAt:       { column: 'created_at', readOnly: true },
  updatedAt:       { column: 'updated_at', readOnly: true },
});

export type NewDesignSession =
  Pick<DesignSession, 'id' | 'userId' | 'vertical' | 'correlationId'>
  & Partial<Pick<DesignSession, 'status' | 'progress' | 'inputContext' | 'sourceImages' | 'pipelineVersion'>>;

/** Whole-column replacements. `steps` is merged instead — see `update`. */
export type DesignSessionPatch = Partial<Pick<
  DesignSession,
  'status' | 'progress' | 'inferredContext' | 'sourceImages' | 'warnings' | 'designs' | 'artifacts' | 'error' | 'completedAt'
>>;

export interface DesignSessionSummary {
  id: string;
  status: DesignSession['status'];
  vertical: DesignSession['vertical'];
  progress: number;
  createdAt: Date;
  imageCount: number;
  designCount: number;
}

export const designSessionsRepository = {
  async create(data: NewDesignSession, db: Queryable = getDb()): Promise<DesignSession> {
    const write = designSessions.toWrite(data);
    const { rows } = await db.query(
      `insert into design_sessions (${write.columns.join(', ')}) values (${write.placeholders.join(', ')})
       returning ${designSessions.columns}`,
      write.values,
    );
    return designSessions.toEntity(rows[0]);
  },

  async findById(id: string, db: Queryable = getDb()): Promise<DesignSession | null> {
    const { rows } = await db.query(`select ${designSessions.columns} from design_sessions where id = $1`, [id]);
    return rows[0] ? designSessions.toEntity(rows[0]) : null;
  },

  /** List view — counts are computed in SQL so the jsonb payloads are not shipped. */
  async listSummariesByUser(userId: string, page: Page, db: Queryable = getDb()): Promise<DesignSessionSummary[]> {
    const { limit, offset } = toLimitOffset(page);
    const { rows } = await db.query<{
      id: string; status: DesignSession['status']; vertical: DesignSession['vertical']; progress: number;
      created_at: Date; image_count: number; design_count: number;
    }>(
      `select id, status, vertical, progress, created_at,
              jsonb_array_length(source_images) as image_count,
              jsonb_array_length(designs)       as design_count
       from design_sessions
       where user_id = $1
       order by created_at desc, id desc
       limit $2 offset $3`,
      [userId, limit, offset],
    );
    return rows.map((row) => ({
      id: row.id, status: row.status, vertical: row.vertical, progress: row.progress,
      createdAt: row.created_at, imageCount: row.image_count, designCount: row.design_count,
    }));
  },

  async countByUser(userId: string, db: Queryable = getDb()): Promise<number> {
    const { rows } = await db.query<{ total: number }>(
      'select count(*)::int as total from design_sessions where user_id = $1',
      [userId],
    );
    return rows[0].total;
  },

  /**
   * Applies a patch and returns the updated session (null if it does not exist).
   *
   * `stepUpdates` is merged into the existing `steps` object inside the UPDATE
   * (`steps || $n`), not read-modify-written, so pipeline steps that finish at
   * the same moment cannot overwrite each other's status.
   */
  async update(
    id: string,
    patch: DesignSessionPatch,
    stepUpdates?: Record<string, StepStatus>,
    db: Queryable = getDb(),
  ): Promise<DesignSession | null> {
    const set = designSessions.toAssignments(patch, 2);
    const assignments = set ? [set.sql] : [];
    const values: unknown[] = [id, ...(set?.values ?? [])];
    if (stepUpdates && Object.keys(stepUpdates).length > 0) {
      values.push(JSON.stringify(stepUpdates));
      assignments.push(`steps = steps || $${values.length}::jsonb`);
    }
    if (assignments.length === 0) return this.findById(id, db);

    const { rows } = await db.query(
      `update design_sessions set ${assignments.join(', ')} where id = $1 returning ${designSessions.columns}`,
      values,
    );
    return rows[0] ? designSessions.toEntity(rows[0]) : null;
  },

  /** Atomic append (the Mongo `$push`). */
  async appendWarnings(id: string, warnings: string[], db: Queryable = getDb()): Promise<void> {
    if (warnings.length === 0) return;
    await db.query('update design_sessions set warnings = warnings || $2::text[] where id = $1', [id, warnings]);
  },
};
