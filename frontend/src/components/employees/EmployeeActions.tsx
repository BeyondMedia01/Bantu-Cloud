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
          A total of <span className="text-accent-blue font-bold">{total}</span> personnel in the system.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate('/employees/import')}
          className="flex items-center gap-2 border border-border text-slate-600 px-5 py-3 rounded-full font-bold hover:bg-slate-50 transition-colors"
        >
          <Upload size={16} /> Bulk Import
        </button>
        <button
          onClick={() => navigate('/employees/new')}
          className="bg-brand text-navy px-6 py-3 rounded-full font-bold shadow-lg hover:opacity-90 transition-all flex items-center gap-2 group"
        >
          <span className="p-1 bg-navy/5 rounded-full group-hover:bg-navy/10 transition-colors">
            <Plus size={18} />
          </span>
          Add Employee
        </button>
      </div>
    </header>
  );
};

export default EmployeeActions;
