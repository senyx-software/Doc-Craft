import { useState, useMemo } from 'react';

// Shared client-side pagination — every table that adopts it gets the same
// page-size, page-clamping, and slicing behavior instead of reimplementing it.
export function usePagination<T>(items: T[], pageSize = 8) {
  const [requestedPage, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  const page = Math.min(requestedPage, totalPages);

  const paged = useMemo(
    () => items.slice((page - 1) * pageSize, page * pageSize),
    [items, page, pageSize]
  );

  return { page, setPage, totalPages, paged, pageSize, totalItems: items.length };
}
