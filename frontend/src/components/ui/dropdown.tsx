import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface DropdownItem {
  label?: string;
  onClick: () => void;
  icon?: React.ReactNode;
  renderItem?: () => React.ReactNode;
  disabled?: boolean;
}

export interface DropdownSection {
  heading?: string;
  items: DropdownItem[];
  emptyMessage?: string;
}

export interface DropdownProps {
  trigger: React.ReactNode | ((isOpen: boolean) => React.ReactNode);
  sections: DropdownSection[];
  align?: 'left' | 'right';
  disabled?: boolean;
  stopPropagation?: boolean;
  className?: string;
}

export function Dropdown({
  trigger,
  sections,
  align = 'left',
  disabled = false,
  stopPropagation = false,
  className,
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Suppress open when all sections are empty with no emptyMessage
  const hasContent = sections.some(
    (s) => s.items.length > 0 || s.emptyMessage !== undefined
  );

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    const onOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onOutside);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onOutside);
    };
  }, [isOpen]);

  const handleWrapperClick = (e: React.MouseEvent) => {
    if (stopPropagation) e.stopPropagation();
    if (disabled || !hasContent) return;
    setIsOpen((v) => !v);
  };

  const handleItemClick = (item: DropdownItem) => {
    if (item.disabled) return;
    item.onClick();
    setIsOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative" onClick={handleWrapperClick}>
      {typeof trigger === 'function' ? trigger(isOpen) : trigger}
      {isOpen && (
        <div
          role="menu"
          className={cn(
            'absolute top-full mt-1 bg-card border border-border rounded-xl shadow-lg z-30',
            'min-w-[110px] max-h-60 overflow-y-auto py-1',
            align === 'right' ? 'right-0' : 'left-0',
            className,
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {sections.map((section, si) => (
            <div key={si}>
              {section.heading && (
                <p className="px-3 pt-2 pb-1 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  {section.heading}
                </p>
              )}
              {section.items.length === 0 && section.emptyMessage ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">{section.emptyMessage}</p>
              ) : (
                section.items.map((item, ii) => (
                  <button
                    key={ii}
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    onClick={() => handleItemClick(item)}
                    className="w-full text-left px-3 py-1.5 text-xs font-bold text-foreground hover:bg-muted transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {item.renderItem ? item.renderItem() : (
                      <span className="uppercase flex items-center gap-2">
                        {item.icon}
                        {item.label}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
