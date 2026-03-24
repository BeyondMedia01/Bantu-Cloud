# Bantu Platform — Frontend Design System

> This document establishes the canonical patterns for all UI work on the Bantu frontend.
> All new pages and refactors must follow these standards.

---

## Stack

| Layer | Library | Version |
|---|---|---|
| Components | shadcn/ui (Radix UI primitives) | latest |
| Styling | Tailwind CSS v4 | ^4 |
| Forms | react-hook-form + zod + @hookform/resolvers | v7 / v4 / v5 |
| Data fetching | @tanstack/react-query | v5 |
| Icons | lucide-react | latest |
| Routing | react-router-dom | v6 |

---

## Colour Tokens

| Token | Value | Usage |
|---|---|---|
| `bg-primary` | `#FFFFFF` (light) / `#1E293B` (dark) | Card/section backgrounds |
| `text-navy` | `#0F172A` (light) / `#F8FAFC` (dark) | Primary headings |
| `border-border` | `#E2E8F0` (light) / `#334155` (dark) | All borders |
| `bg-btn-primary` | `#b2db64` | Primary CTA buttons |
| `text-accent-blue` | `#3B82F6` | Links, focus rings, active states |

---

## Typography Scale

| Use | Class |
|---|---|
| Page title | `text-2xl font-bold text-navy` |
| Section heading | `text-xs font-bold uppercase tracking-wider text-slate-400` |
| Body | `text-sm font-medium text-slate-600` |
| Caption / meta | `text-xs text-slate-400` |
| Form label | `text-xs font-bold uppercase tracking-wider` (via `<FormLabel>`) |

---

## Component Patterns

### Page Shell
```tsx
<div className="max-w-3xl">
  <div className="flex items-center gap-4 mb-8">
    <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
      <ArrowLeft size={20} />
    </Button>
    <div>
      <h1 className="text-2xl font-bold">Page Title</h1>
      <p className="text-slate-500 font-medium text-sm">Subtitle</p>
    </div>
  </div>
  {/* content */}
</div>
```

### Card Section
```tsx
<Card>
  <CardHeader className="pb-2">
    <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-400">
      Section Title
    </CardTitle>
  </CardHeader>
  <CardContent>{/* fields */}</CardContent>
</Card>
```

### Form Pattern (react-hook-form + zod + shadcn)

Every data-entry page uses this pattern — no manual `useState` for form fields.

```tsx
// 1. Schema
const schema = z.object({
  name: z.string().min(1, 'Required'),
  amount: z.coerce.number().positive('Must be positive'),
  date: z.date({ required_error: 'Required' }),
  type: z.enum(['A', 'B']),
});

// 2. Hook
const form = useForm<z.infer<typeof schema>>({
  resolver: zodResolver(schema),
  defaultValues: { name: '', type: 'A' },
});

// 3. JSX
<Form {...form}>
  <form onSubmit={form.handleSubmit(onSubmit)}>
    <FormField
      control={form.control}
      name="name"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Name</FormLabel>
          <FormControl><Input {...field} /></FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  </form>
</Form>
```

### Select Field
```tsx
<FormField control={form.control} name="type" render={({ field }) => (
  <FormItem>
    <FormLabel>Type</FormLabel>
    <Select onValueChange={field.onChange} defaultValue={field.value}>
      <FormControl>
        <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
      </FormControl>
      <SelectContent>
        <SelectItem value="A">Option A</SelectItem>
      </SelectContent>
    </Select>
    <FormMessage />
  </FormItem>
)} />
```

### Date Picker Field
```tsx
<FormField control={form.control} name="date" render={({ field }) => (
  <FormItem className="flex flex-col">
    <FormLabel>Date</FormLabel>
    <Popover>
      <PopoverTrigger asChild>
        <FormControl>
          <Button variant="outline" className={cn(
            'pl-3 text-left font-normal',
            !field.value && 'text-muted-foreground',
          )}>
            {field.value ? format(field.value, 'dd MMM yyyy') : 'Pick a date'}
            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
          </Button>
        </FormControl>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={field.value}
          onSelect={field.onChange} initialFocus />
      </PopoverContent>
    </Popover>
    <FormMessage />
  </FormItem>
)} />
```

### Error Alert
```tsx
{serverError && (
  <Alert variant="destructive">
    <AlertCircle className="h-4 w-4" />
    <AlertTitle>Error</AlertTitle>
    <AlertDescription>{serverError}</AlertDescription>
  </Alert>
)}
```

### Tab Bar
```tsx
<div className="flex gap-2 p-1 bg-slate-100 rounded-2xl mb-8 w-fit">
  {TABS.map((t) => (
    <button key={t.id} type="button" onClick={() => setActiveTab(t.id)}
      className={cn(
        'px-6 py-2.5 rounded-xl text-sm font-bold transition-all',
        activeTab === t.id ? 'bg-white text-navy shadow-sm' : 'text-slate-500 hover:text-navy',
        t.hasError && 'after:ml-1 after:content-["•"] after:text-red-400',
      )}>
      {t.label}
    </button>
  ))}
</div>
```

### Dynamic Field Array (bank accounts, etc.)
```tsx
const { fields, append, remove } = useFieldArray({
  control: form.control,
  name: 'bankAccounts',
});
```

---

## Form Validation Rules

| Field Type | Rule |
|---|---|
| Required text | `z.string().min(1, 'Required')` |
| Required number | `z.coerce.number({ required_error: 'Required' }).positive()` |
| Optional number | `z.coerce.number().optional().or(z.literal(''))` |
| Required date | `z.date({ required_error: 'Required' })` |
| Optional date | `z.date().optional()` |
| Email | `z.string().email('Invalid email').optional().or(z.literal(''))` |
| Percentage | `z.coerce.number().min(0).max(100)` |
| Zim National ID | `z.string().regex(/^[0-9]{2}-?[0-9]{6,7}\s?[A-Za-z]\s?[0-9]{2}$/)` |

---

## Refactor Phases

### Phase 1 — Forms ✅ In progress
Pilot: `EmployeeNew.tsx`
- [x] Install: form, input, select, label, popover, calendar, zod, react-hook-form
- [x] Establish Design.md
- [ ] Refactor EmployeeNew.tsx
- [ ] Refactor EmployeeEdit.tsx
- [ ] Refactor LoanNew.tsx, LeaveNew.tsx, PayrollNew.tsx
- [ ] Refactor all Settings pages

### Phase 2 — Data Tables
- [ ] Install: table, pagination components
- [ ] Refactor Employees.tsx with shadcn Table + React Query pagination
- [ ] Refactor Loans.tsx, Leave.tsx, Payroll.tsx

### Phase 3 — Layout & Feedback
- [ ] Replace all raw modals with Dialog
- [ ] Replace raw alert divs with Alert component
- [ ] Replace section divs with Card

