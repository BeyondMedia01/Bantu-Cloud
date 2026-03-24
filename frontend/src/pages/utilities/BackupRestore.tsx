import React, { useState } from 'react';
import { Download, Upload, AlertTriangle, CheckCircle, Loader2, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { BackupAPI } from '../../api/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const BackupRestore: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const handleExport = async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const res = await BackupAPI.export();
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Bantu_Backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      setSuccess('Backup generated and downloaded successfully.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to generate backup';
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? msg);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    e.target.value = ''; // allow re-selecting the same file
  };

  const confirmRestore = async () => {
    if (!pendingFile) return;
    const file = pendingFile;
    setPendingFile(null);
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const text = await file.text();
      const backupData = JSON.parse(text);
      await BackupAPI.restore(backupData);
      setSuccess('Data restored successfully. Please refresh the page to see changes.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid backup file or restore failed';
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Restore confirmation dialog */}
      <Dialog open={!!pendingFile} onOpenChange={(open) => { if (!open) setPendingFile(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore from Backup</DialogTitle>
            <DialogDescription>
              <span className="font-semibold text-destructive">WARNING:</span> Restoring from a backup
              will overwrite or merge data. This action is irreversible. Are you sure you want to proceed?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingFile(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmRestore}>Restore</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <button
        onClick={() => navigate('/utilities')}
        aria-label="Go back"
        className="flex items-center gap-2 text-slate-500 hover:text-navy mb-6 transition-colors"
      >
        <ArrowLeft size={20} />
        <span className="font-medium">Back to Utilities</span>
      </button>

      <div className="mb-8">
        <h1 className="text-2xl font-bold">Backup & Restore</h1>
        <p className="text-slate-500 text-sm font-medium">Protect your data and ensure business continuity</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Export Card */}
        <div className="bg-primary border border-border rounded-2xl p-8 shadow-sm">
          <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 mb-6">
            <Download size={24} />
          </div>
          <h2 className="text-xl font-bold text-navy mb-2">Export Data</h2>
          <p className="text-slate-500 text-sm font-medium mb-8 leading-relaxed">
            Download a complete snapshot of your company's data in JSON format.
            This includes employees, payroll history, loans, and settings.
          </p>
          <Button
            onClick={handleExport}
            disabled={loading}
            className="w-full bg-navy text-white rounded-xl hover:bg-slate-800 gap-2"
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : <Download size={20} />}
            Generate Backup
          </Button>
        </div>

        {/* Restore Card */}
        <div className="bg-primary border border-border rounded-2xl p-8 shadow-sm">
          <div className="w-12 h-12 bg-orange-50 rounded-xl flex items-center justify-center text-orange-600 mb-6">
            <Upload size={24} />
          </div>
          <h2 className="text-xl font-bold text-navy mb-2">Restore Data</h2>
          <p className="text-slate-500 text-sm font-medium mb-8 leading-relaxed">
            Upload a previously generated backup file to restore your data.{' '}
            <span className="text-orange-600">This will update or add records to your current database.</span>
          </p>
          <label className="cursor-pointer block">
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleFileSelect}
              disabled={loading}
            />
            <div className="w-full bg-white border-2 border-dashed border-slate-300 rounded-xl py-3 font-semibold text-slate-600 hover:border-navy hover:text-navy transition-all flex items-center justify-center gap-2">
              {loading ? <Loader2 className="animate-spin" size={20} /> : <Upload size={20} />}
              Select Backup File
            </div>
          </label>
        </div>
      </div>

      {/* Status messages */}
      {error && (
        <div className="mt-8 bg-rose-50 border border-rose-200 text-rose-700 p-4 rounded-xl flex items-start gap-3">
          <AlertTriangle className="shrink-0 mt-0.5" size={20} />
          <div>
            <p className="font-bold">Error</p>
            <p className="text-sm font-medium">{error}</p>
          </div>
        </div>
      )}

      {success && (
        <div className="mt-8 bg-emerald-50 border border-emerald-200 text-emerald-700 p-4 rounded-xl flex items-start gap-3">
          <CheckCircle className="shrink-0 mt-0.5" size={20} />
          <div>
            <p className="font-bold">Success</p>
            <p className="text-sm font-medium">{success}</p>
          </div>
        </div>
      )}

      {/* Safety notice */}
      <div className="mt-8 p-6 bg-slate-50 rounded-2xl border border-slate-200">
        <div className="flex items-center gap-2 text-navy font-bold mb-3 text-sm italic">
          <AlertTriangle size={16} />
          IMPORTANT SAFETY INFORMATION
        </div>
        <ul className="text-xs text-slate-500 font-medium space-y-2 list-disc pl-4 leading-relaxed italic">
          <li>Always generate a fresh backup before performing a restore operation.</li>
          <li>Ensure nobody else is processing payroll while a restore is in progress.</li>
          <li>For security, backup files should be stored in a password-protected location.</li>
          <li>Restoring a large dataset may take several seconds. Do not close the browser during the process.</li>
        </ul>
      </div>
    </div>
  );
};

export default BackupRestore;
