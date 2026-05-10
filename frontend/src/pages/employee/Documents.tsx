import React, { useEffect, useState } from 'react';
import { FileText, Download } from 'lucide-react';
import { EmployeeSelfAPI } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import SkeletonTable from '../../components/common/SkeletonTable';
import { EmptyState } from '../../components/ui/empty-state';

const DOC_TYPE_COLORS: Record<string, string> = {
  CONTRACT:     'bg-blue-50 text-blue-700',
  PAYSLIP:      'bg-emerald-50 text-emerald-700',
  CERTIFICATE:  'bg-purple-50 text-purple-700',
  ID:           'bg-amber-50 text-amber-700',
  OTHER:        'bg-muted text-muted-foreground',
};

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

const EmployeeDocuments: React.FC = () => {
  const { showToast } = useToast();
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('');

  useEffect(() => {
    EmployeeSelfAPI.getDocuments()
      .then((r) => setDocs(r.data))
      .catch(() => showToast('Failed to load documents', 'error'))
      .finally(() => setLoading(false));
  }, []);

  const types = Array.from(new Set(docs.map((d) => d.type).filter(Boolean)));
  const filtered = filterType ? docs.filter((d) => d.type === filterType) : docs;

  const handleDownload = (doc: any) => {
    if (!doc.url) { showToast('No file attached to this document', 'error'); return; }
    const a = document.createElement('a');
    a.href = doc.url;
    a.download = doc.name || 'document';
    a.target = '_blank';
    a.click();
  };

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-navy">My Documents</h1>
        <p className="text-muted-foreground font-medium text-sm">Documents shared with you by HR</p>
      </header>

      {/* Type filter pills */}
      {types.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setFilterType('')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
              filterType === '' ? 'bg-navy text-white border-navy' : 'border-border text-muted-foreground hover:border-navy hover:text-navy'
            }`}
          >
            All
          </button>
          {types.map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                filterType === t ? 'bg-navy text-white border-navy' : 'border-border text-muted-foreground hover:border-navy hover:text-navy'
              }`}
            >
              {t.charAt(0) + t.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      )}

      <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden">
        {loading ? (
          <SkeletonTable headers={['Document Name', 'Type', 'Date Uploaded', 'Download']} rows={5} />
        ) : filtered.length === 0 ? (
          <EmptyState
            variant="no-data"
            icon={FileText}
            title="No documents"
            description="No documents have been shared with you yet."
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted border-b border-border">
              <tr>
                {['Document Name', 'Type', 'Date Uploaded', 'Download'].map((h) => (
                  <th key={h} className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((doc: any) => (
                <tr key={doc.id} className="hover:bg-muted/70 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2.5">
                      <FileText size={16} className="text-muted-foreground shrink-0" />
                      <span className="font-medium text-navy">{doc.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    {doc.type ? (
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold ${DOC_TYPE_COLORS[doc.type] || DOC_TYPE_COLORS.OTHER}`}>
                        {doc.type.charAt(0) + doc.type.slice(1).toLowerCase()}
                      </span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-5 py-4 text-muted-foreground">{fmtDate(doc.uploadedAt)}</td>
                  <td className="px-5 py-4">
                    <button
                      onClick={() => handleDownload(doc)}
                      className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-navy transition-colors"
                      title="Download"
                    >
                      <Download size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default EmployeeDocuments;
