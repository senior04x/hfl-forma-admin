import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useOrg } from '../context/OrgContext';
import PlayersTable from '../components/PlayersTable';
import TeamsTable from '../components/TeamsTable';
import './Dashboard.css';

const Dashboard = () => {
  const [currentTab, setCurrentTab] = useState('players');
  const [stats, setStats] = useState({ total: 0, pending: 0, approved: 0 });
  const { orgId } = useOrg();

  useEffect(() => {
    fetchStats();
  }, [currentTab, orgId]);

  const fetchStats = async () => {
    try {
      if (currentTab === 'players') {
        const { count: total, error: e1 } = await supabase.from('applications').select('*', { count: 'exact', head: true }).eq('organization_id', orgId);
        const { count: pending, error: e2 } = await supabase.from('applications').select('*', { count: 'exact', head: true }).eq('organization_id', orgId).eq('status', 'pending');
        const { count: approved, error: e3 } = await supabase.from('applications').select('*', { count: 'exact', head: true }).eq('organization_id', orgId).eq('status', 'approved');
        
        if (!e1 && !e2 && !e3) setStats({ total: total || 0, pending: pending || 0, approved: approved || 0 });
      } else {
        const { count: total, error: e1 } = await supabase.from('teams').select('*', { count: 'exact', head: true }).eq('organization_id', orgId);
        const { count: pending, error: e2 } = await supabase.from('teams').select('*', { count: 'exact', head: true }).eq('organization_id', orgId).eq('status', 'pending');
        const { count: approved, error: e3 } = await supabase.from('teams').select('*', { count: 'exact', head: true }).eq('organization_id', orgId).in('status', ['approved', 'partially_approved']);
        
        if (!e1 && !e2 && !e3) setStats({ total: total || 0, pending: pending || 0, approved: approved || 0 });
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  return (
    <div className="dashboard-container">
      <div className="stats-cards">
        <div className="stat-card total">
          <div className="stat-info">
            <h3>Jami</h3>
            <p>{stats.total}</p>
          </div>
          <div className="stat-icon"><i data-lucide="users"></i></div>
        </div>
        <div className="stat-card pending">
          <div className="stat-info">
            <h3>Kutilmoqda</h3>
            <p>{stats.pending}</p>
          </div>
          <div className="stat-icon"><i data-lucide="clock"></i></div>
        </div>
        <div className="stat-card approved">
          <div className="stat-info">
            <h3>Tasdiqlandi</h3>
            <p>{stats.approved}</p>
          </div>
          <div className="stat-icon"><i data-lucide="check-circle"></i></div>
        </div>
      </div>

      <div className="tabs-container">
        <button 
          className={`tab-btn ${currentTab === 'players' ? 'active' : ''}`}
          onClick={() => setCurrentTab('players')}
        >
          Barcha O'yinchilar
        </button>
        <button 
          className={`tab-btn ${currentTab === 'teams' ? 'active' : ''}`}
          onClick={() => setCurrentTab('teams')}
        >
          Jamoalar
        </button>
      </div>

      <div className="tab-content">
        {currentTab === 'players' ? <PlayersTable onStatusChange={fetchStats} /> : <TeamsTable onStatusChange={fetchStats} />}
      </div>
    </div>
  );
};

export default Dashboard;

