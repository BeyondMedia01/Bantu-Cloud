import React from 'react';
import { Edit, Trash, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import type { Employee } from '../../types/employee';
import { ReportsAPI } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { StatusBadge } from '../common/StatusBadge';
import { getAvatarGradient } from '@/lib/avatarGradient';
import { usePermissions } from '../../hooks/usePermissions';
import { DataTable } from '../ui/data-table';

interface EmployeeTableProps {
  employees: Employee[];
  onDelete: (id: string, name: string) => void;
}

const EmployeeTable: React.FC<EmployeeTableProps> = ({ employees, onDelete }) => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { can } = usePermissions();

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

  const columns = React.useMemo<ColumnDef<Employee, any>[]>(() => [
    {
      id: 'employee',
      accessorFn: row => `${row.firstName} ${row.lastName}`,
      header: 'Employee',
      size: 220,
      enableSorting: true,
      cell: ({ row }) => {
        const emp = row.original;
        return (
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs uppercase text-white shrink-0"
              style={getAvatarGradient(`${emp.firstName} ${emp.lastName}`)}
              aria-hidden="true"
            >
              {emp.firstName?.[0]}{emp.lastName?.[0]}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{emp.firstName} {emp.lastName}</p>
              <p className="text-xs text-muted-foreground font-mono-financial">{emp.employeeCode}</p>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: 'employeeCode',
      header: 'ID',
      size: 100,
      enableSorting: true,
      cell: ({ getValue }) => (
        <span className="font-mono-financial text-foreground/70">{getValue()}</span>
      ),
    },
    {
      accessorKey: 'position',
      header: 'Position',
      size: 160,
      enableSorting: true,
      cell: ({ getValue }) => getValue() || '—',
    },
    {
      id: 'department',
      accessorFn: row => row.department?.name ?? '',
      header: 'Department',
      size: 140,
      enableSorting: true,
      cell: ({ getValue }) => getValue() || '—',
    },
    {
      id: 'branch',
      accessorFn: row => row.branch?.name ?? '',
      header: 'Branch',
      size: 120,
      enableSorting: true,
      cell: ({ getValue }) => getValue() || '—',
    },
    {
      id: 'status',
      accessorFn: row => (row.dischargeDate ? 'TERMINATED' : 'ACTIVE'),
      header: 'Status',
      size: 100,
      enableSorting: true,
      cell: ({ getValue }) => (
        <StatusBadge status={getValue()} context="employee" />
      ),
    },
    {
      id: 'actions',
      header: '',
      size: 100,
      enableSorting: false,
      cell: ({ row }) => {
        const emp = row.original;
        return (
          <div
            className="flex items-center gap-1"
            role="group"
            aria-label={`Actions for ${emp.firstName} ${emp.lastName}`}
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => handleDownloadIT7(emp)}
              className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-info transition-colors"
              aria-label={`Download IT7 for ${emp.firstName} ${emp.lastName}`}
              title="Download IT7 Certificate"
            >
              <FileText size={15} aria-hidden="true" />
            </button>
            {can('PEOPLE', 'EDIT') && (
              <button
                onClick={() => navigate(`/employees/${emp.id}/edit`)}
                className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                aria-label={`Edit ${emp.firstName} ${emp.lastName}`}
                title="Edit"
              >
                <Edit size={15} aria-hidden="true" />
              </button>
            )}
            {can('PEOPLE', 'DELETE') && (
              <button
                onClick={() => onDelete(emp.id, `${emp.firstName} ${emp.lastName}`)}
                className="p-1.5 hover:bg-destructive-bg rounded-lg text-muted-foreground hover:text-destructive transition-colors"
                aria-label={`Delete ${emp.firstName} ${emp.lastName}`}
                title="Delete"
              >
                <Trash size={15} aria-hidden="true" />
              </button>
            )}
          </div>
        );
      },
    },
  ], [can, navigate, onDelete]);

  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
      <DataTable
        data={employees}
        columns={columns}
        frozenColumns={1}
        virtual={employees.length > 80}
        maxHeight={600}
        showDensityToggle
        rowClassName={(emp) => emp.dischargeDate ? 'opacity-60' : undefined}
        onRowClick={(emp) => navigate(`/employees/${emp.id}/edit`)}
        emptyState={
          <div className="flex flex-col items-center gap-2 py-4">
            <p className="font-medium text-foreground">No employees found</p>
            <p className="text-xs text-muted-foreground">Try adjusting your search or filters</p>
          </div>
        }
      />
    </div>
  );
};

export default EmployeeTable;
