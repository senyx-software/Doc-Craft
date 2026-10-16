import React from 'react';

export interface SortState<K extends string> {
  key: K;
  direction: 'asc' | 'desc';
}

// Generic comparator used alongside SortableHeader — keeps the "click header
// to sort" behavior identical everywhere it's used instead of each table
// hand-rolling its own compare function.
export function sortRows<T>(rows: T[], sort: SortState<string> | null, getValue: (row: T, key: string) => unknown): T[] {
  if (!sort) return rows;
  const sorted = [...rows].sort((a, b) => {
    const av = getValue(a, sort.key);
    const bv = getValue(b, sort.key);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'number' && typeof bv === 'number') return av - bv;
    return String(av).localeCompare(String(bv));
  });
  return sort.direction === 'asc' ? sorted : sorted.reverse();
}

export function useSortToggle<K extends string>() {
  const [sort, setSort] = React.useState<SortState<K> | null>(null);
  const toggleSort = (key: K) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, direction: 'asc' };
      if (prev.direction === 'asc') return { key, direction: 'desc' };
      return null;
    });
  };
  return { sort, toggleSort };
}
