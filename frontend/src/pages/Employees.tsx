import React, { useEffect, useState, useCallback } from 'react';
import { EmployeeAPI, BranchAPI, DepartmentAPI } from '../api/client';
import { getActiveCompanyId } from '../lib/companyContext';
import type { Employee, EmployeeFilters as IFilters } from '../types/employee';
import type { Branch, Department } from '../types/common';
import { useToast } from '../context/ToastContext';
import ConfirmModal from '../components/common/ConfirmModal';

// Components
import EmployeeTable from '../components/employees/EmployeeTable';
import EmployeeFilters from '../components/employees/EmployeeFilters';
import EmployeeActions from '../components/employees/EmployeeActions';
import EmployeeTableSkeleton from '../components/employees/EmployeeTableSkeleton';

const Employees: React.FC = () => {
  const { showToast } = useToast();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [filters, setFilters] = useState<IFilters>({
    search: '',
    branch: '',
    department: '',
    employmentType: '',
  });

  // Reactive company ID — updates when AppShell sets it asynchronously
  const [companyId, setCompanyId] = useState<string | null>(() => getActiveCompanyId());

  useEffect(() => {
    const handle = () => setCompanyId(getActiveCompanyId());
    window.addEventListener('activeCompanyChanged', handle);
    return () => window.removeEventListener('activeCompanyChanged', handle);
  }, []);

  const fetchDependencies = useCallback(async () => {
    if (!companyId) return;
    try {
      const [bRes, dRes] = await Promise.all([
        BranchAPI.getAll({ companyId }),
        DepartmentAPI.getAll({ companyId }),
      ]);
      setBranches(bRes.data);
      setDepartments(dRes.data);
    } catch (error) {
      console.error('Failed to fetch dependencies', error);
    }
  }, [companyId]);

  const fetchEmployees = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const params: Record<string, string> = { companyId };
      if (filters.search) params.search = filters.search;
      if (filters.branch) params.branchId = filters.branch;
      if (filters.department) params.departmentId = filters.department;
      if (filters.employmentType) params.employmentType = filters.employmentType;

      const response = await EmployeeAPI.getAll(params);
      setEmployees(response.data.data);
      setTotal(response.data.total);
    } catch (error) {
      console.error('Failed to fetch employees', error);
    } finally {
      setLoading(false);
    }
  }, [companyId, filters]);

  useEffect(() => {
    fetchDependencies();
  }, [fetchDependencies]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchEmployees();
    }, 300); // Debounce search
    return () => clearTimeout(timer);
  }, [fetchEmployees]);

  const handleFilterChange = (field: keyof IFilters, value: string) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  const handleDelete = (id: string, name: string) => {
    setDeleteTarget({ id, name });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await EmployeeAPI.delete(deleteTarget.id);
      fetchEmployees();
      showToast('Employee deleted successfully', 'success');
    } catch {
      showToast('Failed to delete employee. Please try again.', 'error');
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div className="flex flex-col gap-8 animate-in fade-in duration-500">
      {deleteTarget && (
        <ConfirmModal
          title="Delete Employee"
          message={`Are you sure you want to delete ${deleteTarget.name}? This action cannot be undone.`}
          confirmLabel="Delete Employee"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      <EmployeeActions total={total} />
      
      <EmployeeFilters 
        filters={filters} 
        onFilterChange={handleFilterChange}
        branches={branches}
        departments={departments}
        total={total}
      />

      {loading ? (
        <EmployeeTableSkeleton />
      ) : (
        <EmployeeTable 
          employees={employees} 
          onDelete={handleDelete} 
        />
      )}
    </div>
  );
};

export default Employees;
