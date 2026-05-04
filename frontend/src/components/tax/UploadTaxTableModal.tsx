import React, { useState } from 'react';
import { X, Upload, FileText, AlertCircle, CheckCircle2, Loader } from 'lucide-react';
import { TaxTableAPI } from '../../api/client';

interface UploadTaxTableModalProps {
  tableId: string;
  tableName?: string;
  onClose: () => void;
  onSuccess: () => void;
}

const UploadTaxTableModal: React.FC<UploadTaxTableModalProps> = ({ tableId, tableName, onClose, onSuccess }) => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);

    try {
      await TaxTableAPI.upload(tableId, file);

      setSuccess(true);
      setTimeout(() => {
        onSuccess();
      }, 1500);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to upload tax table. Check console for details.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-navy/20 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl relative animate-in fade-in zoom-in duration-200">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-2 hover:bg-muted rounded-full text-muted-foreground transition-colors"
        >
          <X size={20} />
        </button>

        <div className="mb-6">
          <h3 className="text-2xl font-bold text-navy">Bulk Upload</h3>
          <p className="text-muted-foreground text-sm font-medium">Populate brackets for {tableName}</p>
        </div>

        {success ? (
          <div className="py-12 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 size={32} />
            </div>
            <h4 className="font-bold text-navy mb-1">Import Successful</h4>
            <p className="text-sm text-muted-foreground">Tax brackets have been updated.</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div 
              className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center transition-colors ${file ? 'border-accent-green bg-blue-50/30' : 'border-border hover:border-border'}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f && (f.type === 'text/csv' || f.type === 'application/pdf' || f.name.endsWith('.xlsx') || f.name.endsWith('.xls'))) {
                  setFile(f);
                }
              }}
            >
              <div className={`p-4 rounded-2xl mb-4 ${file ? 'bg-accent-green text-white' : 'bg-muted text-muted-foreground'}`}>
                {file ? <FileText size={32} /> : <Upload size={32} />}
              </div>
              
              <div className="text-center">
                <p className="font-bold text-navy mb-1">{file ? file.name : 'Choose a file'}</p>
                <p className="text-xs text-muted-foreground font-medium">Supports CSV, PDF or Excel tax tables</p>
              </div>

              <input 
                type="file" 
                className="hidden" 
                id="tax-file-input" 
                accept=".csv,.pdf,.xlsx,.xls"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              <label 
                htmlFor="tax-file-input"
                className="mt-6 px-6 py-2 bg-muted hover:bg-muted rounded-full text-sm font-bold text-navy cursor-pointer transition-colors"
                >
                Browse Files
              </label>
            </div>

            {error && (
              <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex gap-3 items-start text-red-600">
                <AlertCircle size={18} className="shrink-0" />
                <p className="text-xs font-medium">{error}</p>
              </div>
            )}

            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="w-full bg-brand text-navy py-4 rounded-2xl font-bold shadow-lg shadow-navy/10 hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
            >
              {uploading ? <Loader size={18} className="animate-spin" /> : <Upload size={18} />}
              {uploading ? 'Processing File...' : 'Import Brackets'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default UploadTaxTableModal;
