import React, { useState, useEffect } from 'react';
import { supabase, supabaseAdmin } from '../supabaseClient';
import { useOrg } from '../context/OrgContext';
import PlayersTable from '../components/PlayersTable';
import TeamsTable from '../components/TeamsTable';
import ExportPdfModal from '../components/ExportPdfModal';
import { getActiveOrgLeagues } from '../utils/leagueUtils';
import { fetchAllApplications, fetchAllTeams } from '../utils/supabaseHelpers';
import { Users, Clock, CheckCircle2, XCircle, FileText } from 'lucide-react';
import './Dashboard.css';

const Dashboard = () => {
  const [currentTab, setCurrentTab] = useState('players');
  const [stats, setStats] = useState({ total: 0, pending: 0, approved: 0, rejected: 0 });
  const [statsLoading, setStatsLoading] = useState(true);
  const [activeLeagues, setActiveLeagues] = useState([]);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const { orgId } = useOrg();

  const [isRegistrationOpen, setIsRegistrationOpen] = useState(() => {
    try {
      const saved = localStorage.getItem(`hfl_reg_open_${orgId || 1}`);
      if (saved === 'false') return false;
      if (saved === 'true') return true;
    } catch (e) {}
    return true;
  });
  const [togglingReg, setTogglingReg] = useState(false);

  useEffect(() => {
    loadLeaguesAndStats();
    fetchRegistrationStatus();

    const activeOrgId = orgId || 1;
    const channel = supabase
      .channel(`web_dashboard_reg_status_${activeOrgId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'organizations' },
        (payload) => {
          if (payload.new && payload.new.is_registration_open !== undefined && payload.new.is_registration_open !== null) {
            setIsRegistrationOpen(!!payload.new.is_registration_open);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sponsors' },
        (payload) => {
          if (payload.new && payload.new.name && payload.new.name.startsWith('REGISTRATION_OPEN')) {
            setIsRegistrationOpen(payload.new.logo_url === 'true');
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentTab, orgId]);

  const fetchRegistrationStatus = async () => {
    const activeOrgId = orgId || 1;
    let openStatus = true;
    let found = false;

    // 1. Try sponsors KV table with supabaseAdmin
    try {
      const configKey = `REGISTRATION_OPEN_${activeOrgId}`;
      const { data: spData } = await supabaseAdmin
        .from('sponsors')
        .select('logo_url')
        .eq('name', configKey)
        .maybeSingle();

      if (spData && spData.logo_url !== undefined && spData.logo_url !== null) {
        openStatus = spData.logo_url === 'true';
        found = true;
      }
    } catch (e) {}

    // 2. Try organizations table with supabaseAdmin if not found in sponsors
    if (!found) {
      try {
        const { data: orgData } = await supabaseAdmin
          .from('organizations')
          .select('*')
          .eq('id', activeOrgId)
          .maybeSingle();

        if (orgData && orgData.is_registration_open !== undefined && orgData.is_registration_open !== null) {
          openStatus = !!orgData.is_registration_open;
          found = true;
        }
      } catch (e) {}
    }

    if (found) {
      setIsRegistrationOpen(openStatus);
      try { localStorage.setItem(`hfl_reg_open_${activeOrgId}`, openStatus ? 'true' : 'false'); } catch (e) {}
    }
  };

  const handleToggleRegistration = async () => {
    if (togglingReg) return;
    setTogglingReg(true);
    const newState = !isRegistrationOpen;
    setIsRegistrationOpen(newState);
    const activeOrgId = orgId || 1;

    // Instantly persist to localStorage
    try { localStorage.setItem(`hfl_reg_open_${activeOrgId}`, newState ? 'true' : 'false'); } catch (e) {}

    // Save to sponsors KV table using supabaseAdmin across all key formats
    try {
      const keysToUpdate = [
        `REGISTRATION_OPEN_${activeOrgId}`,
        `REGISTRATION_OPEN_1`,
        `REGISTRATION_OPEN`
      ];

      for (const key of keysToUpdate) {
        const { data: existing } = await supabaseAdmin
          .from('sponsors')
          .select('id')
          .eq('name', key)
          .maybeSingle();

        if (existing?.id) {
          await supabaseAdmin
            .from('sponsors')
            .update({ logo_url: newState ? 'true' : 'false' })
            .eq('id', existing.id);
        } else {
          await supabaseAdmin
            .from('sponsors')
            .insert([{
              name: key,
              logo_url: newState ? 'true' : 'false',
              organization_id: activeOrgId,
              is_main: false
            }]);
        }
      }
    } catch (e) {
      console.warn('Sponsors reg toggle save notice:', e);
    }

    // Also sync to organizations table
    try {
      await supabaseAdmin.from('organizations').update({ is_registration_open: newState }).eq('id', activeOrgId);
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
        const [allApps, allTeams] = await Promise.all([
          fetchAllApplications('id, status, team_id, organization_id, comment'),
          fetchAllTeams('id, league, organization_id')
        ]);

        const validTeamIds = new Set(
          (allTeams || [])
            .filter(t => t.organization_id === orgId || activeLeagueNames.includes(t.league))
            .map(t => t.id)
        );

        const filteredApps = (allApps || [])
          .filter(app => !app.comment || !app.comment.includes('[PROFILE_UPDATE]'))
          .filter(app => 
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
        const allTeams = await fetchAllTeams('id, status, league, organization_id');
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {/* Export PDF Button */}
          <button
            onClick={() => setIsPdfModalOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
              color: '#ffffff',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '12px',
              cursor: 'pointer',
              fontWeight: '700',
              fontSize: '13px',
              boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
              transition: 'all 0.2s ease'
            }}
            title="O'yinchilar va jamoalarni PDF formatida yuklab olish"
          >
            <FileText size={18} />
            <span>Export PDF</span>
          </button>

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
      </div>

      <div className="tab-content">
        {currentTab === 'players' ? <PlayersTable onStatusChange={fetchStats} /> : <TeamsTable onStatusChange={fetchStats} />}
      </div>

      {/* Export PDF Modal */}
      <ExportPdfModal
        isOpen={isPdfModalOpen}
        onClose={() => setIsPdfModalOpen(false)}
        activeLeagues={activeLeagues}
      />
    </div>
  );
};

export default Dashboard;
