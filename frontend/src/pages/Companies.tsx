import React, { useEffect, useState } from 'react';
import { Plus, Trash, Building2, MapPin, Hash, Pencil, X, Check } from 'lucide-react';
import { CompanyAPI } from '../api/client';
import { useToast } from '../context/ToastContext';
import ConfirmModal from '../components/common/ConfirmModal';



const Companies: React.FC = () => {
  const [companies, setCompanies] = useState<any[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const { showToast } = useToast();

  // Create form state
  const [newName, setNewName] = useState('');
  const [newBp, setNewBp] = useState('');
  const [newAddress, setNewAddress] = useState('');

  // Edit form state
  const [editForm, setEditForm] = useState<any>({});

  const fetchCompanies = async () => {
    try {
      const response = await CompanyAPI.getAll();
      setCompanies(response.data);
    } catch (error) {
      console.error('Failed to fetch companies');
    }
  };

  useEffect(() => { fetchCompanies(); }, []);

  const handleCreate = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      await CompanyAPI.create({
        name: newName,
        taxId: newBp,
        address: newAddress,
      });
      setNewName(''); setNewBp(''); setNewAddress('');
      setIsAdding(false);
      fetchCompanies();
      showToast('New company entity created successfully', 'success');
    } catch {
      showToast('Failed to create company entity', 'error');
    }
  };

  const startEdit = (company: any) => {
    setEditingId(company.id);
    setEditForm({
      name: company.name || '',
      registrationNumber: company.registrationNumber || '',
      taxId: company.taxId || '',
      address: company.address || '',
      contactEmail: company.contactEmail || '',
      contactPhone: company.contactPhone || '',
    });
  };

  const handleUpdate = async (id: string) => {
    try {
      await CompanyAPI.update(id, {
        name: editForm.name,
        registrationNumber: editForm.registrationNumber || null,
        taxId: editForm.taxId || null,
        address: editForm.address || null,
        contactEmail: editForm.contactEmail || null,
        contactPhone: editForm.contactPhone || null,
      });
      setEditingId(null);
      fetchCompanies();
      showToast('Company details updated', 'success');
    } catch {
      showToast('Failed to update company', 'error');
    }
  };

  const handleDelete = (id: string, name: string) => {
    setDeleteTarget({ id, name });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await CompanyAPI.delete(deleteTarget.id);
      fetchCompanies();
      showToast(`${deleteTarget.name} has been removed`, 'success');
    } catch {
      showToast('Failed to delete company', 'error');
    } finally {
      setDeleteTarget(null);
    }
  };

  const ef = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setEditForm((prev: any) => ({ ...prev, [field]: e.target.value }));

  const inputCls = "w-full px-4 py-3 bg-slate-50 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green transition-all font-medium text-sm";

  return (
    <div className="flex flex-col gap-8">
      {deleteTarget && (
        <ConfirmModal
          title="Remove Company"
          message={`Are you sure you want to remove ${deleteTarget.name}? This will delete all associated data and cannot be undone.`}
          confirmLabel="Remove Company"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-navy mb-1">Company Directory</h2>
          <p className="text-slate-500 font-medium">Manage multiple business entities on one platform.</p>
        </div>
        <button
          onClick={() => setIsAdding(!isAdding)}
          className="bg-brand text-navy px-6 py-3 rounded-[9999px] font-bold shadow-lg hover:opacity-90 transition-opacity flex items-center gap-2"
        >
          <Plus size={20} /> Add New Entity
        </button>
      </header>

      {/* ── Create Form ────────────────────────────────────────────────────── */}
      {isAdding && (
        <div className="bg-primary rounded-2xl border border-border shadow-sm p-8 animate-in fade-in slide-in-from-top-4 duration-300">
          <h3 className="text-xl font-bold mb-6">Create New Company</h3>
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Company Legal Name</label>
              <input type="text" required className={inputCls} placeholder="Zimbabwe Tech Ltd"
                value={newName} onChange={e => setNewName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">BP Number (ZIMRA)</label>
              <input type="text" className={inputCls} placeholder="200XXXXXX"
                value={newBp} onChange={e => setNewBp(e.target.value)} />
            </div>
            <div className="md:col-span-2 flex flex-col gap-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Primary Address</label>
              <input type="text" className={inputCls} placeholder="123 Samora Machel Ave, Harare"
                value={newAddress} onChange={e => setNewAddress(e.target.value)} />
            </div>
            <div className="md:col-span-2 flex items-center justify-end gap-3 mt-2">
              <button type="button" onClick={() => setIsAdding(false)}
                className="px-6 py-3 rounded-[9999px] font-bold text-slate-500 hover:bg-slate-100 transition-colors">
                Cancel
              </button>
              <button type="submit"
                className="bg-brand text-navy px-8 py-3 rounded-[9999px] font-bold shadow-lg hover:opacity-90 transition-opacity">
                Save Company Entity
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Company Cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {companies.map(company => (
          <div key={company.id}
            className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden">

            {editingId === company.id ? (
              /* ── Inline Edit Panel ────────────────────────────────────── */
              <div className="p-6 animate-in fade-in duration-200">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-bold text-navy">Edit Company</h4>
                  <button onClick={() => setEditingId(null)}
                    className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors">
                    <X size={16} />
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  <input className={inputCls} placeholder="Legal Name" value={editForm.name} onChange={ef('name')} />
                  <input className={inputCls} placeholder="Registration Number" value={editForm.registrationNumber} onChange={ef('registrationNumber')} />
                  <input className={inputCls} placeholder="ZIMRA Tax ID / BP Number" value={editForm.taxId} onChange={ef('taxId')} />
                  <input className={inputCls} placeholder="Address" value={editForm.address} onChange={ef('address')} />
                  <input className={inputCls} placeholder="Contact Email" type="email" value={editForm.contactEmail} onChange={ef('contactEmail')} />
                  <input className={inputCls} placeholder="Contact Phone" value={editForm.contactPhone} onChange={ef('contactPhone')} />

                  <div className="flex gap-2 mt-1">
                    <button onClick={() => handleUpdate(company.id)}
                      className="flex-1 flex items-center justify-center gap-2 bg-brand text-navy py-2.5 rounded-xl font-bold text-sm hover:opacity-90 transition-opacity">
                      <Check size={15} /> Save Changes
                    </button>
                    <button onClick={() => setEditingId(null)}
                      className="px-4 py-2.5 rounded-xl font-bold text-sm text-slate-500 hover:bg-slate-100 transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* ── Card View ────────────────────────────────────────────── */
              <div className="p-6 flex flex-col h-full group">
                <div className="flex items-start gap-4 flex-1">
                  <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center text-accent-green shrink-0
                    group-hover:bg-accent-green group-hover:text-white transition-colors shadow-sm">
                    <Building2 size={24} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-bold text-navy truncate mb-3">{company.name}</h3>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2 text-slate-400">
                        <Hash size={13} className="shrink-0" />
                        <span className="text-xs font-bold">{company.registrationNumber || company.taxId || 'BP: N/A'}</span>
                      </div>
                      <div className="flex items-start gap-2 text-slate-400">
                        <MapPin size={13} className="shrink-0 mt-0.5" />
                        <span className="text-xs font-semibold leading-tight">{company.address || 'Address not set'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-accent-green">
                    <div className="w-1.5 h-1.5 rounded-full bg-accent-green" />
                    Operational
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleDelete(company.id, company.name)}
                      className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash size={14} />
                    </button>
                    <button onClick={() => startEdit(company)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-accent-green hover:bg-blue-50 rounded-lg transition-colors">
                      <Pencil size={13} /> Edit
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Companies;
