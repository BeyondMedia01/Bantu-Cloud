import React, { useEffect, useState } from 'react';
import {
  Users, Briefcase, GraduationCap, Target,
  DollarSign, CalendarCheck, Package, TrendingUp,
} from 'lucide-react';
import { AnalyticsAPI } from '../api/client';
import { useToast } from '../context/ToastContext';
import SkeletonTable from '../components/common/SkeletonTable';
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

  const SimpleBar = ({ data, color }: { data: { label: string; value: number }[]; color: string }) => {
    const max = Math.max(...data.map(d => d.value), 1);
    return (
      <div className="flex flex-col gap-2">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-24 truncate text-right">{d.label}</span>
            <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
              <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${(d.value / max) * 100}%` }} />
            </div>
            <span className="text-xs font-bold text-muted-foreground w-8 text-right">{d.value}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy">Analytics</h1>
          <p className="text-muted-foreground font-medium text-sm">Workforce insights and key metrics</p>
        </div>
      </header>

      {loading ? (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-primary rounded-2xl border border-border shadow-sm p-6 animate-pulse">
                <div className="h-8 bg-muted rounded-lg mb-2 w-16" />
                <div className="h-3 bg-muted rounded-lg w-24" />
              </div>
            ))}
          </div>
          <SkeletonTable headers={["", ""]} rows={4} />
        </div>
      ) : (
        <>
          {/* Overview stat cards */}
          {overview && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { icon: Users, label: 'Active Employees', value: overview.employees.active },
                { icon: Briefcase, label: 'Open Positions', value: overview.recruitment.openPostings },
                { icon: GraduationCap, label: 'Active Courses', value: overview.training.activeCourses },
                { icon: Target, label: 'Achieved Goals', value: overview.performance.achievedGoals },
                { icon: DollarSign, label: 'Payroll Processed', value: `$${(overview.payroll.totalProcessed / 1000).toFixed(0)}k` },
                { icon: CalendarCheck, label: 'Pending Leave', value: overview.leave.pending },
                { icon: Package, label: 'Total Assets', value: overview.assets.total },
                { icon: TrendingUp, label: 'Total Employees', value: overview.employees.total },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="bg-primary rounded-2xl border border-border shadow-sm p-6">
                  <div className="flex items-center gap-3 mb-1">
                    <Icon size={18} className="text-muted-foreground shrink-0" />
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider truncate">{label}</p>
                  </div>
                  <p className="text-2xl font-bold text-navy">{value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Charts row 1 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {workforce && (
              <div className="bg-primary rounded-2xl border border-border shadow-sm p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Users size={16} className="text-muted-foreground" />
                  <h3 className="text-sm font-bold text-navy">Workforce by Department</h3>
                </div>
                <SimpleBar data={workforce.departments.map(d => ({ label: d.name, value: d.count }))} color="bg-blue-500" />
              </div>
            )}

            {recruitment && (
              <div className="bg-primary rounded-2xl border border-border shadow-sm p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Briefcase size={16} className="text-muted-foreground" />
                  <h3 className="text-sm font-bold text-navy">Applications by Status</h3>
                </div>
                <SimpleBar data={recruitment.applicationsByStatus.map(a => ({ label: a.status, value: a.count }))} color="bg-emerald-500" />
              </div>
            )}
          </div>

          {/* Charts row 2 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {training && (
              <div className="bg-primary rounded-2xl border border-border shadow-sm p-6">
                <div className="flex items-center gap-2 mb-4">
                  <GraduationCap size={16} className="text-muted-foreground" />
                  <h3 className="text-sm font-bold text-navy">Training Overview</h3>
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Courses by Status</p>
                    <SimpleBar data={training.coursesByStatus.map(c => ({ label: c.status, value: c.count }))} color="bg-purple-500" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Enrollments</p>
                    <SimpleBar data={training.enrollmentsByStatus.map(e => ({ label: e.status, value: e.count }))} color="bg-indigo-500" />
                  </div>
                </div>
              </div>
            )}

            {performance && (
              <div className="bg-primary rounded-2xl border border-border shadow-sm p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Target size={16} className="text-muted-foreground" />
                  <h3 className="text-sm font-bold text-navy">Performance Overview</h3>
                </div>
                {performance.averageRating !== null && (
                  <div className="bg-muted rounded-2xl p-4 text-center mb-4">
                    <p className="text-2xl font-bold text-navy">{performance.averageRating}</p>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Avg Review Rating</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Reviews</p>
                    <SimpleBar data={performance.reviewsByStatus.map(r => ({ label: r.status, value: r.count }))} color="bg-amber-500" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Goals</p>
                    <SimpleBar data={performance.goalsByStatus.map(g => ({ label: g.status.replace('_', ' '), value: g.count }))} color="bg-emerald-500" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default Analytics;
