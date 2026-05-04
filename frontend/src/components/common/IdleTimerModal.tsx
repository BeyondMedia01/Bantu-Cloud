import React from 'react';
import { ShieldAlert, LogOut, Clock } from 'lucide-react';

interface IdleTimerModalProps {
  remainingTime: number;
  onStayLoggedIn: () => void;
  onLogout: () => void;
}

const IdleTimerModal: React.FC<IdleTimerModalProps> = ({ remainingTime, onStayLoggedIn, onLogout }) => {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-navy/40 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-card rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300 border border-border">
        <div className="bg-brand/10 px-8 py-8 flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-brand rounded-2xl flex items-center justify-center text-navy shadow-lg mb-6 ring-4 ring-brand/20">
            <ShieldAlert size={32} />
          </div>
          <h2 className="text-2xl font-bold text-navy mb-2">Session Expiring</h2>
          <p className="text-muted-foreground font-medium">
            Due to inactivity, your session will expire automatically.
          </p>
        </div>

        <div className="px-8 pt-8 pb-10">
          <div className="bg-muted/50 rounded-2xl p-6 mb-8 flex flex-col items-center border border-border">
            <div className="flex items-center gap-2 text-navy mb-3">
              <Clock size={18} className="text-brand" />
              <span className="text-sm font-bold uppercase tracking-wider">Logging out in</span>
            </div>
            <div className="text-5xl font-black text-navy tabular-nums">
              {remainingTime}s
            </div>
            <div className="w-full h-2 bg-muted rounded-full mt-6 overflow-hidden">
              <div
                className="h-full bg-brand transition-all duration-1000 ease-linear"
                style={{ width: `${(remainingTime / 10) * 100}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={onLogout}
              className="flex items-center justify-center gap-2 px-6 py-4 rounded-2xl bg-muted text-foreground font-bold hover:bg-muted/80 transition-all text-sm"
            >
              <LogOut size={18} />
              Logout
            </button>
            <button
              onClick={onStayLoggedIn}
              className="flex items-center justify-center gap-2 px-6 py-4 rounded-2xl bg-navy text-white font-bold hover:bg-navy/90 transition-all shadow-lg shadow-navy/20 text-sm"
            >
              Extend Session
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IdleTimerModal;
