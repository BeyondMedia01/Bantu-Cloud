import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, LogOut } from 'lucide-react';
import { logout } from '../lib/auth';

const LicenseExpired: React.FC = () => {
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 font-inter text-center">
      <div className="w-20 h-20 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-6 text-red-500">
        <AlertTriangle size={40} />
      </div>
      <h1 className="text-3xl font-bold mb-3">License Expired</h1>
      <p className="text-muted-foreground font-medium max-w-md mb-8">
        Your Bantu Payroll license has expired or been revoked. Please contact your platform administrator to renew your license.
      </p>
      <div className="flex gap-4">
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 px-4 py-2 border border-border rounded-full font-bold text-foreground/80 hover:bg-muted transition-colors"
        >
          <LogOut size={16} /> Sign Out
        </button>
      </div>
    </div>
  );
};

export default LicenseExpired;
