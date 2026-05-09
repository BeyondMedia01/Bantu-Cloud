import React, { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import {
  LayoutDashboard, Users, DollarSign, FileText, Settings,
  Building2, User, ChevronDown, LogOut, Wrench,
  CalendarDays, CreditCard, ShieldCheck, Menu, ChevronRight,
  ClipboardList, Clock, Cpu, PanelLeftClose, PanelLeftOpen, Download,
  UserCog, Scale, UserPlus, TrendingUp, Receipt, BookOpen, BarChart2,
} from 'lucide-react';
import { getUser, logout } from '../lib/auth';
import { CompanyAPI, UserAPI } from '../api/client';
import { setActiveCompanyId } from '../lib/companyContext';
import { getAvatarGradient } from '../lib/avatarGradient';
import { useIdleTimer } from '../hooks/useIdleTimer';
import IdleTimerModal from './common/IdleTimerModal';
import { usePermissions } from '../hooks/usePermissions';

const IS_DESKTOP = typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__;

const AppShell: React.FC = () => {
  const user = getUser();
  const navigate = useNavigate();
  const location = useLocation();

  // Desktop gets a 30-minute idle window; web gets 60s.
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

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('sidebarCollapsed', String(next));
    if (next) setCompanyDropdown(false);
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
      }).catch(() => {
      });
    }
    return () => { mounted = false; };
  }, [user]);

  // Fetch live user name so the sidebar stays current after profile updates
  useEffect(() => {
    UserAPI.me().then((res) => {
      const d = res.data as any;
      // Prefer dedicated firstName, fall back to first word of full name
      const first = d.firstName || d.name?.split(' ')[0] || null;
      setLiveUserName(first);
    }).catch(() => {
    });
  }, []);
  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleCheckUpdates = async () => {
    if (!IS_DESKTOP) return;
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const result = await check();
      if (!result) {
        const { toast } = await import('sonner');
        toast.info('You are on the latest version.');
      }
    } catch {
      // updater unavailable
    }
  };

  useEffect(() => {
    if (isIdle) handleLogout();
  }, [isIdle, navigate]);

  const handleSelectCompany = (company: any) => {
    setActiveCompany(company);
    setActiveCompanyId(company.id);
    setCompanyDropdown(false);
    window.dispatchEvent(new Event('activeCompanyChanged'));
    navigate(homeLink);
  };

  const isAdmin = user?.role === 'PLATFORM_ADMIN';
  const isEmployee = user?.role === 'EMPLOYEE';
  const isCompanyUser = user?.role === 'COMPANY_USER';
  const { can, isClientAdmin } = usePermissions();

  // Module nav groups — each maps to a section of the app
  const moduleNavMap = {
    PEOPLE: [
      { to: '/employees', label: 'Employees', icon: <Users size={18} /> },
      { to: '/grades', label: 'Grades', icon: <ClipboardList size={18} /> },
      { to: '/client-admin/structure', label: 'Company Structure', icon: <Building2 size={18} /> },
    ],
    TIME_LEAVE: [
      { to: '/leave', label: 'Leave', icon: <CalendarDays size={18} /> },
      { to: '/shifts', label: 'Shifts & Roster', icon: <Clock size={18} /> },
      { to: '/attendance', label: 'Attendance', icon: <Cpu size={18} /> },
    ],
    PAYROLL: [
      { to: '/payroll', label: 'Payroll', icon: <DollarSign size={18} /> },
      { to: '/payslip-input', label: 'Payslip Input', icon: <ClipboardList size={18} /> },
      { to: '/loans', label: 'Loans', icon: <CreditCard size={18} /> },
    ],
    COMPLIANCE: [
      { to: '/utilities/statutory-rates', label: 'Statutory Rates', icon: <Scale size={18} /> },
      { to: '/utilities/nec-tables', label: 'NEC Tables', icon: <FileText size={18} /> },
      { to: '/utilities/nssa', label: 'NSSA', icon: <ShieldCheck size={18} /> },
    ],
    REPORTS: [
      { to: '/reports', label: 'Reports', icon: <FileText size={18} /> },
    ],
    SETTINGS: [
      { to: '/utilities', label: 'Utilities', icon: <Wrench size={18} /> },
      { to: '/client-admin/settings', label: 'Settings', icon: <Settings size={18} /> },
    ],
    RECRUITMENT: [
      { to: '/recruitment', label: 'Recruitment', icon: <UserPlus size={18} /> },
    ],
    PERFORMANCE: [
      { to: '/performance', label: 'Performance', icon: <TrendingUp size={18} /> },
    ],
    EXPENSES: [
      { to: '/expenses', label: 'Expenses', icon: <Receipt size={18} /> },
    ],
    ONBOARDING: [
      { to: '/onboarding', label: 'Onboarding', icon: <ClipboardList size={18} /> },
    ],
    TRAINING: [
      { to: '/training', label: 'Training', icon: <BookOpen size={18} /> },
    ],
    ASSETS: [
      { to: '/assets', label: 'Assets', icon: <ShieldCheck size={18} /> },
    ],
    SUCCESSION: [
      { to: '/succession', label: 'Succession', icon: <TrendingUp size={18} /> },
    ],
    SURVEYS: [
      { to: '/surveys', label: 'Surveys', icon: <ClipboardList size={18} /> },
    ],
    ANALYTICS: [
      { to: '/analytics', label: 'Analytics', icon: <BarChart2 size={18} /> },
    ],
  } as const;

  type ModuleKey = keyof typeof moduleNavMap;

  // Build nav based on role
  const buildModuleNav = () => {
    const allModules: ModuleKey[] = ['PEOPLE', 'TIME_LEAVE', 'PAYROLL', 'COMPLIANCE', 'REPORTS', 'SETTINGS', 'RECRUITMENT', 'PERFORMANCE', 'EXPENSES', 'ONBOARDING', 'TRAINING', 'ASSETS', 'SUCCESSION', 'SURVEYS', 'ANALYTICS'];
    const links: { to: string; label: string; icon: React.ReactNode; section?: string }[] = [
      { to: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
    ];
    for (const mod of allModules) {
      if (can(mod)) {
        links.push(...moduleNavMap[mod]);
      }
    }
    return links;
  };

  const navLinks = isAdmin ? [
    { to: '/admin', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
    { to: '/admin/users', label: 'Users', icon: <Users size={18} /> },
    { to: '/admin/clients', label: 'Clients', icon: <Building2 size={18} /> },
    { to: '/admin/licenses', label: 'Licenses', icon: <ShieldCheck size={18} /> },
    { to: '/admin/settings', label: 'Settings', icon: <Settings size={18} /> },
  ] : isEmployee ? [
    { to: '/employee', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
    { to: '/employee/payslips', label: 'Payslips', icon: <FileText size={18} /> },
    { to: '/employee/leave', label: 'Leave', icon: <CalendarDays size={18} /> },
    { to: '/employee/profile', label: 'Profile', icon: <User size={18} /> },
  ] : buildModuleNav();

  // CLIENT_ADMIN gets team management links; COMPANY_USER does not
  const adminSectionLinks = user?.role === 'CLIENT_ADMIN' ? [
    { to: '/companies', label: 'Companies', icon: <Building2 size={18} /> },
    { to: '/client-admin/roles', label: 'Roles', icon: <ShieldCheck size={18} /> },
    { to: '/client-admin/users', label: 'Team Members', icon: <UserCog size={18} /> },
  ] : [];

  const homeLink = isAdmin ? '/admin' : isEmployee ? '/employee' : '/dashboard';

  const NavLink = ({ link }: { link: typeof navLinks[0] }) => {
    const active = location.pathname === link.to ||
      (link.to !== '/dashboard' && link.to !== '/admin' && link.to !== '/employee' &&
        location.pathname.startsWith(link.to));
    return (
      <Link
        key={link.to}
        to={link.to}
        title={collapsed ? link.label : undefined}
        className={`flex items-center gap-3 rounded-xl text-sm font-bold transition-all
          ${collapsed ? 'justify-center px-0 py-2.5 mx-2' : 'px-3 py-2.5'}
          ${active ? 'bg-brand text-navy shadow-sm' : 'text-muted-foreground hover:bg-muted dark:hover:bg-muted hover:text-navy dark:hover:text-foreground'}`}
      >
        <span className="shrink-0">{link.icon}</span>
        {!collapsed && <span>{link.label}</span>}
      </Link>
    );
  };

  const SidebarContent = ({ mobile = false }: { mobile?: boolean }) => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={`flex items-center border-b border-border shrink-0 py-3.5
          ${collapsed && !mobile ? 'justify-center px-0' : 'gap-3 px-5'}`}>
        <Link to={homeLink} className={`flex items-center gap-3 min-w-0 ${collapsed && !mobile ? '' : 'flex-1'}`}>
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
      </div>

      {/* Company switcher — hidden when collapsed */}
      {!isEmployee && !isAdmin && (!collapsed || mobile) && (
        <div className="px-3 py-3 border-b border-border">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1 mb-1.5">Active Company</p>
          <button
            onClick={() => setCompanyDropdown(!companyDropdown)}
            aria-haspopup="listbox"
            aria-expanded={companyDropdown}
            aria-label={`Active company: ${activeCompany?.name || 'No company'}. Click to switch.`}
            className="w-full flex items-center gap-2 px-3 py-2.5 bg-muted dark:bg-muted/40 border border-border rounded-xl hover:bg-muted dark:hover:bg-slate-700 transition-colors text-sm font-semibold"
          >
            <Building2 size={14} className="text-brand shrink-0" aria-hidden="true" />
            <span className="truncate flex-1 text-left">{activeCompany?.name || 'No company'}</span>
            <ChevronDown size={13} className={`text-muted-foreground shrink-0 transition-transform ${companyDropdown ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
          {companyDropdown && (
            <div className="mt-1 bg-white dark:bg-slate-800 border border-border rounded-xl shadow-lg z-10 overflow-hidden">
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
                      className={`w-full text-left px-3 py-2 text-sm font-semibold transition-colors flex items-center gap-2 ${c.id === activeCompany?.id ? 'text-navy bg-brand/20' : 'hover:bg-muted dark:hover:bg-slate-700'}`}
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

      {/* Company icon when collapsed (tooltip shows name) */}
      {!isEmployee && !isAdmin && collapsed && !mobile && (
        <div className="py-3 border-b border-border flex justify-center">
          <button
            onClick={() => { setCollapsed(false); localStorage.setItem('sidebarCollapsed', 'false'); }}
            title={activeCompany?.name || 'No company'}
            className="p-2 rounded-xl hover:bg-muted dark:hover:bg-slate-700 transition-colors"
          >
            <Building2 size={18} className="text-brand" />
          </button>
        </div>
      )}

      {/* Nav links */}
      <nav className="flex-1 overflow-y-auto py-3 flex flex-col gap-0.5 px-2">
        {navLinks.map((link) => <NavLink key={link.to} link={link} />)}

        {adminSectionLinks.length > 0 && (
          <>
            {!collapsed && (
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-3 pt-4 pb-1">Administration</p>
            )}
            {collapsed && <div className="border-t border-border mx-2 my-2" />}
            {adminSectionLinks.map((link) => <NavLink key={link.to} link={link} />)}
          </>
        )}
      </nav>

      {/* Collapse toggle (desktop only) */}
      {!mobile && (
        <div className={`px-2 py-2 border-t border-border shrink-0 ${collapsed ? 'flex justify-center' : ''}`}>
          <button
            onClick={toggleCollapsed}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-muted-foreground hover:bg-muted dark:hover:bg-slate-700 hover:text-navy dark:hover:text-slate-100 transition-colors text-xs font-bold w-full"
          >
            {collapsed
              ? <PanelLeftOpen size={16} />
              : <><PanelLeftClose size={16} /><span>Collapse</span></>
            }
          </button>
        </div>
      )}

      {/* User / logout */}
      <div className={`px-3 py-3 border-t border-border shrink-0 ${collapsed && !mobile ? '' : ''}`}>
        {collapsed && !mobile ? (
          <div className="flex flex-col items-center gap-2">
            <Link to="/profile" title={user?.name || 'Profile'} className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold uppercase transition-opacity hover:opacity-80" style={getAvatarGradient(liveUserName || user?.name)}>
              {(liveUserName || user?.name || '?')[0]}
            </Link>
            <button onClick={handleLogout} aria-label="Sign out" className="p-2 hover:bg-muted dark:hover:bg-slate-700 rounded-lg transition-colors text-muted-foreground min-w-[36px] min-h-[36px] flex items-center justify-center">
              <LogOut size={16} />
            </button>
            {IS_DESKTOP && (
              <button onClick={handleCheckUpdates} aria-label="Check for updates" className="p-2 hover:bg-muted dark:hover:bg-slate-700 rounded-lg transition-colors text-muted-foreground min-w-[36px] min-h-[36px] flex items-center justify-center" title="Check for updates">
                <Download size={16} />
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3 mb-1">
            <Link to="/profile" className="flex items-center gap-3 flex-1 min-w-0 px-3 py-2 rounded-xl hover:bg-muted dark:hover:bg-slate-700 transition-colors">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold uppercase shrink-0" style={getAvatarGradient(liveUserName || user?.name)}>
                {(liveUserName || user?.name || '?')[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold leading-none truncate">{liveUserName || user?.name || 'User'}</p>
                <p className="text-[10px] text-muted-foreground font-semibold uppercase mt-0.5">{user?.role?.replace(/_/g, ' ')}</p>
              </div>
            </Link>
            {IS_DESKTOP && (
              <button onClick={handleCheckUpdates} aria-label="Check for updates" className="p-1.5 hover:bg-muted dark:hover:bg-slate-700 rounded-lg transition-colors text-muted-foreground shrink-0" title="Check for updates">
                <Download size={16} />
              </button>
            )}
            <button onClick={handleLogout} aria-label="Sign out" className="p-1.5 hover:bg-muted dark:hover:bg-slate-700 rounded-lg transition-colors text-muted-foreground shrink-0" title="Sign out">
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
        <div
          className="fixed inset-0 bg-black/30 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile sidebar drawer */}
      <aside className={`fixed top-0 left-0 h-screen w-64 max-w-[75vw] bg-primary border-r border-border z-50 flex flex-col transition-transform md:hidden ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <SidebarContent mobile />
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-14 bg-primary border-b border-border z-30 flex items-center justify-between px-4">
        <button onClick={() => setSidebarOpen(true)} aria-label="Open navigation menu" className="p-2 hover:bg-muted dark:hover:bg-slate-700 rounded-xl">
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

      {/* Security Idle Timer Warning */}
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
