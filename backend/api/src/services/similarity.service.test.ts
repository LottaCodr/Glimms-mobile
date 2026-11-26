/**
 * Similarity rules, against a real database and a fake vector index that
 * ranks by cosine similarity like the real one.
 */
import { createSimilarityService, VectorIndex, vectorIdOf } from './similarity.service';
import { catalogService } from './catalog.service';
import { setupTestDatabase, TestDatabase } from '../test/testDatabase';
import { createUser, SAMPLE_ITEM, UNKNOWN_ID } from '../test/fixtures';

type Stored = { vector: number[]; metadata: Record<string, unknown> };

function fakeIndex() {
  const vectors = new Map<string, Stored>();
  const calls: Array<{ op: string; filter?: Record<string, unknown>; topK?: number }> = [];
  let down = false;
  const cosine = (a: number[], b: number[]) => {
    const dot = a.reduce((sum, value, i) => sum + value * b[i], 0);
    return dot / (Math.hypot(...a) * Math.hypot(...b));
  };
  const rank = (query: number[], topK: number, filter: Record<string, unknown>, skip?: string) =>
    [...vectors.entries()]
      .filter(([id, stored]) => id !== skip && Object.entries(filter).every(([key, value]) => stored.metadata[key] === value))
      .map(([id, stored]) => ({ id, score: cosine(query, stored.vector) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

  const index: VectorIndex = {
    async neighboursOf(vectorId, topK, filter) {
      calls.push({ op: 'neighbours', filter, topK });
      if (down) throw new Error('vector store unavailable');
      const stored = vectors.get(vectorId);
      return stored ? { found: true, matches: rank(stored.vector, topK, filter, vectorId) } : { found: false, matches: [] };
    },
    async nearest(embedding, topK, filter) {
      calls.push({ op: 'nearest', filter, topK });
      if (down) throw new Error('vector store unavailable');
      return rank(embedding, topK, filter);
    },
    async remove(ids) {
      calls.push({ op: 'remove' });
      if (down) throw new Error('vector store unavailable');
      ids.forEach((id) => vectors.delete(id));
    },
  };
  return { index, vectors, calls, setDown: (value: boolean) => { down = value; } };
}

let database: TestDatabase;
beforeAll(async () => { database = await setupTestDatabase(); });
afterAll(async () => { await database.close(); });
beforeEach(async () => { await database.reset(); });

type Fake = ReturnType<typeof fakeIndex>;
const make = (fake: Fake, duplicateThreshold = 0.93) =>
  createSimilarityService(fake.index, { duplicateThreshold, presign: async (key) => `https://cdn.test/${key}` });

/** A catalog item with a style vector, as the scan pipeline leaves it. */
async function scanned(fake: Fake, userId: string, label: string, category: string, vector: number[], vertical = 'wardrobe') {
  const vectorId = `${userId}:item_${label.replace(/\W/g, '')}`;
  const item = await catalogService.create(userId, {
    ...SAMPLE_ITEM, vertical, label, category, imageKey: `users/${userId}/${label}.jpg`, attributes: { vectorId },
  });
  fake.vectors.set(vectorId, { vector, metadata: { user_id: userId, vertical } });
  return item;
}

describe('forItem', () => {
  it('returns the user\'s most similar items, closest first, with a score and image link', async () => {
    const fake = fakeIndex();
    const user = await createUser();
    const shirt = await scanned(fake, user.id, 'white shirt', 'top', [1, 0, 0]);
    await scanned(fake, user.id, 'cream blouse', 'top', [0.95, 0.3, 0]);
    await scanned(fake, user.id, 'black boots', 'shoes', [0, 0, 1]);
    await scanned(fake, user.id, 'ivory tee', 'top', [0.99, 0.1, 0]);

    const result = await make(fake).forItem(shirt.id, user.id, { limit: 2 });

    expect(result.available).toBe(true);
    expect(result.items.map((item) => item.label)).toEqual(['ivory tee', 'cream blouse']);
    expect(result.items[0].similarity).toBeGreaterThan(result.items[1].similarity);
    expect(result.items[0].similarity).toBeLessThanOrEqual(1);
    expect(result.items[0].imageUrl).toBe(`https://cdn.test/users/${user.id}/ivory tee.jpg`);
  });

  it('in pairs mode returns only items from other categories', async () => {
    const fake = fakeIndex();
    const user = await createUser();
    const shirt = await scanned(fake, user.id, 'white shirt', 'top', [1, 0, 0]);
    await scanned(fake, user.id, 'ivory tee', 'Top', [0.99, 0.1, 0]);
    await scanned(fake, user.id, 'beige chinos', 'bottom', [0.8, 0.6, 0]);
    await scanned(fake, user.id, 'black boots', 'shoes', [0.1, 0, 1]);

    const result = await make(fake).forItem(shirt.id, user.id, { mode: 'pairs' });
    expect(result.items.map((item) => item.label)).toEqual(['beige chinos', 'black boots']);
  });

  it('never returns another user\'s items, even identical ones', async () => {
    const fake = fakeIndex();
    const user = await createUser();
    const other = await createUser();
    const shirt = await scanned(fake, user.id, 'white shirt', 'top', [1, 0, 0]);
    await scanned(fake, other.id, 'their shirt', 'top', [1, 0, 0]);

    const result = await make(fake).forItem(shirt.id, user.id);
    expect(result).toEqual({ available: true, items: [] });
    expect(fake.calls[0].filter).toEqual({ user_id: user.id, vertical: 'wardrobe' });
  });

  it('stays within the item\'s vertical and skips items the user removed', async () => {
    const fake = fakeIndex();
    const user = await createUser();
    const shirt = await scanned(fake, user.id, 'white shirt', 'top', [1, 0, 0]);
    await scanned(fake, user.id, 'white sofa', 'seating', [1, 0, 0], 'room');
    const removed = await scanned(fake, user.id, 'old tee', 'top', [0.99, 0.1, 0]);
    await catalogService.remove(removed.id, user.id);
    await scanned(fake, user.id, 'cream blouse', 'top', [0.9, 0.4, 0]);

    const result = await make(fake).forItem(shirt.id, user.id);
    expect(result.items.map((item) => item.label)).toEqual(['cream blouse']);
  });

  it('reports unavailable for an item with no vector, or whose vector was never stored', async () => {
    const fake = fakeIndex();
    const user = await createUser();
    const manual = await catalogService.create(user.id, SAMPLE_ITEM);
    expect(await make(fake).forItem(manual.id, user.id)).toEqual({ available: false, items: [] });
    expect(fake.calls).toHaveLength(0);

    const lost = await scanned(fake, user.id, 'white shirt', 'top', [1, 0, 0]);
    fake.vectors.clear();
    expect(await make(fake).forItem(lost.id, user.id)).toEqual({ available: false, items: [] });
  });

  it('ignores a vector id that names another user\'s vector', async () => {
    const fake = fakeIndex();
    const user = await createUser();
    const other = await createUser();
    await scanned(fake, other.id, 'their shirt', 'top', [1, 0, 0]);
    // attributes come from the client on POST /catalog, so this can be forged.
    const forged = await catalogService.create(user.id, { ...SAMPLE_ITEM, attributes: { vectorId: `${other.id}:item_theirshirt` } });

    expect(vectorIdOf(forged)).toBeNull();
    expect(await make(fake).forItem(forged.id, user.id)).toEqual({ available: false, items: [] });
    expect(fake.calls).toHaveLength(0);
  });

  it('answers 404 for a missing item, 403 for someone else\'s, and 503 when the index is down', async () => {
    const fake = fakeIndex();
    const user = await createUser();
    const other = await createUser();
    const theirs = await scanned(fake, other.id, 'their shirt', 'top', [1, 0, 0]);
    const mine = await scanned(fake, user.id, 'white shirt', 'top', [1, 0, 0]);
    const service = make(fake);

    await expect(service.forItem(UNKNOWN_ID, user.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.forItem(theirs.id, user.id)).rejects.toMatchObject({ statusCode: 403 });
    fake.setDown(true);
    await expect(service.forItem(mine.id, user.id)).rejects.toMatchObject({ statusCode: 503, code: 'SIMILARITY_UNAVAILABLE' });
  });
});

describe('findDuplicates', () => {
  it('flags a new item whose nearest existing item is above the threshold', async () => {
    const fake = fakeIndex();
    const user = await createUser();
    const shirt = await scanned(fake, user.id, 'white shirt', 'top', [1, 0, 0]);
    await scanned(fake, user.id, 'black boots', 'shoes', [0, 0, 1]);

    const hits = await make(fake).findDuplicates(user.id, 'wardrobe', [
      { key: 'same-shirt', embedding: [0.999, 0.02, 0] },
      { key: 'different', embedding: [0.6, 0.8, 0] },
    ]);

    expect([...hits.keys()]).toEqual(['same-shirt']);
    expect(hits.get('same-shirt')).toMatchObject({ itemId: shirt.id });
    expect(hits.get('same-shirt')!.similarity).toBeGreaterThan(0.99);
  });

  it('respects the configured threshold', async () => {
    const fake = fakeIndex();
    const user = await createUser();
    await scanned(fake, user.id, 'white shirt', 'top', [1, 0, 0]);
    const candidate = [{ key: 'k', embedding: [0.9, 0.44, 0] }]; // cosine ≈ 0.90

    expect((await make(fake, 0.93).findDuplicates(user.id, 'wardrobe', candidate)).size).toBe(0);
    expect((await make(fake, 0.85).findDuplicates(user.id, 'wardrobe', candidate)).size).toBe(1);
  });

  it('only compares with the same user\'s items in the same vertical, and not with removed items', async () => {
    const fake = fakeIndex();
    const user = await createUser();
    const other = await createUser();
    await scanned(fake, other.id, 'their shirt', 'top', [1, 0, 0]);
    await scanned(fake, user.id, 'white sofa', 'seating', [1, 0, 0], 'room');
    const removed = await scanned(fake, user.id, 'old shirt', 'top', [1, 0, 0]);
    await catalogService.remove(removed.id, user.id);

    const hits = await make(fake).findDuplicates(user.id, 'wardrobe', [{ key: 'k', embedding: [1, 0, 0] }]);
    expect(hits.size).toBe(0);
  });

  it('never throws, and checks at most twelve items per scan', async () => {
    const fake = fakeIndex();
    const user = await createUser();
    const many = Array.from({ length: 30 }, (_, i) => ({ key: `k${i}`, embedding: [1, 0, 0] }));

    await make(fake).findDuplicates(user.id, 'wardrobe', many);
    expect(fake.calls.filter((call) => call.op === 'nearest')).toHaveLength(12);

    fake.setDown(true);
    await expect(make(fake).findDuplicates(user.id, 'wardrobe', many)).resolves.toEqual(new Map());
  });
});

describe('forget', () => {
  it('deletes the vector of a removed item and tolerates failure', async () => {
    const fake = fakeIndex();
    const user = await createUser();
    const shirt = await scanned(fake, user.id, 'white shirt', 'top', [1, 0, 0]);
    const service = make(fake);

    await service.forget(shirt);
    expect(fake.vectors.size).toBe(0);

    fake.setDown(true);
    await expect(service.forget(shirt)).resolves.toBeUndefined();
  });

  it('does nothing for an item without a vector of its own', async () => {
    const fake = fakeIndex();
    const user = await createUser();
    await make(fake).forget(await catalogService.create(user.id, SAMPLE_ITEM));
    expect(fake.calls).toHaveLength(0);
  });
});
