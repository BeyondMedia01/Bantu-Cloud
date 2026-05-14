import React, { useEffect, useState } from 'react';
import { Package, Plus, X, UserCheck, RotateCcw, ChevronDown, Trash } from 'lucide-react';
import { AssetAPI } from '../api/client';
import { useToast } from '../context/ToastContext';
import { usePermissions } from '../hooks/usePermissions';
import SkeletonTable from '../components/common/SkeletonTable';
import ConfirmModal from '../components/common/ConfirmModal';
import { EmptyState } from '@/components/ui/empty-state';
import { Dropdown } from '@/components/ui/dropdown';
import type { Asset, AssetCategory, AssetStatus } from '../types/domain';

const STATUS_COLORS: Record<string, string> = {
  AVAILABLE: 'bg-emerald-50 text-emerald-700',
  ASSIGNED: 'bg-blue-50 text-blue-700',
  MAINTENANCE: 'bg-amber-50 text-amber-700',
  RETIRED: 'bg-muted text-muted-foreground',
  LOST: 'bg-red-50 text-red-700',
};
const STATUS_OPTS: AssetStatus[] = ['AVAILABLE', 'ASSIGNED', 'MAINTENANCE', 'RETIRED', 'LOST'];

const Assets: React.FC = () => {
  const { showToast } = useToast();
  const { can } = usePermissions();
  const canManage = can('ASSETS');

  const [tab, setTab] = useState<'assets' | 'categories'>('assets');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

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

  // Create category
  const [showCreateCat, setShowCreateCat] = useState(false);
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');

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

  const loadCategories = async () => {
    setLoading(true);
    try {
      const res = await AssetAPI.getCategories();
      setCategories(res.data.data || []);
    } catch {
      showToast('Failed to load categories', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'assets') loadAssets();
    else loadCategories();
  }, [tab, filterStatus, filterCat]);

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
      showToast(err.message || 'Failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormCat(''); setFormName(''); setFormSerial(''); setFormModel('');
    setFormCondition('GOOD'); setFormPrice(''); setFormDate(''); setFormNotes('');
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName) return;
    setSubmitting(true);
    try {
      await AssetAPI.createCategory({ name: catName, description: catDesc || undefined });
      showToast('Category created', 'success');
      setShowCreateCat(false); setCatName(''); setCatDesc('');
      loadCategories();
    } catch (err: any) {
      showToast(err.message || 'Failed', 'error');
    } finally {
      setSubmitting(false);
    }
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
      showToast(err.message || 'Failed', 'error');
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
      showToast(err.message || 'Failed', 'error');
    } finally {
      setActionLoading('');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setActionLoading('del-' + deleteTarget);
    try {
      await AssetAPI.delete(deleteTarget);
      showToast('Asset deleted', 'success');
      setDeleteTarget(null);
      loadAssets();
    } catch (err: any) {
      showToast(err.message || 'Failed', 'error');
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

  const hasFilters = !!(filterStatus || filterCat || search);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy">Assets</h1>
          <p className="text-muted-foreground font-medium text-sm">Track and manage company assets</p>
        </div>
        {canManage && tab === 'assets' && (
          <button onClick={() => setShowCreate(true)} className="bg-brand text-navy px-4 py-2 rounded-full font-bold shadow hover:opacity-90 flex items-center gap-1.5">
            <Plus size={18} /> New Asset
          </button>
        )}
        {canManage && tab === 'categories' && (
          <button onClick={() => setShowCreateCat(true)} className="bg-brand text-navy px-4 py-2 rounded-full font-bold shadow hover:opacity-90 flex items-center gap-1.5">
            <Plus size={18} /> New Category
          </button>
        )}
      </header>

      {/* Sub-navigation tabs */}
      <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
        {[{ key: 'assets', label: 'Assets' }, { key: 'categories', label: 'Categories' }].map(t => {
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key as 'assets' | 'categories')}
              className={`px-4 py-2.5 text-sm font-bold transition-colors border-b-2 -mb-px ${active ? 'border-navy text-navy' : 'border-transparent text-muted-foreground hover:text-navy'}`}>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Assets tab */}
      {tab === 'assets' && (
        <>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Filters</p>
              {hasFilters && <button onClick={() => { setFilterStatus(''); setFilterCat(''); setSearch(''); }} className="text-xs font-bold text-muted-foreground hover:text-red-500 px-3 py-1.5 rounded-full border border-border hover:border-red-200 hover:bg-red-50 transition-colors">× Clear filters</button>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <input className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                placeholder="Search assets..." value={search} onChange={e => setSearch(e.target.value)} />
              <Dropdown
                trigger={(isOpen) => (
                  <button className="w-full bg-primary border border-border rounded-2xl px-4 py-3 text-sm font-medium shadow-sm flex items-center justify-between hover:border-accent-green transition-colors">
                    <span className="truncate">{filterStatus || 'All Statuses'}</span>
                    <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                )}
                sections={[{ items: [{ label: 'All Statuses', onClick: () => setFilterStatus('') }, ...STATUS_OPTS.map(s => ({ label: s, onClick: () => setFilterStatus(s) }))] }]}
              />
              <Dropdown
                trigger={(isOpen) => (
                  <button className="w-full bg-primary border border-border rounded-2xl px-4 py-3 text-sm font-medium shadow-sm flex items-center justify-between hover:border-accent-green transition-colors">
                    <span className="truncate">{filterCat ? categories.find(c => c.id === filterCat)?.name : 'All Categories'}</span>
                    <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                )}
                sections={[{ items: [{ label: 'All Categories', onClick: () => setFilterCat('') }, ...categories.map(c => ({ label: c.name, onClick: () => setFilterCat(c.id) }))] }]}
              />
            </div>
          </div>

          <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden">
            {loading ? <SkeletonTable headers={["", "", "", "", "", "", ""]} rows={6} /> : filtered.length === 0 ? (
              <EmptyState variant="no-data" icon={Package} title="No assets found" description="Create your first asset to start tracking."
                action={canManage ? { label: 'New Asset', onClick: () => setShowCreate(true) } : undefined} />
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted border-b border-border">
                  <tr>
                    <th className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Name</th>
                    <th className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Category</th>
                    <th className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Assigned To</th>
                    <th className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Serial</th>
                    <th className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Condition</th>
                    <th className="px-5 py-4 text-right text-xs font-bold text-muted-foreground uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map(a => (
                    <tr key={a.id} className="hover:bg-muted/70 transition-colors">
                      <td className="px-5 py-4">
                        <p className="font-medium text-navy">{a.name}</p>
                        {a.model && <p className="text-xs text-muted-foreground">{a.model}</p>}
                      </td>
                      <td className="px-5 py-4 text-muted-foreground">{a.category?.name || '—'}</td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold ${STATUS_COLORS[a.status]}`}>
                          {a.status}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-muted-foreground">
                        {a.assignedTo ? `${a.assignedTo.firstName} ${a.assignedTo.lastName}` : '—'}
                      </td>
                      <td className="px-5 py-4 text-muted-foreground text-xs">{a.serialNumber || '—'}</td>
                      <td className="px-5 py-4 text-muted-foreground">{a.condition || '—'}</td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {canManage && a.status === 'AVAILABLE' && (
                            <button onClick={() => openAssign(a)} className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-blue-600 transition-colors" title="Assign">
                              <UserCheck size={15} />
                            </button>
                          )}
                          {canManage && a.status === 'ASSIGNED' && (
                            <button onClick={() => handleReturn(a.id)} disabled={!!actionLoading} className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-amber-600 transition-colors" title="Return">
                              <RotateCcw size={15} />
                            </button>
                          )}
                          {canManage && (
                            <button onClick={() => setDeleteTarget(a.id)} disabled={!!actionLoading} className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-red-500 transition-colors">
                              <Trash size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* Categories tab */}
      {tab === 'categories' && (
        <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden">
          {loading ? <SkeletonTable headers={["", "", ""]} rows={6} /> : categories.length === 0 ? (
            <EmptyState variant="no-data" icon={Package} title="No categories" description="Create categories to organize your assets."
              action={canManage ? { label: 'New Category', onClick: () => setShowCreateCat(true) } : undefined} />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted border-b border-border">
                <tr>
                  <th className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Name</th>
                  <th className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Description</th>
                  <th className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Assets</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {categories.map(c => (
                  <tr key={c.id} className="hover:bg-muted/70 transition-colors">
                    <td className="px-5 py-4 font-medium text-navy">{c.name}</td>
                    <td className="px-5 py-4 text-muted-foreground">{c.description || '—'}</td>
                    <td className="px-5 py-4 text-muted-foreground">{(c as any)._count?.assets ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Create Asset modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-primary rounded-2xl shadow-xl w-full max-w-lg flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-lg font-bold text-navy">New Asset</h2>
              <button onClick={() => setShowCreate(false)} className="p-2 hover:bg-muted rounded-lg text-muted-foreground"><X size={18} /></button>
            </div>
            <form onSubmit={handleCreate} className="p-6 flex flex-col gap-4 overflow-y-auto max-h-[70vh]">
              <div className="grid grid-cols-2 gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Category *</span>
                  <select className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                    value={formCat} onChange={e => setFormCat(e.target.value)} required>
                    <option value="">Select category</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Condition</span>
                  <select className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                    value={formCondition} onChange={e => setFormCondition(e.target.value)}>
                    <option value="NEW">New</option>
                    <option value="GOOD">Good</option>
                    <option value="FAIR">Fair</option>
                    <option value="POOR">Poor</option>
                  </select>
                </label>
              </div>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Name *</span>
                <input className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                  value={formName} onChange={e => setFormName(e.target.value)} required placeholder="e.g. Dell Latitude 5420" />
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Serial Number</span>
                  <input className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                    value={formSerial} onChange={e => setFormSerial(e.target.value)} />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Model</span>
                  <input className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                    value={formModel} onChange={e => setFormModel(e.target.value)} />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Purchase Price (USD)</span>
                  <input type="number" step="0.01" min="0" className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                    value={formPrice} onChange={e => setFormPrice(e.target.value)} />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Purchase Date</span>
                  <input type="date" className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                    value={formDate} onChange={e => setFormDate(e.target.value)} />
                </label>
              </div>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Notes</span>
                <textarea className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green min-h-[60px]"
                  value={formNotes} onChange={e => setFormNotes(e.target.value)} />
              </label>
            </form>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-full border border-border text-sm font-bold hover:bg-muted transition-colors">Cancel</button>
              <button onClick={handleCreate as any} disabled={submitting} className="bg-brand text-navy px-4 py-2 rounded-full font-bold shadow hover:opacity-90 flex items-center gap-1.5">
                <Plus size={16} /> {submitting ? 'Creating...' : 'Create Asset'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Category modal */}
      {showCreateCat && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-primary rounded-2xl shadow-xl w-full max-w-md flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-lg font-bold text-navy">New Category</h2>
              <button onClick={() => setShowCreateCat(false)} className="p-2 hover:bg-muted rounded-lg text-muted-foreground"><X size={18} /></button>
            </div>
            <form onSubmit={handleCreateCategory} className="p-6 flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Name *</span>
                <input className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                  value={catName} onChange={e => setCatName(e.target.value)} required placeholder="e.g. IT Equipment" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Description</span>
                <textarea className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green min-h-[60px]"
                  value={catDesc} onChange={e => setCatDesc(e.target.value)} />
              </label>
            </form>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
              <button onClick={() => setShowCreateCat(false)} className="px-4 py-2 rounded-full border border-border text-sm font-bold hover:bg-muted transition-colors">Cancel</button>
              <button onClick={handleCreateCategory as any} disabled={submitting} className="bg-brand text-navy px-4 py-2 rounded-full font-bold shadow hover:opacity-90 flex items-center gap-1.5">
                <Plus size={16} /> {submitting ? 'Creating...' : 'Create Category'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign modal */}
      {assignTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-primary rounded-2xl shadow-xl w-full max-w-md flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-lg font-bold text-navy">Assign: {assignTarget.name}</h2>
              <button onClick={() => setAssignTarget(null)} className="p-2 hover:bg-muted rounded-lg text-muted-foreground"><X size={18} /></button>
            </div>
            <div className="p-6 flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Employee *</span>
                <select className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                  value={assignEmp} onChange={e => setAssignEmp(e.target.value)}>
                  <option value="">Select employee</option>
                  {employees.map(e => (
                    <option key={e.id} value={e.id}>{e.firstName} {e.lastName} ({e.employeeCode}){e.department?.name ? ` - ${e.department.name}` : ''}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
              <button onClick={() => setAssignTarget(null)} className="px-4 py-2 rounded-full border border-border text-sm font-bold hover:bg-muted transition-colors">Cancel</button>
              <button onClick={handleAssign} disabled={!assignEmp || !!actionLoading} className="bg-brand text-navy px-4 py-2 rounded-full font-bold shadow hover:opacity-90 flex items-center gap-1.5">
                <UserCheck size={16} /> {actionLoading ? 'Assigning...' : 'Assign'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <ConfirmModal
          title="Delete Asset"
          message="Are you sure you want to delete this asset? This cannot be undone."
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
};

export default Assets;
