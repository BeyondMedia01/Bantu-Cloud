import React from 'react';
import { Plus, Upload } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface EmployeeActionsProps {
  total: number;
}

const EmployeeActions: React.FC<EmployeeActionsProps> = ({ total }) => {
  const navigate = useNavigate();

  return (
    <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div>
        <h1 className="text-2xl font-bold text-navy">Employees</h1>
        <p className="text-slate-500 font-medium text-sm">
          A total of <span className="text-accent-green font-bold">{total}</span> personnel in the system.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate('/employees/import')}
          className="flex items-center gap-1.5 border border-border text-slate-600 px-4 py-2 rounded-full font-bold text-sm hover:bg-slate-50 transition-colors"
        >
          <Upload size={14} /> Bulk Import
        </button>
        <button
          onClick={() => navigate('/employees/new')}
          className="bg-brand text-navy px-4 py-2 rounded-full font-bold text-sm shadow hover:opacity-90 transition-all flex items-center gap-1.5"
        >
          <Plus size={14} />
          Add Employee
        </button>
      </div>
    </header>
  );
};

export default EmployeeActions;
