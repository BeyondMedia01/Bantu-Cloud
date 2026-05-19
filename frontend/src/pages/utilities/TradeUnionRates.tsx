import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Save } from 'lucide-react';
import { http } from '../../api/http';

interface TradeUnion {
  name: string;
  rate: number;
  fixedAmount?: number;
  currency?: 'USD' | 'ZiG';
}

const EMPTY: TradeUnion = { name: '', rate: 0, fixedAmount: 0, currency: 'USD' };

const TradeUnionRates: React.FC = () => {
  const navigate = useNavigate();
  const [unions, setUnions] = useState<TradeUnion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    http.get<{ unions: TradeUnion[] }>('/trade-union-rates')
      .then((res) => setUnions(res.data.unions))
      .catch(() => setUnions([]))
      .finally(() => setLoading(false));
  }, []);

  const add = () => setUnions((u) => [...u, { ...EMPTY }]);

  const remove = (i: number) => setUnions((u) => u.filter((_, idx) => idx !== i));

  const update = (i: number, field: keyof TradeUnion, value: string) => {
    setUnions((u) => u.map((item, idx) =>
      idx !== i ? item : {
        ...item,
        [field]: field === 'rate' || field === 'fixedAmount' ? parseFloat(value) || 0 : value,
      }
    ));
    setSuccess(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess(false);
    try {
      await http.put('/trade-union-rates', { unions });
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Failed to save trade union rates');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => navigate('/utilities')} aria-label="Go back" className="p-2 hover:bg-muted rounded-xl transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold">Trade Union Rates</h1>
          <p className="text-muted-foreground font-medium text-sm">Configure trade union subscription deduction rates</p>
        </div>
      </div>

      {loading ? (
        <div className="text-muted-foreground text-sm font-medium">Loading…</div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-sm text-red-600 font-medium">{error}</div>
          )}
          {success && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-2xl text-sm text-green-700 font-medium">Trade union rates saved.</div>
          )}

          <div className="bg-primary border border-border rounded-2xl overflow-hidden">
            {unions.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm font-medium">
                No trade unions configured. Click "Add Union" to get started.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left px-4 py-3 font-semibold text-xs text-muted-foreground">Union Name</th>
                    <th className="text-left px-4 py-3 font-semibold text-xs text-muted-foreground">Rate (%)</th>
                    <th className="text-left px-4 py-3 font-semibold text-xs text-muted-foreground">Fixed Amount</th>
                    <th className="text-left px-4 py-3 font-semibold text-xs text-muted-foreground">Currency</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {unions.map((u, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="px-4 py-3">
                        <input
                          required
                          value={u.name}
                          onChange={(e) => update(i, 'name', e.target.value)}
                          placeholder="e.g. ZANU Trade Union"
                          className="w-full border border-border rounded-lg px-2.5 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-brand/40"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={u.rate}
                          onChange={(e) => update(i, 'rate', e.target.value)}
                          className="w-24 border border-border rounded-lg px-2.5 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-brand/40"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={u.fixedAmount ?? 0}
                          onChange={(e) => update(i, 'fixedAmount', e.target.value)}
                          className="w-24 border border-border rounded-lg px-2.5 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-brand/40"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={u.currency ?? 'USD'}
                          onChange={(e) => update(i, 'currency', e.target.value)}
                          className="border border-border rounded-lg px-2.5 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-brand/40"
                        >
                          <option value="USD">USD</option>
                          <option value="ZiG">ZiG</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => remove(i)} className="p-1.5 text-muted-foreground hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={add}
              className="flex items-center gap-2 px-4 py-2 text-sm font-bold border border-border rounded-full hover:bg-muted transition-colors"
            >
              <Plus size={14} /> Add Union
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 text-sm font-bold bg-brand text-navy rounded-full shadow hover:opacity-90 disabled:opacity-60 transition-opacity"
            >
              <Save size={14} /> {saving ? 'Saving…' : 'Save Rates'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default TradeUnionRates;
