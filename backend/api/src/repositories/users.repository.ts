import { getDb, Queryable } from '../db';
import { TableMapper } from '../db/tableMapper';
import type { Tier, User, UserCredentials } from '../models';

// `password_hash` is deliberately absent: a plain `User` can be returned to a
// client as-is. Only `credentials` (used by the auth service) can read it.
const users = new TableMapper<User>('users', {
  id:        { column: 'id', readOnly: true },
  email:     'email',
  name:      'name',
  avatarUrl: 'avatar_url',
  tier:      'tier',
  isActive:  'is_active',
  createdAt: { column: 'created_at', readOnly: true },
  updatedAt: { column: 'updated_at', readOnly: true },
});

const credentials = new TableMapper<UserCredentials>('users', {
  id:           { column: 'id', readOnly: true },
  email:        'email',
  passwordHash: 'password_hash',
  name:         'name',
  avatarUrl:    'avatar_url',
  tier:         'tier',
  isActive:     'is_active',
  createdAt:    { column: 'created_at', readOnly: true },
  updatedAt:    { column: 'updated_at', readOnly: true },
});

export const USERS_EMAIL_UNIQUE = 'users_email_key';

export const usersRepository = {
  /** Throws a unique violation on `USERS_EMAIL_UNIQUE` if the email is taken. */
  async create(
    data: { email: string; passwordHash: string | null; name?: string | null; tier?: Tier },
    db: Queryable = getDb(),
  ): Promise<User> {
    const write = credentials.toWrite(data);
    const { rows } = await db.query(
      `insert into users (${write.columns.join(', ')}) values (${write.placeholders.join(', ')})
       returning ${users.columns}`,
      write.values,
    );
    return users.toEntity(rows[0]);
  },

  async findById(id: string, db: Queryable = getDb()): Promise<User | null> {
    const { rows } = await db.query(`select ${users.columns} from users where id = $1`, [id]);
    return rows[0] ? users.toEntity(rows[0]) : null;
  },

  async findByEmail(email: string, db: Queryable = getDb()): Promise<User | null> {
    const { rows } = await db.query(`select ${users.columns} from users where email = $1`, [email]);
    return rows[0] ? users.toEntity(rows[0]) : null;
  },

  /** For login only — includes the password hash, and only matches active accounts. */
  async findActiveCredentialsByEmail(email: string, db: Queryable = getDb()): Promise<UserCredentials | null> {
    const { rows } = await db.query(
      `select ${credentials.columns} from users where email = $1 and is_active`,
      [email],
    );
    return rows[0] ? credentials.toEntity(rows[0]) : null;
  },

  async update(
    id: string,
    patch: Partial<Pick<User, 'name' | 'avatarUrl' | 'tier' | 'isActive'>>,
    db: Queryable = getDb(),
  ): Promise<User | null> {
    const set = users.toAssignments(patch, 2);
    if (!set) return this.findById(id, db);
    const { rows } = await db.query(
      `update users set ${set.sql} where id = $1 returning ${users.columns}`,
      [id, ...set.values],
    );
    return rows[0] ? users.toEntity(rows[0]) : null;
  },
};
