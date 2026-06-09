/**
 * The reusable pagination payload. It lives INSIDE the response envelope's `data`
 * (the global interceptor still adds `meta:{requestId,timestamp}` around it), so a
 * paginated list comes back as:
 *   { data: { items: [...], meta: PageMeta }, meta: { requestId, timestamp } }
 */
export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface Paginated<T> {
  items: T[];
  meta: PageMeta;
}

/** Build a `Paginated<T>` from the page's rows + the total row count. */
export function paginate<T>(
  items: T[],
  total: number,
  query: { page: number; pageSize: number },
): Paginated<T> {
  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  return {
    items,
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages,
      hasNext: query.page < totalPages,
      hasPrev: query.page > 1,
    },
  };
}
