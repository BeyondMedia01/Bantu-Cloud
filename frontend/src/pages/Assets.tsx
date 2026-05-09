import React, { useEffect, useState } from 'react';
import { Package, Plus, X, Search, UserCheck, RotateCcw } from 'lucide-react';
import { AssetAPI } from '../api/client';
import { useToast } from '../context/ToastContext';
import { usePermissions } from '../hooks/usePermissions';
import SkeletonTable from '../components/common/SkeletonTable';
import type { Asset, AssetCategory, AssetStatus } from '../types/domain';

const STATUS_COLORS: Record<string, string> = {
  AVAILABLE: 'bg-green-50 text-green-700 border-green-200',
  ASSIGNED: 'bg-blue-50 text-blue-700 border-blue-200',
  MAINTENANCE: 'bg-amber-50 text-amber-700 border-amber-200',
  RETIRED: 'bg-slate-100 text-slate-500 border-slate-200',
  LOST: 'bg-red-50 text-red-600 border-red-200',
};
const STATUS_OPTS: AssetStatus[] = ['AVAILABLE', 'ASSIGNED', 'MAINTENANCE', 'RETIRED', 'LOST'];

const Assets: React.FC = () => {
  const { showToast } = useToast();
  const { can } = usePermissions();
  const canManage = can('ASSETS');

  const [assets, setAssets] = useState<Asset[]>([]);
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState('');

  // Create asset
  const [showCreate, setShowCreate] = useState(false);
  const [formCat, setFormCat] = useState('');
  const [formName, setFormName] = useState('');
  const [formSerial, setFormSerial] = useState('');
  const [formModel, setFormModel] = useState('');
  const [formCondition, setFormCondition] = useState('GOOD');
  const [formPrice, setFormPrice] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Assign
  const [assignTarget, setAssignTarget] = useState<Asset | null>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [assignEmp, setAssignEmp] = useState('');

  const loadAssets = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filterStatus) params.status = filterStatus;
      if (filterCat) params.categoryId = filterCat;
      const [assetRes, catRes] = await Promise.all([AssetAPI.getAll(params), AssetAPI.getCategories()]);
      setAssets(assetRes.data.data || []);
      setCategories(catRes.data.data || []);
    } catch {
      showToast('Failed to load assets', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAssets(); }, [filterStatus, filterCat]);

  const filtered = assets.filter(a =>
    !search || a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.serialNumber?.toLowerCase().includes(search.toLowerCase()) ||
    a.assignedTo?.firstName?.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCat || !formName) return;
    setSubmitting(true);
    try {
      await AssetAPI.create({
        categoryId: formCat, name: formName, serialNumber: formSerial || undefined,
        model: formModel || undefined, condition: formCondition || undefined,
        purchasePrice: formPrice ? parseFloat(formPrice) : undefined,
        purchaseDate: formDate || undefined, notes: formNotes || undefined,
      });
      showToast('Asset created', 'success');
      setShowCreate(false);
      resetForm();
      loadAssets();
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormCat(''); setFormName(''); setFormSerial(''); setFormModel('');
    setFormCondition('GOOD'); setFormPrice(''); setFormDate(''); setFormNotes('');
  };

  const handleAssign = async () => {
    if (!assignTarget || !assignEmp) return;
    setActionLoading('assign-' + assignTarget.id);
    try {
      await AssetAPI.assign(assignTarget.id, assignEmp);
      showToast('Asset assigned', 'success');
      setAssignTarget(null); setAssignEmp('');
      loadAssets();
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed', 'error');
    } finally {
      setActionLoading('');
    }
  };

  const handleReturn = async (id: string) => {
    setActionLoading('return-' + id);
    try {
      await AssetAPI.return(id);
      showToast('Asset returned', 'success');
      loadAssets();
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed', 'error');
    } finally {
      setActionLoading('');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this asset?')) return;
    setActionLoading('del-' + id);
    try {
      await AssetAPI.delete(id);
      showToast('Asset deleted', 'success');
      loadAssets();
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed', 'error');
    } finally {
      setActionLoading('');
    }
  };

  const openAssign = async (asset: Asset) => {
    setAssignTarget(asset);
    setAssignEmp('');
    try {
      const res = await AssetAPI.getEmployees();
      setEmployees(res.data.data || []);
    } catch { /* ignore */ }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Package size={28} className="text-navy" />
          <h1 className="text-2xl font-semibold text-navy">Assets</h1>
        </div>
        {canManage && (
          <button onClick={() => setShowCreate(true)} className="btn btn-primary flex items-center gap-2">
            <Plus size={18} /> New Asset
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6 flex-wrap items-center">
        <div className="relative flex-1 max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Search assets..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input w-auto" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All statuses</option>
          {STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="input w-auto" value={filterCat} onChange={e => setFilterCat(e.target.value)}>
          <option value="">All categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <span className="text-sm text-slate-500">{filtered.length} assets</span>
      </div>

      {loading ? <SkeletonTable headers={['Name', 'Category', 'Status', 'Assigned To', 'Serial', 'Actions']} rows={6} /> : (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              <Package size={48} className="mx-auto mb-3 text-slate-300" />
              <p className="text-lg font-medium text-slate-400 mb-1">No assets found</p>
              <p>Create your first asset to start tracking.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Name</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Category</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Assigned To</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Serial</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Condition</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map(a => (
                    <tr key={a.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <span className="font-medium text-slate-800">{a.name}</span>
                        {a.model && <span className="text-xs text-slate-400 ml-1">{a.model}</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{a.category?.name}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_COLORS[a.status] || ''}`}>
                          {a.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {a.assignedTo ? (
                          <span>{a.assignedTo.firstName} {a.assignedTo.lastName}</span>
                        ) : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{a.serialNumber || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{a.condition || '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {canManage && a.status === 'AVAILABLE' && (
                            <button onClick={() => openAssign(a)} className="btn btn-sm text-blue-600 hover:bg-blue-50" title="Assign">
                              <UserCheck size={14} />
                            </button>
                          )}
                          {canManage && a.status === 'ASSIGNED' && (
                            <button onClick={() => handleReturn(a.id)} disabled={!!actionLoading} className="btn btn-sm text-amber-600 hover:bg-amber-50" title="Return">
                              <RotateCcw size={14} />
                            </button>
                          )}
                          {canManage && (
                            <button onClick={() => handleDelete(a.id)} disabled={!!actionLoading} className="btn btn-sm text-red-500 hover:bg-red-50" title="Delete">
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Create Asset modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-navy">New Asset</h2>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Category *</label>
                  <select className="input" value={formCat} onChange={e => setFormCat(e.target.value)} required>
                    <option value="">Select category</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Condition</label>
                  <select className="input" value={formCondition} onChange={e => setFormCondition(e.target.value)}>
                    <option value="NEW">New</option>
                    <option value="GOOD">Good</option>
                    <option value="FAIR">Fair</option>
                    <option value="POOR">Poor</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Name *</label>
                <input className="input" value={formName} onChange={e => setFormName(e.target.value)} required placeholder="e.g. Dell Latitude 5420" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Serial Number</label>
                  <input className="input" value={formSerial} onChange={e => setFormSerial(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Model</label>
                  <input className="input" value={formModel} onChange={e => setFormModel(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Purchase Price (USD)</label>
                  <input type="number" step="0.01" min="0" className="input" value={formPrice} onChange={e => setFormPrice(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Purchase Date</label>
                  <input type="date" className="input" value={formDate} onChange={e => setFormDate(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                <textarea className="input min-h-[60px]" value={formNotes} onChange={e => setFormNotes(e.target.value)} />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="btn btn-ghost">Cancel</button>
                <button type="submit" disabled={submitting} className="btn btn-primary">
                  {submitting ? 'Creating...' : 'Create Asset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign modal */}
      {assignTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setAssignTarget(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-navy">Assign: {assignTarget.name}</h2>
              <button onClick={() => setAssignTarget(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Employee *</label>
                <select className="input" value={assignEmp} onChange={e => setAssignEmp(e.target.value)}>
                  <option value="">Select employee</option>
                  {employees.map(e => (
                    <option key={e.id} value={e.id}>{e.firstName} {e.lastName} ({e.employeeCode}){e.department?.name ? ` - ${e.department.name}` : ''}</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setAssignTarget(null)} className="btn btn-ghost">Cancel</button>
                <button onClick={handleAssign} disabled={!assignEmp || !!actionLoading} className="btn btn-primary">
                  {actionLoading ? 'Assigning...' : 'Assign'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Assets;
