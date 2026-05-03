import React from 'react';
import { Search, Users as UsersIcon, ChevronDown } from 'lucide-react';
import { Dropdown } from '@/components/ui/dropdown';
import type { EmployeeFilters as IFilters } from '../../types/employee';
import type { Branch, Department } from '../../types/common';

interface EmployeeFiltersProps {
  filters: IFilters;
  onFilterChange: (field: keyof IFilters, value: string) => void;
  branches: Branch[];
  departments: Department[];
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
      <div className="bg-primary rounded-2xl border border-border shadow-sm px-4 py-3 flex items-center gap-3 flex-1 transition-all focus-within:ring-2 focus-within:ring-accent-green/10 focus-within:border-accent-green">
        <Search size={16} className="text-slate-400 shrink-0" aria-hidden="true" />
        <label htmlFor="employee-search" className="sr-only">Search employees</label>
        <input
          id="employee-search"
          type="text"
          placeholder="Search by name, code, or position…"
          className="flex-1 bg-transparent focus:outline-none font-medium placeholder:text-slate-400 text-sm text-navy"
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
        <Dropdown
          className="w-full"
          trigger={(isOpen) => (
            <button type="button" className="w-full bg-primary border border-border rounded-2xl px-4 py-3 text-sm font-bold text-navy shadow-sm flex items-center justify-between hover:border-accent-green transition-colors">
              <span className="truncate">{branches.find(b => b.id === filters.branch)?.name || 'All Branches'}</span>
              <ChevronDown size={14} className={`text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
          )}
          sections={[{ items: [
            { label: 'All Branches', onClick: () => onFilterChange('branch', '') },
            ...branches.map(b => ({ label: b.name, onClick: () => onFilterChange('branch', b.id) })),
          ]}]}
        />

        <Dropdown
          className="w-full"
          trigger={(isOpen) => (
            <button type="button" className="w-full bg-primary border border-border rounded-2xl px-4 py-3 text-sm font-bold text-navy shadow-sm flex items-center justify-between hover:border-accent-green transition-colors">
              <span className="truncate">{departments.find(d => d.id === filters.department)?.name || 'All Departments'}</span>
              <ChevronDown size={14} className={`text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
          )}
          sections={[{ items: [
            { label: 'All Departments', onClick: () => onFilterChange('department', '') },
            ...departments.map(d => ({ label: d.name, onClick: () => onFilterChange('department', d.id) })),
          ]}]}
        />

        <Dropdown
          className="w-full"
          trigger={(isOpen) => (
            <button type="button" className="w-full bg-primary border border-border rounded-2xl px-4 py-3 text-sm font-bold text-navy shadow-sm flex items-center justify-between hover:border-accent-green transition-colors">
              <span className="truncate">{filters.employmentType ? filters.employmentType.replace('_', ' ') : 'All Types'}</span>
              <ChevronDown size={14} className={`text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
          )}
          sections={[{ items: [
            { label: 'All Types', onClick: () => onFilterChange('employmentType', '') },
            ...EMPLOYMENT_TYPES.map(t => ({ label: t.replace('_', ' '), onClick: () => onFilterChange('employmentType', t) })),
          ]}]}
        />
      </div>
    </div>
  );
};

export default EmployeeFilters;
