import React from 'react';
import { Search, Users as UsersIcon } from 'lucide-react';
import type { EmployeeFilters as IFilters } from '../../types/employee';

interface EmployeeFiltersProps {
  filters: IFilters;
  onFilterChange: (field: keyof IFilters, value: string) => void;
  branches: any[];
  departments: any[];
  total: number;
}

const EMPLOYMENT_TYPES = ['PERMANENT', 'CONTRACT', 'TEMPORARY', 'PART_TIME'];

const EmployeeFilters: React.FC<EmployeeFiltersProps> = ({ 
  filters, 
  onFilterChange, 
  branches, 
  departments,
  total 
}) => {
  return (
    <div className="flex flex-col lg:flex-row gap-3">
      {/* Search Input */}
      <div className="bg-primary rounded-2xl border border-border shadow-sm px-4 py-3 flex items-center gap-3 flex-1 transition-all focus-within:ring-2 focus-within:ring-accent-blue/10 focus-within:border-accent-blue">
        <Search size={16} className="text-slate-400 shrink-0" />
        <input
          type="text"
          placeholder="Search by name, code, or position…"
          className="flex-1 bg-transparent focus:outline-none font-medium placeholder:text-slate-300 text-sm text-navy"
          value={filters.search}
          onChange={(e) => onFilterChange('search', e.target.value)}
        />
        <div className="flex items-center gap-2 pl-3 border-l border-border text-slate-400 shrink-0">
          <UsersIcon size={14} />
          <span className="text-sm font-bold text-slate-500">{total}</span>
        </div>
      </div>

      {/* Select Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <select
          value={filters.branch}
          onChange={(e) => onFilterChange('branch', e.target.value)}
          className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm font-bold text-navy focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue shadow-sm transition-all"
        >
          <option value="">All Branches</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>

        <select
          value={filters.department}
          onChange={(e) => onFilterChange('department', e.target.value)}
          className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm font-bold text-navy focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue shadow-sm transition-all"
        >
          <option value="">All Departments</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>

        <select
          value={filters.employmentType}
          onChange={(e) => onFilterChange('employmentType', e.target.value)}
          className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm font-bold text-navy focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue shadow-sm transition-all"
        >
          <option value="">All Types</option>
          {EMPLOYMENT_TYPES.map((t) => (
            <option key={t} value={t}>{t.replace('_', ' ')}</option>
          ))}
        </select>
      </div>
    </div>
  );
};

export default EmployeeFilters;
