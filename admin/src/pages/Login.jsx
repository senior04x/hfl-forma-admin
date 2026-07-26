import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../supabaseClient';
import './Login.css';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(false);
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: username.includes('@') ? username : username + '@hfl.uz',
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
        
        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label>Login / Email</label>
            <input 
              type="text" 
              placeholder="Loginni kiriting" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required 
            />
          </div>
          <div className="form-group">
            <label>Parol</label>
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
          
          <button type="submit" className="login-btn" disabled={loading}>
            <LogIn size={18} /> {loading ? 'Tekshirilmoqda...' : 'Tizimga kirish'}
          </button>
          
          {error && <div className="error-msg" style={{display: 'block'}}>Login yoki parol xato!</div>}
        </form>
      </div>
    </div>
  );
};

export default Login;
