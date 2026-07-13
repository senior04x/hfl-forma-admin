import React, { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { LogOut, LayoutDashboard, Calendar, Users, Menu, X } from 'lucide-react';
import { supabase } from '../supabaseClient';
import './Layout.css';

const Layout = () => {
  const [session, setSession] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (!session) {
        navigate('/login');
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (!session) {
        navigate('/login');
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const menuItems = [
    { path: '/dashboard', label: 'Zayavkalar', icon: <Users size={20} /> },
    { path: '/schedule', label: "O'yinlar jadvali", icon: <Calendar size={20} /> }
  ];

  if (!session) return <div>Loading...</div>;

  return (
    <div className="admin-layout">
      {/* Mobile Header */}
      <header className="mobile-header">
        <div className="logo-container">
          <img src="/images/logo.png" alt="HFL Logo" className="header-logo" />
        </div>
        <button className="menu-toggle" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
          {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </header>

      {/* Sidebar */}
      <aside className={`sidebar ${mobileMenuOpen ? 'open' : ''}`}>
        <div className="sidebar-header hide-mobile">
          <img src="/images/logo.png" alt="HFL Logo" className="sidebar-logo" />
        </div>
        
        <nav className="sidebar-nav">
          <ul>
            {menuItems.map(item => (
              <li key={item.path} className={location.pathname === item.path ? 'active' : ''}>
                <a 
                  href="#" 
                  onClick={(e) => { 
                    e.preventDefault(); 
                    navigate(item.path); 
                    setMobileMenuOpen(false); 
                  }}
                >
                  {item.icon} <span>{item.label}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="sidebar-footer">
          <button onClick={handleLogout} className="logout-btn">
            <LogOut size={20} /> <span>Tizimdan chiqish</span>
          </button>
        </div>
      </aside>

      {/* Mobile Overlay */}
      {mobileMenuOpen && (
        <div className="mobile-overlay" onClick={() => setMobileMenuOpen(false)}></div>
      )}

      {/* Main Content */}
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;


