import React, { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { 
  Users, 
  Calendar, 
  LayoutDashboard, 
  Settings as SettingsIcon, 
  LogOut, 
  Menu, 
  X,
  Building2,
  ChevronDown,
  ArrowLeftRight,
  RefreshCw,
  Newspaper,
  Archive,
  ShieldAlert
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useOrg } from '../context/OrgContext';
import './Layout.css';

const Layout = () => {
  const [session, setSession] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showOrgDropdown, setShowOrgDropdown] = useState(false);
  const [allOrgs, setAllOrgs] = useState([]);
  const navigate = useNavigate();
  const location = useLocation();
  const { currentOrg, isSuperAdmin, switchOrg, loading: orgLoading, gradientCSS } = useOrg();

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

  useEffect(() => {
    if (isSuperAdmin) {
      supabase.from('organizations').select('*').order('id').then(({ data }) => {
        if (data) setAllOrgs(data);
      });
    }
  }, [isSuperAdmin]);

  const handleLogoutClick = () => {
    setShowLogoutModal(true);
    setMobileMenuOpen(false);
  };

  const confirmLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const menuItems = [
    { path: '/dashboard', label: 'Zayavkalar', icon: <Users size={20} /> },
    { path: '/transfers', label: 'Transferlar', icon: <ArrowLeftRight size={20} /> },
    { path: '/profile-updates', label: "Ma'lumotlar almashinuvi", icon: <RefreshCw size={20} /> },
    { path: '/schedule', label: "O'yinlar jadvali", icon: <Calendar size={20} /> },
    { path: '/standings', label: 'Turnir jadvali', icon: <LayoutDashboard size={20} /> },
    { path: '/cards', label: 'Kartochkalar', icon: <ShieldAlert size={20} /> },
    { path: '/sponsors', label: 'Homiylar', icon: <Calendar size={20} /> },
    { path: '/news', label: 'Yangiliklar', icon: <Newspaper size={20} /> },
    { path: '/archive', label: 'Arxiv', icon: <Archive size={20} /> },
    { path: '/settings', label: 'Sozlamalar', icon: <SettingsIcon size={20} /> }
  ];

  if (!session) return <div>Loading...</div>;

  return (
    <div className="admin-layout">
      {/* Mobile Header */}
      <header className="mobile-header">
        <div className="logo-container">
          {orgLoading ? (
            <div className="logo-skeleton" style={{ width: '75px', height: '36px' }}></div>
          ) : currentOrg?.logo_url ? (
            <img 
              src={currentOrg.logo_url} 
              alt={currentOrg?.name || "Logo"} 
              className="header-logo" 
            />
          ) : (
            <div className="logo-placeholder-avatar">
              <Building2 size={20} />
            </div>
          )}
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
        <div style={{ background: gradientCSS, height: '4px', width: '100%' }} />
        <div className="sidebar-header hide-mobile">
          {orgLoading ? (
            <div className="logo-skeleton"></div>
          ) : currentOrg?.logo_url ? (
            <img 
              src={currentOrg.logo_url} 
              alt={currentOrg?.name || "Logo"} 
              className="sidebar-logo" 
            />
          ) : (
            <div className="logo-placeholder-avatar large">
              <Building2 size={28} />
            </div>
          )}
        </div>

        {/* Organization Switcher */}
        {currentOrg && (
          <div className="org-switcher-container">
            <button
              className="org-switcher-btn"
              onClick={() => isSuperAdmin && setShowOrgDropdown(!showOrgDropdown)}
              style={{ cursor: isSuperAdmin ? 'pointer' : 'default' }}
            >
              <Building2 size={14} />
              <span className="org-switcher-name">{currentOrg.name}</span>
              {isSuperAdmin && <ChevronDown size={14} className={`org-chevron ${showOrgDropdown ? 'open' : ''}`} />}
            </button>
            {showOrgDropdown && isSuperAdmin && (
              <div className="org-dropdown">
                {allOrgs.map(org => (
                  <button
                    key={org.id}
                    className={`org-dropdown-item ${org.id === currentOrg.id ? 'active' : ''}`}
                    onClick={() => {
                      switchOrg(org);
                      setShowOrgDropdown(false);
                      setMobileMenuOpen(false);
                    }}
                  >
                    <Building2 size={14} />
                    <span>{org.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        
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


