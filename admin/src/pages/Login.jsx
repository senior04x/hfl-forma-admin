import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, Eye, EyeOff, KeyRound, ArrowLeft, Send } from 'lucide-react';
import { supabase } from '../supabaseClient';
import './Login.css';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [loading, setLoading] = useState(false);

  // Forgot Password State
  const [isForgotMode, setIsForgotMode] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSuccess, setResetSuccess] = useState(false);

  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(false);
    setErrorText('');
    setLoading(true);

    try {
      const emailValue = username.includes('@') ? username : username + '@hfl.uz';
      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailValue,
        password: password,
      });

      if (error) {
        throw error;
      }
      
      if (data.user) {
        navigate('/dashboard');
      }
    } catch (error) {
      console.error(error);
      setError(true);
      setErrorText(error.message || 'Login yoki parol xato!');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setError(false);
    setErrorText('');
    setResetSuccess(false);
    setLoading(true);

    try {
      const emailValue = resetEmail.includes('@') ? resetEmail : resetEmail + '@hfl.uz';
      const redirectUrl = `${window.location.origin}/reset-password`;

      const { error } = await supabase.auth.resetPasswordForEmail(emailValue, {
        redirectTo: redirectUrl,
      });

      if (error) throw error;

      setResetSuccess(true);
    } catch (err) {
      console.error(err);
      setError(true);
      setErrorText(err.message || "Xatolik yuz berdi. Pochtani qayta tekshirib ko'ring.");
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
        
        {!isForgotMode ? (
          <form onSubmit={handleLogin}>
            <div className="login-field-group">
              <label className="login-label">Login / Email</label>
              <input 
                type="text" 
                placeholder="Loginni kiriting" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required 
              />
            </div>
            
            <div className="login-field-group" style={{ marginBottom: '14px' }}>
              <label className="login-label">Parol</label>
              <div className="password-input-wrapper">
                <input 
                  type={showPassword ? 'text' : 'password'} 
                  placeholder="Parolni kiriting" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required 
                />
                <button 
                  type="button" 
                  className="password-toggle-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  title={showPassword ? "Parolni berkitish" : "Parolni ko'rsatish"}
                >
                  {showPassword ? <Eye size={18} /> : <EyeOff size={18} />}
                </button>
              </div>
            </div>

            <div className="forgot-password-container">
              <button 
                type="button" 
                className="forgot-password-link"
                onClick={() => {
                  setIsForgotMode(true);
                  setError(false);
                  setResetSuccess(false);
                  setResetEmail(username);
                }}
              >
                Parolni unutdingizmi?
              </button>
            </div>
            
            <button type="submit" className="login-btn" disabled={loading}>
              <LogIn size={18} /> {loading ? 'Tekshirilmoqda...' : 'Tizimga kirish'}
            </button>
            
            {error && <div className="error-msg">{errorText || 'Login yoki parol xato!'}</div>}
          </form>
        ) : (
          <form onSubmit={handleForgotPassword}>
            <div style={{ marginBottom: '18px', textAlign: 'center' }}>
              <div style={{ 
                display: 'inline-flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                width: '48px', 
                height: '48px', 
                borderRadius: '12px', 
                background: 'rgba(0, 255, 102, 0.15)', 
                color: '#00ff66',
                marginBottom: '10px'
              }}>
                <KeyRound size={26} />
              </div>
              <h3 style={{ margin: '0 0 6px 0', fontSize: '18px', color: '#fff', fontWeight: '700' }}>Parolni tiklash</h3>
              <p style={{ margin: 0, fontSize: '13px', color: 'rgba(255, 255, 255, 0.7)' }}>
                Elektron pochtangizni kiriting. Biz sizga parolni yangilash linkini yuboramiz.
              </p>
            </div>

            <div className="login-field-group">
              <label className="login-label">Login / Email</label>
              <input 
                type="text" 
                placeholder="Login yoki emailingizni kiriting" 
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                required 
              />
            </div>

            <button type="submit" className="login-btn" disabled={loading || resetSuccess}>
              <Send size={16} /> {loading ? 'Yuborilmoqda...' : 'Linkni yuborish'}
            </button>

            {resetSuccess && (
              <div className="success-msg">
                ✅ Parolni tiklash havolasi elektron pochtangizga yuborildi! Pochtani tekshiring.
              </div>
            )}

            {error && <div className="error-msg">{errorText}</div>}

            <div style={{ marginTop: '16px' }}>
              <button 
                type="button" 
                className="back-to-login-btn"
                onClick={() => {
                  setIsForgotMode(false);
                  setError(false);
                  setResetSuccess(false);
                }}
              >
                <ArrowLeft size={15} /> Kirish oynasiga qaytish
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default Login;
