import React, { useState } from 'react';
import { X, Save, Loader, AlertCircle, ChevronDown } from 'lucide-react';
import { Dropdown } from '@/components/ui/dropdown';
import { TaxTableAPI } from '../../api/client';

interface TaxTable {
  id: string;
  clientId: string;
  name: string;
  currency: string;
  effectiveDate: string;
  expiryDate: string | null;
  isAnnual: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface NewTaxTableModalProps {
  onClose: () => void;
  onSuccess: (newTable: TaxTable) => void;
}

const NewTaxTableModal: React.FC<NewTaxTableModalProps> = ({ onClose, onSuccess }) => {
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0]);
  const [isAnnual, setIsAnnual] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await TaxTableAPI.create({
        name,
        currency,
        effectiveDate,
        isAnnual,
      });
      onSuccess(response.data);
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to create tax table');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-navy/20 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl relative animate-in fade-in zoom-in duration-200">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-2 hover:bg-muted rounded-full text-muted-foreground transition-colors"
        >
          <X size={20} />
        </button>

        <div className="mb-6">
          <h3 className="text-2xl font-bold text-navy">New Tax Table</h3>
          <p className="text-muted-foreground text-sm font-medium">Define a new tax structure</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5 ml-1">Table Name</label>
            <input 
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. 2024 USD Standard"
              className="w-full px-4 py-3 bg-muted border border-border rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green transition-all"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5 ml-1">Currency</label>
              <Dropdown className="w-full" trigger={(isOpen) => (
                <button type="button" className="w-full flex items-center justify-between px-4 py-3 bg-muted border border-border rounded-2xl text-sm font-bold hover:border-accent-green transition-all">
                  <span>{currency}</span>
                  <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
              )} sections={[{ items: [
                { label: 'USD', onClick: () => setCurrency('USD') },
                { label: 'ZiG', onClick: () => setCurrency('ZiG') },
              ]}]} />
            </div>
            <div>
              <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5 ml-1">Effective Date</label>
              <input
                type="date"
                required
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                className="w-full px-4 py-3 bg-muted border border-border rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5 ml-1">Bracket Type</label>
            <div className="flex rounded-2xl overflow-hidden border border-border bg-muted">
              <button
                type="button"
                onClick={() => setIsAnnual(true)}
                className={`flex-1 py-3 text-sm font-bold transition-all ${isAnnual ? 'bg-accent-green text-white' : 'text-muted-foreground hover:bg-muted'}`}
              >
                Annual (FDS)
              </button>
              <button
                type="button"
                onClick={() => setIsAnnual(false)}
                className={`flex-1 py-3 text-sm font-bold transition-all ${!isAnnual ? 'bg-accent-green text-white' : 'text-muted-foreground hover:bg-muted'}`}
              >
                Monthly
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5 ml-1">
              {isAnnual ? 'Brackets use annual income (ZIMRA FDS standard)' : 'Brackets use monthly income directly'}
            </p>
          </div>

          {error && (
            <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex gap-3 items-start text-red-600 animate-in slide-in-from-top-1">
              <AlertCircle size={18} className="shrink-0" />
              <p className="text-xs font-medium">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand text-navy py-4 rounded-2xl font-bold shadow-lg shadow-navy/10 hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center gap-2 mt-4"
          >
            {loading ? <Loader size={18} className="animate-spin" /> : <Save size={18} />}
            {loading ? 'Creating...' : 'Create Table'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default NewTaxTableModal;
