import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Lock, Phone, CheckCircle2, AlertCircle, ShieldCheck, ShieldOff, QrCode, ArrowLeft } from 'lucide-react';
import { UserAPI } from '../api/client';
import { AuthAPI } from '../api/client';
import { getUser } from '../lib/auth';

const ProfileSettings: React.FC = () => {
  const navigate = useNavigate();
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

  // 2FA state
  const currentUser = getUser();
  const isClientAdmin = currentUser?.role === 'CLIENT_ADMIN';
  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [twoFAStep, setTwoFAStep] = useState<'idle' | 'qr' | 'disable'>('idle');
  const [twoFASecret, setTwoFASecret] = useState('');
  const [twoFAUri, setTwoFAUri] = useState('');
  const [twoFACode, setTwoFACode] = useState('');
  const [twoFAQr, setTwoFAQr] = useState('');
  const [twoFAPassword, setTwoFAPassword] = useState('');
  const [twoFALoading, setTwoFALoading] = useState(false);
  const [twoFAError, setTwoFAError] = useState('');
  const [twoFASuccess, setTwoFASuccess] = useState('');

  useEffect(() => {
    UserAPI.me().then((res) => {
      const d: Record<string, any> = res.data;
      setFirstName(d.firstName || d.name?.split(' ')[0] || '');
      setLastName(d.lastName || d.name?.split(' ').slice(1).join(' ') || '');
      setPhone(d.phone || '');
      setEmail(d.email || '');
      setTwoFAEnabled(!!d.totpEnabled);
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
    } catch (err: any) {
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
    } catch (err: any) {
      setPwError(err?.response?.data?.message || 'Failed to change password');
    } finally {
      setPwLoading(false);
    }
  };

  const handle2FASetup = async () => {
    setTwoFAError(''); setTwoFALoading(true);
    try {
      const res = await AuthAPI.twoFA.setup();
      setTwoFASecret(res.data.secret);
      setTwoFAUri(res.data.uri);
      setTwoFAQr((res.data as any).qr || '');
      setTwoFAStep('qr');
    } catch (err: any) {
      setTwoFAError(err.message || 'Failed to start 2FA setup');
    } finally {
      setTwoFALoading(false);
    }
  };

  const handle2FAVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setTwoFAError(''); setTwoFALoading(true);
    try {
      await AuthAPI.twoFA.verify(twoFACode);
      setTwoFAEnabled(true);
      setTwoFAStep('idle');
      setTwoFACode('');
      setTwoFASuccess('Two-factor authentication enabled');
      setTimeout(() => setTwoFASuccess(''), 4000);
    } catch (err: any) {
      setTwoFAError(err.message || 'Invalid code');
    } finally {
      setTwoFALoading(false);
    }
  };

  const handle2FADisable = async (e: React.FormEvent) => {
    e.preventDefault();
    setTwoFAError(''); setTwoFALoading(true);
    try {
      await AuthAPI.twoFA.disable(twoFAPassword, twoFACode);
      setTwoFAEnabled(false);
      setTwoFAStep('idle');
      setTwoFACode(''); setTwoFAPassword('');
      setTwoFASuccess('Two-factor authentication disabled');
      setTimeout(() => setTwoFASuccess(''), 4000);
    } catch (err: any) {
      setTwoFAError(err.message || 'Failed to disable 2FA');
    } finally {
      setTwoFALoading(false);
    }
  };

  const inputCls = "w-full border border-border rounded-lg px-3 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-green/30 focus:border-accent-green";

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => navigate(-1)} aria-label="Go back" className="p-2 hover:bg-muted rounded-xl transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold">Profile & Settings</h1>
          <p className="text-muted-foreground font-medium text-sm">Manage your account details and password</p>
        </div>
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
      {/* Two-Factor Authentication */}
      {isClientAdmin && (
        <div className="bg-primary rounded-2xl border border-border p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className="text-muted-foreground" />
              <h2 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Two-Factor Authentication</h2>
            </div>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${twoFAEnabled ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-muted text-muted-foreground border border-border'}`}>
              {twoFAEnabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>

          {twoFASuccess && (
            <div className="flex items-center gap-2 p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm font-medium mb-4">
              <CheckCircle2 size={15} /> {twoFASuccess}
            </div>
          )}
          {twoFAError && (
            <div className="flex items-center gap-2 p-3 rounded-xl border border-red-200 bg-red-50 text-red-600 text-sm font-medium mb-4">
              <AlertCircle size={15} /> {twoFAError}
            </div>
          )}

          {twoFAStep === 'idle' && !twoFAEnabled && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground font-medium">
                Add an extra layer of security to your account. Once enabled, you'll need a code from your authenticator app each time you log in.
              </p>
              <div className="flex justify-end">
                <button
                  onClick={handle2FASetup}
                  disabled={twoFALoading}
                  className="flex items-center gap-2 bg-brand text-navy font-bold text-sm px-4 py-2 rounded-full shadow hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  <QrCode size={15} />
                  {twoFALoading ? 'Setting up…' : 'Set up 2FA'}
                </button>
              </div>
            </div>
          )}

          {twoFAStep === 'qr' && (
            <div className="flex flex-col gap-5">
              <p className="text-sm text-muted-foreground font-medium">
                Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.), then enter the 6-digit code to confirm.
              </p>
              {/* QR code is a data URL generated server-side — secret never leaves your network */}
              <div className="flex flex-col items-center gap-3">
                <img
                  src={twoFAQr || `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(twoFAUri)}`}
                  alt="2FA QR Code"
                  className="rounded-xl border border-border shadow-sm"
                  width={180}
                  height={180}
                />
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer font-medium hover:text-navy transition-colors">Can't scan? Enter code manually</summary>
                  <p className="mt-1 font-mono bg-muted rounded-lg px-3 py-2 select-all tracking-widest">{twoFASecret}</p>
                </details>
              </div>
              <form onSubmit={handle2FAVerify} className="flex flex-col gap-3">
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Authenticator Code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={twoFACode}
                    onChange={(e) => setTwoFACode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    className={`${inputCls} tracking-[0.3em] text-center text-lg`}
                    autoFocus
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => { setTwoFAStep('idle'); setTwoFACode(''); setTwoFAError(''); }}
                    className="text-sm font-medium text-muted-foreground hover:text-navy transition-colors px-3 py-2"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={twoFALoading || twoFACode.length < 6}
                    className="bg-brand text-navy font-bold text-sm px-4 py-2 rounded-full shadow hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {twoFALoading ? 'Verifying…' : 'Enable 2FA'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {twoFAStep === 'idle' && twoFAEnabled && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground font-medium">
                Your account is protected with two-factor authentication. To disable it, enter your password and a current authenticator code.
              </p>
              <div className="flex justify-end">
                <button
                  onClick={() => { setTwoFAStep('disable'); setTwoFAError(''); }}
                  className="flex items-center gap-2 text-sm font-bold text-red-600 hover:text-red-700 transition-colors px-3 py-2 rounded-full border border-red-200 hover:bg-red-50"
                >
                  <ShieldOff size={14} /> Disable 2FA
                </button>
              </div>
            </div>
          )}

          {twoFAStep === 'disable' && (
            <form onSubmit={handle2FADisable} className="flex flex-col gap-3">
              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Current Password</label>
                <input
                  type="password"
                  value={twoFAPassword}
                  onChange={(e) => setTwoFAPassword(e.target.value)}
                  autoComplete="current-password"
                  className={inputCls}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Authenticator Code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={twoFACode}
                  onChange={(e) => setTwoFACode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className={`${inputCls} tracking-[0.3em] text-center text-lg`}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => { setTwoFAStep('idle'); setTwoFACode(''); setTwoFAPassword(''); setTwoFAError(''); }}
                  className="text-sm font-medium text-muted-foreground hover:text-navy transition-colors px-3 py-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={twoFALoading || !twoFAPassword || twoFACode.length < 6}
                  className="bg-red-600 text-white font-bold text-sm px-4 py-2 rounded-full shadow hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {twoFALoading ? 'Disabling…' : 'Confirm Disable'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
};

export default ProfileSettings;
