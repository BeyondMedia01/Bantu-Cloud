import React, { useEffect, useState } from 'react';
import { User, Lock, Phone, CheckCircle2, AlertCircle } from 'lucide-react';
import { UserAPI } from '../api/client';

const ProfileSettings: React.FC = () => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileError, setProfileError] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwError, setPwError] = useState('');

  useEffect(() => {
    UserAPI.me().then((res) => {
      const d = res.data as any;
      setFirstName(d.firstName || d.name?.split(' ')[0] || '');
      setLastName(d.lastName || d.name?.split(' ').slice(1).join(' ') || '');
      setPhone(d.phone || '');
      setEmail(d.email || '');
    }).catch(() => {});
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError('');
    setProfileSuccess(false);
    if (!firstName.trim()) { setProfileError('First name cannot be empty'); return; }
    setProfileLoading(true);
    try {
      await UserAPI.update({ firstName: firstName.trim(), lastName: lastName.trim(), phone: phone.trim() } as any);
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
    } catch {
      setProfileError(err?.response?.data?.message || 'Failed to update profile');
    } finally {
      setProfileLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    setPwSuccess(false);
    if (!currentPassword || !newPassword || !confirmPassword) { setPwError('All fields are required'); return; }
    if (newPassword.length < 8) { setPwError('New password must be at least 8 characters'); return; }
    if (newPassword !== confirmPassword) { setPwError('New passwords do not match'); return; }
    setPwLoading(true);
    try {
      await UserAPI.changePassword({ currentPassword, newPassword });
      setPwSuccess(true);
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setTimeout(() => setPwSuccess(false), 3000);
    } catch {
      setPwError(err?.response?.data?.message || 'Failed to change password');
    } finally {
      setPwLoading(false);
    }
  };

  const inputCls = "w-full border border-border rounded-lg px-3 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-green/30 focus:border-accent-green";

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-navy">Profile Settings</h1>
        <p className="text-sm text-muted-foreground font-medium mt-1">Manage your account information and password</p>
      </div>

      {/* Personal Info */}
      <div className="bg-primary rounded-2xl border border-border p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-5">
          <User size={16} className="text-muted-foreground" />
          <h2 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Personal Information</h2>
        </div>

        {profileSuccess && (
          <div className="flex items-center gap-2 p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm font-medium mb-4">
            <CheckCircle2 size={15} /> Profile updated successfully
          </div>
        )}
        {profileError && (
          <div className="flex items-center gap-2 p-3 rounded-xl border border-red-200 bg-red-50 text-red-600 text-sm font-medium mb-4">
            <AlertCircle size={15} /> {profileError}
          </div>
        )}

        <form onSubmit={handleSaveProfile} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="profile-first-name" className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">First Name</label>
              <input id="profile-first-name" type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputCls} placeholder="Jane" />
            </div>
            <div>
              <label htmlFor="profile-last-name" className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Last Name</label>
              <input id="profile-last-name" type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputCls} placeholder="Smith" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="profile-phone" className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                <span className="flex items-center gap-1"><Phone size={12} /> Phone Number (2FA)</span>
              </label>
              <input id="profile-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} placeholder="+263 77 123 4567" />
            </div>
            <div>
              <label htmlFor="profile-email" className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Email</label>
              <input id="profile-email" type="email" value={email} disabled className={`${inputCls} bg-muted text-muted-foreground cursor-not-allowed`} />
            </div>
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={profileLoading} className="bg-brand text-navy font-bold text-sm px-4 py-2 rounded-full shadow hover:opacity-90 transition-opacity disabled:opacity-50">
              {profileLoading ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>

      {/* Change Password */}
      <div className="bg-primary rounded-2xl border border-border p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-5">
          <Lock size={16} className="text-muted-foreground" />
          <h2 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Change Password</h2>
        </div>

        {pwSuccess && (
          <div className="flex items-center gap-2 p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm font-medium mb-4">
            <CheckCircle2 size={15} /> Password changed successfully
          </div>
        )}
        {pwError && (
          <div className="flex items-center gap-2 p-3 rounded-xl border border-red-200 bg-red-50 text-red-600 text-sm font-medium mb-4">
            <AlertCircle size={15} /> {pwError}
          </div>
        )}

        <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
          <div>
            <label htmlFor="profile-current-password" className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Current Password</label>
            <input id="profile-current-password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" className={inputCls} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="profile-new-password" className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">New Password</label>
              <input id="profile-new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" className={inputCls} />
            </div>
            <div>
              <label htmlFor="profile-confirm-password" className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Confirm New Password</label>
              <input id="profile-confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" className={inputCls} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground font-medium">Minimum 8 characters</p>
          <div className="flex justify-end">
            <button type="submit" disabled={pwLoading} className="bg-brand text-navy font-bold text-sm px-4 py-2 rounded-full shadow hover:opacity-90 transition-opacity disabled:opacity-50">
              {pwLoading ? 'Updating…' : 'Update Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProfileSettings;
