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
      className={cn('flex gap-2 p-1 tab-pill-track w-fit', className)}
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
              ? 'tab-pill-active'
              : 'tab-pill-inactive',
            tab.hasError && 'after:ml-1 after:content-["•"] after:text-red-400',
          )}
        >
          {tab.label}
          {tab.hasError && <span className="sr-only">(has errors)</span>}
        </button>
      ))}
    </div>
  );
}
