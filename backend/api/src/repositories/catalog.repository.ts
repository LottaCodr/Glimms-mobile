import { getDb, Queryable } from '../db';
import { TableMapper } from '../db/tableMapper';
import type { CatalogItem } from '../models';
import { escapeLike, Page, toLimitOffset } from './pagination';

const catalogItems = new TableMapper<CatalogItem>('catalog_items', {
  id:           { column: 'id', readOnly: true },
  userId:       'user_id',
  vertical:     'vertical',
  label:        'label',
  category:     'category',
  color:        { column: 'color', json: true },
  texture:      'texture',
  pattern:      'pattern',
  imageKey:     'image_key',
  thumbnailKey: 'thumbnail_key',
  confidence:   'confidence',
  attributes:   { column: 'attributes', json: true },
  tags:         'tags',
  styleTags:    'style_tags',
  isActive:     'is_active',
  createdAt:    { column: 'created_at', readOnly: true },
  updatedAt:    { column: 'updated_at', readOnly: true },
});

/** Every writable column, so that multi-row inserts share one column list. */
export type NewCatalogItem = Omit<CatalogItem, 'id' | 'isActive' | 'createdAt' | 'updatedAt'>;

export interface CatalogFilters {
  vertical?: string;
  /** Case-insensitive substring match. */
  category?: string;
  /** Exact match against one of the item's tags. */
  tag?: string;
}

function activeItemsWhere(userId: string, filters: CatalogFilters): { sql: string; values: unknown[] } {
  const conditions = ['user_id = $1', 'is_active'];
  const values: unknown[] = [userId];
  if (filters.vertical) {
    values.push(filters.vertical);
    conditions.push(`vertical = $${values.length}`);
  }
  if (filters.category) {
    values.push(`%${escapeLike(filters.category)}%`);
    conditions.push(`category ilike $${values.length}`);
  }
  if (filters.tag) {
    values.push([filters.tag]);
    conditions.push(`tags @> $${values.length}::text[]`); // served by the GIN index
  }
  return { sql: conditions.join(' and '), values };
}

export const catalogRepository = {
  async insertMany(items: NewCatalogItem[], db: Queryable = getDb()): Promise<CatalogItem[]> {
    if (items.length === 0) return [];
    const values: unknown[] = [];
    let columns: string[] = [];
    const tuples = items.map((item) => {
      const write = catalogItems.toWrite(item, values.length + 1);
      columns = write.columns;
      values.push(...write.values);
      return `(${write.placeholders.join(', ')})`;
    });
    const { rows } = await db.query(
      `insert into catalog_items (${columns.join(', ')}) values ${tuples.join(', ')}
       returning ${catalogItems.columns}`,
      values,
    );
    return catalogItems.toEntities(rows);
  },

  async listActive(userId: string, filters: CatalogFilters, page: Page, db: Queryable = getDb()): Promise<CatalogItem[]> {
    const where = activeItemsWhere(userId, filters);
    const { limit, offset } = toLimitOffset(page);
    const { rows } = await db.query(
      `select ${catalogItems.columns} from catalog_items
       where ${where.sql}
       order by created_at desc, id desc
       limit $${where.values.length + 1} offset $${where.values.length + 2}`,
      [...where.values, limit, offset],
    );
    return catalogItems.toEntities(rows);
  },

  async countActive(userId: string, filters: CatalogFilters = {}, db: Queryable = getDb()): Promise<number> {
    const where = activeItemsWhere(userId, filters);
    const { rows } = await db.query<{ total: number }>(
      `select count(*)::int as total from catalog_items where ${where.sql}`,
      where.values,
    );
    return rows[0].total;
  },

  /** Not scoped to an owner: the service distinguishes "missing" (404) from "not yours" (403). */
  async findActiveById(id: string, db: Queryable = getDb()): Promise<CatalogItem | null> {
    const { rows } = await db.query(
      `select ${catalogItems.columns} from catalog_items where id = $1 and is_active`,
      [id],
    );
    return rows[0] ? catalogItems.toEntity(rows[0]) : null;
  },

  /** The user's active items whose style vector is one of `vectorIds` (attributes.vectorId). */
  async findActiveByVectorIds(userId: string, vectorIds: string[], db: Queryable = getDb()): Promise<CatalogItem[]> {
    if (vectorIds.length === 0) return [];
    const { rows } = await db.query(
      `select ${catalogItems.columns} from catalog_items
       where user_id = $1 and is_active and attributes ? 'vectorId'
         and attributes ->> 'vectorId' = any($2::text[])`,
      [userId, vectorIds],
    );
    return catalogItems.toEntities(rows);
  },

  async update(
    id: string,
    patch: Partial<Pick<CatalogItem, 'label' | 'tags' | 'styleTags' | 'attributes' | 'isActive'>>,
    db: Queryable = getDb(),
  ): Promise<CatalogItem | null> {
    const set = catalogItems.toAssignments(patch, 2);
    if (!set) return this.findActiveById(id, db);
    const { rows } = await db.query(
      `update catalog_items set ${set.sql} where id = $1 returning ${catalogItems.columns}`,
      [id, ...set.values],
    );
    return rows[0] ? catalogItems.toEntity(rows[0]) : null;
  },
};
