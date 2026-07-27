import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, Eye, EyeOff, CheckCircle2, ArrowLeft } from 'lucide-react';
import { supabase } from '../supabaseClient';
import './Login.css';

const ResetPassword = () => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [success, setSuccess] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    // Listen for auth state change recovery event or check active session
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) {
        setSessionReady(true);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setSessionReady(true);
      }
    });

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setErrorText('');

    if (newPassword.length < 6) {
      setErrorText("Parol kamida 6 ta belgidan iborat bo'lishi kerak!");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorText("Kiritilgan parollar bir-biriga mos kelmadi!");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      setSuccess(true);

      // Sign out session after password update so user must log in with new password
      await supabase.auth.signOut();

      setTimeout(() => {
        navigate('/login');
      }, 2500);
    } catch (err) {
      console.error(err);
      setErrorText(err.message || "Parolni o'zgartirishda xatolik yuz berdi.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h2 className="login-subtitle">
          <span>Futbolni avtomatlashtirish</span>
          <span className="login-subtitle-line2">biz bilan oson</span>
        </h2>

        <div style={{ marginBottom: '20px', textAlign: 'center' }}>
          <div style={{ 
            display: 'inline-flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            width: '52px', 
            height: '52px', 
            borderRadius: '14px', 
            background: 'rgba(0, 255, 102, 0.15)', 
            color: '#00ff66',
            marginBottom: '12px'
          }}>
            <KeyRound size={28} />
          </div>
          <h3 style={{ margin: '0 0 6px 0', fontSize: '19px', color: '#fff', fontWeight: '800' }}>Yangi Parol O'rnatish</h3>
          <p style={{ margin: 0, fontSize: '13px', color: 'rgba(255, 255, 255, 0.75)', lineHeight: '1.4' }}>
            Hisobingiz uchun yangi xavfsiz parol kiriting.
          </p>
        </div>

        {success ? (
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <div className="success-msg" style={{ fontSize: '14px', padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <CheckCircle2 size={32} color="#00ff66" />
              <span>Parolingiz muvaffaqiyatli yangilandi!</span>
              <span style={{ fontSize: '12px', opacity: 0.8, color: '#ffffff' }}>Login sahifasiga o'tilmoqda...</span>
            </div>
          </div>
        ) : (
          <form onSubmit={handleResetPassword}>
            <div className="login-field-group">
              <label className="login-label">Yangi Parol</label>
              <div className="password-input-wrapper">
                <input 
                  type={showPassword ? 'text' : 'password'} 
                  placeholder="Yangi parolni kiriting" 
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required 
                />
                <button 
                  type="button" 
                  className="password-toggle-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? <Eye size={18} /> : <EyeOff size={18} />}
                </button>
              </div>
            </div>

            <div className="login-field-group">
              <label className="login-label">Yangi Parolni Tasdiqlang</label>
              <div className="password-input-wrapper">
                <input 
                  type={showPassword ? 'text' : 'password'} 
                  placeholder="Parolni qayta kiriting" 
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required 
                />
              </div>
            </div>

            <button type="submit" className="login-btn" disabled={loading}>
              <KeyRound size={18} /> {loading ? "Saqlanmoqda..." : "Yangi parolni saqlash"}
            </button>

            {errorText && <div className="error-msg">{errorText}</div>}

            <div style={{ marginTop: '16px' }}>
              <button 
                type="button" 
                className="back-to-login-btn"
                onClick={() => navigate('/login')}
              >
                <ArrowLeft size={15} /> Login sahifasiga qaytish
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ResetPassword;
