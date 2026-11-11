import { TableMapper } from './tableMapper';

interface Thing {
  id: string;
  ownerId: string;
  tags: string[];
  payload: unknown;
  createdAt: Date;
}

const things = new TableMapper<Thing>('things', {
  id:        { column: 'id', readOnly: true },
  ownerId:   'owner_id',
  tags:      'tags',
  payload:   { column: 'payload', json: true },
  createdAt: { column: 'created_at', readOnly: true },
});

describe('TableMapper', () => {
  it('lists columns and maps rows to camelCase entities', () => {
    expect(things.columns).toBe('id, owner_id, tags, payload, created_at');
    const createdAt = new Date();
    expect(things.toEntity({ id: '1', owner_id: 'u', tags: ['a'], payload: { x: 1 }, created_at: createdAt, extra: true }))
      .toEqual({ id: '1', ownerId: 'u', tags: ['a'], payload: { x: 1 }, createdAt });
  });

  it('writes only declared, writable, provided properties', () => {
    const write = things.toWrite({
      id: 'forged', ownerId: 'u', tags: undefined, createdAt: new Date(), isAdmin: true,
    } as Partial<Thing>);
    expect(write).toEqual({ columns: ['owner_id'], placeholders: ['$1'], values: ['u'] });
  });

  it('serialises jsonb values — including arrays — and casts the placeholder', () => {
    const write = things.toWrite({ ownerId: 'u', payload: [{ a: 1 }] }, 3);
    expect(write.columns).toEqual(['owner_id', 'payload']);
    expect(write.placeholders).toEqual(['$3', '$4::jsonb']);
    expect(write.values).toEqual(['u', '[{"a":1}]']);
  });

  it('passes text[] values through for the driver and writes null as NULL', () => {
    expect(things.toWrite({ tags: ['a', 'b'], payload: null }).values).toEqual([['a', 'b'], null]);
  });

  it('builds UPDATE assignments, or null when nothing is writable', () => {
    expect(things.toAssignments({ ownerId: 'u', payload: {} }, 2))
      .toEqual({ sql: 'owner_id = $2, payload = $3::jsonb', values: ['u', '{}'] });
    expect(things.toAssignments({ id: 'x' })).toBeNull();
  });
});
