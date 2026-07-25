import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useOrg } from '../context/OrgContext';
import PlayersTable from '../components/PlayersTable';
import TeamsTable from '../components/TeamsTable';
import { getActiveOrgLeagues, applyOrgAndCollabFilter } from '../utils/leagueUtils';
import './Dashboard.css';

const Dashboard = () => {
  const [currentTab, setCurrentTab] = useState('players');
  const [stats, setStats] = useState({ total: 0, pending: 0, approved: 0 });
  const [activeLeagues, setActiveLeagues] = useState([]);
  const { orgId } = useOrg();

  useEffect(() => {
    loadLeaguesAndStats();
  }, [currentTab, orgId]);

  const loadLeaguesAndStats = async () => {
    const fetched = await getActiveOrgLeagues(orgId);
    setActiveLeagues(fetched);
    fetchStats(fetched);
  };

  const fetchStats = async (leaguesList = activeLeagues) => {
    try {
      if (currentTab === 'players') {
        let q1 = supabase.from('applications').select('*', { count: 'exact', head: true });
        let q2 = supabase.from('applications').select('*', { count: 'exact', head: true }).eq('status', 'pending');
        let q3 = supabase.from('applications').select('*', { count: 'exact', head: true }).eq('status', 'approved');

        q1 = applyOrgAndCollabFilter(q1, orgId, leaguesList);
        q2 = applyOrgAndCollabFilter(q2, orgId, leaguesList);
        q3 = applyOrgAndCollabFilter(q3, orgId, leaguesList);

        const [r1, r2, r3] = await Promise.all([q1, q2, q3]);
        setStats({ total: r1.count || 0, pending: r2.count || 0, approved: r3.count || 0 });
      } else {
        let q1 = supabase.from('teams').select('*', { count: 'exact', head: true });
        let q2 = supabase.from('teams').select('*', { count: 'exact', head: true }).eq('status', 'pending');
        let q3 = supabase.from('teams').select('*', { count: 'exact', head: true }).in('status', ['approved', 'partially_approved']);

        q1 = applyOrgAndCollabFilter(q1, orgId, leaguesList);
        q2 = applyOrgAndCollabFilter(q2, orgId, leaguesList);
        q3 = applyOrgAndCollabFilter(q3, orgId, leaguesList);

        const [r1, r2, r3] = await Promise.all([q1, q2, q3]);
        setStats({ total: r1.count || 0, pending: r2.count || 0, approved: r3.count || 0 });
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

