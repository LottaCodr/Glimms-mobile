import { catalogService } from '../services/catalog.service';
import { setupTestDatabase, TestDatabase } from '../test/testDatabase';
import { createUser, SAMPLE_ITEM as MOCK_ITEM, UNKNOWN_ID } from '../test/fixtures';

let database: TestDatabase;
let MOCK_USER_ID: string;
let OTHER_USER_ID: string;

beforeAll(async () => {
  database = await setupTestDatabase();
});

afterAll(async () => {
  await database.close();
});

beforeEach(async () => {
  await database.reset();
  MOCK_USER_ID = (await createUser()).id;
  OTHER_USER_ID = (await createUser()).id;
});

describe('catalogService.create', () => {
  it('creates an item and returns it', async () => {
    const item = await catalogService.create(MOCK_USER_ID, MOCK_ITEM);
    expect(item.label).toBe('white shirt');
    expect(item.userId).toBe(MOCK_USER_ID);
    expect(item.isActive).toBe(true);
  });
});

describe('catalogService.list', () => {
  beforeEach(async () => {
    await catalogService.create(MOCK_USER_ID, MOCK_ITEM);
    await catalogService.create(MOCK_USER_ID, { ...MOCK_ITEM, vertical: 'room', label: 'sofa', category: 'seating', tags: ['leather', 'modern'], styleTags: ['contemporary'] });
    await catalogService.create(OTHER_USER_ID, MOCK_ITEM);
  });

  it('returns only the requesting user\'s items', async () => {
    const res: any = await catalogService.list(MOCK_USER_ID, {});
    const items = Array.isArray(res) ? res : res.items;
    expect(items.length).toBe(2);
    items.forEach((i: any) => expect(i.userId).toBe(MOCK_USER_ID));
  });

  it('filters by vertical', async () => {
    const res: any = await catalogService.list(MOCK_USER_ID, { vertical: 'room' });
    const items = Array.isArray(res) ? res : res.items;
    expect(items.length).toBe(1);
    expect(items[0].label).toBe('sofa');
  });

  it('filters by tag', async () => {
    const res: any = await catalogService.list(MOCK_USER_ID, { tag: 'cotton' });
    const items = Array.isArray(res) ? res : res.items;
    expect(items.length).toBe(1);
  });

  it('returns empty array for unknown vertical', async () => {
    const res: any = await catalogService.list(MOCK_USER_ID, { vertical: 'garden' });
    const items = Array.isArray(res) ? res : res.items;
    expect(items).toEqual([]);
  });

  it('supports pagination', async () => {
    const res: any = await catalogService.list(MOCK_USER_ID, {}, { page: 1, limit: 1 });
    expect(res.items.length).toBe(1);
    expect(res.total).toBe(2);
    expect(res.totalPages).toBe(2);
  });
});

describe('catalogService.findOne', () => {
  it('returns the item for the owner', async () => {
    const created = await catalogService.create(MOCK_USER_ID, MOCK_ITEM);
    const found = await catalogService.findOne(created.id, MOCK_USER_ID);
    expect(found.label).toBe('white shirt');
  });

  it('throws ForbiddenError for wrong owner', async () => {
    const created = await catalogService.create(MOCK_USER_ID, MOCK_ITEM);
    await expect(
      catalogService.findOne(created.id, OTHER_USER_ID),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('throws NotFoundError for a malformed id', async () => {
    await expect(
      catalogService.findOne('not-a-uuid', MOCK_USER_ID),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws NotFoundError for a legacy Mongo ObjectId', async () => {
    await expect(
      catalogService.findOne('665a1b2c3d4e5f6a7b8c9d0e', MOCK_USER_ID),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws NotFoundError for an unknown id', async () => {
    await expect(catalogService.findOne(UNKNOWN_ID, MOCK_USER_ID)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('catalogService.update', () => {
  it('updates label and tags', async () => {
    const created = await catalogService.create(MOCK_USER_ID, MOCK_ITEM);
    const updated = await catalogService.update(
      created.id, MOCK_USER_ID,
      { label: 'blue shirt', tags: ['linen'] },
    );
    expect(updated!.label).toBe('blue shirt');
    expect(updated!.tags).toContain('linen');
  });
});

describe('catalogService.remove', () => {
  it('soft-deletes the item', async () => {
    const created = await catalogService.create(MOCK_USER_ID, MOCK_ITEM);
    await catalogService.remove(created.id, MOCK_USER_ID);

    const res: any = await catalogService.list(MOCK_USER_ID, {});
    const items = Array.isArray(res) ? res : res.items;
    expect(items.length).toBe(0);
  });
});

describe('catalogService.bulkCreate', () => {
  it('creates multiple items at once', async () => {
    const items = [MOCK_ITEM, { ...MOCK_ITEM, label: 'jeans', category: 'bottom' }];
    const result = await catalogService.bulkCreate(MOCK_USER_ID, items);
    expect(result.length).toBe(2);
  });
});

describe('catalogService — stored shape', () => {
  it('applies schema defaults and returns camelCase with a uuid id', async () => {
    const item = await catalogService.create(MOCK_USER_ID, {
      vertical: 'wardrobe', label: '  linen shirt  ', category: 'top',
      color: { dominant: { hex: '#eeeeee', rgb: { r: 238, g: 238, b: 238 } } },
      imageKey: 'uploads/test/linen.jpg', confidence: 0.5,
    });

    expect(item.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(item).toMatchObject({
      label: 'linen shirt',
      color: { palette: [], mood: 'neutral' },
      texture: null, pattern: null, thumbnailKey: null,
      attributes: {}, tags: [], styleTags: [], isActive: true,
    });
    expect(item.createdAt).toBeInstanceOf(Date);
    expect(item).not.toHaveProperty('_id');
    expect(item).not.toHaveProperty('user_id');
  });

  it('round-trips nested JSON attributes', async () => {
    const attributes = { bbox: { x: 1, y: 2, width: 3, height: 4 }, materials: ['cotton', 'linen'], note: 'it\'s "quoted"' };
    const created = await catalogService.create(MOCK_USER_ID, { ...MOCK_ITEM, attributes });
    const found = await catalogService.findOne(created.id, MOCK_USER_ID);
    expect(found.attributes).toEqual(attributes);
  });

  it('ignores properties a client must not set', async () => {
    const created = await catalogService.create(MOCK_USER_ID, {
      ...MOCK_ITEM, userId: OTHER_USER_ID, isActive: false, id: UNKNOWN_ID,
    } as any);
    expect(created.userId).toBe(MOCK_USER_ID);
    expect(created.isActive).toBe(true);
    expect(created.id).not.toBe(UNKNOWN_ID);
  });

  it('rejects an invalid item with 400', async () => {
    await expect(catalogService.create(MOCK_USER_ID, { ...MOCK_ITEM, confidence: 7 }))
      .rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('catalogService.list — filters', () => {
  it('matches category case-insensitively and treats wildcards literally', async () => {
    await catalogService.create(MOCK_USER_ID, { ...MOCK_ITEM, category: 'Outer_Wear' });
    await catalogService.create(MOCK_USER_ID, { ...MOCK_ITEM, category: 'outerXwear' });

    expect((await catalogService.list(MOCK_USER_ID, { category: 'outer_wear' })).total).toBe(1);
    expect((await catalogService.list(MOCK_USER_ID, { category: '%' })).total).toBe(0);
    expect((await catalogService.list(MOCK_USER_ID, { category: 'OUTER' })).total).toBe(2);
  });

  it('is not injectable through filter values', async () => {
    await catalogService.create(MOCK_USER_ID, MOCK_ITEM);
    const res = await catalogService.list(MOCK_USER_ID, { tag: "x' or '1'='1", category: "'; drop table users; --" });
    expect(res.total).toBe(0);
    expect((await catalogService.list(MOCK_USER_ID, {})).total).toBe(1);
  });

  it('orders newest first', async () => {
    const first = await catalogService.create(MOCK_USER_ID, { ...MOCK_ITEM, label: 'first' });
    await database.db.query("update catalog_items set created_at = now() - interval '1 hour' where id = $1", [first.id]);
    await catalogService.create(MOCK_USER_ID, { ...MOCK_ITEM, label: 'second' });

    const { items } = await catalogService.list(MOCK_USER_ID, {});
    expect(items.map((i) => i.label)).toEqual(['second', 'first']);
  });
});

describe('catalogService.bulkCreate — AI output', () => {
  it('stores the valid items and skips unusable ones', async () => {
    const result = await catalogService.bulkCreate(MOCK_USER_ID, [
      MOCK_ITEM,
      { ...MOCK_ITEM, imageKey: '' },            // detector produced no image key
      { ...MOCK_ITEM, color: { mood: 'warm' } }, // no dominant colour
    ]);
    expect(result).toHaveLength(1);
    expect((await catalogService.list(MOCK_USER_ID, {})).total).toBe(1);
  });
});

describe('catalogService.update', () => {
  it('bumps updatedAt and leaves untouched fields alone', async () => {
    const created = await catalogService.create(MOCK_USER_ID, MOCK_ITEM);
    await database.db.query("update catalog_items set updated_at = now() - interval '1 hour' where id = $1", [created.id]);

    const updated = await catalogService.update(created.id, MOCK_USER_ID, { tags: [] });
    expect(updated!.tags).toEqual([]);
    expect(updated!.label).toBe('white shirt');
    expect(updated!.updatedAt.getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it('refuses to update someone else\'s item', async () => {
    const created = await catalogService.create(MOCK_USER_ID, MOCK_ITEM);
    await expect(catalogService.update(created.id, OTHER_USER_ID, { label: 'mine now' }))
      .rejects.toMatchObject({ statusCode: 403 });
  });
});
