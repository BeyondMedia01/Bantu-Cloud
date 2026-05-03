import React from 'react';
import { cn } from '@/lib/utils';

interface FieldProps {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactElement;
}

const inputClass =
  'w-full px-4 py-3 bg-slate-50 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green transition-all font-medium text-sm';

export const Field: React.FC<FieldProps> = ({ label, required, className, children }) => {
  const id = React.useId();
  const child = React.cloneElement(children as React.ReactElement<any>, {
    id,
    className: cn(inputClass, (children.props as any).className),
  });
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-xs font-bold text-slate-400 uppercase tracking-wider">
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </label>
      {child}
    </div>
  );
};
