import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import {
  LayoutDashboard, Users, DollarSign, FileText, Settings,
  Building2, User, ChevronDown, LogOut, Wrench,
  CalendarDays, CreditCard, ShieldCheck, Menu, ChevronRight,
  ClipboardList, Clock, Cpu, PanelLeftClose, PanelLeftOpen, Download,
  UserCog, UserPlus, TrendingUp, Receipt, BookOpen, BarChart2,
  Package, FolderOpen,
} from 'lucide-react';
import { getUser, logout } from '../lib/auth';
import { CompanyAPI, UserAPI } from '../api/client';
import { setActiveCompanyId } from '../lib/companyContext';
import { getAvatarGradient } from '../lib/avatarGradient';
import { useIdleTimer } from '../hooks/useIdleTimer';
import IdleTimerModal from './common/IdleTimerModal';
import { usePermissions } from '../hooks/usePermissions';

const IS_DESKTOP = typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__;

// ── Nav structure ─────────────────────────────────────────────────────────────

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  module?: string;
}

interface NavGroup {
  key: string;
  label: string;
  icon: React.ReactNode;
  items: NavItem[];
}

const AppShell: React.FC = () => {
  const user = getUser();
  const navigate = useNavigate();
  const location = useLocation();

  const { isIdle, isWarning, remainingTime, resetTimer } = useIdleTimer({
    timeout: IS_DESKTOP ? 30 * 60 * 1000 : 60_000,
    warningThreshold: IS_DESKTOP ? 29 * 60 * 1000 : 50_000,
  });

  const [companies, setCompanies] = useState<any[]>([]);
  const [activeCompany, setActiveCompany] = useState<any>(null);
  const [liveUserName, setLiveUserName] = useState<string | null>(null);
  const [companyDropdown, setCompanyDropdown] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() =>
    localStorage.getItem('sidebarCollapsed') === 'true'
  );
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem('sidebarGroups') || '{}'); } catch { return {}; }
  });

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('sidebarCollapsed', String(next));
    if (next) setCompanyDropdown(false);
  };

  const toggleGroup = (key: string) => {
    setOpenGroups(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem('sidebarGroups', JSON.stringify(next));
      return next;
    });
  };

  useEffect(() => {
    let mounted = true;
    if (user?.role !== 'EMPLOYEE') {
      CompanyAPI.getAll().then((res) => {
        if (!mounted) return;
        const list = res.data;
        setCompanies(list);
        const stored = sessionStorage.getItem('activeCompanyId');
        const found = list.find((c: any) => c.id === stored) || list[0];
        if (found) {
          setActiveCompany(found);
          setActiveCompanyId(found.id);
        } else {
          setActiveCompany(null);
        }
      }).catch(() => {});
    }
    return () => { mounted = false; };
  }, [user]);

  useEffect(() => {
    UserAPI.me().then((res) => {
      const d = res.data as any;
      const first = d.firstName || d.name?.split(' ')[0] || null;
      setLiveUserName(first);
    }).catch(() => {});
  }, []);

  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  const handleLogout = () => { logout(); navigate('/login'); };

  const handleCheckUpdates = async () => {
    if (!IS_DESKTOP) return;
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const result = await check();
      if (!result) {
        const { toast } = await import('sonner');
        toast.info('You are on the latest version.');
      }
    } catch {}
  };

  useEffect(() => { if (isIdle) handleLogout(); }, [isIdle, navigate]);

  const handleSelectCompany = (company: any) => {
    setActiveCompany(company);
    setActiveCompanyId(company.id);
    setCompanyDropdown(false);
    window.dispatchEvent(new Event('activeCompanyChanged'));
    navigate(homeLink);
  };

  const isAdmin = user?.role === 'PLATFORM_ADMIN';
  const isEmployee = user?.role === 'EMPLOYEE';
  const { can } = usePermissions();

  const navScrollRef = useRef<HTMLElement>(null);
  const savedScrollPos = useRef(0);
  useLayoutEffect(() => {
    if (navScrollRef.current) navScrollRef.current.scrollTop = savedScrollPos.current;
  });

  // ── Group definitions ──────────────────────────────────────────────────────

  const allGroups: NavGroup[] = [
    {
      key: 'people',
      label: 'People',
      icon: <Users size={18} />,
      items: [
        { to: '/employees', label: 'Employees', icon: <Users size={16} />, module: 'PEOPLE' },
        { to: '/grades', label: 'Grades', icon: <ClipboardList size={16} />, module: 'PEOPLE' },
        { to: '/client-admin/structure', label: 'Company Structure', icon: <Building2 size={16} />, module: 'PEOPLE' },
        { to: '/recruitment', label: 'Recruitment', icon: <UserPlus size={16} />, module: 'RECRUITMENT' },
        { to: '/onboarding', label: 'Onboarding', icon: <ClipboardList size={16} />, module: 'ONBOARDING' },
        { to: '/succession', label: 'Succession', icon: <TrendingUp size={16} />, module: 'SUCCESSION' },
      ],
    },
    {
      key: 'time',
      label: 'Time & Leave',
      icon: <CalendarDays size={18} />,
      items: [
        { to: '/leave', label: 'Leave', icon: <CalendarDays size={16} />, module: 'TIME_LEAVE' },
        { to: '/shifts', label: 'Shifts & Roster', icon: <Clock size={16} />, module: 'TIME_LEAVE' },
        { to: '/attendance', label: 'Attendance', icon: <Cpu size={16} />, module: 'TIME_LEAVE' },
      ],
    },
    {
      key: 'payroll',
      label: 'Payroll & Finance',
      icon: <DollarSign size={18} />,
      items: [
        { to: '/payroll', label: 'Payroll', icon: <DollarSign size={16} />, module: 'PAYROLL' },
        { to: '/payslip-input', label: 'Payslip Input', icon: <ClipboardList size={16} />, module: 'PAYROLL' },
        { to: '/loans', label: 'Loans', icon: <CreditCard size={16} />, module: 'PAYROLL' },
        { to: '/expenses', label: 'Expenses', icon: <Receipt size={16} />, module: 'EXPENSES' },
        { to: '/assets', label: 'Assets', icon: <Package size={16} />, module: 'ASSETS' },
      ],
    },
    {
      key: 'performance',
      label: 'Performance',
      icon: <TrendingUp size={18} />,
      items: [
        { to: '/performance', label: 'Performance', icon: <TrendingUp size={16} />, module: 'PERFORMANCE' },
        { to: '/training', label: 'Training', icon: <BookOpen size={16} />, module: 'TRAINING' },
        { to: '/surveys', label: 'Surveys', icon: <ClipboardList size={16} />, module: 'SURVEYS' },
      ],
    },
    {
      key: 'insights',
      label: 'Insights',
      icon: <BarChart2 size={18} />,
      items: [
        { to: '/reports', label: 'Reports', icon: <FileText size={16} />, module: 'REPORTS' },
        { to: '/analytics', label: 'Analytics', icon: <BarChart2 size={16} />, module: 'ANALYTICS' },
      ],
    },
    {
      key: 'settings',
      label: 'Settings',
      icon: <Settings size={18} />,
      items: [
        { to: '/utilities', label: 'Utilities', icon: <Wrench size={16} /> },
        { to: '/client-admin/settings', label: 'Settings', icon: <Settings size={16} /> },
      ],
    },
  ];

  // Filter items the user has access to, then remove empty groups
  const visibleGroups = allGroups.map(group => ({
    ...group,
    items: group.items.filter(item => !item.module || can(item.module as any)),
  })).filter(group => group.items.length > 0);

  // Auto-expand the group containing the active route (on route change)
  useEffect(() => {
    const activeGroup = visibleGroups.find(g =>
      g.items.some(item => location.pathname === item.to || location.pathname.startsWith(item.to + '/'))
    );
    if (activeGroup && !openGroups[activeGroup.key]) {
      setOpenGroups(prev => {
        const next = { ...prev, [activeGroup.key]: true };
        localStorage.setItem('sidebarGroups', JSON.stringify(next));
        return next;
      });
    }
  }, [location.pathname]);

  // ── Simple nav links (admin / employee) ────────────────────────────────────

  const adminLinks = [
    { to: '/admin', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
    { to: '/admin/users', label: 'Users', icon: <Users size={18} /> },
    { to: '/admin/clients', label: 'Clients', icon: <Building2 size={18} /> },
    { to: '/admin/licenses', label: 'Licenses', icon: <ShieldCheck size={18} /> },
    { to: '/admin/settings', label: 'Settings', icon: <Settings size={18} /> },
  ];

  const employeeLinks = [
    { to: '/employee',             label: 'Dashboard',  icon: <LayoutDashboard size={18} /> },
    { to: '/employee/payslips',    label: 'Payslips',   icon: <FileText size={18} /> },
    { to: '/employee/leave',       label: 'Leave',      icon: <CalendarDays size={18} /> },
    { to: '/employee/attendance',  label: 'Attendance', icon: <Clock size={18} /> },
    { to: '/employee/documents',   label: 'Documents',  icon: <FolderOpen size={18} /> },
    { to: '/employee/profile',     label: 'Profile',    icon: <User size={18} /> },
  ];

  const adminSectionLinks = user?.role === 'CLIENT_ADMIN' ? [
    { to: '/companies', label: 'Companies', icon: <Building2 size={18} /> },
    { to: '/client-admin/roles', label: 'Roles', icon: <ShieldCheck size={18} /> },
    { to: '/client-admin/users', label: 'Team Members', icon: <UserCog size={18} /> },
  ] : [];

  const homeLink = isAdmin ? '/admin' : isEmployee ? '/employee' : '/dashboard';

  // ── Link components ────────────────────────────────────────────────────────

  const FlatLink = ({ link, small = false }: { link: { to: string; label: string; icon: React.ReactNode }; small?: boolean }) => {
    const active = location.pathname === link.to ||
      (link.to !== '/dashboard' && link.to !== '/admin' && link.to !== '/employee' &&
        location.pathname.startsWith(link.to));
    return (
      <Link
        to={link.to}
        title={collapsed ? link.label : undefined}
        className={`flex items-center gap-3 rounded-xl text-sm font-bold transition-all
          ${collapsed ? 'justify-center px-0 py-2.5 mx-2' : small ? 'pl-9 pr-3 py-2' : 'px-3 py-2.5'}
          ${active
            ? 'bg-brand text-navy shadow-sm'
            : 'text-muted-foreground hover:bg-muted hover:text-navy'
          }`}
      >
        <span className="shrink-0">{link.icon}</span>
        {!collapsed && <span>{link.label}</span>}
      </Link>
    );
  };

  const GroupSection = ({ group }: { group: NavGroup }) => {
    const isOpen = !!openGroups[group.key];
    const hasActive = group.items.some(item =>
      location.pathname === item.to || location.pathname.startsWith(item.to + '/')
    );

    if (collapsed) {
      // In collapsed mode: show group icon, clicking navigates to first item + expands sidebar
      const firstItem = group.items[0];
      return (
        <button
          title={group.label}
          onClick={() => {
            setCollapsed(false);
            localStorage.setItem('sidebarCollapsed', 'false');
            navigate(firstItem.to);
          }}
          className={`flex justify-center items-center mx-2 py-2.5 rounded-xl transition-all
            ${hasActive ? 'bg-brand text-navy shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-navy'}`}
        >
          {group.icon}
        </button>
      );
    }

    return (
      <div>
        <button
          onClick={() => toggleGroup(group.key)}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-bold transition-all
            ${hasActive && !isOpen ? 'text-navy' : 'text-muted-foreground hover:text-navy hover:bg-muted'}`}
        >
          <div className="flex items-center gap-3">
            <span className={`shrink-0 ${hasActive ? 'text-brand' : ''}`}>{group.icon}</span>
            <span>{group.label}</span>
          </div>
          <ChevronDown size={14} className={`shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && (
          <div className="mt-0.5 flex flex-col gap-0.5">
            {group.items.map(item => (
              <FlatLink key={item.to} link={item} small />
            ))}
          </div>
        )}
      </div>
    );
  };

  // ── Sidebar content ────────────────────────────────────────────────────────

  const SidebarContent = ({ mobile = false }: { mobile?: boolean }) => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={`flex items-center border-b border-border shrink-0 py-3.5
          ${collapsed && !mobile ? 'justify-center px-2' : 'gap-3 px-4'}`}>
        <Link to={homeLink} className="flex items-center gap-3 min-w-0 flex-1">
          <img src="/logo.svg" alt="Bantu" className="w-9 h-9 shrink-0" />
          {(!collapsed || mobile) && <span className="text-lg font-bold tracking-tight">Bantu</span>}
        </Link>
        {mobile && (
          <button
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation menu"
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors shrink-0"
          >
            <PanelLeftClose size={18} />
          </button>
        )}
        {!mobile && (
          <button
            onClick={toggleCollapsed}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-navy transition-colors shrink-0"
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        )}
      </div>

      {/* Company switcher */}
      {!isEmployee && !isAdmin && (!collapsed || mobile) && (
        <div className="px-3 py-3 border-b border-border">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1 mb-1.5">Active Company</p>
          <button
            onClick={() => setCompanyDropdown(!companyDropdown)}
            aria-haspopup="listbox"
            aria-expanded={companyDropdown}
            className="w-full flex items-center gap-2 px-3 py-2.5 bg-muted border border-border rounded-xl hover:bg-muted transition-colors text-sm font-semibold"
          >
            <Building2 size={14} className="text-brand shrink-0" />
            <span className="truncate flex-1 text-left">{activeCompany?.name || 'No company'}</span>
            <ChevronDown size={13} className={`text-muted-foreground shrink-0 transition-transform ${companyDropdown ? 'rotate-180' : ''}`} />
          </button>
          {companyDropdown && (
            <div className="mt-1 bg-primary border border-border rounded-xl shadow-lg z-10 overflow-hidden">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-3 pt-2 pb-1">Switch Company</p>
              {companies.length === 0 ? (
                <div className="px-3 py-3 text-center">
                  <p className="text-xs text-muted-foreground">No companies yet</p>
                </div>
              ) : (
                <div className="pb-1">
                  {companies.map((c: any) => (
                    <button
                      key={c.id}
                      onClick={() => handleSelectCompany(c)}
                      className={`w-full text-left px-3 py-2 text-sm font-semibold transition-colors flex items-center gap-2 ${c.id === activeCompany?.id ? 'text-navy bg-brand/20' : 'hover:bg-muted'}`}
                    >
                      {c.id === activeCompany?.id && <ChevronRight size={12} className="shrink-0" />}
                      <span className={c.id === activeCompany?.id ? '' : 'pl-4'}>{c.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <Link
            to="/companies/new"
            onClick={() => setCompanyDropdown(false)}
            className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-border text-xs font-bold text-muted-foreground hover:border-brand hover:text-navy transition-colors"
          >
            + Add New Company
          </Link>
        </div>
      )}

      {/* Company icon when collapsed */}
      {!isEmployee && !isAdmin && collapsed && !mobile && (
        <div className="py-3 border-b border-border flex justify-center">
          <button
            onClick={() => { setCollapsed(false); localStorage.setItem('sidebarCollapsed', 'false'); }}
            title={activeCompany?.name || 'No company'}
            className="p-2 rounded-xl hover:bg-muted transition-colors"
          >
            <Building2 size={18} className="text-brand" />
          </button>
        </div>
      )}

      {/* Nav */}
      <nav
        ref={!mobile ? navScrollRef : undefined}
        onScroll={!mobile ? (e) => { savedScrollPos.current = e.currentTarget.scrollTop; } : undefined}
        className="flex-1 overflow-y-auto py-3 flex flex-col gap-0.5 px-2"
      >
        {/* Platform admin & employee — flat links */}
        {(isAdmin || isEmployee) && (isAdmin ? adminLinks : employeeLinks).map(link => (
          <FlatLink key={link.to} link={link} />
        ))}

        {/* Company users — dashboard + grouped modules */}
        {!isAdmin && !isEmployee && (
          <>
            <FlatLink link={{ to: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> }} />

            {visibleGroups.map(group => (
              <GroupSection key={group.key} group={group} />
            ))}
          </>
        )}

        {/* Administration section (CLIENT_ADMIN only) */}
        {adminSectionLinks.length > 0 && (
          <>
            {!collapsed && (
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-3 pt-4 pb-1">Administration</p>
            )}
            {collapsed && <div className="border-t border-border mx-2 my-2" />}
            {adminSectionLinks.map(link => <FlatLink key={link.to} link={link} />)}
          </>
        )}
      </nav>

      {/* User / logout */}
      <div className="px-3 py-3 border-t border-border shrink-0">
        {collapsed && !mobile ? (
          <div className="flex flex-col items-center gap-2">
            <Link to="/profile" title={user?.name || 'Profile'} className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold uppercase transition-opacity hover:opacity-80" style={getAvatarGradient(liveUserName || user?.name)}>
              {(liveUserName || user?.name || '?')[0]}
            </Link>
            <button onClick={handleLogout} aria-label="Sign out" className="p-2 hover:bg-muted rounded-lg transition-colors text-muted-foreground min-w-[36px] min-h-[36px] flex items-center justify-center">
              <LogOut size={16} />
            </button>
            {IS_DESKTOP && (
              <button onClick={handleCheckUpdates} aria-label="Check for updates" title="Check for updates" className="p-2 hover:bg-muted rounded-lg transition-colors text-muted-foreground min-w-[36px] min-h-[36px] flex items-center justify-center">
                <Download size={16} />
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Link to="/profile" className="flex items-center gap-3 flex-1 min-w-0 px-3 py-2 rounded-xl hover:bg-muted transition-colors">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold uppercase shrink-0" style={getAvatarGradient(liveUserName || user?.name)}>
                {(liveUserName || user?.name || '?')[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold leading-none truncate">{liveUserName || user?.name || 'User'}</p>
                <p className="text-[10px] text-muted-foreground font-semibold uppercase mt-0.5">{user?.role?.replace(/_/g, ' ')}</p>
              </div>
            </Link>
            {IS_DESKTOP && (
              <button onClick={handleCheckUpdates} aria-label="Check for updates" title="Check for updates" className="p-1.5 hover:bg-muted rounded-lg transition-colors text-muted-foreground shrink-0">
                <Download size={16} />
              </button>
            )}
            <button onClick={handleLogout} aria-label="Sign out" title="Sign out" className="p-1.5 hover:bg-muted rounded-lg transition-colors text-muted-foreground shrink-0">
              <LogOut size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );

  const sidebarW = collapsed ? 'w-16' : 'w-64';
  const mainML = collapsed ? 'md:ml-16' : 'md:ml-64';

  return (
    <div className="min-h-screen bg-background font-inter font-medium text-navy flex">
      {/* Desktop sidebar */}
      <aside className={`hidden md:flex flex-col ${sidebarW} shrink-0 bg-primary border-r border-border fixed top-0 left-0 h-screen z-40 transition-all duration-200`}>
        <SidebarContent />
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/30 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Mobile sidebar drawer */}
      <aside className={`fixed top-0 left-0 h-screen w-64 max-w-[75vw] bg-primary border-r border-border z-50 flex flex-col transition-transform md:hidden ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <SidebarContent mobile />
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-14 bg-primary border-b border-border z-30 flex items-center justify-between px-4">
        <button onClick={() => setSidebarOpen(true)} aria-label="Open navigation menu" className="p-2 hover:bg-muted rounded-xl">
          <Menu size={20} />
        </button>
        <Link to={homeLink} className="flex items-center gap-2">
          <img src="/logo.svg" alt="Bantu" className="w-8 h-8" />
          <span className="font-bold tracking-tight">Bantu</span>
        </Link>
        <div className="w-10" />
      </div>

      {/* Main content */}
      <main className={`flex-1 min-w-0 ${mainML} min-h-screen transition-all duration-200`}>
        <div className="pt-16 md:pt-8 px-4 sm:px-8 pb-8 max-w-[1400px] mx-auto">
          <Outlet />
        </div>
      </main>

      {isWarning && (
        <IdleTimerModal
          remainingTime={remainingTime}
          onStayLoggedIn={resetTimer}
          onLogout={handleLogout}
        />
      )}
    </div>
  );
};

export default AppShell;
