import React from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmModal: React.FC<Props> = ({
  title,
  message,
  confirmLabel = 'Confirm',
  danger = true,
  onConfirm,
  onCancel,
}) => {
  return (
    <Dialog open onOpenChange={(open: boolean) => { if (!open) onCancel(); }}>
      <DialogContent showCloseButton={false} className="max-w-sm">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-xl shrink-0 ${danger ? 'bg-red-50 text-red-500' : 'bg-amber-50 text-amber-500'}`}>
              <AlertTriangle size={20} />
            </div>
            <div className="flex flex-col gap-1">
              <DialogTitle className="font-bold text-navy text-base">{title}</DialogTitle>
              <DialogDescription className="text-sm text-slate-500 font-medium leading-relaxed">
                {message}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <DialogFooter className="border-0 bg-transparent -mx-0 -mb-0 px-0 pb-0">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-full border border-border text-sm font-bold text-slate-500 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            autoFocus
            onClick={onConfirm}
            className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${
              danger
                ? 'bg-red-500 text-white hover:bg-red-600'
                : 'bg-brand text-navy hover:opacity-90'
            }`}
          >
            {confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ConfirmModal;
