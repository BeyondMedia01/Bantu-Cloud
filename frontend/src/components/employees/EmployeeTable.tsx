import React from 'react';
import { Edit, Trash, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Employee } from '../../types/employee';
import { ReportsAPI } from '../../api/client';
import { useToast } from '../../context/ToastContext';

interface EmployeeTableProps {
  employees: Employee[];
  onDelete: (id: string) => void;
}

const EmployeeTable: React.FC<EmployeeTableProps> = ({ employees, onDelete }) => {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const handleDownloadIT7 = async (employee: Employee) => {
    try {
      const year = new Date().getFullYear();
      const response = await ReportsAPI.it7(employee.id, year);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `IT7-${employee.employeeCode || employee.lastName}-${year}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      showToast('Failed to generate IT7 certificate. Ensure there is completed payroll data for this year.', 'error');
    }
  };

  return (
    <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border bg-slate-50">
              {['Employee', 'ID', 'Position', 'Department', 'Branch', 'Status', 'Actions'].map((h) => (
                <th 
                  key={h} 
                  className={`px-5 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider ${
                    (h === 'Department' || h === 'Branch') ? 'hidden md:table-cell' : ''
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {employees.length > 0 ? employees.map((emp) => (
              <tr 
                key={emp.id} 
                className={`hover:bg-slate-50/50 transition-colors ${emp.dischargeDate ? 'bg-muted/50' : ''}`}
              >
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-slate-100 border border-border flex items-center justify-center text-slate-400 font-bold text-xs uppercase">
                      {emp.firstName?.[0]}{emp.lastName?.[0]}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-navy">{emp.firstName} {emp.lastName}</p>
                      <p className="text-xs text-slate-400 font-semibold">{emp.employeeCode}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4 text-sm font-medium text-slate-600">
                  {emp.employeeCode}
                </td>
                <td className="px-5 py-4 text-sm font-medium text-slate-600">
                  {emp.position || '—'}
                </td>
                <td className="px-5 py-4 text-sm font-medium text-slate-600 hidden md:table-cell">
                  {emp.department?.name || '—'}
                </td>
                <td className="px-5 py-4 text-sm font-medium text-slate-600 hidden md:table-cell">
                  {emp.branch?.name || '—'}
                </td>
                <td className="px-5 py-4">
                  {emp.dischargeDate ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700">
                      Discharged
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-50 text-green-700">
                      Active
                    </span>
                  )}
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleDownloadIT7(emp)}
                      className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-blue-600 transition-colors"
                      title="Download IT7 Certificate"
                    >
                      <FileText size={16} />
                    </button>
                    <button
                      onClick={() => navigate(`/employees/${emp.id}/edit`)}
                      className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-navy transition-colors"
                      title="Edit"
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      onClick={() => onDelete(emp.id)}
                      className="p-2 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 transition-colors"
                      title="Delete"
                    >
                      <Trash size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-slate-400 font-medium font-inter">
                  No employees found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default EmployeeTable;
