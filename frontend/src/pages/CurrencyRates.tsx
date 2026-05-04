import React, { useEffect, useState } from 'react';
import { Plus, Trash, History, TrendingUp, Anchor, Calendar, Info, Globe, X, Check, XCircle, ChevronDown } from 'lucide-react';
import { Dropdown } from '@/components/ui/dropdown';
import { CurrencyRateAPI } from '../api/client';
import ConfirmModal from '../components/common/ConfirmModal';
import { useToast } from '../context/ToastContext';
import { useEscapeKey } from '../hooks/useEscapeKey';

interface Props {
  activeCompanyId?: string | null;
}

const CurrencyRates: React.FC<Props> = ({ activeCompanyId: _activeCompanyId }) => {
  const { showToast } = useToast();
  const [rates, setRates]       = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm]         = useState({ toCurrency: 'ZiG', rate: '', effectiveDate: new Date().toISOString().slice(0, 10), source: 'RBZ', notes: '' });
  const [saving, setSaving]     = useState(false);
  const [formError, setFormError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEscapeKey(isModalOpen, () => setIsModalOpen(false));

  const fetchRates = async () => {
    try {
      setFetchError(null);
      const response = await CurrencyRateAPI.getAll();
      setRates(response.data);
    } catch (error) {
      setFetchError('Failed to load exchange rates. Please check your connection.');
    }
  };

  useEffect(() => { fetchRates(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.rate || !form.effectiveDate) { setFormError('Rate and effective date are required.'); return; }
    if (parseFloat(form.rate) <= 0) { showToast('Exchange rate must be greater than zero', 'error'); return; }
    setSaving(true);
    setFormError('');
    try {
      await CurrencyRateAPI.create({
        fromCurrency: 'USD',
        toCurrency: form.toCurrency,
        rate: parseFloat(form.rate),
        effectiveDate: form.effectiveDate,
        source: form.source || 'MANUAL',
        notes: form.notes || undefined,
      });
      setIsModalOpen(false);
      setForm({ toCurrency: 'ZiG', rate: '', effectiveDate: new Date().toISOString().slice(0, 10), source: 'RBZ', notes: '' });
      fetchRates();
    } catch (e) {
      setFormError((e as {response?: {data?: {message?: string}}})?.response?.data?.message || 'Failed to save rate.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: string) => setDeleteTarget(id);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await CurrencyRateAPI.delete(deleteTarget);
      fetchRates();
    } catch (e) {
      showToast('Failed to delete rate', 'error');
    } finally {
      setDeleteTarget(null);
    }
  };

  const latestZig = rates.find((r) => r.toCurrency === 'ZiG');

  return (
    <div className="flex flex-col gap-8">
      {deleteTarget && (
        <ConfirmModal
          title="Delete Exchange Rate"
          message="Delete this exchange rate record? This action cannot be undone."
          confirmLabel="Delete"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy mb-1">Exchange Rates</h1>
          <p className="text-muted-foreground font-medium text-sm">Manage USD to ZiG conversion rates for payroll ledgers.</p>
        </div>
        <button
          onClick={() => { setIsModalOpen(true); setFormError(''); }}
          className="bg-brand text-navy px-4 py-2 rounded-full font-bold shadow hover:opacity-90 transition-opacity flex items-center gap-1.5"
        >
          <Plus size={20} /> New Rate
        </button>
      </header>

      {fetchError && (
        <div className="bg-red-50 text-red-600 border border-red-200 rounded-2xl p-4 flex items-center gap-3 shadow-sm">
          <XCircle size={20} className="text-red-500 shrink-0" />
          <p className="text-sm font-medium">{fetchError}</p>
        </div>
      )}

      {/* Hero Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-primary rounded-2xl p-6 border border-border shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-50 text-accent-green rounded-xl"><Anchor size={20} /></div>
            <span className="font-bold text-muted-foreground text-xs uppercase tracking-wider">Base Currency</span>
          </div>
          <p className="text-2xl font-black text-navy">USD ($)</p>
          <p className="text-xs text-muted-foreground font-medium mt-1">All tax logic anchors to USD.</p>
        </div>
        <div className="bg-primary rounded-2xl p-6 border border-border shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl"><TrendingUp size={20} /></div>
            <span className="font-bold text-muted-foreground text-xs uppercase tracking-wider">Current ZiG Rate</span>
          </div>
          <p className="text-2xl font-black text-navy">
            {latestZig ? Number(latestZig.rate).toFixed(4) : 'N/A'}
          </p>
          <p className="text-xs text-muted-foreground font-medium mt-1">ZiG per 1 USD.</p>
        </div>
        <div className="bg-primary rounded-2xl p-6 border border-border shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-purple-50 text-purple-600 rounded-xl"><History size={20} /></div>
            <span className="font-bold text-muted-foreground text-xs uppercase tracking-wider">Historical Records</span>
          </div>
          <p className="text-2xl font-black text-navy">{rates.length}</p>
          <p className="text-xs text-muted-foreground font-medium mt-1">Versioned rate entries.</p>
        </div>
      </div>

      {/* Info */}
      <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5 flex gap-4 items-start">
        <div className="p-2 bg-card rounded-xl text-amber-500 shadow-sm shrink-0"><Info size={20} /></div>
        <div>
          <h3 className="font-bold text-navy mb-0.5">Precision Notice</h3>
          <p className="text-sm text-foreground/80 leading-relaxed">
            Ensure rates are verified against official <strong>RBZ</strong> or approved market sources before committing. Rates affect all ZiG payroll calculations.
          </p>
        </div>
      </div>

      {/* Rates Table */}
      <div className="bg-primary rounded-2xl border border-border overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-muted border-b border-border">
              <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Pair</th>
              <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Rate</th>
              <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Effective From</th>
              <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Source</th>
              <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rates.length > 0 ? rates.map((rate) => (
              <tr key={rate.id} className="hover:bg-muted/30 transition-colors group">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-navy font-bold text-xs">
                      {rate.toCurrency?.slice(0, 3)}
                    </div>
                    <span className="text-sm font-bold">{rate.fromCurrency} → {rate.toCurrency}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <p className="text-sm font-bold text-navy font-mono">
                    {Number(rate.rate).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 10 })}
                  </p>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar size={14} />
                    <span className="text-sm">{new Date(rate.effectiveDate).toLocaleDateString()}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="px-2 py-1 bg-muted rounded-lg text-[10px] font-bold text-muted-foreground uppercase">{rate.source || 'Manual'}</span>
                </td>
                <td className="px-6 py-4 text-right">
                  <button
                    onClick={() => handleDelete(rate.id)}
                    className="p-2 hover:bg-red-50 rounded-lg text-muted-foreground hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash size={16} />
                  </button>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={5} className="px-6 py-20 text-center">
                  <Globe size={48} className="mx-auto mb-4 text-slate-200" />
                  <p className="text-muted-foreground font-medium text-sm">No exchange rates configured.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {/* Create Rate Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl shadow-xl p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-navy">New Exchange Rate</h3>
              <button onClick={() => setIsModalOpen(false)} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
                <X size={18} className="text-muted-foreground" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-bold text-foreground/80 mb-1.5">To Currency</label>
                <input
                  type="text"
                  value={form.toCurrency}
                  onChange={(e) => setForm((p) => ({ ...p, toCurrency: e.target.value.toUpperCase() }))}
                  placeholder="ZiG"
                  maxLength={6}
                  className="w-full px-4 py-2.5 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-green/30 focus:border-accent-green"
                  required
                />
                <p className="text-xs text-muted-foreground font-medium mt-1">From currency is always USD.</p>
              </div>
              <div>
                <label className="block text-sm font-bold text-foreground/80 mb-1.5">Rate *</label>
                <input
                  type="number"
                  step="0.000001"
                  min="0.000001"
                  value={form.rate}
                  onChange={(e) => setForm((p) => ({ ...p, rate: e.target.value }))}
                  placeholder="e.g. 13.5"
                  className="w-full px-4 py-2.5 border border-border rounded-xl text-sm font-medium font-mono focus:outline-none focus:ring-2 focus:ring-accent-green/30 focus:border-accent-green"
                  required
                />
                <p className="text-xs text-muted-foreground font-medium mt-1">How many {form.toCurrency || 'units'} equal 1 USD.</p>
              </div>
              <div>
                <label className="block text-sm font-bold text-foreground/80 mb-1.5">Effective Date *</label>
                <input
                  type="date"
                  value={form.effectiveDate}
                  onChange={(e) => setForm((p) => ({ ...p, effectiveDate: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-green/30 focus:border-accent-green"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-foreground/80 mb-1.5">Source</label>
                <Dropdown className="w-full" trigger={(isOpen) => {
                  const labels: Record<string,string> = { RBZ: 'RBZ (Official)', MANUAL: 'Manual', IMPORT: 'Import' };
                  return (
                    <button type="button" className="w-full flex items-center justify-between px-4 py-2.5 border border-border rounded-xl text-sm font-medium hover:border-accent-green transition-colors bg-primary">
                      <span>{labels[form.source] || form.source}</span>
                      <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                  );
                }} sections={[{ items: [
                  { label: 'RBZ (Official)', onClick: () => setForm((p) => ({ ...p, source: 'RBZ' })) },
                  { label: 'Manual', onClick: () => setForm((p) => ({ ...p, source: 'MANUAL' })) },
                  { label: 'Import', onClick: () => setForm((p) => ({ ...p, source: 'IMPORT' })) },
                ]}]} />
              </div>
              <div>
                <label className="block text-sm font-bold text-foreground/80 mb-1.5">Notes</label>
                <input
                  type="text"
                  value={form.notes}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                  placeholder="Optional note…"
                  className="w-full px-4 py-2.5 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-green/30 focus:border-accent-green"
                />
              </div>

              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium">{formError}</div>
              )}

              <div className="flex gap-3 mt-1">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-1.5 flex-1 justify-center bg-brand text-navy py-2.5 rounded-full font-bold hover:opacity-90 disabled:opacity-60 text-sm"
                >
                  <Check size={15} /> {saving ? 'Saving…' : 'Save Rate'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-full border border-border font-bold text-muted-foreground hover:bg-muted text-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CurrencyRates;
