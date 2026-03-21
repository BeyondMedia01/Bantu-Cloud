import React, { useEffect, useState } from 'react';
import { Plus, Edit, Trash, Info, Calendar, Percent, Hash } from 'lucide-react';
import { TaxBandAPI } from '../api/client';

const TaxConfiguration: React.FC<{ activeCompanyId?: string | null }> = ({ activeCompanyId }) => {
  const [bands, setBands] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBand, setEditingBand] = useState<any>(null);

  const fetchBands = async () => {
    try {
      const response = await TaxBandAPI.getAll();
      setBands(response.data);
    } catch (error) {
      console.error('Failed to fetch tax bands');
    }
  };

  useEffect(() => {
    if (activeCompanyId) {
      fetchBands();
    }
  }, [activeCompanyId]);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this tax band?')) return;
    try {
      await TaxBandAPI.delete(id);
      fetchBands();
    } catch (error) {
      alert('Failed to delete tax band');
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-navy mb-1">Tax Configuration</h2>
          <p className="text-slate-500 font-medium">Manage USD-based PAYE thresholds and statutory rates.</p>
        </div>
        <button 
          onClick={() => { setEditingBand(null); setIsModalOpen(true); }}
          className="bg-btn-primary text-navy px-6 py-3 rounded-[9999px] font-bold shadow-lg hover:opacity-90 transition-opacity flex items-center gap-2"
        >
          <Plus size={20} /> Add New Band
        </button>
      </header>

      {/* Info Card */}
      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 flex gap-4 items-start">
        <div className="p-2 bg-white rounded-xl text-accent-blue shadow-sm">
          <Info size={24} />
        </div>
        <div>
          <h3 className="font-bold text-navy mb-1">Zimbabwe PAYE Logic</h3>
          <p className="text-sm text-slate-600 leading-relaxed max-w-2xl">
            These bands are applied to the <strong>USD portion</strong> of employee earnings. The calculation engine iterates through these bands in order of <em>Band Number</em> to compute the total progressive tax liability.
          </p>
        </div>
      </div>

      {/* Bands Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {bands.length > 0 ? bands.map(band => (
          <div key={band.id} className="bg-primary rounded-2xl border border-border p-6 shadow-sm hover:border-accent-blue transition-all group">
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 font-bold group-hover:bg-blue-50 group-hover:text-accent-blue transition-colors">
                  <Hash size={20} />
                </div>
                <div>
                  <h4 className="font-bold text-navy">Band {band.bandNumber}</h4>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">{band.description || 'Tax Bracket'}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                  onClick={() => { setEditingBand(band); setIsModalOpen(true); }}
                  className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-navy transition-colors"
                >
                  <Edit size={16} />
                </button>
                <button 
                  onClick={() => handleDelete(band.id)}
                  className="p-2 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 transition-colors"
                >
                  <Trash size={16} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="p-3 bg-slate-50 rounded-xl border border-border/50">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Range (USD)</p>
                <p className="text-sm font-bold text-navy">
                  ${band.lowerLimitUSD.toLocaleString()} — {band.upperLimitUSD ? `$${band.upperLimitUSD.toLocaleString()}` : '∞'}
                </p>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-border/50">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Tax Rate</p>
                <p className="text-sm font-bold text-accent-blue flex items-center gap-1">
                  <Percent size={14} /> {band.taxRatePercent}%
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-border">
              <div className="flex items-center gap-2 text-slate-400">
                <Calendar size={14} />
                <span className="text-[10px] font-bold uppercase">Effective: {new Date(band.effectiveFrom).toLocaleDateString()}</span>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-slate-400 uppercase">Fixed Cum. Tax</p>
                <p className="text-sm font-bold text-navy">${band.fixedAmountUSD.toLocaleString()}</p>
              </div>
            </div>
          </div>
        )) : (
          <div className="col-span-full py-20 bg-primary rounded-2xl border border-dashed border-border flex flex-col items-center justify-center text-slate-400">
             <Hash size={48} className="mb-4 opacity-20" />
             <p className="font-medium italic">No tax bands configured yet.</p>
          </div>
        )}
      </div>

      {/* Simple Modal Placeholder */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-navy/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
           <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl animate-in fade-in zoom-in duration-200">
              <h3 className="text-2xl font-bold text-navy mb-6">{editingBand ? 'Edit Tax Band' : 'New Tax Band'}</h3>
              <p className="text-slate-500 text-sm mb-8">This feature is coming soon. Use the API or Database direct for now.</p>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="w-full bg-slate-100 py-3 rounded-2xl font-bold text-navy hover:bg-slate-200 transition-colors"
                > Close </button>
           </div>
        </div>
      )}
    </div>
  );
};

export default TaxConfiguration;
