import React, { useEffect, useState } from 'react';
import { User, Lock, CheckCircle2, AlertCircle } from 'lucide-react';
import { UserAPI } from '../api/client';

const ProfileSettings: React.FC = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [nameLoading, setNameLoading] = useState(false);
  const [nameSuccess, setNameSuccess] = useState(false);
  const [nameError, setNameError] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwError, setPwError] = useState('');

  useEffect(() => {
    UserAPI.me().then((res) => {
      setName(res.data.name || '');
      setEmail(res.data.email || '');
    }).catch(() => {});
  }, []);

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    setNameError('');
    setNameSuccess(false);
    if (!name.trim()) { setNameError('Name cannot be empty'); return; }
    setNameLoading(true);
    try {
      await UserAPI.update({ name: name.trim() });
      setNameSuccess(true);
      setTimeout(() => setNameSuccess(false), 3000);
    } catch (err: any) {
      setNameError(err?.response?.data?.message || 'Failed to update profile');
    } finally {
      setNameLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    setPwSuccess(false);
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPwError('All fields are required'); return;
    }
    if (newPassword.length < 8) {
      setPwError('New password must be at least 8 characters'); return;
    }
    if (newPassword !== confirmPassword) {
      setPwError('New passwords do not match'); return;
    }
    setPwLoading(true);
    try {
      await UserAPI.changePassword({ currentPassword, newPassword });
      setPwSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPwSuccess(false), 3000);
    } catch (err: any) {
      setPwError(err?.response?.data?.message || 'Failed to change password');
    } finally {
      setPwLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-navy">Profile Settings</h1>
        <p className="text-sm text-slate-400 font-medium mt-1">Manage your account information and password</p>
      </div>

      {/* Personal Info */}
      <div className="bg-primary rounded-2xl border border-border p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-5">
          <User size={16} className="text-slate-400" />
          <h2 className="font-bold text-sm uppercase tracking-wider text-slate-400">Personal Information</h2>
        </div>

        {nameSuccess && (
          <div className="flex items-center gap-2 p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm font-medium mb-4">
            <CheckCircle2 size={15} /> Profile updated successfully
          </div>
        )}
        {nameError && (
          <div className="flex items-center gap-2 p-3 rounded-xl border border-red-200 bg-red-50 text-red-600 text-sm font-medium mb-4">
            <AlertCircle size={15} /> {nameError}
          </div>
        )}

        <form onSubmit={handleSaveName} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                disabled
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm font-medium bg-slate-50 text-slate-400 cursor-not-allowed"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={nameLoading}
              className="bg-btn-primary text-navy font-bold text-sm px-5 py-2.5 rounded-full shadow hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {nameLoading ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>

      {/* Change Password */}
      <div className="bg-primary rounded-2xl border border-border p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-5">
          <Lock size={16} className="text-slate-400" />
          <h2 className="font-bold text-sm uppercase tracking-wider text-slate-400">Change Password</h2>
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
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue"
              />
            </div>
          </div>
          <p className="text-xs text-slate-400 font-medium">Minimum 8 characters</p>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={pwLoading}
              className="bg-btn-primary text-navy font-bold text-sm px-5 py-2.5 rounded-full shadow hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {pwLoading ? 'Updating…' : 'Update Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProfileSettings;
