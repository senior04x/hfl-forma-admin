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
  const [statsLoading, setStatsLoading] = useState(true);
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
    setStatsLoading(true);
    try {
      const activeLeagueNames = (leaguesList || []).map(l => l.name);

      if (currentTab === 'players') {
        const [appRes, teamRes] = await Promise.all([
          supabase.from('applications').select('id, status, team_id, organization_id'),
          supabase.from('teams').select('id, league, organization_id')
        ]);

        const allApps = appRes.data || [];
        const allTeams = teamRes.data || [];

        const validTeamIds = new Set(
          allTeams
            .filter(t => t.organization_id === orgId || activeLeagueNames.includes(t.league))
            .map(t => t.id)
        );

        const filteredApps = allApps.filter(app => 
          app.organization_id === orgId || 
          (app.team_id && validTeamIds.has(app.team_id)) ||
          (!orgId)
        );

        let total = filteredApps.length;
        let pending = 0;
        let approved = 0;
        let rejected = 0;

        filteredApps.forEach(item => {
          const s = item.status;
          if (s === 'pending') pending++;
          else if (s === 'approved' || s === 'partially_approved') approved++;
          else if (s === 'rejected') rejected++;
        });

        setStats({ total, pending, approved, rejected });
      } else {
        const { data: allTeams } = await supabase.from('teams').select('id, status, league, organization_id');
        const filteredTeams = (allTeams || []).filter(t => 
          t.organization_id === orgId || activeLeagueNames.includes(t.league)
        );

        let total = filteredTeams.length;
        let pending = 0;
        let approved = 0;
        let rejected = 0;

        filteredTeams.forEach(item => {
          const s = item.status;
          if (s === 'pending') pending++;
          else if (s === 'approved' || s === 'partially_approved') approved++;
          else if (s === 'rejected') rejected++;
        });

        setStats({ total, pending, approved, rejected });
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setStatsLoading(false);
    }
  };

  return (
    <div className="dashboard-container">
      <div className="stats-cards">
        <div className="stat-card total">
          <div className="stat-info">
            <h3>Jami</h3>
            {statsLoading ? <div className="skeleton-number"></div> : <p>{stats.total}</p>}
          </div>
          <div className="stat-icon"><Users size={24} /></div>
        </div>
        <div className="stat-card pending">
          <div className="stat-info">
            <h3>Kutilmoqda</h3>
            {statsLoading ? <div className="skeleton-number"></div> : <p>{stats.pending}</p>}
          </div>
          <div className="stat-icon"><Clock size={24} /></div>
        </div>
        <div className="stat-card approved">
          <div className="stat-info">
            <h3>Tasdiqlandi</h3>
            {statsLoading ? <div className="skeleton-number"></div> : <p>{stats.approved}</p>}
          </div>
          <div className="stat-icon"><CheckCircle2 size={24} /></div>
        </div>
        <div className="stat-card rejected">
          <div className="stat-info">
            <h3>Rad etildi</h3>
            {statsLoading ? <div className="skeleton-number"></div> : <p>{stats.rejected}</p>}
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

