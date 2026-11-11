export interface Page {
  page: number;   // 1-based
  limit: number;
}

export function toLimitOffset({ page, limit }: Page): { limit: number; offset: number } {
  return { limit, offset: (page - 1) * limit };
}

/** Escapes LIKE/ILIKE wildcards so user input only ever matches literally. */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, '\\$&');
}
