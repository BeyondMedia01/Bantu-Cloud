import React from 'react';

const EmployeeTableSkeleton: React.FC = () => {
  return (
    <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden animate-pulse">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border bg-slate-50">
              {['Employee', 'ID', 'Position', 'Department', 'Branch', 'Status', 'Actions'].map((h) => (
                <th key={h} className="px-5 py-4 text-xs font-bold text-slate-300 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {[...Array(5)].map((_, i) => (
              <tr key={i}>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-slate-100"></div>
                    <div className="space-y-2">
                      <div className="h-3 w-24 bg-slate-100 rounded"></div>
                      <div className="h-2 w-16 bg-slate-50 rounded"></div>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4"><div className="h-3 w-16 bg-slate-100 rounded"></div></td>
                <td className="px-5 py-4"><div className="h-3 w-20 bg-slate-100 rounded"></div></td>
                <td className="px-5 py-4"><div className="h-3 w-20 bg-slate-100 rounded"></div></td>
                <td className="px-5 py-4"><div className="h-3 w-16 bg-slate-100 rounded"></div></td>
                <td className="px-5 py-4"><div className="h-6 w-16 bg-slate-100 rounded-full"></div></td>
                <td className="px-5 py-4"><div className="flex gap-2"><div className="h-8 w-8 bg-slate-50 rounded-lg"></div><div className="h-8 w-8 bg-slate-50 rounded-lg"></div></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default EmployeeTableSkeleton;
