import React, { useEffect, useState } from 'react';
import { IntelligenceAPI } from '../api/client';
import { getActiveCompanyId } from '../lib/companyContext';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';

const IntelligenceWidget: React.FC = () => {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [fraudFlags, setFraudFlags] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const fetchIntel = async () => {
      const companyId = getActiveCompanyId();
      if (!companyId) { if (mounted) setLoading(false); return; }

      try {
        setLoading(true);
        const [alertsRes, fraudRes] = await Promise.all([
          IntelligenceAPI.getAlerts(companyId),
          IntelligenceAPI.getFraud(companyId)
        ]);

        if (!mounted) return;
        if (alertsRes.data?.alerts) setAlerts(alertsRes.data.alerts);
        if (fraudRes.data?.flags) setFraudFlags(fraudRes.data.flags);
      } catch (err) {
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchIntel();
    return () => { mounted = false; };
  }, []); // [] is correct — company switches trigger a full page reload (window.location.reload)

  if (loading || (alerts.length === 0 && fraudFlags.length === 0)) {
    return null; // Return null if nothing to show to keep dashboard clean
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Fraud Flags */}
      {fraudFlags.length > 0 && (
        <div className="bg-destructive-bg border border-destructive/30 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <ShieldAlert size={20} className="text-destructive" />
            <h3 className="font-bold text-destructive text-sm tracking-wide">FRAUD DETECTED</h3>
          </div>
          <div className="flex flex-col gap-3">
            {fraudFlags.map((flag, idx) => (
              <div key={idx} className="bg-card p-4 rounded-xl shadow-sm border border-destructive/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-foreground">{flag.message}</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {flag.employees?.map((emp: any) => (
                      <span key={emp.id} className="text-[10px] font-bold bg-muted text-muted-foreground px-2 py-1 rounded-md">
                        {emp.name} ({emp.code})
                      </span>
                    ))}
                  </div>
                </div>
                <Link to="/employees" className="shrink-0 bg-destructive text-white text-xs font-bold px-4 py-2 rounded-full hover:bg-destructive/90 transition">
                  Review Data
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Smart Alerts */}
      {alerts.length > 0 && (
        <div className="bg-warning-bg border border-warning-border rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={20} className="text-warning" />
            <h3 className="font-bold text-warning text-sm tracking-wide">SMART ALERTS</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {alerts.map((alert, idx) => (
              <div key={idx} className="bg-card p-4 rounded-xl shadow-sm border border-warning-border/50 flex flex-col justify-between gap-3">
                <p className="text-sm font-bold text-foreground leading-snug">{alert.message}</p>
                {alert.actionLink && (
                  <Link to={alert.actionLink} className="self-start text-xs font-bold text-warning hover:text-warning/80 flex items-center gap-1 group">
                    {alert.actionText} <span className="group-hover:translate-x-1 transition-transform">→</span>
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default IntelligenceWidget;
