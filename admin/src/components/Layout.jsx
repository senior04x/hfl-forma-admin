import React, { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { LogOut, LayoutDashboard, Calendar, Users, Menu, X } from 'lucide-react';
import { supabase } from '../supabaseClient';
import './Layout.css';

const Layout = () => {
  const [session, setSession] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
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

  const handleLogoutClick = () => {
    setShowLogoutModal(true);
    setMobileMenuOpen(false); // close sidebar on mobile if open
  };

  const confirmLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const menuItems = [
    { path: '/dashboard', label: 'Zayavkalar', icon: <Users size={20} /> },
    { path: '/schedule', label: "O'yinlar jadvali", icon: <Calendar size={20} /> },
    { path: '/standings', label: 'Turnir jadvali', icon: <LayoutDashboard size={20} /> }
  ];

  if (!session) return <div>Loading...</div>;

  return (
    <div className="admin-layout">
      {/* Mobile Header */}
      <header className="mobile-header">
        <div className="logo-container">
          <img src="/images/logo.png" alt="HFL Logo" className="header-logo" />
        </div>
        <button className={`menu-toggle ${mobileMenuOpen ? 'open' : ''}`} onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
          <Menu size={24} className="icon-menu" />
          <X size={24} className="icon-close" />
        </button>
      </header>

      {/* Mobile Overlay */}
      {mobileMenuOpen && (
        <div className="mobile-overlay" onClick={() => setMobileMenuOpen(false)}></div>
      )}

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
          <button onClick={handleLogoutClick} className="logout-btn">
            <LogOut size={20} /> <span>Tizimdan chiqish</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <Outlet />
      </main>

      {/* Premium Logout Modal */}
      {showLogoutModal && (
        <div className="logout-modal-overlay">
          <div className="logout-modal">
            <div className="logout-modal-icon">
              <LogOut size={32} />
            </div>
            <h3>Tizimdan chiqish</h3>
            <p>Haqiqatan ham tizimdan chiqmoqchimisiz?</p>
            <div className="logout-modal-actions">
              <button className="btn-cancel" onClick={() => setShowLogoutModal(false)}>Yo'q</button>
              <button className="btn-confirm" onClick={confirmLogout}>Ha</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Layout;


