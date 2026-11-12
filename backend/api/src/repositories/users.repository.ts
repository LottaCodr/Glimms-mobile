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
  emailVerifiedAt: 'email_verified_at',
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
  emailVerifiedAt: 'email_verified_at',
  googleSub:    'google_sub',
  appleSub:     'apple_sub',
  createdAt:    { column: 'created_at', readOnly: true },
  updatedAt:    { column: 'updated_at', readOnly: true },
});

export const USERS_EMAIL_UNIQUE = 'users_email_key';

export const usersRepository = {
  /** Throws a unique violation on `USERS_EMAIL_UNIQUE` if the email is taken. */
  async create(
    data: {
      email: string; passwordHash: string | null; name?: string | null; tier?: Tier;
      emailVerifiedAt?: Date | null; googleSub?: string | null; appleSub?: string | null;
    },
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
    patch: Partial<Pick<User, 'name' | 'avatarUrl' | 'tier' | 'isActive' | 'emailVerifiedAt'>>,
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

  /** For the auth service only — includes the password hash and identities. */
  async findCredentialsById(id: string, db: Queryable = getDb()): Promise<UserCredentials | null> {
    const { rows } = await db.query(`select ${credentials.columns} from users where id = $1`, [id]);
    return rows[0] ? credentials.toEntity(rows[0]) : null;
  },

  async findCredentialsByEmail(email: string, db: Queryable = getDb()): Promise<UserCredentials | null> {
    const { rows } = await db.query(`select ${credentials.columns} from users where email = $1`, [email]);
    return rows[0] ? credentials.toEntity(rows[0]) : null;
  },

  /** Looks an account up by its Google or Apple subject id. */
  async findCredentialsByIdentity(
    provider: 'google' | 'apple',
    subject: string,
    db: Queryable = getDb(),
  ): Promise<UserCredentials | null> {
    const column = provider === 'google' ? 'google_sub' : 'apple_sub';
    const { rows } = await db.query(`select ${credentials.columns} from users where ${column} = $1`, [subject]);
    return rows[0] ? credentials.toEntity(rows[0]) : null;
  },

  /** Auth-only fields. `passwordHash: null` removes the password. */
  async updateCredentials(
    id: string,
    patch: Partial<Pick<UserCredentials, 'passwordHash' | 'googleSub' | 'appleSub' | 'emailVerifiedAt' | 'name'>>,
    db: Queryable = getDb(),
  ): Promise<void> {
    const set = credentials.toAssignments(patch, 2);
    if (!set) return;
    await db.query(`update users set ${set.sql} where id = $1`, [id, ...set.values]);
  },

  /** Removes the user and, by cascade, every row that belongs to them. */
  async delete(id: string, db: Queryable = getDb()): Promise<boolean> {
    const result = await db.query('delete from users where id = $1', [id]);
    return result.rowCount > 0;
  },
};
