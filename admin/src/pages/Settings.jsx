import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useOrg } from '../context/OrgContext';
import { Settings as SettingsIcon, KeyRound, Mail, Check, AlertCircle } from 'lucide-react';
import './Settings.css';

const Settings = () => {
  const { currentOrg, adminRole } = useOrg();
  const [userEmail, setUserEmail] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserEmail(user.email || '');
        setNewEmail(user.email || '');
      }
    });
  }, []);

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });

    if (!newPassword) {
      setMessage({ type: 'error', text: 'Yangi parolni kiriting!' });
      return;
    }
    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: 'Parol kamida 6 ta belgidan iborat bo\'lishi kerak!' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Parollar mos kelmadi!' });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setMessage({ type: 'success', text: 'Parolingiz muvaffaqiyatli almashtirildi!' });
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setMessage({ type: 'error', text: 'Xato: ' + err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateEmail = async (e) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });

    if (!newEmail || newEmail === userEmail) return;

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail });
      if (error) throw error;

      // Update email in admin_users if exists
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('admin_users').update({ email: newEmail }).eq('id', user.id);
      }

      setMessage({ type: 'success', text: 'Email yangilandi! Tasdiqlash havolasi yangi emailga yuborildi.' });
      setUserEmail(newEmail);
    } catch (err) {
      setMessage({ type: 'error', text: 'Xato: ' + err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="settings-page">
      <div className="settings-header">
        <SettingsIcon size={28} />
        <div>
          <h1>Hisob Sozlamalari</h1>
          <p>{currentOrg?.name} ({adminRole === 'super_admin' ? 'Super Admin' : 'Tashkilot Admini'})</p>
        </div>
      </div>

      {message.text && (
        <div className={`settings-alert ${message.type}`}>
          {message.type === 'success' ? <Check size={18} /> : <AlertCircle size={18} />}
          <span>{message.text}</span>
        </div>
      )}

      <div className="settings-grid">
        {/* Profile Info Card */}
        <div className="settings-card">
          <div className="settings-card-header">
            <Mail size={20} />
            <h2>Email manzili</h2>
          </div>
          <form onSubmit={handleUpdateEmail}>
            <div className="settings-form-group">
              <label>Hozirgi Email</label>
              <input
                type="email"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="settings-btn" disabled={loading || newEmail === userEmail}>
              Emailni yangilash
            </button>
          </form>
        </div>

        {/* Change Password Card */}
        <div className="settings-card">
          <div className="settings-card-header">
            <KeyRound size={20} />
            <h2>Parolni almashtirish</h2>
          </div>
          <form onSubmit={handleUpdatePassword}>
            <div className="settings-form-group">
              <label>Yangi Parol</label>
              <input
                type="password"
                placeholder="Kamida 6 belgi"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
              />
            </div>
            <div className="settings-form-group">
              <label>Parolni takrorlang</label>
              <input
                type="password"
                placeholder="Yangi parolni takrorlang"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="settings-btn settings-btn-primary" disabled={loading}>
              Parolni saqlash
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Settings;
