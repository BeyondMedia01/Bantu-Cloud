import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, X, Check, Layers } from 'lucide-react';
import { GradeAPI } from '../api/client';

interface Grade {
  id: string;
  name: string;
  description: string | null;
  minSalary: number | null;
  maxSalary: number | null;
  _count?: { employees: number };
}

const emptyForm = () => ({ name: '', description: '', minSalary: '', maxSalary: '' });

const Grades: React.FC = () => {
  const [grades, setGrades]         = useState<Grade[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId]         = useState<string | null>(null);
  const [form, setForm]             = useState(emptyForm());
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');
  const [confirmDelete, setConfirmDelete] = useState<Grade | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await GradeAPI.getAll();
      setGrades(res.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const field = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((p) => ({ ...p, [k]: e.target.value }));
      setError('');
    };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Grade name is required.'); return; }
    setSaving(true);
    setError('');
    const payload = {
      name: form.name.trim(),
      description: form.description || null,
      minSalary: form.minSalary ? parseFloat(form.minSalary) : null,
      maxSalary: form.maxSalary ? parseFloat(form.maxSalary) : null,
    };
    try {
      if (editId) {
        await GradeAPI.update(editId, payload);
      } else {
        await GradeAPI.create(payload);
      }
      setShowCreate(false);
      setEditId(null);
      setForm(emptyForm());
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save grade.');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (g: Grade) => {
    setEditId(g.id);
    setForm({
      name: g.name,
      description: g.description ?? '',
      minSalary: g.minSalary != null ? String(g.minSalary) : '',
      maxSalary: g.maxSalary != null ? String(g.maxSalary) : '',
    });
    setShowCreate(true);
    setError('');
  };

  const cancelForm = () => {
    setShowCreate(false);
    setEditId(null);
    setForm(emptyForm());
    setError('');
  };

  const handleDelete = async (g: Grade) => {
    try {
      await GradeAPI.delete(g.id);
      setConfirmDelete(null);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete grade.');
      setConfirmDelete(null);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold">Salary Grades</h1>
          <p className="text-muted-foreground font-medium text-sm">
            Define grade bands used for NEC / graded pay structures
          </p>
        </div>
        {!showCreate && (
          <button
            onClick={() => { setShowCreate(true); setEditId(null); setForm(emptyForm()); }}
            className="flex items-center gap-1.5 bg-brand text-navy px-4 py-2 rounded-full font-bold shadow hover:opacity-90 text-sm"
          >
            <Plus size={15} /> New Grade
          </button>
        )}
      </div>

      {/* Create / Edit form */}
      {showCreate && (
        <form
          onSubmit={handleSave}
          className="bg-primary border border-border rounded-2xl p-6 shadow-sm mb-6"
        >
          <h2 className="font-bold text-sm uppercase tracking-wider text-muted-foreground mb-4">
            {editId ? 'Edit Grade' : 'New Grade'}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-bold text-foreground/80 mb-1.5">Grade Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={field('name')}
                placeholder="e.g. Grade A, Band 3, NEC Grade 7"
                className="w-full px-4 py-2.5 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-green/30 focus:border-accent-green"
                required
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-bold text-foreground/80 mb-1.5">Description</label>
              <input
                type="text"
                value={form.description}
                onChange={field('description')}
                placeholder="Optional description or category"
                className="w-full px-4 py-2.5 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-green/30 focus:border-accent-green"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-foreground/80 mb-1.5">Min Salary (USD)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-bold">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.minSalary}
                  onChange={field('minSalary')}
                  placeholder="0.00"
                  className="w-full pl-8 pr-4 py-2.5 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-green/30 focus:border-accent-green"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold text-foreground/80 mb-1.5">Max Salary (USD)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-bold">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.maxSalary}
                  onChange={field('maxSalary')}
                  placeholder="0.00"
                  className="w-full pl-8 pr-4 py-2.5 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-green/30 focus:border-accent-green"
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium mb-4">{error}</div>
          )}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 bg-brand text-navy px-4 py-2 rounded-full font-bold hover:opacity-90 disabled:opacity-60 text-sm"
            >
              <Check size={15} /> {saving ? 'Saving…' : editId ? 'Save Changes' : 'Create Grade'}
            </button>
            <button
              type="button"
              onClick={cancelForm}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-border font-bold text-muted-foreground hover:bg-muted text-sm"
            >
              <X size={14} /> Cancel
            </button>
          </div>
        </form>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-center py-16 text-muted-foreground text-sm font-medium">Loading…</div>
      ) : grades.length === 0 ? (
        <div className="bg-primary border border-border rounded-2xl p-12 text-center shadow-sm">
          <Layers size={36} className="mx-auto mb-3 text-slate-200" />
          <p className="text-muted-foreground font-medium text-sm">No grades defined yet.</p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-4 text-accent-green text-sm font-bold hover:underline"
          >
            Create your first grade →
          </button>
        </div>
      ) : (
        <div className="bg-primary border border-border rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th className="text-left px-5 py-3 text-xs font-black text-muted-foreground uppercase tracking-wider">Grade</th>
                <th className="text-left px-5 py-3 text-xs font-black text-muted-foreground uppercase tracking-wider">Description</th>
                <th className="text-left px-5 py-3 text-xs font-black text-muted-foreground uppercase tracking-wider">Min Salary</th>
                <th className="text-left px-5 py-3 text-xs font-black text-muted-foreground uppercase tracking-wider">Max Salary</th>
                <th className="text-left px-5 py-3 text-xs font-black text-muted-foreground uppercase tracking-wider">Employees</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {grades.map((g) => (
                <tr key={g.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-5 py-3 font-bold text-navy">{g.name}</td>
                  <td className="px-5 py-3 text-muted-foreground font-medium">{g.description ?? '—'}</td>
                  <td className="px-5 py-3 font-medium">
                    {g.minSalary != null ? `$${g.minSalary.toLocaleString()}` : '—'}
                  </td>
                  <td className="px-5 py-3 font-medium">
                    {g.maxSalary != null ? `$${g.maxSalary.toLocaleString()}` : '—'}
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-xs font-black text-muted-foreground bg-muted px-2 py-1 rounded-full">
                      {g._count?.employees ?? '—'}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => startEdit(g)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-navy hover:bg-muted transition-colors"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(g)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="grades-delete-modal-title" className="bg-card rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <h3 id="grades-delete-modal-title" className="font-bold text-navy mb-2">Delete "{confirmDelete.name}"?</h3>
            <p className="text-sm text-muted-foreground font-medium mb-1">
              {(confirmDelete._count?.employees ?? 0) > 0
                ? `This grade has ${confirmDelete._count!.employees} employee(s) assigned. Employees will remain but lose their grade association.`
                : 'This grade has no employees. It will be permanently deleted.'}
            </p>
            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-5 py-2 rounded-full border border-border font-bold text-muted-foreground hover:bg-muted text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                className="px-5 py-2 rounded-full bg-red-500 text-white font-bold text-sm hover:opacity-90"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Grades;
