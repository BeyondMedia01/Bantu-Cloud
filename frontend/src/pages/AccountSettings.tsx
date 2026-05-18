import { useState } from 'react';
import { AlertTriangle, Trash2, Loader2 } from 'lucide-react';
import { http } from '../api/http';
import { logout } from '../lib/auth';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

const AccountSettings: React.FC = () => {
  const navigate = useNavigate();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleDeleteAccount = async () => {
    setLoading(true);
    setError('');
    try {
      await http.delete('/user/account', { headers: { password } });
      logout();
      navigate('/login');
    } catch (err: any) {
      setError(err.message || 'Failed to delete account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 space-y-8">
      <div>
        <h2 className="text-xl font-bold text-navy mb-2">Account Settings</h2>
        <p className="text-muted-foreground text-sm">Manage your account and data</p>
      </div>

      <div className="border-t border-border pt-8">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-red-100 rounded-xl">
              <AlertTriangle className="text-red-600" size={24} />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-red-800 text-lg">Delete Account</h3>
              <p className="text-sm text-red-700 mt-1 mb-4">
                Permanently delete your account and all associated data. This action cannot be undone.
              </p>

              {!showDeleteConfirm ? (
                <Button
                  onClick={() => setShowDeleteConfirm(true)}
                  variant="outline"
                  className="border-red-300 text-red-700 hover:bg-red-100 hover:text-red-800"
                >
                  <Trash2 size={16} className="mr-2" />
                  Delete My Account
                </Button>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm font-medium text-red-800">
                    To confirm, enter your password:
                  </p>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full max-w-sm px-4 py-2 border border-red-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                  {error && <p className="text-sm text-red-600">{error}</p>}
                  <div className="flex gap-3">
                    <Button
                      onClick={handleDeleteAccount}
                      disabled={!password || loading}
                      className="bg-red-600 text-white hover:bg-red-700"
                    >
                      {loading ? <Loader2 size={16} className="mr-2 animate-spin" /> : null}
                      Confirm Delete
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowDeleteConfirm(false);
                        setPassword('');
                        setError('');
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccountSettings;