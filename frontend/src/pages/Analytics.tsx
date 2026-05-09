import React, { useEffect, useState } from 'react';
import {
  BarChart3, Users, Briefcase, GraduationCap, Target,
  DollarSign, CalendarCheck, Package, TrendingUp, Loader,
} from 'lucide-react';
import { AnalyticsAPI } from '../api/client';
import { useToast } from '../context/ToastContext';
import type { AnalyticsOverview, WorkforceData, AnalyticsRecruitment, AnalyticsTraining, AnalyticsPerformance } from '../types/domain';

const Analytics: React.FC = () => {
  const { showToast } = useToast();
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [workforce, setWorkforce] = useState<WorkforceData | null>(null);
  const [recruitment, setRecruitment] = useState<AnalyticsRecruitment | null>(null);
  const [training, setTraining] = useState<AnalyticsTraining | null>(null);
  const [performance, setPerformance] = useState<AnalyticsPerformance | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [o, w, r, t, p] = await Promise.all([
          AnalyticsAPI.getOverview(), AnalyticsAPI.getWorkforce(),
          AnalyticsAPI.getRecruitment(), AnalyticsAPI.getTraining(), AnalyticsAPI.getPerformance(),
        ]);
        setOverview(o.data.data);
        setWorkforce(w.data.data);
        setRecruitment(r.data.data);
        setTraining(t.data.data);
        setPerformance(p.data.data);
      } catch { showToast('Failed to load analytics', 'error'); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <BarChart3 size={28} className="text-navy" />
        <h1 className="text-2xl font-semibold text-navy">Analytics</h1>
      </div>
      <div className="flex items-center justify-center py-20"><Loader size={32} className="animate-spin text-slate-300" /></div>
    </div>
  );

  const StatCard = ({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) => (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className="flex items-center gap-3">
        <div className={`p-2.5 rounded-lg ${color}`}><Icon size={20} className="text-white" /></div>
        <div>
          <p className="text-2xl font-bold text-slate-900">{value}</p>
          <p className="text-xs text-slate-500">{label}</p>
        </div>
      </div>
    </div>
  );

  const SimpleBar = ({ data, color }: { data: { label: string; value: number }[]; color: string }) => {
    const max = Math.max(...data.map(d => d.value), 1);
    return (
      <div className="space-y-2">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="text-xs text-slate-600 w-24 truncate text-right">{d.label}</span>
            <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
              <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${(d.value / max) * 100}%` }} />
            </div>
            <span className="text-xs font-medium text-slate-600 w-8 text-right">{d.value}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <BarChart3 size={28} className="text-navy" />
        <h1 className="text-2xl font-semibold text-navy">Analytics</h1>
      </div>

      {/* Overview cards */}
      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard icon={Users} label="Active Employees" value={overview.employees.active} color="bg-blue-600" />
          <StatCard icon={Briefcase} label="Open Positions" value={overview.recruitment.openPostings} color="bg-green-600" />
          <StatCard icon={GraduationCap} label="Active Courses" value={overview.training.activeCourses} color="bg-purple-600" />
          <StatCard icon={Target} label="Achieved Goals" value={overview.performance.achievedGoals} color="bg-amber-600" />
          <StatCard icon={DollarSign} label="Payroll Processed" value={`$${(overview.payroll.totalProcessed / 1000).toFixed(0)}k`} color="bg-emerald-600" />
          <StatCard icon={CalendarCheck} label="Pending Leave" value={overview.leave.pending} color="bg-orange-600" />
          <StatCard icon={Package} label="Total Assets" value={overview.assets.total} color="bg-indigo-600" />
          <StatCard icon={TrendingUp} label="Total Employees" value={overview.employees.total} color="bg-slate-700" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Workforce */}
        {workforce && (
          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2"><Users size={16} /> Workforce by Department</h3>
            <SimpleBar data={workforce.departments.map(d => ({ label: d.name, value: d.count }))} color="bg-blue-500" />
          </div>
        )}

        {/* Recruitment */}
        {recruitment && (
          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2"><Briefcase size={16} /> Applications by Status</h3>
            <SimpleBar data={recruitment.applicationsByStatus.map(a => ({ label: a.status, value: a.count }))} color="bg-green-500" />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Training */}
        {training && (
          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2"><GraduationCap size={16} /> Training</h3>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <h4 className="text-xs font-medium text-slate-500 mb-2">Courses by Status</h4>
                <SimpleBar data={training.coursesByStatus.map(c => ({ label: c.status, value: c.count }))} color="bg-purple-500" />
              </div>
              <div>
                <h4 className="text-xs font-medium text-slate-500 mb-2">Enrollments by Status</h4>
                <SimpleBar data={training.enrollmentsByStatus.map(e => ({ label: e.status, value: e.count }))} color="bg-indigo-500" />
              </div>
            </div>
          </div>
        )}

        {/* Performance */}
        {performance && (
          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2"><Target size={16} /> Performance</h3>
            {performance.averageRating !== null && (
              <div className="text-center mb-4">
                <p className="text-3xl font-bold text-navy">{performance.averageRating}</p>
                <p className="text-xs text-slate-500">Average Review Rating</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="text-xs font-medium text-slate-500 mb-2">Reviews</h4>
                <SimpleBar data={performance.reviewsByStatus.map(r => ({ label: r.status, value: r.count }))} color="bg-amber-500" />
              </div>
              <div>
                <h4 className="text-xs font-medium text-slate-500 mb-2">Goals</h4>
                <SimpleBar data={performance.goalsByStatus.map(g => ({ label: g.status.replace('_', ' '), value: g.count }))} color="bg-green-500" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Analytics;
