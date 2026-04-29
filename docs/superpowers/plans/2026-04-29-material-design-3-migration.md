# Material Design 3 Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace shadcn/ui + Tailwind CSS with MUI v6 + Material Design 3 (`Experimental_CssVarsProvider`) across all 65 pages, AppShell, and shared components in a single big-bang feature branch.

**Architecture:** MUI v6's experimental MD3 theme generates tonal palettes from brand colour seeds (`#B2DB64` primary, `#3B82F6` tertiary). `next-themes` owns the `data-color-scheme` HTML attribute; MUI reads it via `colorSchemeSelector`. All business logic, routing, API, and validation layers are untouched.

**Tech Stack:** React 19, Vite 7, MUI v6 (`@mui/material`, `@mui/icons-material`, `@mui/x-date-pickers`), Emotion, react-hook-form + zod, @tanstack/react-query, recharts, react-router-dom v7

---

## File Map

### Create
- `frontend/src/theme/index.ts` — `extendTheme` with MD3 seeds, Geist font, dark mode overrides
- `frontend/src/theme/tokens.ts` — semantic colour tokens for status badges and recharts

### Modify
- `frontend/package.json` — add MUI packages, remove shadcn/Tailwind packages
- `frontend/vite.config.ts` — remove `@tailwindcss/vite` plugin
- `frontend/src/main.tsx` — swap providers: `NextThemesProvider` → `Experimental_CssVarsProvider` → `CssBaseline` → `App`
- `frontend/src/context/ToastContext.tsx` — swap `sonner` for MUI `Snackbar` + `Alert`
- `frontend/src/components/AppShell.tsx` — full rewrite with MUI Drawer, AppBar, List
- `frontend/src/components/common/ConfirmModal.tsx` — MUI Dialog
- `frontend/src/components/common/EmptyState.tsx` — MUI Box + Typography + Button
- `frontend/src/components/common/ErrorBoundary.tsx` — MUI Alert (display only)
- `frontend/src/components/common/Field.tsx` — delete (replaced by MUI FormControl pattern)
- `frontend/src/components/common/IdleTimerModal.tsx` — MUI Dialog
- `frontend/src/components/common/SkeletonTable.tsx` — MUI Skeleton + Table primitives
- `frontend/src/components/common/StatusBadge.tsx` — MUI Chip
- All 65 pages in `frontend/src/pages/` — remove Tailwind classNames, swap shadcn imports for MUI

### Delete
- `frontend/src/components/ui/` (all 16 files)
- `frontend/src/index.css`
- `frontend/src/App.css`
- `frontend/components.json`

---

## Task 1: Create Feature Branch

**Files:** none

- [ ] **Step 1: Create and checkout migration branch**

```bash
cd frontend
git checkout -b feat/material-design-3
```

- [ ] **Step 2: Verify you are on the right branch**

```bash
git branch --show-current
```
Expected output: `feat/material-design-3`

---

## Task 2: Install and Remove Dependencies

**Files:** `frontend/package.json`, `frontend/package-lock.json`

- [ ] **Step 1: Install MUI packages**

```bash
cd frontend
npm install @mui/material @mui/icons-material @mui/lab @mui/x-date-pickers @emotion/react @emotion/styled
```

> Note: `@mui/lab` must be the `6.x` pre-release matching `@mui/material`. After install, verify:
> `npm ls @mui/lab` — the version should start with `6.`.

- [ ] **Step 2: Remove packages that are being replaced**

```bash
npm uninstall shadcn tailwindcss @tailwindcss/vite tw-animate-css tailwind-merge class-variance-authority clsx lucide-react @base-ui/react react-day-picker sonner
```

- [ ] **Step 3: Verify the app still starts (it will be broken visually — that is expected)**

```bash
npm run dev
```
Expected: Vite starts without crashing. Browser will show broken styles — that's fine at this stage.

- [ ] **Step 4: Commit**

```bash
cd ..
git add frontend/package.json frontend/package-lock.json
git commit -m "deps: install MUI v6 MD3, remove shadcn/Tailwind packages"
```

---

## Task 3: Remove Tailwind from Vite Config

**Files:** `frontend/vite.config.ts`

- [ ] **Step 1: Update vite.config.ts**

Replace the entire file with:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

- [ ] **Step 2: Verify build still starts**

```bash
cd frontend && npm run dev
```
Expected: Vite starts. No Tailwind-related errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/vite.config.ts
git commit -m "build: remove @tailwindcss/vite plugin from Vite config"
```

---

## Task 4: Create Theme Files

**Files:** `frontend/src/theme/index.ts`, `frontend/src/theme/tokens.ts`

- [ ] **Step 1: Create `src/theme/tokens.ts`**

```ts
// Semantic tokens consumed by app code.
// recharts does not read MUI CSS variables — pass these as explicit props.
export const tokens = {
  status: {
    active:     '#10B981',
    inactive:   '#64748B',
    discharged: '#EF4444',
    suspended:  '#F59E0B',
    approved:   '#10B981',
    pending:    '#F59E0B',
    rejected:   '#EF4444',
    cancelled:  '#64748B',
    paid:       '#10B981',
    unpaid:     '#EF4444',
    draft:      '#64748B',
    processing: '#3B82F6',
  },
  charts: {
    // 5-stop greyscale matching existing --chart-* variables
    c1: '#DEDEDE',
    c2: '#737373',
    c3: '#5C5C5C',
    c4: '#4D4D4D',
    c5: '#363636',
  },
} as const;
```

- [ ] **Step 2: Create `src/theme/index.ts`**

```ts
import { experimental_extendTheme as extendTheme } from '@mui/material/styles';
import '@fontsource-variable/geist';

const theme = extendTheme({
  colorSchemes: {
    light: {
      palette: {
        primary:    { main: '#B2DB64' },
        tertiary:   { main: '#3B82F6' },
        error:      { main: '#B3261E' },
        // secondary is auto-derived from primary seed — omit to let MUI generate it
        background: { default: '#FFFFFF', paper: '#FFFFFF' },
      },
    },
    dark: {
      palette: {
        primary:    { main: '#B2DB64' },
        tertiary:   { main: '#3B82F6' },
        error:      { main: '#B3261E' },
        background: { default: '#0F172A', paper: '#1E293B' },
      },
    },
  },
  typography: {
    fontFamily: '"Geist Variable", "Inter", sans-serif',
  },
  shape: {
    borderRadius: 10, // ~0.625rem matches existing --radius
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { textTransform: 'none', fontWeight: 700 },
      },
    },
    MuiTextField: {
      defaultProps: { variant: 'outlined', size: 'small' },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600 },
      },
    },
  },
});

export default theme;
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```
Expected: No errors in the new theme files.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/theme/
git commit -m "feat: add MUI MD3 theme with brand colour seeds and semantic tokens"
```

---

## Task 5: Update main.tsx and Delete CSS Files

**Files:** `frontend/src/main.tsx`, `frontend/src/index.css`, `frontend/src/App.css`

- [ ] **Step 1: Replace `src/main.tsx`**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Experimental_CssVarsProvider as CssVarsProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider as NextThemesProvider } from 'next-themes'
import theme from './theme'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <NextThemesProvider attribute="data-color-scheme" defaultTheme="light">
      <CssVarsProvider theme={theme} colorSchemeSelector="[data-color-scheme]" defaultColorScheme="light">
        <CssBaseline />
        <App />
      </CssVarsProvider>
    </NextThemesProvider>
  </StrictMode>,
)
```

- [ ] **Step 2: Delete `src/index.css` and `src/App.css`**

```bash
rm frontend/src/index.css frontend/src/App.css
```

- [ ] **Step 3: Remove CSS imports from `App.tsx` if present**

Open `frontend/src/App.tsx` and delete any line that reads:
```ts
import './App.css'
import './index.css'
```

- [ ] **Step 4: Verify dev server starts without CSS import errors**

```bash
cd frontend && npm run dev
```
Expected: Vite starts. Browser shows unstyled but structurally intact app.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/main.tsx frontend/src/App.tsx
git rm frontend/src/index.css frontend/src/App.css
git commit -m "feat: wire Experimental_CssVarsProvider and CssBaseline, remove Tailwind CSS files"
```

---

## Task 6: Replace Toast Context

**Files:** `frontend/src/context/ToastContext.tsx`

The existing context uses `sonner` (now removed). Replace it with a MUI `Snackbar` + `Alert` implementation that preserves the same `useToast` API so no call sites need changing.

- [ ] **Step 1: Replace `src/context/ToastContext.tsx`**

```tsx
import React, { createContext, useContext, useCallback, useState } from 'react';
import Snackbar from '@mui/material/Snackbar';
import Alert, { type AlertColor } from '@mui/material/Alert';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [severity, setSeverity] = useState<AlertColor>('info');

  const showToast = useCallback((msg: string, type: ToastType = 'info') => {
    setMessage(msg);
    setSeverity(type);
    setOpen(true);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <Snackbar
        open={open}
        autoHideDuration={4000}
        onClose={() => setOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setOpen(false)}
          severity={severity}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {message}
        </Alert>
      </Snackbar>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within a ToastProvider');
  return context;
};
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 3: Remove `<Toaster />` from `App.tsx`**

Open `frontend/src/App.tsx` and:
- Delete line 127: `import { Toaster } from './components/ui/sonner';`
- Delete line 273: `<Toaster />`

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep "App.tsx"
```
Expected: no errors referencing `sonner` or `Toaster`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/context/ToastContext.tsx frontend/src/App.tsx
git commit -m "feat: replace sonner with MUI Snackbar+Alert in ToastContext, remove Toaster from App"
```

---

## Task 7: Delete shadcn UI Components and Config

**Files:** `frontend/src/components/ui/`, `frontend/components.json`

- [ ] **Step 1: Delete shadcn files**

```bash
rm -rf frontend/src/components/ui
rm frontend/components.json
```

- [ ] **Step 2: Check what imports `@/components/ui` across the codebase**

```bash
grep -r "from '@/components/ui" frontend/src --include="*.tsx" --include="*.ts" -l
```

Note all files listed — these will be fixed in subsequent tasks (Tasks 8–14).

- [ ] **Step 3: Commit the deletions**

```bash
git rm -r frontend/src/components/ui frontend/components.json
git commit -m "chore: delete shadcn UI components and components.json"
```

---

## Task 8: Migrate Shared Components

**Files:** `frontend/src/components/common/`

Migrate all 6 shared components in one task. These are used across many pages so fixing them first unblocks all subsequent page migrations.

- [ ] **Step 1: Replace `StatusBadge.tsx`**

```tsx
import Chip from '@mui/material/Chip';
import { tokens } from '@/theme/tokens';

const STATUS_COLOR: Record<string, string> = {
  ACTIVE:     tokens.status.active,
  INACTIVE:   tokens.status.inactive,
  DISCHARGED: tokens.status.discharged,
  SUSPENDED:  tokens.status.suspended,
  APPROVED:   tokens.status.approved,
  PENDING:    tokens.status.pending,
  REJECTED:   tokens.status.rejected,
  CANCELLED:  tokens.status.cancelled,
  PAID:       tokens.status.paid,
  UNPAID:     tokens.status.unpaid,
  DRAFT:      tokens.status.draft,
  PROCESSING: tokens.status.processing,
};

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const color = STATUS_COLOR[status?.toUpperCase()] ?? '#64748B';
  return (
    <Chip
      label={status}
      size="small"
      sx={{
        backgroundColor: `${color}20`,
        color,
        fontWeight: 700,
        fontSize: '0.7rem',
        height: 22,
        border: `1px solid ${color}40`,
      }}
    />
  );
}
```

- [ ] **Step 2: Replace `ConfirmModal.tsx`**

```tsx
import React from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';

interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({ title, message, confirmLabel = 'Confirm', danger, onConfirm, onCancel }: Props) {
  return (
    <Dialog open onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{message}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} variant="text">Cancel</Button>
        <Button
          onClick={onConfirm}
          variant="contained"
          color={danger ? 'error' : 'primary'}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default ConfirmModal;
```

- [ ] **Step 3: Replace `EmptyState.tsx`**

```tsx
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import type { SvgIconComponent } from '@mui/icons-material/index';

interface EmptyStateProps {
  icon: SvgIconComponent;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon: Icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <Box
      sx={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', py: 8, px: 3, textAlign: 'center',
        bgcolor: 'background.paper', borderRadius: 3, border: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Box sx={{ mb: 2, p: 2, borderRadius: '50%', bgcolor: 'action.hover' }}>
        <Icon sx={{ fontSize: 36, color: 'text.secondary' }} />
      </Box>
      <Typography variant="subtitle1" fontWeight={700} mb={0.5}>{title}</Typography>
      {description && (
        <Typography variant="body2" color="text.secondary" maxWidth={360} mb={3}>{description}</Typography>
      )}
      {actionLabel && onAction && (
        <Button variant="contained" onClick={onAction}>{actionLabel}</Button>
      )}
    </Box>
  );
}
```

> Note: `EmptyState` previously accepted `LucideIcon`. It now accepts a MUI `SvgIconComponent`. All callers must update their icon import from `lucide-react` to `@mui/icons-material`. This is addressed per-page in Tasks 9–14.

- [ ] **Step 4: Replace `IdleTimerModal.tsx`**

```tsx
import React from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import ShieldIcon from '@mui/icons-material/Shield';

interface IdleTimerModalProps {
  remainingTime: number;
  onStayLoggedIn: () => void;
  onLogout: () => void;
}

const IdleTimerModal: React.FC<IdleTimerModalProps> = ({ remainingTime, onStayLoggedIn, onLogout }) => {
  const seconds = Math.ceil(remainingTime / 1000);
  return (
    <Dialog open maxWidth="xs" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ShieldIcon color="primary" />
          Session Expiring
        </Box>
      </DialogTitle>
      <DialogContent>
        <DialogContentText>
          Due to inactivity, your session will expire in <strong>{seconds}s</strong>. Stay logged in?
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onLogout} variant="text" color="error">Sign out</Button>
        <Button onClick={onStayLoggedIn} variant="contained">Stay logged in</Button>
      </DialogActions>
    </Dialog>
  );
};

export default IdleTimerModal;
```

- [ ] **Step 5: Replace `SkeletonTable.tsx`**

```tsx
import React from 'react';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';

interface SkeletonTableProps {
  headers: string[];
  rows?: number;
}

const SkeletonTable: React.FC<SkeletonTableProps> = ({ headers, rows = 6 }) => {
  const firstIsAvatar = /employee|name/i.test(headers[0] || '');

  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          {headers.map((h) => (
            <TableCell key={h}><Skeleton width={80} /></TableCell>
          ))}
        </TableRow>
      </TableHead>
      <TableBody>
        {Array.from({ length: rows }).map((_, ri) => (
          <TableRow key={ri}>
            {headers.map((h, ci) => (
              <TableCell key={ci}>
                {ci === 0 && firstIsAvatar ? (
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Skeleton variant="circular" width={32} height={32} />
                    <Stack>
                      <Skeleton width={100} />
                      <Skeleton width={70} />
                    </Stack>
                  </Stack>
                ) : /status/i.test(h) ? (
                  <Skeleton variant="rounded" width={60} height={22} />
                ) : (
                  <Skeleton width={80} />
                )}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

export default SkeletonTable;
```

- [ ] **Step 6: Update `ErrorBoundary.tsx` — remove lucide import**

Open `frontend/src/components/common/ErrorBoundary.tsx`. Replace:
```ts
import { AlertTriangle } from 'lucide-react';
```
with:
```ts
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
```
Then replace any JSX `<AlertTriangle .../>` with `<WarningAmberIcon />`.

- [ ] **Step 7: Migrate `Field.tsx`**

`Field.tsx` is a thin wrapper that injected Tailwind class strings onto a child input. It is imported by 8 pages:
- `LeaveEdit.tsx`, `LeaveNew.tsx`, `PayslipInput.tsx`, `PayrollInputGrid.tsx`
- `EmployeeEdit.tsx`, `LoanNew.tsx`, `CompanyNew.tsx`, `EmployeeNew.tsx`

These pages are migrated in Tasks 11–14. At that point every `<Field>` usage is replaced directly with MUI `FormControl` + `TextField` (or `Controller` + `TextField` for react-hook-form). The `Field` component itself is no longer needed.

Delete it now so the import fails loudly during migration rather than silently passing:

```bash
rm frontend/src/components/common/Field.tsx
```

When migrating each of the 8 pages above, replace every `<Field label="X">...</Field>` with:

```tsx
<TextField label="X" fullWidth />
// or with react-hook-form:
<Controller
  name="fieldName"
  control={control}
  render={({ field, fieldState }) => (
    <TextField {...field} label="X" fullWidth error={!!fieldState.error} helperText={fieldState.error?.message} />
  )}
/>
```

- [ ] **Step 8: Verify TypeScript on shared components**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep "components/common"
```
Expected: no errors in `common/`.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/common/
git commit -m "feat: migrate shared components to MUI (StatusBadge, ConfirmModal, EmptyState, IdleTimerModal, SkeletonTable, ErrorBoundary)"
```

---

## Task 9: Migrate AppShell

**Files:** `frontend/src/components/AppShell.tsx`

This is the biggest single-file change. All logic (companies, idle timer, nav links, collapse state) is preserved — only the JSX and imports change.

- [ ] **Step 1: Replace `AppShell.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation, Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Avatar from '@mui/material/Avatar';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import MenuIcon from '@mui/icons-material/Menu';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PeopleIcon from '@mui/icons-material/People';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import DescriptionIcon from '@mui/icons-material/Description';
import SettingsIcon from '@mui/icons-material/Settings';
import BusinessIcon from '@mui/icons-material/Business';
import PersonIcon from '@mui/icons-material/Person';
import LogoutIcon from '@mui/icons-material/Logout';
import BuildIcon from '@mui/icons-material/Build';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import AssignmentIcon from '@mui/icons-material/Assignment';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import MemoryIcon from '@mui/icons-material/Memory';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { getUser, logout } from '../lib/auth';
import { CompanyAPI, UserAPI } from '../api/client';
import { setActiveCompanyId } from '../lib/companyContext';
import { useIdleTimer } from '../hooks/useIdleTimer';
import IdleTimerModal from './common/IdleTimerModal';

const DRAWER_EXPANDED = 240;
const DRAWER_COLLAPSED = 64;

const AppShell: React.FC = () => {
  const user = getUser();
  const navigate = useNavigate();
  const location = useLocation();

  const { isIdle, isWarning, remainingTime, resetTimer } = useIdleTimer({
    timeout: 60000,
    warningThreshold: 50000,
  });

  const [companies, setCompanies] = useState<any[]>([]);
  const [activeCompany, setActiveCompany] = useState<any>(null);
  const [liveUserName, setLiveUserName] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() =>
    localStorage.getItem('sidebarCollapsed') === 'true'
  );
  const [companyAnchor, setCompanyAnchor] = useState<null | HTMLElement>(null);
  const [userAnchor, setUserAnchor] = useState<null | HTMLElement>(null);

  const drawerWidth = collapsed ? DRAWER_COLLAPSED : DRAWER_EXPANDED;

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('sidebarCollapsed', String(next));
  };

  const loadCompanies = () => {
    if (user?.role !== 'EMPLOYEE') {
      CompanyAPI.getAll().then((res) => {
        const list = res.data;
        setCompanies(list);
        const stored = sessionStorage.getItem('activeCompanyId');
        const found = list.find((c: any) => c.id === stored) || list[0];
        if (found) { setActiveCompany(found); setActiveCompanyId(found.id); }
      }).catch((err: unknown) => console.error('[AppShell] companies:', err));
    }
  };

  useEffect(loadCompanies, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    UserAPI.me().then((res) => {
      const d = res.data as any;
      setLiveUserName(d.firstName || d.name?.split(' ')[0] || null);
    }).catch((err: unknown) => console.error('[AppShell] user profile:', err));
  }, []);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);
  useEffect(() => { if (isIdle) handleLogout(); }, [isIdle]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogout = () => { logout(); navigate('/login'); };
  const handleSelectCompany = (company: any) => {
    setActiveCompany(company);
    setActiveCompanyId(company.id);
    setCompanyAnchor(null);
    window.dispatchEvent(new Event('activeCompanyChanged'));
    navigate(homeLink);
  };

  const isAdmin = user?.role === 'PLATFORM_ADMIN';
  const isEmployee = user?.role === 'EMPLOYEE';

  const navLinks = isAdmin ? [
    { to: '/admin', label: 'Dashboard', icon: <DashboardIcon fontSize="small" /> },
    { to: '/admin/users', label: 'Users', icon: <PeopleIcon fontSize="small" /> },
    { to: '/admin/clients', label: 'Clients', icon: <BusinessIcon fontSize="small" /> },
    { to: '/admin/licenses', label: 'Licenses', icon: <VerifiedUserIcon fontSize="small" /> },
    { to: '/admin/settings', label: 'Settings', icon: <SettingsIcon fontSize="small" /> },
  ] : isEmployee ? [
    { to: '/employee', label: 'Dashboard', icon: <DashboardIcon fontSize="small" /> },
    { to: '/employee/payslips', label: 'Payslips', icon: <DescriptionIcon fontSize="small" /> },
    { to: '/employee/leave', label: 'Leave', icon: <CalendarMonthIcon fontSize="small" /> },
    { to: '/employee/profile', label: 'Profile', icon: <PersonIcon fontSize="small" /> },
  ] : [
    { to: '/dashboard', label: 'Dashboard', icon: <DashboardIcon fontSize="small" /> },
    { to: '/employees', label: 'Employees', icon: <PeopleIcon fontSize="small" /> },
    { to: '/payroll', label: 'Payroll', icon: <AttachMoneyIcon fontSize="small" /> },
    { to: '/payslip-input', label: 'Payslip Input', icon: <AssignmentIcon fontSize="small" /> },
    { to: '/leave', label: 'Leave', icon: <CalendarMonthIcon fontSize="small" /> },
    { to: '/loans', label: 'Loans', icon: <CreditCardIcon fontSize="small" /> },
    { to: '/reports', label: 'Reports', icon: <DescriptionIcon fontSize="small" /> },
    { to: '/shifts', label: 'Shifts & Roster', icon: <AccessTimeIcon fontSize="small" /> },
    { to: '/attendance', label: 'Attendance', icon: <MemoryIcon fontSize="small" /> },
    { to: '/utilities', label: 'Utilities', icon: <BuildIcon fontSize="small" /> },
    { to: '/client-admin/structure', label: 'Company Structure', icon: <BusinessIcon fontSize="small" /> },
  ];

  const adminSectionLinks = (!isAdmin && !isEmployee) ? [
    { to: '/companies', label: 'Companies', icon: <BusinessIcon fontSize="small" /> },
    { to: '/client-admin/settings', label: 'Settings', icon: <SettingsIcon fontSize="small" /> },
  ] : [];

  const homeLink = isAdmin ? '/admin' : isEmployee ? '/employee' : '/dashboard';

  const isActive = (to: string) =>
    location.pathname === to ||
    (to !== '/dashboard' && to !== '/admin' && to !== '/employee' && location.pathname.startsWith(to));

  const drawerContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Logo */}
      <Box
        component={RouterLink}
        to={homeLink}
        sx={{
          display: 'flex', alignItems: 'center', gap: collapsed ? 0 : 1.5,
          justifyContent: collapsed ? 'center' : 'flex-start',
          px: collapsed ? 0 : 2.5, py: 2,
          borderBottom: '1px solid', borderColor: 'divider',
          textDecoration: 'none', color: 'text.primary',
        }}
      >
        <Box component="img" src="/logo.svg" alt="Bantu" sx={{ width: 36, height: 36 }} />
        {!collapsed && <Typography fontWeight={700} fontSize={18} letterSpacing="-0.5px">Bantu</Typography>}
      </Box>

      {/* Company switcher */}
      {!isEmployee && !isAdmin && (
        <Box sx={{ px: 1.5, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
          {!collapsed ? (
            <>
              <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ px: 1, textTransform: 'uppercase', letterSpacing: 1 }}>
                Active Company
              </Typography>
              <ListItemButton
                onClick={(e) => setCompanyAnchor(e.currentTarget)}
                sx={{ mt: 0.5, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}
              >
                <ListItemIcon sx={{ minWidth: 32 }}><BusinessIcon fontSize="small" color="primary" /></ListItemIcon>
                <ListItemText
                  primary={activeCompany?.name || 'No company'}
                  primaryTypographyProps={{ fontSize: 13, fontWeight: 600, noWrap: true }}
                />
                <KeyboardArrowDownIcon fontSize="small" color="action" />
              </ListItemButton>
              <Menu anchorEl={companyAnchor} open={Boolean(companyAnchor)} onClose={() => setCompanyAnchor(null)}>
                {companies.map((c: any) => (
                  <MenuItem key={c.id} onClick={() => handleSelectCompany(c)} selected={c.id === activeCompany?.id}>
                    {c.name}
                  </MenuItem>
                ))}
                <Divider />
                <MenuItem component={RouterLink} to="/companies/new" onClick={() => setCompanyAnchor(null)}>
                  + Add New Company
                </MenuItem>
              </Menu>
            </>
          ) : (
            <Tooltip title={activeCompany?.name || 'No company'} placement="right">
              <IconButton onClick={() => { setCollapsed(false); localStorage.setItem('sidebarCollapsed', 'false'); }}>
                <BusinessIcon fontSize="small" color="primary" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      )}

      {/* Nav items */}
      <List sx={{ flex: 1, overflowY: 'auto', py: 1, px: 1 }} disablePadding>
        {navLinks.map((link) => (
          <Tooltip key={link.to} title={collapsed ? link.label : ''} placement="right">
            <ListItemButton
              component={RouterLink}
              to={link.to}
              selected={isActive(link.to)}
              sx={{ borderRadius: 2.5, mb: 0.5, justifyContent: collapsed ? 'center' : 'flex-start', px: collapsed ? 1 : 1.5 }}
            >
              <ListItemIcon sx={{ minWidth: collapsed ? 0 : 36, justifyContent: 'center' }}>
                {link.icon}
              </ListItemIcon>
              {!collapsed && <ListItemText primary={link.label} primaryTypographyProps={{ fontSize: 13, fontWeight: 700 }} />}
            </ListItemButton>
          </Tooltip>
        ))}

        {adminSectionLinks.length > 0 && (
          <>
            <Divider sx={{ my: 1 }} />
            {!collapsed && (
              <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ px: 2, textTransform: 'uppercase', letterSpacing: 1 }}>
                Administration
              </Typography>
            )}
            {adminSectionLinks.map((link) => (
              <Tooltip key={link.to} title={collapsed ? link.label : ''} placement="right">
                <ListItemButton
                  component={RouterLink}
                  to={link.to}
                  selected={isActive(link.to)}
                  sx={{ borderRadius: 2.5, mb: 0.5, justifyContent: collapsed ? 'center' : 'flex-start', px: collapsed ? 1 : 1.5 }}
                >
                  <ListItemIcon sx={{ minWidth: collapsed ? 0 : 36, justifyContent: 'center' }}>
                    {link.icon}
                  </ListItemIcon>
                  {!collapsed && <ListItemText primary={link.label} primaryTypographyProps={{ fontSize: 13, fontWeight: 700 }} />}
                </ListItemButton>
              </Tooltip>
            ))}
          </>
        )}
      </List>

      {/* Collapse toggle (desktop only) */}
      <Divider />
      <Box sx={{ p: 1, display: { xs: 'none', md: 'flex' }, justifyContent: collapsed ? 'center' : 'flex-start' }}>
        <IconButton onClick={toggleCollapsed} size="small">
          {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
        </IconButton>
        {!collapsed && <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ ml: 1, alignSelf: 'center' }}>Collapse</Typography>}
      </Box>

      {/* User / logout */}
      <Divider />
      <Box sx={{ p: 1.5 }}>
        {collapsed ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
            <Tooltip title={liveUserName || user?.name || 'Profile'} placement="right">
              <IconButton component={RouterLink} to="/profile" size="small">
                <Avatar sx={{ width: 28, height: 28, fontSize: 12 }}>{(liveUserName || user?.name || 'U')[0]}</Avatar>
              </IconButton>
            </Tooltip>
            <Tooltip title="Sign out" placement="right">
              <IconButton onClick={handleLogout} size="small"><LogoutIcon fontSize="small" /></IconButton>
            </Tooltip>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconButton component={RouterLink} to="/profile" sx={{ p: 0.5 }}>
              <Avatar sx={{ width: 32, height: 32, fontSize: 13 }}>{(liveUserName || user?.name || 'U')[0]}</Avatar>
            </IconButton>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="caption" fontWeight={700} noWrap display="block">
                {liveUserName || user?.name || 'User'}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap display="block" fontSize={10}>
                {user?.role?.replace(/_/g, ' ')}
              </Typography>
            </Box>
            <Tooltip title="Sign out">
              <IconButton onClick={handleLogout} size="small"><LogoutIcon fontSize="small" /></IconButton>
            </Tooltip>
          </Box>
        )}
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {/* Mobile AppBar */}
      <AppBar
        position="fixed"
        sx={{ display: { md: 'none' }, zIndex: (t) => t.zIndex.drawer + 1 }}
        elevation={0}
      >
        <Toolbar>
          <IconButton color="inherit" edge="start" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
            <MenuIcon />
          </IconButton>
          <Box component={RouterLink} to={homeLink} sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 1, textDecoration: 'none', color: 'inherit' }}>
            <Box component="img" src="/logo.svg" alt="Bantu" sx={{ width: 28, height: 28 }} />
            <Typography fontWeight={700} fontSize={16}>Bantu</Typography>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Mobile Drawer */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        sx={{ display: { md: 'none' }, '& .MuiDrawer-paper': { width: DRAWER_EXPANDED } }}
        ModalProps={{ keepMounted: true }}
      >
        {drawerContent}
      </Drawer>

      {/* Desktop Drawer */}
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', md: 'block' },
          width: drawerWidth,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            transition: 'width 0.2s',
            overflowX: 'hidden',
          },
        }}
        open
      >
        {drawerContent}
      </Drawer>

      {/* Main content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minHeight: '100vh',
          pt: { xs: '70px', md: 4 },
          px: { xs: 2, sm: 4 },
          pb: 4,
          maxWidth: 1400,
          mx: 'auto',
          width: '100%',
        }}
      >
        <Outlet />
      </Box>

      {isWarning && (
        <IdleTimerModal
          remainingTime={remainingTime}
          onStayLoggedIn={resetTimer}
          onLogout={handleLogout}
        />
      )}
    </Box>
  );
};

export default AppShell;
```

- [ ] **Step 2: Verify TypeScript compiles on AppShell**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep "AppShell"
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/AppShell.tsx
git commit -m "feat: rewrite AppShell with MUI Drawer, AppBar, List navigation"
```

---

## Task 10: Migrate Auth Pages

**Files:** `frontend/src/pages/Login.tsx`, `ForgotPassword.tsx`, `ResetPassword.tsx`, `frontend/src/pages/Register.tsx`

These pages are self-contained and share a common pattern: centered card layout, form fields, submit button.

**Pattern for each auth page:**
- Replace outer `div` with `Box sx={{ minHeight: '100vh', display: 'flex', ... }}`
- Replace card `div` with MUI `Paper` or `Card`
- Replace `<input>` / shadcn `Input` with `TextField` (controlled or `Controller` if react-hook-form is used)
- Replace `<button>` / shadcn `Button` with MUI `Button`
- Replace `className` error `div` with MUI `Alert`
- Replace lucide icons with MUI icons

- [ ] **Step 1: Migrate `Login.tsx`**

Key replacements:
```tsx
// Before
import { Mail, Lock, ArrowRight, Eye, EyeOff } from 'lucide-react';
// After
import MailIcon from '@mui/icons-material/Mail';
import LockIcon from '@mui/icons-material/Lock';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';

// Outer wrapper
<Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 3, bgcolor: 'background.default' }}>

// Card
<Paper elevation={0} sx={{ width: '100%', maxWidth: 440, p: 5, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>

// Input fields
<TextField fullWidth label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
<TextField fullWidth label="Password" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
  InputProps={{ endAdornment: <IconButton onClick={() => setShowPassword(!showPassword)}>{showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}</IconButton> }} />

// Error
{error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

// Submit button
<Button fullWidth variant="contained" type="submit" loading={loading} endIcon={<ArrowForwardIcon />}>Sign in</Button>
```

- [ ] **Step 2: Migrate `Register.tsx`, `ForgotPassword.tsx`, `ResetPassword.tsx`** using the same pattern.

- [ ] **Step 3: Verify TypeScript**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep "pages/Login\|pages/Register\|pages/Forgot\|pages/Reset"
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Login.tsx frontend/src/pages/Register.tsx frontend/src/pages/ForgotPassword.tsx frontend/src/pages/ResetPassword.tsx
git commit -m "feat: migrate auth pages to MUI (Login, Register, ForgotPassword, ResetPassword)"
```

---

## Task 11: Migrate Core HR Pages

**Files:** `frontend/src/pages/Dashboard.tsx`, `Employees.tsx`, `Payroll.tsx`, `Payslips.tsx`

These are the highest-traffic pages. Apply the per-page checklist:

1. Remove all `className` strings
2. Replace `@/components/ui/*` with MUI equivalents (see component map in spec)
3. Replace `lucide-react` icons with `@mui/icons-material`
4. Replace layout `div` tags with `Box`, `Stack`, `Paper`

**Dashboard-specific:** The `RUN_STATUS_CLASS` record uses Tailwind class strings. Replace with inline `sx` or use `StatusBadge` component:
```tsx
// Before
<span className={`px-2 py-0.5 rounded-full text-xs font-bold ${RUN_STATUS_CLASS[run.status]}`}>{run.status}</span>
// After
<StatusBadge status={run.status} />
```

- [ ] **Step 1: Migrate `Dashboard.tsx`**
- [ ] **Step 2: Migrate `Employees.tsx`** and its sub-components (`EmployeeTable.tsx`, `EmployeeFilters.tsx`, `EmployeeActions.tsx`, `EmployeeTableSkeleton.tsx`, `EmployeeModal.tsx`, `EmployeeAuditTab.tsx`)
- [ ] **Step 3: Migrate `Payroll.tsx`** and related pages (`PayrollCore.tsx`, `PayrollNew.tsx`, `PayrollSummary.tsx`, `PayrollLogs.tsx`, `PayrollInputs.tsx`, `PayrollInputGrid.tsx`)
- [ ] **Step 4: Migrate `Payslips.tsx`** and related (`PayslipTransactions.tsx`, `PayslipSummaries.tsx`, `PayslipInput.tsx`, `PayslipExports.tsx`, `PayTransactions.tsx`)

- [ ] **Step 5: Verify TypeScript on core HR pages**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep "pages/Dashboard\|pages/Employee\|pages/Payroll\|pages/Payslip\|pages/Pay"
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Dashboard.tsx frontend/src/pages/Employees.tsx frontend/src/pages/Payroll.tsx frontend/src/pages/Payslips.tsx \
  frontend/src/pages/PayrollCore.tsx frontend/src/pages/PayrollNew.tsx frontend/src/pages/PayrollSummary.tsx \
  frontend/src/pages/PayrollLogs.tsx frontend/src/pages/PayrollInputs.tsx frontend/src/pages/PayrollInputGrid.tsx \
  frontend/src/pages/PayslipTransactions.tsx frontend/src/pages/PayslipSummaries.tsx frontend/src/pages/PayslipInput.tsx \
  frontend/src/pages/PayslipExports.tsx frontend/src/pages/PayTransactions.tsx \
  frontend/src/components/employees/ frontend/src/components/EmployeeModal.tsx frontend/src/components/EmployeeAuditTab.tsx \
  frontend/src/components/dashboard/ frontend/src/components/IntelligenceWidget.tsx
git commit -m "feat: migrate Dashboard, Employees, Payroll, Payslips pages to MUI"
```

---

## Task 12: Migrate Leave & Loans Pages

**Files:** `frontend/src/pages/Leave.tsx`, `LeaveNew.tsx`, `LeaveEdit.tsx`, `LeaveBalances.tsx`, `LeaveEncashments.tsx`, `LeavePolicy.tsx`, `Loans.tsx`, `LoanNew.tsx`, `LoanDetail.tsx`

Apply the per-page checklist to each file. Leave and Loan pages heavily use forms — ensure `react-hook-form` `Controller` wraps all MUI `TextField` and `Select` inputs.

**Pattern for form fields with react-hook-form:**
```tsx
<Controller
  name="fieldName"
  control={control}
  render={({ field, fieldState }) => (
    <TextField
      {...field}
      label="Field Label"
      error={!!fieldState.error}
      helperText={fieldState.error?.message}
      fullWidth
    />
  )}
/>
```

- [ ] **Step 1: Migrate all Leave pages**
- [ ] **Step 2: Migrate all Loan pages**
- [ ] **Step 3: Verify TypeScript**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep "pages/Leave\|pages/Loan"
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Leave.tsx frontend/src/pages/LeaveNew.tsx frontend/src/pages/LeaveEdit.tsx \
  frontend/src/pages/LeaveBalances.tsx frontend/src/pages/LeaveEncashments.tsx frontend/src/pages/LeavePolicy.tsx \
  frontend/src/pages/Loans.tsx frontend/src/pages/LoanNew.tsx frontend/src/pages/LoanDetail.tsx
git commit -m "feat: migrate Leave and Loans pages to MUI"
```

---

## Task 13: Migrate Settings, Reports, and Tax Pages

**Files:** `Settings.tsx`, `SystemSettings.tsx`, `ClientSettings.tsx`, `ProfileSettings.tsx`, `TaxConfiguration.tsx`, `TaxTableSettings.tsx`, `NecTables.tsx`, `NSSAContributions.tsx`, `CurrencyRates.tsx`, `Reports.tsx`, `Grades.tsx`, `PayrollUsers.tsx`, `Companies.tsx`, `CompanyNew.tsx`, `ClientAdminStructure.tsx`

Also migrate tax sub-components: `frontend/src/components/tax/` (BenefitCalculator, NewTaxTableModal, UploadTaxTableModal).

- [ ] **Step 1: Migrate settings pages** (Settings, SystemSettings, ClientSettings, ProfileSettings)
- [ ] **Step 2: Migrate tax pages and components** (TaxConfiguration, TaxTableSettings, NecTables, NSSAContributions, and `src/components/tax/`)
- [ ] **Step 3: Migrate reports and admin data pages** (Reports, CurrencyRates, Grades, Companies, CompanyNew, ClientAdminStructure, PayrollUsers)
- [ ] **Step 4: Verify TypeScript**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep "pages/Settings\|pages/System\|pages/Client\|pages/Profile\|pages/Tax\|pages/Nec\|pages/NSSA\|pages/Currency\|pages/Reports\|pages/Grades\|pages/Companies\|pages/Payroll"
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Settings.tsx frontend/src/pages/SystemSettings.tsx frontend/src/pages/ClientSettings.tsx \
  frontend/src/pages/ProfileSettings.tsx frontend/src/pages/TaxConfiguration.tsx frontend/src/pages/TaxTableSettings.tsx \
  frontend/src/pages/NecTables.tsx frontend/src/pages/NSSAContributions.tsx frontend/src/pages/CurrencyRates.tsx \
  frontend/src/pages/Reports.tsx frontend/src/pages/Grades.tsx frontend/src/pages/Companies.tsx \
  frontend/src/pages/CompanyNew.tsx frontend/src/pages/ClientAdminStructure.tsx frontend/src/pages/PayrollUsers.tsx \
  frontend/src/components/tax/
git commit -m "feat: migrate Settings, Reports, Tax, and admin data pages to MUI"
```

---

## Task 14: Migrate Remaining Pages

**Files:** All remaining pages not yet migrated.

```
frontend/src/pages/AuditLogs.tsx
frontend/src/pages/License.tsx
frontend/src/pages/LicenseExpired.tsx
frontend/src/pages/Landing.tsx
frontend/src/pages/Setup.tsx
frontend/src/pages/Subscription.tsx
frontend/src/pages/EmployeeImport.tsx
frontend/src/pages/EmployeeNew.tsx
frontend/src/pages/EmployeeEdit.tsx
frontend/src/pages/PayslipInput.tsx  (if not done in Task 11)
frontend/src/pages/admin/  (all 6 files)
frontend/src/pages/employee/  (all 4 files)
frontend/src/pages/attendance/Attendance.tsx
frontend/src/pages/devices/Devices.tsx
frontend/src/pages/shifts/  (Shifts.tsx, Roster.tsx)
frontend/src/pages/utilities/  (all 10 files)
```

- [ ] **Step 1: Migrate admin pages** (`admin/AdminDashboard.tsx`, `admin/AuditLogs.tsx`, `admin/Clients.tsx`, `admin/Licenses.tsx`, `admin/SystemSettings.tsx`, `admin/Users.tsx`)
- [ ] **Step 2: Migrate employee self-service pages** (`employee/EmployeeDashboard.tsx`, `employee/Leave.tsx`, `employee/Payslips.tsx`, `employee/Profile.tsx`)
- [ ] **Step 3: Migrate utilities pages** (`utilities/BackPay.tsx`, `utilities/BackupRestore.tsx`, `utilities/NSSASettings.tsx`, `utilities/PayIncrease.tsx`, `utilities/PayrollCalendar.tsx`, `utilities/PeriodEnd.tsx`, `utilities/PublicHolidays.tsx`, `utilities/StatutoryRates.tsx`, `utilities/Transactions.tsx`, `utilities/UtilitiesHub.tsx`, `utilities/WorkPeriodSettings.tsx`)
- [ ] **Step 4: Migrate remaining standalone pages** (AuditLogs, License, LicenseExpired, Landing, Setup, Subscription, EmployeeImport, EmployeeNew, EmployeeEdit, Attendance, Devices, Shifts, Roster)

- [ ] **Step 5: Verify TypeScript — full project**

```bash
cd frontend && npx tsc --noEmit
```
Expected: **Zero errors**.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/
git commit -m "feat: migrate all remaining pages to MUI (admin, employee, utilities, attendance, shifts)"
```

---

## Task 15: Delete `src/lib/utils.ts` cn helper and audit remaining Tailwind references

**Files:** `frontend/src/lib/utils.ts`

`utils.ts` exports a `cn` helper built on `clsx` + `tailwind-merge`, both of which are removed. It may still be imported.

- [ ] **Step 1: Check for remaining `cn` usages**

```bash
grep -r "from.*lib/utils\|from '@/lib/utils'" frontend/src --include="*.tsx" --include="*.ts" -l
```

- [ ] **Step 2: Check for remaining `className` strings**

```bash
grep -r "className=" frontend/src --include="*.tsx" | grep -v "node_modules"
```
All results should be zero or only in non-Tailwind contexts (e.g. inline SVG classes). Fix any remaining ones.

- [ ] **Step 3: Delete `utils.ts`**

`utils.ts` exports only the `cn` helper, which imports `clsx` and `tailwind-merge` (both uninstalled in Task 2). Keeping it causes a `tsc` failure. Delete it:

```bash
rm frontend/src/lib/utils.ts
```

Verify it's no longer imported anywhere:
```bash
grep -r "from.*lib/utils\|from '@/lib/utils'" frontend/src --include="*.tsx" --include="*.ts"
```
Expected: zero results.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove cn helper and remaining Tailwind references"
```

---

## Task 16: Final TypeScript Build and Test Run

- [ ] **Step 1: Full TypeScript check**

```bash
cd frontend && npx tsc -b
```
Expected: **Zero errors**.

- [ ] **Step 2: Run Vitest**

```bash
cd frontend && npm test
```
Expected: All tests pass.

- [ ] **Step 3: Run production build**

```bash
cd frontend && npm run build
```
Expected: Build completes with no errors.

- [ ] **Step 4: Start preview and smoke test**

```bash
cd frontend && npm run preview
```

Open `http://localhost:4173` and verify:
- [ ] Login page renders correctly
- [ ] Can log in and reach Dashboard
- [ ] Sidebar navigation works (desktop and mobile)
- [ ] Sidebar collapses and expands
- [ ] At least one form (e.g. New Employee) submits without errors
- [ ] Toast notifications appear (bottom-right)
- [ ] Dark mode toggle (if wired) switches themes

- [ ] **Step 5: Commit final state**

```bash
git add -A
git commit -m "feat: Material Design 3 migration complete — full MUI v6 MD3 theme"
```

---

## Task 17: Merge to Main

- [ ] **Step 1: Rebase onto main**

```bash
git fetch origin
git rebase origin/main
```

Resolve any conflicts (likely in `package.json` or `package-lock.json`).

- [ ] **Step 2: Final build verification after rebase**

```bash
cd frontend && npm run build
```

- [ ] **Step 3: Merge**

```bash
git checkout main
git merge feat/material-design-3 --no-ff -m "feat: Material Design 3 full migration (MUI v6 + MD3 experimental theme)"
```

---

## Reference: Per-Page Checklist

Apply to every page file during Tasks 10–14:

```
- [ ] Remove all className="..." Tailwind strings
- [ ] Replace `from '@/components/ui/button'` → `import Button from '@mui/material/Button'`
- [ ] Replace `from '@/components/ui/input'` → `import TextField from '@mui/material/TextField'`
- [ ] Replace `from '@/components/ui/card'` → `import Card/CardContent/CardHeader from '@mui/material/...'`
- [ ] Replace `from '@/components/ui/dialog'` → `import Dialog/... from '@mui/material/...'`
- [ ] Replace `from '@/components/ui/badge'` → `import Chip from '@mui/material/Chip'`
- [ ] Replace `from '@/components/ui/select'` → `import Select/MenuItem from '@mui/material/...'`
- [ ] Replace `from '@/components/ui/tabs'` → `import Tabs/Tab from '@mui/material/...'`
- [ ] Replace `from '@/components/ui/table'` → `import Table/... from '@mui/material/...'`
- [ ] Replace `from '@/components/ui/skeleton'` → `import Skeleton from '@mui/material/Skeleton'`
- [ ] Replace `from '@/components/ui/separator'` → `import Divider from '@mui/material/Divider'`
- [ ] Replace `from '@/components/ui/avatar'` → `import Avatar from '@mui/material/Avatar'`
- [ ] Replace `from 'lucide-react'` → equivalent `@mui/icons-material` imports
- [ ] Replace layout `<div className="flex ...">` → `<Box sx={{ display: 'flex', ... }}>`
- [ ] Replace layout `<div className="flex flex-col gap-4">` → `<Stack spacing={2}>`
- [ ] Replace `<div className="... bg-white ... rounded ...">` → `<Paper>`
- [ ] Replace react-hook-form bare inputs with `Controller` + MUI `TextField`
- [ ] Replace `from '@/lib/utils'` cn usage → remove (no replacement needed in MUI)
```
