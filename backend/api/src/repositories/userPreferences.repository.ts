import { getDb, Queryable } from '../db';
import { TableMapper } from '../db/tableMapper';
import type { UserPreferences } from '../models';

const preferences = new TableMapper<UserPreferences>('user_preferences', {
  id:          { column: 'id', readOnly: true },
  userId:      'user_id',
  occupation:  'occupation',
  styleGoals:  'style_goals',
  occasions:   'occasions',
  culturalCtx: 'cultural_ctx',
  location:    { column: 'location', json: true },
  createdAt:   { column: 'created_at', readOnly: true },
  updatedAt:   { column: 'updated_at', readOnly: true },
});

export type PreferencesPatch = Partial<
  Pick<UserPreferences, 'occupation' | 'styleGoals' | 'occasions' | 'culturalCtx' | 'location'>
>;

export const userPreferencesRepository = {
  async findByUserId(userId: string, db: Queryable = getDb()): Promise<UserPreferences | null> {
    const { rows } = await db.query(
      `select ${preferences.columns} from user_preferences where user_id = $1`,
      [userId],
    );
    return rows[0] ? preferences.toEntity(rows[0]) : null;
  },

  /** Creates the row or updates only the provided fields — one atomic statement. */
  async upsert(userId: string, patch: PreferencesPatch, db: Queryable = getDb()): Promise<UserPreferences> {
    const write = preferences.toWrite({ ...patch, userId });
    const updates = write.columns
      .filter((column) => column !== 'user_id')
      .map((column) => `${column} = excluded.${column}`);
    // With nothing to change, still touch a column so RETURNING yields the row.
    const onConflict = updates.length > 0 ? updates.join(', ') : 'user_id = excluded.user_id';

    const { rows } = await db.query(
      `insert into user_preferences (${write.columns.join(', ')})
       values (${write.placeholders.join(', ')})
       on conflict (user_id) do update set ${onConflict}
       returning ${preferences.columns}`,
      write.values,
    );
    return preferences.toEntity(rows[0]);
  },
};
