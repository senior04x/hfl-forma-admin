import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useOrg } from '../context/OrgContext';
import PlayersTable from '../components/PlayersTable';
import TeamsTable from '../components/TeamsTable';
import { getActiveOrgLeagues, applyOrgAndCollabFilter } from '../utils/leagueUtils';
import { Users, Clock, CheckCircle2, XCircle } from 'lucide-react';
import './Dashboard.css';

const Dashboard = () => {
  const [currentTab, setCurrentTab] = useState('players');
  const [stats, setStats] = useState({ total: 0, pending: 0, approved: 0, rejected: 0 });
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
      const table = currentTab === 'players' ? 'applications' : 'teams';
      let query = supabase.from(table).select('status');
      query = applyOrgAndCollabFilter(query, orgId, leaguesList);

      const { data, error } = await query;
      if (error) throw error;

      if (data) {
        let total = data.length;
        let pending = 0;
        let approved = 0;
        let rejected = 0;

        data.forEach(item => {
          const s = item.status;
          if (s === 'pending') pending++;
          else if (s === 'approved' || s === 'partially_approved') approved++;
          else if (s === 'rejected') rejected++;
        });

        setStats({ total, pending, approved, rejected });
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
          <div className="stat-icon"><Users size={24} /></div>
        </div>
        <div className="stat-card pending">
          <div className="stat-info">
            <h3>Kutilmoqda</h3>
            <p>{stats.pending}</p>
          </div>
          <div className="stat-icon"><Clock size={24} /></div>
        </div>
        <div className="stat-card approved">
          <div className="stat-info">
            <h3>Tasdiqlandi</h3>
            <p>{stats.approved}</p>
          </div>
          <div className="stat-icon"><CheckCircle2 size={24} /></div>
        </div>
        <div className="stat-card rejected">
          <div className="stat-info">
            <h3>Rad etildi</h3>
            <p>{stats.rejected}</p>
          </div>
          <div className="stat-icon"><XCircle size={24} /></div>
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

