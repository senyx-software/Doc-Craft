import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';

import type { SortState } from '../../hooks/useSortToggle';

interface SortableHeaderProps<K extends string> {
  label: string;
  sortKey: K;
  sort: SortState<K> | null;
  onSort: (key: K) => void;
  align?: 'left' | 'right';
  className?: string;
}

function SortableHeader<K extends string>({ label, sortKey, sort, onSort, align = 'left', className = '' }: SortableHeaderProps<K>) {
  const isActive = sort?.key === sortKey;
  const Icon = isActive ? (sort!.direction === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;

  return (
    <th className={`pb-3 font-bold ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}>
      <button
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 hover:text-gray-900 dark:hover:text-white transition-colors ${
          align === 'right' ? 'flex-row-reverse' : ''
        } ${isActive ? 'text-gray-900 dark:text-white' : ''}`}
      >
        {label}
        <Icon size={11} className={isActive ? 'text-purple-500' : 'text-gray-400 dark:text-gray-600'} />
      </button>
    </th>
  );
}

export default SortableHeader;
