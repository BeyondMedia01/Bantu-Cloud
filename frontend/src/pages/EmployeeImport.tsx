import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Upload, CheckCircle2, XCircle, FileSpreadsheet, FileText } from 'lucide-react';
import { EmployeeAPI } from '../api/client';

interface FailedRow {
  row: number;
  name: string;
  reason: string;
}

interface ImportResult {
  message: string;
  created: number;
  failed: FailedRow[];
}

const EmployeeImport: React.FC = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');

  const downloadTemplate = async (format: 'csv' | 'xlsx') => {
    try {
      const res = await EmployeeAPI.downloadTemplate(format);
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `employee_import_template.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Failed to download template.');
    }
  };

  const handleFile = (f: File) => {
    const ext = f.name.toLowerCase().split('.').pop();
    if (!['csv', 'xlsx', 'xls'].includes(ext || '')) {
      setError('Please select a CSV or Excel (.xlsx) file.');
      return;
    }
    setError('');
    setResult(null);
    setFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError('');
    setResult(null);
    try {
      const res = await EmployeeAPI.importBulk(file);
      setResult(res.data);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      setError(err.response?.data?.message || 'Import failed. Please check your file and try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => navigate('/employees')} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold">Bulk Import Employees</h1>
          <p className="text-slate-500 font-medium text-sm">Upload a CSV or Excel file to add multiple employees at once</p>
        </div>
      </div>

      {/* Step 1: Download template */}
      <div className="bg-primary rounded-2xl border border-border p-6 shadow-sm mb-4">
        <div className="flex items-center gap-3 mb-1">
          <span className="w-6 h-6 rounded-full bg-btn-primary text-navy text-xs font-bold flex items-center justify-center shrink-0">1</span>
          <h3 className="font-bold text-sm uppercase tracking-wider text-slate-400">Download Template</h3>
        </div>
        <p className="text-sm text-slate-500 mb-4 pl-9">
          Start by downloading the template. Fill in your employee data — the columns must stay the same for the upload to work.
        </p>
        <div className="flex gap-3 pl-9">
          <button
            onClick={() => downloadTemplate('xlsx')}
            className="flex items-center gap-2 bg-btn-primary text-navy px-5 py-2.5 rounded-full text-sm font-bold hover:opacity-90 shadow"
          >
            <FileSpreadsheet size={16} /> Download Excel Template
          </button>
          <button
            onClick={() => downloadTemplate('csv')}
            className="flex items-center gap-2 border border-border text-slate-600 px-5 py-2.5 rounded-full text-sm font-bold hover:bg-slate-50"
          >
            <FileText size={16} /> Download CSV Template
          </button>
        </div>
      </div>

      {/* Step 2: Upload file */}
      <div className="bg-primary rounded-2xl border border-border p-6 shadow-sm mb-4">
        <div className="flex items-center gap-3 mb-1">
          <span className="w-6 h-6 rounded-full bg-btn-primary text-navy text-xs font-bold flex items-center justify-center shrink-0">2</span>
          <h3 className="font-bold text-sm uppercase tracking-wider text-slate-400">Upload Filled File</h3>
        </div>
        <p className="text-sm text-slate-500 mb-4 pl-9">
          Upload your completed template. Accepted formats: <strong>.csv</strong> and <strong>.xlsx</strong>. Max 5 MB.
        </p>

        {error && (
          <div className="mb-4 ml-9 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium">{error}</div>
        )}

        {/* Drop zone */}
        <div
          className={`ml-9 border-2 border-dashed rounded-2xl p-8 text-center transition-colors cursor-pointer ${
            dragging ? 'border-btn-primary bg-btn-primary/5' : 'border-slate-200 hover:border-slate-300'
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          <Upload size={28} className="mx-auto mb-3 text-slate-300" />
          {file ? (
            <div>
              <p className="text-sm font-bold text-navy">{file.name}</p>
              <p className="text-xs text-slate-400 mt-1">{(file.size / 1024).toFixed(1)} KB — click to change</p>
            </div>
          ) : (
            <div>
              <p className="text-sm font-bold text-slate-500">Drag & drop your file here</p>
              <p className="text-xs text-slate-400 mt-1">or click to browse</p>
            </div>
          )}
        </div>

        {file && (
          <div className="flex gap-3 mt-4 ml-9">
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="flex items-center gap-2 bg-btn-primary text-navy px-8 py-3 rounded-full font-bold shadow hover:opacity-90 disabled:opacity-60"
            >
              <Upload size={16} /> {uploading ? 'Importing…' : 'Import Employees'}
            </button>
            <button
              type="button"
              onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
              className="px-6 py-3 rounded-full border border-border font-bold text-slate-500 hover:bg-slate-50"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Results */}
      {result && (
        <div className="bg-primary rounded-2xl border border-border p-6 shadow-sm">
          <h3 className="font-bold text-sm uppercase tracking-wider text-slate-400 mb-4">Import Results</h3>

          <div className="flex gap-4 mb-4">
            <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-100 rounded-xl">
              <CheckCircle2 size={18} className="text-emerald-600" />
              <div>
                <p className="text-xl font-bold text-emerald-700">{result.created}</p>
                <p className="text-xs font-bold text-emerald-600 uppercase tracking-wide">Created</p>
              </div>
            </div>
            {result.failed.length > 0 && (
              <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-100 rounded-xl">
                <XCircle size={18} className="text-red-500" />
                <div>
                  <p className="text-xl font-bold text-red-600">{result.failed.length}</p>
                  <p className="text-xs font-bold text-red-500 uppercase tracking-wide">Failed</p>
                </div>
              </div>
            )}
          </div>

          {result.failed.length > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Failed Rows</p>
              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-border">
                      <th className="px-4 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider">Row</th>
                      <th className="px-4 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider">Name</th>
                      <th className="px-4 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {result.failed.map((f) => (
                      <tr key={f.row}>
                        <td className="px-4 py-2 text-slate-500 font-medium">{f.row}</td>
                        <td className="px-4 py-2 font-semibold">{f.name || '—'}</td>
                        <td className="px-4 py-2 text-red-600 font-medium">{f.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {result.created > 0 && (
            <button
              onClick={() => navigate('/employees')}
              className="mt-4 flex items-center gap-2 bg-btn-primary text-navy px-6 py-2.5 rounded-full font-bold text-sm hover:opacity-90"
            >
              View Employees
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default EmployeeImport;
