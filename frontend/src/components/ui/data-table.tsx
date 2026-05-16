import * as React from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type Row,

} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronUp, ChevronDown, ChevronsUpDown, AlignJustify, AlignCenter } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

export type { ColumnDef };

type Density = 'compact' | 'normal';

interface DataTableProps<TData> {
  data: TData[];
  columns: ColumnDef<TData, any>[];
  /** Freeze the first N columns (default: 0). Use 1 for employee name columns. */
  frozenColumns?: number;
  /** Enable virtualized scrolling — required for lists > ~100 rows */
  virtual?: boolean;
  /** Estimated row height in px for virtualizer (default: 48 for normal, 36 for compact) */
  estimatedRowHeight?: number;
  /** Max height for the scroll container when virtual=true */
  maxHeight?: number | string;
  /** Empty state content */
  emptyState?: React.ReactNode;
  /** Show density toggle button */
  showDensityToggle?: boolean;
  /** Controlled density */
  density?: Density;
  onDensityChange?: (d: Density) => void;
  className?: string;
  /** Called when a row is clicked */
  onRowClick?: (row: TData) => void;
  /** Highlight a row */
  rowClassName?: (row: TData, index: number) => string | undefined;
}

// ── Sort icon ─────────────────────────────────────────────────────────────────

function SortIcon({ sorted }: { sorted: false | 'asc' | 'desc' }) {
  if (sorted === 'asc')  return <ChevronUp  size={13} className="shrink-0 text-brand" aria-hidden />;
  if (sorted === 'desc') return <ChevronDown size={13} className="shrink-0 text-brand" aria-hidden />;
  return <ChevronsUpDown size={13} className="shrink-0 opacity-30 group-hover:opacity-60 transition-opacity" aria-hidden />;
}

// ── Main component ────────────────────────────────────────────────────────────

export function DataTable<TData>({
  data,
  columns,
  frozenColumns = 0,
  virtual = false,
  estimatedRowHeight,
  maxHeight = 600,
  emptyState,
  showDensityToggle = false,
  density: controlledDensity,
  onDensityChange,
  className,
  onRowClick,
  rowClassName,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [internalDensity, setInternalDensity] = React.useState<Density>('normal');

  const density = controlledDensity ?? internalDensity;
  const rowHeight = estimatedRowHeight ?? (density === 'compact' ? 36 : 48);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const { rows } = table.getRowModel();

  // ── Virtualizer ──────────────────────────────────────────────────────────

  const scrollRef = React.useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 10,
    enabled: virtual,
  });

  const virtualItems = virtual ? virtualizer.getVirtualItems() : null;
  const totalSize   = virtual ? virtualizer.getTotalSize() : 0;

  // ── Frozen column sticky offsets ─────────────────────────────────────────

  const headerGroups = table.getHeaderGroups();
  const leafHeaders  = headerGroups[headerGroups.length - 1].headers;

  // Pre-compute cumulative left offsets for frozen columns
  const stickyOffsets = React.useMemo(() => {
    const offsets: number[] = [];
    let acc = 0;
    for (let i = 0; i < frozenColumns; i++) {
      offsets.push(acc);
      // Use the column's declared size, fallback to 180
      acc += (leafHeaders[i]?.column.getSize() ?? 180);
    }
    return offsets;
  }, [frozenColumns, leafHeaders]);

  function cellClass(colIndex: number, extra?: string) {
    const frozen = colIndex < frozenColumns;
    return cn(
      density === 'compact' ? 'px-4 py-2' : 'px-5 py-3.5',
      'text-sm tabular-num',
      frozen && 'sticky z-10 bg-[var(--color-card)] after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-border',
      extra,
    );
  }

  function headerCellClass(colIndex: number, canSort: boolean) {
    const frozen = colIndex < frozenColumns;
    return cn(
      density === 'compact' ? 'px-4 py-2.5' : 'px-5 py-3.5',
      'text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground select-none',
      canSort && 'cursor-pointer group hover:text-foreground transition-colors',
      frozen && 'sticky z-20 bg-muted/80 after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-border',
    );
  }

  // ── Density toggle ────────────────────────────────────────────────────────

  function toggleDensity() {
    const next: Density = density === 'normal' ? 'compact' : 'normal';
    setInternalDensity(next);
    onDensityChange?.(next);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={cn('flex flex-col', className)}>
      {showDensityToggle && (
        <div className="flex justify-end px-4 py-2 border-b border-border bg-muted/30">
          <button
            onClick={toggleDensity}
            title={density === 'compact' ? 'Switch to normal density' : 'Switch to compact density'}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-muted"
          >
            {density === 'compact'
              ? <AlignCenter size={14} />
              : <AlignJustify size={14} />
            }
            {density === 'compact' ? 'Normal' : 'Compact'}
          </button>
        </div>
      )}

      <div
        ref={scrollRef}
        className="overflow-auto scroll-x-shadow"
        style={virtual ? { maxHeight, overflowY: 'auto' } : undefined}
      >
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 z-30">
            {headerGroups.map(hg => (
              <tr key={hg.id} className="border-b border-border bg-muted/60 backdrop-blur-sm">
                {hg.headers.map((header, colIndex) => (
                  <th
                    key={header.id}
                    colSpan={header.colSpan}
                    scope="col"
                    onClick={header.column.getCanSort() ? header.column.getToggleSortingHandler() : undefined}
                    className={headerCellClass(colIndex, header.column.getCanSort())}
                    style={colIndex < frozenColumns ? { left: stickyOffsets[colIndex] } : undefined}
                    aria-sort={
                      header.column.getIsSorted() === 'asc' ? 'ascending'
                      : header.column.getIsSorted() === 'desc' ? 'descending'
                      : header.column.getCanSort() ? 'none' : undefined
                    }
                  >
                    {header.isPlaceholder ? null : (
                      <span className="inline-flex items-center gap-1.5">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getCanSort() && (
                          <SortIcon sorted={header.column.getIsSorted()} />
                        )}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>

          <tbody
            className="divide-y divide-border"
            style={virtual ? { height: totalSize, position: 'relative' } : undefined}
          >
            {data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-6 py-16 text-center text-muted-foreground text-sm"
                >
                  {emptyState ?? 'No data'}
                </td>
              </tr>
            ) : virtual && virtualItems ? (
              virtualItems.map(vi => {
                const row = rows[vi.index];
                return (
                  <VirtualRow
                    key={row.id}
                    row={row}
                    virtualItem={vi}
                    frozenColumns={frozenColumns}
                    stickyOffsets={stickyOffsets}
                    cellClass={cellClass}
                    onRowClick={onRowClick}
                    rowClassName={rowClassName}
                  />
                );
              })
            ) : (
              rows.map((row, i) => (
                <StaticRow
                  key={row.id}
                  row={row}
                  rowIndex={i}
                  frozenColumns={frozenColumns}
                  stickyOffsets={stickyOffsets}
                  cellClass={cellClass}
                  onRowClick={onRowClick}
                  rowClassName={rowClassName}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Row sub-components ────────────────────────────────────────────────────────

interface RowProps<TData> {
  row: Row<TData>;
  rowIndex?: number;
  frozenColumns: number;
  stickyOffsets: number[];
  cellClass: (colIndex: number, extra?: string) => string;
  onRowClick?: (row: TData) => void;
  rowClassName?: (row: TData, index: number) => string | undefined;
  virtualItem?: { start: number; size: number; index: number };
}

function StaticRow<TData>({
  row, rowIndex = 0, frozenColumns, stickyOffsets, cellClass, onRowClick, rowClassName,
}: RowProps<TData>) {
  const extra = rowClassName?.(row.original, rowIndex);
  return (
    <tr
      onClick={onRowClick ? () => onRowClick(row.original) : undefined}
      className={cn(
        'transition-colors hover:bg-muted/50',
        onRowClick && 'cursor-pointer',
        extra,
      )}
    >
      {row.getVisibleCells().map((cell, colIndex) => (
        <td
          key={cell.id}
          className={cellClass(colIndex, 'text-foreground/90')}
          style={colIndex < frozenColumns ? { left: stickyOffsets[colIndex] } : undefined}
        >
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </td>
      ))}
    </tr>
  );
}

function VirtualRow<TData>({
  row, frozenColumns, stickyOffsets, cellClass, onRowClick, rowClassName, virtualItem,
}: RowProps<TData>) {
  const extra = rowClassName?.(row.original, virtualItem?.index ?? 0);
  return (
    <tr
      data-index={virtualItem?.index}
      onClick={onRowClick ? () => onRowClick(row.original) : undefined}
      className={cn(
        'absolute w-full transition-colors hover:bg-muted/50',
        onRowClick && 'cursor-pointer',
        extra,
      )}
      style={{
        transform: `translateY(${virtualItem?.start ?? 0}px)`,
        height: virtualItem?.size,
      }}
    >
      {row.getVisibleCells().map((cell, colIndex) => (
        <td
          key={cell.id}
          className={cellClass(colIndex, 'text-foreground/90')}
          style={colIndex < frozenColumns ? { left: stickyOffsets[colIndex] } : undefined}
        >
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </td>
      ))}
    </tr>
  );
}
