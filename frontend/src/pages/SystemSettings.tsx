import React, { useEffect, useState } from 'react';
import { Search, Save, Edit, Type, Hash, ToggleLeft, Calendar, Info, Clock, AlertCircle, XCircle } from 'lucide-react';
import { SystemSettingsAPI } from '../api/client';
import { useToast } from '../context/ToastContext';

const SystemSettings: React.FC<{ activeCompanyId?: string | null }> = ({ activeCompanyId }) => {
  const { showToast } = useToast();
  const [settings, setSettings] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchSettings = async () => {
    try {
      setFetchError(null);
      // Ensure latest settings (like WORKING_DAYS_PER_PERIOD) are seeded before fetching
      await SystemSettingsAPI.seed().catch(() => console.warn('Silently ignoring seed failure.'));
      const response = await SystemSettingsAPI.getAll();
      setSettings(response.data);
    } catch (error) {
      console.error('Failed to fetch system settings');
      setFetchError('Failed to load system configurations. Please try again.');
    }
  };


  useEffect(() => {
    if (activeCompanyId) {
      fetchSettings();
    }
  }, [activeCompanyId]);

  const handleUpdate = async (id: string, newValues: any) => {
    try {
      await SystemSettingsAPI.update(id, newValues);
      setEditingId(null);
      fetchSettings();
    } catch (error) {
      showToast('Failed to update setting', 'error');
    }
  };

  const filteredSettings = settings.filter(s => 
    s.settingName.toLowerCase().includes(search.toLowerCase()) ||
    (s.description || '').toLowerCase().includes(search.toLowerCase())
  );

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'NUMBER': return <Hash size={16} className="text-accent-green" />;
      case 'BOOLEAN': return <ToggleLeft size={16} className="text-emerald-500" />;
      case 'DATE': return <Calendar size={16} className="text-amber-500" />;
      default: return <Type size={16} className="text-muted-foreground" />;
    }
  };

  const renderValueInput = (setting: any) => {
    if (setting.dataType === 'BOOLEAN') {
      return (
        <label className="relative inline-flex items-center cursor-pointer">
          <input 
            type="checkbox" 
            className="sr-only peer" 
            checked={editValue === 'true'}
            onChange={(e) => setEditValue(e.target.checked ? 'true' : 'false')}
          />
          <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-navy"></div>
          <span className="ml-3 text-sm font-bold text-navy">{editValue === 'true' ? 'Enabled' : 'Disabled'}</span>
        </label>
      );
    }

    return (
      <input
        type={setting.dataType === 'NUMBER' ? 'number' : setting.dataType === 'DATE' ? 'date' : 'text'}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        className="w-full max-w-[200px] border border-border rounded-xl px-3 py-2 text-sm font-bold text-navy focus:outline-none focus:border-accent-green"
      />
    );
  };

  const renderValueDisplay = (setting: any) => {
    if (setting.dataType === 'BOOLEAN') {
      const isTrue = setting.settingValue === 'true';
      return (
        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${isTrue ? 'bg-emerald-50 text-accent-green border border-emerald-100' : 'bg-muted text-muted-foreground border border-border'}`}>
          {isTrue ? 'Enabled' : 'Disabled'}
        </span>
      );
    }
    if (setting.dataType === 'DATE') {
      return <span className="font-mono text-sm text-navy">{new Date(setting.settingValue).toLocaleDateString()}</span>;
    }
    return <span className={`font-bold text-navy ${setting.dataType === 'NUMBER' ? 'font-mono' : ''}`}>{setting.settingValue}</span>;
  };

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-navy mb-1">Global Configurations</h2>
          <p className="text-muted-foreground font-medium">System-wide variables, feature flags, and statutory thresholds.</p>
        </div>
      </header>

      {/* Info Card */}
      <div className="bg-amber-50 rounded-2xl p-6 flex items-start gap-4 border border-amber-100/50">
         <div className="p-3 bg-card text-amber-500 rounded-xl shadow-sm border border-amber-100 shrink-0">
            <AlertCircle size={24} />
         </div>
         <div>
            <h3 className="text-navy font-bold mb-1">Caution: Global Impact</h3>
            <p className="text-sm text-foreground/80 leading-relaxed">
              Modifying these values affects core payroll math and global multi-tenant behavior. Ensure changes align with current legal and compliance guidance. Changes are tracked for auditing.
            </p>
         </div>
      </div>

      {fetchError && (
        <div className="bg-red-50 text-red-600 border border-red-200 rounded-2xl p-4 flex items-center gap-3 shadow-sm">
          <XCircle size={20} className="text-red-500 shrink-0" />
          <p className="text-sm font-medium">{fetchError}</p>
        </div>
      )}

      {/* Settings List */}
      <div className="bg-primary rounded-3xl border border-border shadow-sm overflow-hidden">
        <div className="p-4 px-6 border-b border-border bg-muted/30">
          <div className="relative max-w-md">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Search setting keys or descriptions..." 
              className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:border-accent-green"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
        
        <div className="divide-y divide-border">
          {filteredSettings.length > 0 ? filteredSettings.map(setting => (
            <div key={setting.id} className="p-6 hover:bg-muted/30 transition-colors flex flex-col md:flex-row justify-between items-start md:items-center gap-6 group">
              
              {/* Setting Info */}
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-base font-black text-navy">{setting.settingName}</span>
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-muted border border-border">
                    {getTypeIcon(setting.dataType)}
                    <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">{setting.dataType}</span>
                  </div>
                  {!setting.isActive && (
                    <span className="px-2 py-0.5 rounded-lg bg-red-50 text-red-500 border border-red-100 text-[9px] font-black uppercase tracking-widest">Inactive</span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{setting.description || 'No description provided.'}</p>
                <div className="flex justify-between items-center text-[10px] text-muted-foreground font-bold uppercase tracking-tight mt-3">
                    <span className="flex items-center gap-1.5"><Clock size={12}/> Updated: {new Date(setting.lastUpdatedOn).toLocaleString()}</span>
                    <span>By: {setting.lastUpdatedBy || 'System Init'}</span>
                </div>
              </div>

              {/* Setting Value / Editor */}
              <div className="w-full md:w-auto flex items-center justify-between md:justify-end gap-6 border-t border-border md:border-none pt-4 md:pt-0">
                <div className="bg-card px-4 py-2 rounded-xl border border-border shadow-sm min-w-[120px] text-center">
                  {editingId === setting.id ? renderValueInput(setting) : renderValueDisplay(setting)}
                </div>
                
                <div className="flex gap-2">
                  {editingId === setting.id ? (
                    <>
                      <button 
                        onClick={() => handleUpdate(setting.id, { settingValue: editValue, lastUpdatedBy: 'Admin User' })}
                        className="p-2 bg-emerald-50 text-accent-green hover:bg-emerald-100 rounded-lg transition-colors border border-emerald-100"
                        title="Save Changes"
                      >
                        <Save size={18} />
                      </button>
                      <button 
                        onClick={() => setEditingId(null)}
                        className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-navy transition-colors"
                        title="Cancel"
                      >
                        <XCircle size={18} />
                      </button>
                    </>
                  ) : (
                    <button 
                      onClick={() => {
                        setEditingId(setting.id);
                        setEditValue(setting.settingValue);
                      }}
                      className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-navy transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                      title="Edit Value"
                    >
                      <Edit size={18} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )) : (
             <div className="p-16 text-center text-muted-foreground">
                <Info size={32} className="mx-auto mb-3 opacity-20" />
                <p className="italic font-medium">No global configurations found matching your search.</p>
             </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SystemSettings;
