import { useState } from 'react';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { cn } from '../../lib/utils';

export type SortDirection = 'asc' | 'desc';

export interface SortState {
  field: string;
  direction: SortDirection;
}

interface SortableTableHeadProps {
  field: string;
  sort: SortState;
  onSort: (field: string) => void;
  children: React.ReactNode;
  className?: string;
}

export function SortableTableHead({ field, sort, onSort, children, className }: SortableTableHeadProps) {
  const isActive = sort.field === field;

  return (
    <th
      className={cn(
        'h-12 px-4 text-left align-middle font-medium text-muted-foreground text-xs cursor-pointer select-none hover:text-foreground transition-colors',
        isActive && 'text-foreground',
        className
      )}
      onClick={() => onSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        {isActive ? (
          sort.direction === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-30" />
        )}
      </div>
    </th>
  );
}

export function useSort(defaultField = 'createdAt', defaultDir: SortDirection = 'desc') {
  const [sort, setSort] = useState<SortState>({ field: defaultField, direction: defaultDir });

  const toggle = (field: string) => {
    setSort(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'desc' ? 'asc' : 'desc',
    }));
  };

  const param = `${sort.field},${sort.direction}`;

  return { sort, toggle, param };
}
