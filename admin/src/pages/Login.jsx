import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { supabase } from '../supabaseClient';
import './Login.css';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
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
        <img src="/images/logo.png" alt="Logo" className="logo" />
        <h2>Admin Kirish</h2>
        
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
            <input 
              type="password" 
              placeholder="Parolni kiriting" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required 
            />
          </div>
          
          <button type="submit" className="login-btn" disabled={loading}>
            <LogIn size={20} /> {loading ? 'Tekshirilmoqda...' : 'Tizimga kirish'}
          </button>
          
          {error && <div className="error-msg" style={{display: 'block'}}>Login yoki parol xato!</div>}
        </form>
      </div>
    </div>
  );
};

export default Login;

