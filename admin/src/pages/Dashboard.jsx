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

  const [isRegistrationOpen, setIsRegistrationOpen] = useState(true);
  const [togglingReg, setTogglingReg] = useState(false);

  useEffect(() => {
    loadLeaguesAndStats();
    fetchRegistrationStatus();
  }, [currentTab, orgId]);

  const fetchRegistrationStatus = async () => {
    try {
      const activeOrgId = orgId || 1;
      // 1. Try organizations table
      const { data: orgData } = await supabase
        .from('organizations')
        .select('is_registration_open')
        .eq('id', activeOrgId)
        .maybeSingle();

      if (orgData && orgData.is_registration_open !== undefined && orgData.is_registration_open !== null) {
        setIsRegistrationOpen(!!orgData.is_registration_open);
        return;
      }

      // 2. Fallback to sponsors table key-value store
      const configKey = `REGISTRATION_OPEN_${activeOrgId}`;
      const { data: spData } = await supabase
        .from('sponsors')
        .select('logo_url')
        .eq('name', configKey)
        .maybeSingle();

      if (spData && spData.logo_url !== undefined && spData.logo_url !== null) {
        setIsRegistrationOpen(spData.logo_url === 'true');
      }
    } catch (err) {
      console.error('Error fetching registration status:', err);
    }
  };

  const handleToggleRegistration = async () => {
    if (togglingReg) return;
    setTogglingReg(true);
    const newState = !isRegistrationOpen;
    setIsRegistrationOpen(newState);
    const activeOrgId = orgId || 1;

    try {
      // 1. Try updating organizations table
      await supabase
        .from('organizations')
        .update({ is_registration_open: newState })
        .eq('id', activeOrgId);
    } catch (e) {}

    try {
      // 2. Dual-sync to sponsors table as key-value config
      const configKey = `REGISTRATION_OPEN_${activeOrgId}`;
      const { data: existing } = await supabase
        .from('sponsors')
        .select('id')
        .eq('name', configKey)
        .maybeSingle();

      if (existing?.id) {
        await supabase
          .from('sponsors')
          .update({ logo_url: newState ? 'true' : 'false' })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('sponsors')
          .insert([{
            name: configKey,
            logo_url: newState ? 'true' : 'false',
            organization_id: activeOrgId,
            is_main: false,
            is_selected: false
          }]);
      }
    } catch (e) {}

    setTogglingReg(false);
  };

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

      <div className="tabs-container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            className={`tab-btn ${currentTab === 'players' ? 'active' : ''}`}
            onClick={() => setCurrentTab('players')}
          >
            O'yinchilar
          </button>
          <button 
            className={`tab-btn ${currentTab === 'teams' ? 'active' : ''}`}
            onClick={() => setCurrentTab('teams')}
          >
            Jamoalar
          </button>
        </div>

        {/* Registration Toggle Switcher */}
        <div 
          onClick={handleToggleRegistration}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            background: isRegistrationOpen ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
            border: isRegistrationOpen ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(239, 68, 68, 0.4)',
            padding: '8px 16px',
            borderRadius: '12px',
            cursor: 'pointer',
            userSelect: 'none',
            transition: 'all 0.3s ease'
          }}
          title={isRegistrationOpen ? "Ro'yxatdan o'tish arizalari OCHIQ (Bosib yopish)" : "Ro'yxatdan o'tish arizalari YOPILGAN (Bosib ochish)"}
        >
          <span style={{ fontSize: '13px', fontWeight: '800', color: isRegistrationOpen ? '#10b981' : '#ef4444' }}>
            {isRegistrationOpen ? "Ro'yxatdan o'tish: OCHIQ" : "Ro'yxatdan o'tish: YOPILGAN"}
          </span>
          <div style={{
            width: '40px',
            height: '22px',
            background: isRegistrationOpen ? '#10b981' : '#475569',
            borderRadius: '12px',
            position: 'relative',
            transition: 'background 0.3s ease'
          }}>
            <div style={{
              width: '16px',
              height: '16px',
              background: '#ffffff',
              borderRadius: '50%',
              position: 'absolute',
              top: '3px',
              left: isRegistrationOpen ? '21px' : '3px',
              transition: 'left 0.3s ease',
              boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
            }} />
          </div>
        </div>
      </div>

      <div className="tab-content">
        {currentTab === 'players' ? <PlayersTable onStatusChange={fetchStats} /> : <TeamsTable onStatusChange={fetchStats} />}
      </div>
    </div>
  );
};

export default Dashboard;

