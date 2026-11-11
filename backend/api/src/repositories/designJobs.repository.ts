import { getDb, Queryable } from '../db';
import { TableMapper } from '../db/tableMapper';
import type { DesignJob, DesignJobSummary } from '../models';
import { Page, toLimitOffset } from './pagination';

const designJobs = new TableMapper<DesignJob>('design_jobs', {
  id:          { column: 'id', readOnly: true },
  userId:      'user_id',
  vertical:    'vertical',
  status:      'status',
  imageKeys:   'image_keys',
  contextData: { column: 'context_data', json: true },
  result:      { column: 'result', json: true },
  errorMsg:    'error_msg',
  completedAt: 'completed_at',
  createdAt:   { column: 'created_at', readOnly: true },
  updatedAt:   { column: 'updated_at', readOnly: true },
});

export type DesignJobPatch = Partial<Pick<DesignJob, 'status' | 'result' | 'errorMsg' | 'completedAt'>>;

export const designJobsRepository = {
  async create(
    data: Pick<DesignJob, 'userId' | 'vertical' | 'imageKeys' | 'contextData'>,
    db: Queryable = getDb(),
  ): Promise<DesignJob> {
    const write = designJobs.toWrite(data);
    const { rows } = await db.query(
      `insert into design_jobs (${write.columns.join(', ')}) values (${write.placeholders.join(', ')})
       returning ${designJobs.columns}`,
      write.values,
    );
    return designJobs.toEntity(rows[0]);
  },

  async findById(id: string, db: Queryable = getDb()): Promise<DesignJob | null> {
    const { rows } = await db.query(`select ${designJobs.columns} from design_jobs where id = $1`, [id]);
    return rows[0] ? designJobs.toEntity(rows[0]) : null;
  },

  /** List view — leaves out the (large) result payload. */
  async listSummariesByUser(userId: string, page: Page, db: Queryable = getDb()): Promise<DesignJobSummary[]> {
    const { limit, offset } = toLimitOffset(page);
    const { rows } = await db.query<{
      id: string; vertical: DesignJob['vertical']; status: DesignJob['status']; created_at: Date; completed_at: Date | null;
    }>(
      `select id, vertical, status, created_at, completed_at from design_jobs
       where user_id = $1
       order by created_at desc, id desc
       limit $2 offset $3`,
      [userId, limit, offset],
    );
    return rows.map((row) => ({
      id: row.id, vertical: row.vertical, status: row.status,
      createdAt: row.created_at, completedAt: row.completed_at,
    }));
  },

  async countByUser(userId: string, db: Queryable = getDb()): Promise<number> {
    const { rows } = await db.query<{ total: number }>(
      'select count(*)::int as total from design_jobs where user_id = $1',
      [userId],
    );
    return rows[0].total;
  },

  /** Returns null when the job does not exist (or the patch is empty). */
  async update(id: string, patch: DesignJobPatch, db: Queryable = getDb()): Promise<DesignJob | null> {
    const set = designJobs.toAssignments(patch, 2);
    if (!set) return null;
    const { rows } = await db.query(
      `update design_jobs set ${set.sql} where id = $1 returning ${designJobs.columns}`,
      [id, ...set.values],
    );
    return rows[0] ? designJobs.toEntity(rows[0]) : null;
  },
};
