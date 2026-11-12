/**
 * Schema-level guarantees: the things the database itself must enforce, no
 * matter what application code (or a future script) does.
 */
import { loadMigrations, runMigrations } from './migrate';
import { isPgError, PgErrorCode } from './errors';
import { setupTestDatabase, TestDatabase } from '../test/testDatabase';
import { createUser } from '../test/fixtures';
import {
  designSessionsRepository, savedDesignsRepository, subscriptionsRepository, usersRepository,
} from '../repositories';

let database: TestDatabase;

beforeAll(async () => { database = await setupTestDatabase(); });
afterAll(async () => { await database.close(); });
beforeEach(async () => { await database.reset(); });

const TABLES = [
  'account_erasures', 'account_tokens', 'catalog_items', 'credo_payments', 'design_jobs', 'design_sessions', 'device_tokens', 'refresh_tokens', 'saved_designs', 'stripe_events', 'subscriptions', 'user_preferences', 'users',
];

async function sqlState(run: Promise<unknown>): Promise<string | undefined> {
  try {
    await run;
    return undefined;
  } catch (err) {
    return isPgError(err) ? err.code : `not a pg error: ${String(err)}`;
  }
}

describe('migrations', () => {
  it('are named <timestamp>_<name>.sql and sorted', async () => {
    const migrations = await loadMigrations();
    expect(migrations.length).toBeGreaterThan(0);
    const versions = migrations.map((m) => m.version);
    expect(versions).toEqual([...versions].sort());
    expect(new Set(versions).size).toBe(versions.length);
  });

  it('create every table', async () => {
    const { rows } = await database.db.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public' order by tablename",
    );
    expect(rows.map((r) => r.tablename)).toEqual(TABLES);
  });

  it('are recorded in the Supabase CLI history table and are not re-applied', async () => {
    const expected = (await loadMigrations()).map((m) => `${m.version}_${m.name}`);

    const second = await runMigrations(database.db);
    expect(second).toEqual({ applied: [], skipped: expected });

    const { rows } = await database.db.query<{ version: string; name: string }>(
      'select version, name from supabase_migrations.schema_migrations order by version',
    );
    expect(rows.map((r) => `${r.version}_${r.name}`)).toEqual(expected);
  });

  it('enable row level security on every table, with no policies (deny by default)', async () => {
    const { rows } = await database.db.query<{ relname: string; relrowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' order by c.relname`,
    );
    expect(rows).toEqual(TABLES.map((relname) => ({ relname, relrowsecurity: true })));

    const policies = await database.db.query("select 1 from pg_policies where schemaname = 'public'");
    expect(policies.rows).toHaveLength(0);
  });
});

describe('constraints', () => {
  it('rejects duplicate, non-lowercase and malformed emails', async () => {
    await createUser({ email: 'taken@glimms.ai' });
    const insert = (email: string) => database.db.query('insert into users (email) values ($1)', [email]);

    expect(await sqlState(insert('taken@glimms.ai'))).toBe(PgErrorCode.UniqueViolation);
    expect(await sqlState(insert('Mixed@Glimms.ai'))).toBe(PgErrorCode.CheckViolation);
    expect(await sqlState(insert('not-an-email'))).toBe(PgErrorCode.CheckViolation);
  });

  it('rejects values outside the enumerations', async () => {
    const user = await createUser();
    const db = database.db;

    expect(await sqlState(db.query("update users set tier = 'gold' where id = $1", [user.id])))
      .toBe(PgErrorCode.CheckViolation);
    expect(await sqlState(db.query(
      "insert into design_jobs (user_id, vertical) values ($1, 'kitchen')", [user.id],
    ))).toBe(PgErrorCode.CheckViolation);
    expect(await sqlState(db.query(
      "insert into design_sessions (user_id, vertical, correlation_id, status) values ($1, 'room', 'c', 'paused')", [user.id],
    ))).toBe(PgErrorCode.CheckViolation);
    expect(await sqlState(db.query(
      "insert into design_sessions (user_id, vertical, correlation_id, progress) values ($1, 'room', 'c', 101)", [user.id],
    ))).toBe(PgErrorCode.CheckViolation);
    expect(await sqlState(db.query(
      "insert into device_tokens (user_id, token, platform) values ($1, 't', 'windows')", [user.id],
    ))).toBe(PgErrorCode.CheckViolation);
  });

  it('rejects rows that reference a user that does not exist', async () => {
    expect(await sqlState(database.db.query(
      "insert into design_jobs (user_id, vertical) values ('00000000-0000-4000-8000-000000000000', 'room')",
    ))).toBe(PgErrorCode.ForeignKeyViolation);
  });

  it('allows one subscription and one preferences row per user', async () => {
    const user = await createUser();
    await database.db.query('insert into subscriptions (user_id) values ($1)', [user.id]);
    expect(await sqlState(database.db.query('insert into subscriptions (user_id) values ($1)', [user.id])))
      .toBe(PgErrorCode.UniqueViolation);

    await database.db.query('insert into user_preferences (user_id) values ($1)', [user.id]);
    expect(await sqlState(database.db.query('insert into user_preferences (user_id) values ($1)', [user.id])))
      .toBe(PgErrorCode.UniqueViolation);
  });

  it('requires a preferences location to carry numeric lat/lon', async () => {
    const user = await createUser();
    const insert = (location: string) => database.db.query(
      'insert into user_preferences (user_id, location) values ($1, $2::jsonb)', [user.id, location],
    );
    expect(await sqlState(insert('{"city":"Lagos"}'))).toBe(PgErrorCode.CheckViolation);
    expect(await sqlState(insert('{"lat":"6.5","lon":3.3}'))).toBe(PgErrorCode.CheckViolation);
    expect(await sqlState(insert('{"lat":6.5,"lon":3.3}'))).toBeUndefined();
  });

  it('requires a catalog item colour to carry a dominant swatch', async () => {
    const user = await createUser();
    const insert = (color: string) => database.db.query(
      `insert into catalog_items (user_id, vertical, label, category, color, image_key, confidence)
       values ($1, 'wardrobe', 'shirt', 'top', $2::jsonb, 'k.jpg', 0.5)`, [user.id, color],
    );
    expect(await sqlState(insert('{"mood":"warm"}'))).toBe(PgErrorCode.CheckViolation);
    expect(await sqlState(insert('[]'))).toBe(PgErrorCode.CheckViolation);
    expect(await sqlState(insert('{"dominant":{"hex":"#fff"}}'))).toBeUndefined();
  });
});

describe('referential behaviour', () => {
  it('deleting a user removes everything they own', async () => {
    const user = await createUser();
    const keeper = await createUser();
    const session = await designSessionsRepository.create({
      id: '11111111-1111-4111-8111-111111111111', userId: user.id, vertical: 'room', correlationId: 'cor_1',
    });
    await savedDesignsRepository.create({ userId: user.id, source: { kind: 'session', id: session.id }, items: [] });
    await subscriptionsRepository.upsertStripeCustomer(user.id, 'cus_1');
    await database.db.query(
      "insert into refresh_tokens (user_id, token_hash, expires_at) values ($1, 'h', now() + interval '1 day')", [user.id],
    );

    await database.db.query('delete from users where id = $1', [user.id]);

    for (const table of TABLES.filter((t) => t !== 'users')) {
      const { rows } = await database.db.query<{ n: number }>(`select count(*)::int as n from ${table}`);
      expect({ table, rows: rows[0].n }).toEqual({ table, rows: 0 });
    }
    expect(await usersRepository.findById(keeper.id)).not.toBeNull();
  });

  it('a saved design outlives the session it came from', async () => {
    const user = await createUser();
    const session = await designSessionsRepository.create({
      id: '22222222-2222-4222-8222-222222222222', userId: user.id, vertical: 'room', correlationId: 'cor_2',
    });
    const saved = await savedDesignsRepository.create({
      userId: user.id, source: { kind: 'session', id: session.id }, items: [{ label: 'sofa' }],
    });

    await database.db.query('delete from design_sessions where id = $1', [session.id]);

    expect(await savedDesignsRepository.findById(saved.id)).toMatchObject({ jobId: null, items: [{ label: 'sofa' }] });
  });

  it('maintains updated_at', async () => {
    const user = await createUser();
    await database.db.query("update users set updated_at = now() - interval '1 day' where id = $1", [user.id]);
    const updated = await usersRepository.update(user.id, { name: 'Renamed' });
    expect(Date.now() - updated!.updatedAt.getTime()).toBeLessThan(60_000);
  });
});

describe('stripe webhook persistence', () => {
  it('updates a subscription by customer id and reports unknown customers', async () => {
    const user = await createUser();
    await subscriptionsRepository.upsertStripeCustomer(user.id, 'cus_42');
    const periodEnd = new Date('2031-05-01T00:00:00Z');

    const updated = await subscriptionsRepository.updateByStripeCustomerId('cus_42', {
      stripeSubscriptionId: 'sub_1', status: 'active', currentPeriodEnd: periodEnd, cancelAtPeriodEnd: true,
    });

    expect(updated).toMatchObject({
      userId: user.id, stripeCustomerId: 'cus_42', stripeSubscriptionId: 'sub_1',
      status: 'active', currentPeriodEnd: periodEnd, cancelAtPeriodEnd: true,
    });
    expect(await subscriptionsRepository.updateByStripeCustomerId('cus_missing', { status: 'past_due' })).toBeNull();
  });

  it('rolls the subscription change back when the tier change fails', async () => {
    const user = await createUser();
    await subscriptionsRepository.upsertStripeCustomer(user.id, 'cus_7');

    await expect(database.db.transaction(async (tx) => {
      await subscriptionsRepository.updateByStripeCustomerId('cus_7', { status: 'active' }, tx);
      await usersRepository.update(user.id, { tier: 'platinum' as never }, tx); // violates users_tier_valid
    })).rejects.toMatchObject({ code: PgErrorCode.CheckViolation });

    expect(await subscriptionsRepository.findByUserId(user.id)).toMatchObject({ status: 'inactive' });
    expect(await usersRepository.findById(user.id)).toMatchObject({ tier: 'free' });
  });
});
