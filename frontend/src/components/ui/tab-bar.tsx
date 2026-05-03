import { cn } from '@/lib/utils';

interface Tab {
  id: string;
  label: string;
  hasError?: boolean;
}

interface TabBarProps {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}

export function TabBar({ tabs, active, onChange, className }: TabBarProps) {
  return (
    <div
      role="tablist"
      className={cn('flex gap-2 p-1 bg-slate-100 rounded-2xl w-fit', className)}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            'px-6 py-2.5 rounded-xl text-sm font-bold transition-all',
            active === tab.id
              ? 'bg-white text-navy shadow-sm'
              : 'text-slate-500 hover:text-navy',
            tab.hasError && 'after:ml-1 after:content-["•"] after:text-red-400',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
