import { Search, UserPlus, Trash, Users as UsersIcon, Eye, Calculator, Download as DownloadIcon, Check, X, Key, ShieldAlert, XCircle } from 'lucide-react';
import { PayrollUserAPI } from '../api/client';
import { useState, useEffect } from 'react';
import ConfirmModal from '../components/common/ConfirmModal';
import { useToast } from '../context/ToastContext';

const PayrollUsers: React.FC<{ activeCompanyId?: string | null }> = ({ activeCompanyId }) => {
  const { showToast } = useToast();
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchUsers = async () => {
    try {
      setFetchError(null);
      const response = await PayrollUserAPI.getAll();
      setUsers(response.data);
    } catch (error) {
      console.error('Failed to fetch payroll users');
      setFetchError('Failed to load payroll users. Please check your connection.');
    }
  };

  useEffect(() => {
    if (activeCompanyId) {
      fetchUsers();
    }
  }, [activeCompanyId]);

  const handleDelete = (id: string) => setDeleteTarget(id);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await PayrollUserAPI.delete(deleteTarget);
      fetchUsers();
    } catch {
      showToast('Failed to delete user', 'error');
    } finally {
      setDeleteTarget(null);
    }
  };

  const filteredUsers = users.filter(user => 
    user.fullName.toLowerCase().includes(search.toLowerCase()) ||
    user.email.toLowerCase().includes(search.toLowerCase())
  );

  const getRoleStyle = (role: string) => {
    switch (role) {
      case 'ADMIN': return 'bg-purple-50 text-purple-600 border-purple-100';
      case 'PAYROLL_OFFICER': return 'bg-accent-blue/10 text-accent-blue border-accent-blue/20';
      case 'AUDITOR': return 'bg-amber-50 text-amber-600 border-amber-100';
      default: return 'bg-slate-100 text-slate-500 border-slate-200';
    }
  };

  const PermissionTag = ({ active, label, icon: Icon }: { active: boolean, label: string, icon: any }) => (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[10px] font-black uppercase tracking-tight ${active ? 'bg-emerald-50 text-accent-green border-emerald-100' : 'bg-slate-50 text-slate-400 border-slate-100 opacity-50'}`}>
        <Icon size={12} />
        {label}
        {active ? <Check size={12} className="ml-1" /> : <X size={12} className="ml-1" />}
    </div>
  );

  return (
    <div className="flex flex-col gap-8">
      {deleteTarget && (
        <ConfirmModal
          title="Remove User"
          message="Are you sure you want to remove this user? This revokes all system access."
          confirmLabel="Remove"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-navy mb-1">Access Control</h2>
          <p className="text-slate-500 font-medium">Manage user roles, system access, and fine-grained data permissions.</p>
        </div>
        <button
          onClick={() => { showToast('Feature coming soon', 'success'); }}
          className="bg-brand text-navy px-6 py-3 rounded-[9999px] font-bold shadow-lg hover:opacity-90 transition-opacity flex items-center gap-2"
        >
          <UserPlus size={20} /> Invite New User
        </button>
      </header>

      {/* RBAC Info Card */}
      <div className="bg-gradient-to-br from-navy to-slate-800 rounded-3xl p-6 text-white flex flex-col md:flex-row gap-6 items-start md:items-center shadow-xl shadow-slate-200">
        <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center border border-white/10 shrink-0">
          <Key size={32} className="text-accent-blue" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-bold mb-1">Robust Role-Based Access Control (RBAC)</h3>
          <p className="text-sm text-slate-500 leading-relaxed">
            Roles define base templates (e.g., Auditors view everything, Officers edit payroll). <strong>Granular Permissions</strong> override these defaults, giving you surgical control over exactly what each user can execute, edit, or export. <i>Admins automatically inherit all permissions.</i>
          </p>
        </div>
      </div>

      {fetchError && (
        <div className="bg-red-50 text-red-600 border border-red-200 rounded-2xl p-4 flex items-center gap-3 shadow-sm">
          <XCircle size={20} className="text-red-500 shrink-0" />
          <p className="text-sm font-medium">{fetchError}</p>
        </div>
      )}

      {/* Table Section */}
      <div className="bg-primary rounded-3xl border border-border shadow-sm overflow-hidden">
        <div className="p-4 px-6 border-b border-border bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search by name or email..."
                aria-label="Search users"
                className="w-full pl-10 pr-4 py-2 bg-white border border-border rounded-xl text-sm focus:outline-none focus:border-accent-blue focus:ring-2 focus:ring-accent-blue/30 shadow-sm"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest">
               <UsersIcon size={14} /> {filteredUsers.length} Users Active
            </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-border">
                <th className="px-6 py-5 text-xs font-black text-slate-400 uppercase tracking-widest w-[250px]">Identity</th>
                <th className="px-6 py-5 text-xs font-black text-slate-400 uppercase tracking-widest">Role Level</th>
                <th className="px-6 py-5 text-xs font-black text-slate-400 uppercase tracking-widest">Granular Permissions</th>
                <th className="px-6 py-5 text-xs font-black text-slate-400 uppercase tracking-widest">Status / Last Login</th>
                <th className="px-6 py-5 text-xs font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredUsers.length > 0 ? filteredUsers.map(user => (
                <tr key={user.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-slate-200 border-2 border-white shadow-sm flex items-center justify-center text-slate-500 font-bold text-xs uppercase">
                        {user.fullName[0]}{user.fullName.split(' ')[1]?.[0] || ''}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-navy truncate">{user.fullName}</p>
                        <p className="text-[10px] text-slate-400 font-semibold truncate">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                     <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border ${getRoleStyle(user.role)}`}>
                        {user.role.replace('_', ' ')}
                     </span>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex flex-wrap gap-1.5 max-w-[280px]">
                       <PermissionTag active={user.canProcessPayroll} label="Run Payroll" icon={Calculator} />
                       <PermissionTag active={user.canEditEmployees} label="Edit Staff" icon={UsersIcon} />
                       <PermissionTag active={user.canViewReports} label="View Reports" icon={Eye} />
                      <PermissionTag active={user.canExportData} label="Export" icon={DownloadIcon} />
                    </div>
                  </td>
                  <td className="px-6 py-5">
                     <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5">
                           <div className={`w-2 h-2 rounded-full ${user.isActive ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500'}`} />
                           <span className={`text-[10px] font-black uppercase tracking-widest ${user.isActive ? 'text-accent-green' : 'text-red-500'}`}>
                              {user.isActive ? 'Active' : 'Suspended'}
                           </span>
                        </div>
                        <p className="text-[9px] font-bold text-slate-400 uppercase">
                           {user.lastLogin ? `Seen: ${new Date(user.lastLogin).toLocaleDateString()}` : 'Never logged in'}
                        </p>
                     </div>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => { showToast('Feature coming soon', 'success'); }}
                        className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-navy transition-colors"
                        title="Edit Permissions"
                      >
                        <ShieldAlert size={16} />
                      </button>
                      <button 
                        onClick={() => handleDelete(user.id)}
                        className="p-2 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 transition-colors"
                        title="Revoke Access"
                      >
                        <Trash size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                   <td colSpan={5} className="px-6 py-24 text-center">
                      <div className="flex flex-col items-center gap-4 text-slate-300">
                         <div className="p-4 bg-slate-50 rounded-full border border-border border-dashed">
                            <UsersIcon size={48} className="opacity-20" />
                         </div>
                         <p className="italic font-medium">No users found. Invite an administrator to get started.</p>
                      </div>
                   </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Settings management modal would go here. For now, we rely on the list view. Note: Full implementaion of UserForm Modal goes here, similar to TaxBands */}
    </div>
  );
};

export default PayrollUsers;
