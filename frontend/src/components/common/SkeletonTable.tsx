import React from 'react';

const bar = (w: string) => <div className={`h-3 ${w} bg-slate-100 rounded`} />;

interface SkeletonTableProps {
  headers: string[];
  rows?: number;
}

/**
 * Generic animated skeleton for any data table.
 * - First column named "Employee" or "Name" gets avatar + two-line layout
 * - Columns named "Status" get a pill shape
 * - Empty-string / "Actions" last column gets button placeholders
 */
const SkeletonTable: React.FC<SkeletonTableProps> = ({ headers, rows = 6 }) => {
  const firstIsAvatar = /employee|name/i.test(headers[0] || '');

  const cellContent = (h: string, ci: number) => {
    if (ci === 0 && firstIsAvatar) {
      return (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-slate-100 shrink-0" />
          <div className="space-y-2">
            <div className="h-3 w-24 bg-slate-100 rounded" />
            <div className="h-2 w-14 bg-slate-50 rounded" />
          </div>
        </div>
      );
    }
    if (ci === 0) {
      return (
        <div className="space-y-2">
          {bar('w-24')}
          {bar('w-16')}
        </div>
      );
    }
    if (/status/i.test(h)) return <div className="h-6 w-20 bg-slate-100 rounded-full" />;
    if (h === '' || /actions/i.test(h)) {
      return (
        <div className="flex gap-2">
          <div className="h-7 w-16 bg-slate-100 rounded-full" />
          <div className="h-7 w-12 bg-slate-50 rounded-full" />
        </div>
      );
    }
    const widths = ['w-20', 'w-16', 'w-24', 'w-14', 'w-20'];
    return bar(widths[ci % widths.length]);
  };

  return (
    <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden animate-pulse">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border bg-slate-50">
              {headers.map((h, i) => (
                <th key={i} className="px-5 py-4 text-xs font-bold text-slate-300 uppercase tracking-wider whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {Array.from({ length: rows }).map((_, ri) => (
              <tr key={ri}>
                {headers.map((h, ci) => (
                  <td key={ci} className="px-5 py-4">{cellContent(h, ci)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SkeletonTable;
