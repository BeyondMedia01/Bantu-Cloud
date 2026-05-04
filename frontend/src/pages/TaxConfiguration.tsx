import React, { useEffect, useState } from 'react';
import { Plus, Edit, Trash, Info, Calendar, Percent, Hash, XCircle, X } from 'lucide-react';
import { TaxBandAPI } from '../api/client';
import ConfirmModal from '../components/common/ConfirmModal';
import { useToast } from '../context/ToastContext';

const EMPTY_FORM = {
  bandNumber: '',
  description: '',
  lowerLimitUSD: '',
  upperLimitUSD: '',
  taxRatePercent: '',
  fixedAmountUSD: '',
  effectiveFrom: '',
};

const TaxConfiguration: React.FC<{ activeCompanyId?: string | null }> = ({ activeCompanyId }) => {
  const { showToast } = useToast();
  const [bands, setBands] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBand, setEditingBand] = useState<any>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const sf = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }));

  const openCreate = () => {
    setEditingBand(null);
    setForm(EMPTY_FORM);
    setIsModalOpen(true);
  };

  const openEdit = (band: any) => {
    setEditingBand(band);
    setForm({
      bandNumber: String(band.bandNumber ?? ''),
      description: band.description ?? '',
      lowerLimitUSD: String(band.lowerLimitUSD ?? ''),
      upperLimitUSD: band.upperLimitUSD != null ? String(band.upperLimitUSD) : '',
      taxRatePercent: String(band.taxRatePercent ?? ''),
      fixedAmountUSD: String(band.fixedAmountUSD ?? ''),
      effectiveFrom: band.effectiveFrom ? band.effectiveFrom.slice(0, 10) : '',
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      bandNumber: Number(form.bandNumber),
      description: form.description || null,
      lowerLimitUSD: Number(form.lowerLimitUSD),
      upperLimitUSD: form.upperLimitUSD !== '' ? Number(form.upperLimitUSD) : null,
      taxRatePercent: Number(form.taxRatePercent),
      fixedAmountUSD: Number(form.fixedAmountUSD),
      effectiveFrom: form.effectiveFrom || null,
    };
    try {
      if (editingBand) {
        await TaxBandAPI.update(editingBand.id, payload);
        showToast('Tax band updated', 'success');
      } else {
        await TaxBandAPI.create(payload);
        showToast('Tax band created', 'success');
      }
      setIsModalOpen(false);
      fetchBands();
    } catch {
      showToast('Failed to save tax band', 'error');
    } finally {
      setSaving(false);
    }
  };

  const fetchBands = async () => {
    try {
      setFetchError(null);
      const response = await TaxBandAPI.getAll();
      setBands(response.data);
    } catch (error) {
      setFetchError('Failed to load tax bands. Please check your connection and try again.');
    }
  };

  useEffect(() => {
    if (activeCompanyId) {
      fetchBands();
    }
  }, [activeCompanyId]);

  const handleDelete = (id: string) => setDeleteTarget(id);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await TaxBandAPI.delete(deleteTarget);
      fetchBands();
    } catch {
      showToast('Failed to delete tax band', 'error');
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      {deleteTarget && (
        <ConfirmModal
          title="Delete Tax Band"
          message="Are you sure you want to delete this tax band?"
          confirmLabel="Delete"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-navy mb-1">Tax Configuration</h2>
          <p className="text-muted-foreground font-medium">Manage USD-based PAYE thresholds and statutory rates.</p>
        </div>
        <button 
          onClick={openCreate}
          className="bg-brand text-navy px-6 py-3 rounded-[9999px] font-bold shadow-lg hover:opacity-90 transition-opacity flex items-center gap-2"
        >
          <Plus size={20} /> Add New Band
        </button>
      </header>

      {/* Info Card */}
      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 flex gap-4 items-start">
        <div className="p-2 bg-card rounded-xl text-accent-green shadow-sm">
          <Info size={24} />
        </div>
        <div>
          <h3 className="font-bold text-navy mb-1">Zimbabwe PAYE Logic</h3>
          <p className="text-sm text-foreground/80 leading-relaxed max-w-2xl">
            These bands are applied to the <strong>USD portion</strong> of employee earnings. The calculation engine iterates through these bands in order of <em>Band Number</em> to compute the total progressive tax liability.
          </p>
        </div>
      </div>

      {fetchError && (
        <div className="bg-red-50 text-red-600 border border-red-200 rounded-2xl p-4 flex items-center gap-3 shadow-sm">
          <XCircle size={20} className="text-red-500 shrink-0" />
          <p className="text-sm font-medium">{fetchError}</p>
        </div>
      )}

      {/* Bands Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {bands.length > 0 ? bands.map(band => (
          <div key={band.id} className="bg-primary rounded-2xl border border-border p-6 shadow-sm hover:border-accent-green transition-all group">
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-muted rounded-xl flex items-center justify-center text-muted-foreground font-bold group-hover:bg-blue-50 group-hover:text-accent-green transition-colors">
                  <Hash size={20} />
                </div>
                <div>
                  <h4 className="font-bold text-navy">Band {band.bandNumber}</h4>
                  <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider">{band.description || 'Tax Bracket'}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                  onClick={() => openEdit(band)}
                  className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-navy transition-colors"
                >
                  <Edit size={16} />
                </button>
                <button 
                  onClick={() => handleDelete(band.id)}
                  className="p-2 hover:bg-red-50 rounded-lg text-muted-foreground hover:text-red-500 transition-colors"
                >
                  <Trash size={16} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="p-3 bg-muted rounded-xl border border-border/50">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Range (USD)</p>
                <p className="text-sm font-bold text-navy">
                  ${band.lowerLimitUSD.toLocaleString()} — {band.upperLimitUSD ? `$${band.upperLimitUSD.toLocaleString()}` : '∞'}
                </p>
              </div>
              <div className="p-3 bg-muted rounded-xl border border-border/50">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Tax Rate</p>
                <p className="text-sm font-bold text-accent-green flex items-center gap-1">
                  <Percent size={14} /> {band.taxRatePercent}%
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-border">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar size={14} />
                <span className="text-[10px] font-bold uppercase">Effective: {new Date(band.effectiveFrom).toLocaleDateString()}</span>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-muted-foreground uppercase">Fixed Cum. Tax</p>
                <p className="text-sm font-bold text-navy">${band.fixedAmountUSD.toLocaleString()}</p>
              </div>
            </div>
          </div>
        )) : (
          <div className="col-span-full py-20 bg-primary rounded-2xl border border-dashed border-border flex flex-col items-center justify-center text-muted-foreground">
             <Hash size={48} className="mb-4 opacity-20" />
             <p className="font-medium italic">No tax bands configured yet.</p>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-navy/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="tax-band-modal-title"
            className="bg-card rounded-3xl p-8 max-w-lg w-full shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between mb-6">
              <h3 id="tax-band-modal-title" className="text-2xl font-bold text-navy">
                {editingBand ? 'Edit Tax Band' : 'New Tax Band'}
              </h3>
              <button onClick={() => setIsModalOpen(false)}
                className="p-2 hover:bg-muted rounded-xl text-muted-foreground transition-colors">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSave} className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Band Number</label>
                  <input type="number" required min="1" className="px-4 py-3 bg-muted border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green transition-all"
                    value={form.bandNumber} onChange={sf('bandNumber')} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Effective From</label>
                  <input type="date" className="px-4 py-3 bg-muted border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green transition-all"
                    value={form.effectiveFrom} onChange={sf('effectiveFrom')} />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Description</label>
                <input type="text" className="px-4 py-3 bg-muted border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green transition-all"
                  placeholder="e.g. First bracket" value={form.description} onChange={sf('description')} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Lower Limit (USD)</label>
                  <input type="number" required min="0" step="0.01" className="px-4 py-3 bg-muted border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green transition-all"
                    value={form.lowerLimitUSD} onChange={sf('lowerLimitUSD')} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Upper Limit (USD, blank = ∞)</label>
                  <input type="number" min="0" step="0.01" className="px-4 py-3 bg-muted border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green transition-all"
                    value={form.upperLimitUSD} onChange={sf('upperLimitUSD')} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Tax Rate (%)</label>
                  <input type="number" required min="0" max="100" step="0.01" className="px-4 py-3 bg-muted border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green transition-all"
                    value={form.taxRatePercent} onChange={sf('taxRatePercent')} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Fixed Cum. Tax (USD)</label>
                  <input type="number" required min="0" step="0.01" className="px-4 py-3 bg-muted border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green transition-all"
                    value={form.fixedAmountUSD} onChange={sf('fixedAmountUSD')} />
                </div>
              </div>
              <div className="flex gap-3 mt-2">
                <button type="button" onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-3 rounded-2xl font-bold text-muted-foreground bg-muted hover:opacity-80 transition-opacity">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-3 rounded-2xl font-bold text-navy bg-brand hover:opacity-90 transition-opacity disabled:opacity-50">
                  {saving ? 'Saving…' : editingBand ? 'Save Changes' : 'Create Band'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaxConfiguration;
