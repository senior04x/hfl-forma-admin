import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useOrg } from '../context/OrgContext';
import { fetchAllApplications, fetchAllTeams } from '../utils/supabaseHelpers';
import { Archive as ArchiveIcon, RotateCcw, Search, Shield, Users, Trophy } from 'lucide-react';
import './Archive.css';

export default function ArchivePage() {
  const { orgId } = useOrg();
  const [activeTab, setActiveTab] = useState('teams');
  const [archivedTeams, setArchivedTeams] = useState([]);
  const [archivedPlayers, setArchivedPlayers] = useState([]);
  const [allTeamsMap, setAllTeamsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchArchivedData();
  }, [orgId]);

  const fetchArchivedData = async () => {
    setLoading(true);
    try {
      // 1. Fetch All Teams to separate archived and active teams map
      const teamsData = await fetchAllTeams('*');
      const teamsMap = {};
      const archivedT = [];

      (teamsData || []).forEach(t => {
        teamsMap[t.id] = t.name;
        if (t.is_archived === true) {
          if (!orgId || t.organization_id === orgId) {
            archivedT.push(t);
          }
        }
      });
      setAllTeamsMap(teamsMap);
      setArchivedTeams(archivedT);

      // 2. Fetch All Applications to filter archived players
      const appsData = await fetchAllApplications('*');
      const archivedP = (appsData || []).filter(app => {
        if (orgId && app.organization_id !== orgId) return false;
        return app.is_archived === true || app.status === 'archived';
      });
      setArchivedPlayers(archivedP);
    } catch (e) {
      console.error('Error fetching archived data:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleRestoreTeam = async (teamId) => {
    if (!window.confirm("Ushbu jamoani arxivdan qaytarishni tasdiqlaysizmi?")) return;
    try {
      const { error } = await supabase.from('teams').update({ is_archived: false }).eq('id', teamId);
      if (error) throw error;
      setArchivedTeams(prev => prev.filter(t => t.id !== teamId));
      alert("Jamoa muvaffaqiyatli qaytarildi! ⚽");
    } catch (e) {
      console.error('Error restoring team:', e);
      alert("Jamoani qaytarishda xatolik yuz berdi");
    }
  };

  const handleRestorePlayer = async (playerId) => {
    if (!window.confirm("Ushbu o'yinchini arxivdan qaytarishni tasdiqlaysizmi?")) return;
    try {
      try {
        await supabase.from('applications').update({ is_archived: false, status: 'approved' }).eq('id', playerId);
      } catch (e) {
        await supabase.from('applications').update({ status: 'approved' }).eq('id', playerId);
      }
      try {
        await supabase.from('players').update({ is_archived: false }).eq('id', playerId);
      } catch (e) {}

      setArchivedPlayers(prev => prev.filter(p => p.id !== playerId));
      alert("O'yinchi muvaffaqiyatli qaytarildi! 👤");
    } catch (e) {
      console.error('Error restoring player:', e);
      alert("O'yinchini qaytarishda xatolik yuz berdi");
    }
  };

  // Filter items by search query
  const filteredTeams = archivedTeams.filter(t =>
    !search ||
    (t.name && t.name.toLowerCase().includes(search.toLowerCase())) ||
    (t.captain_phone && t.captain_phone.includes(search)) ||
    (t.league && t.league.toLowerCase().includes(search.toLowerCase()))
  );

  const filteredPlayers = archivedPlayers.filter(p => {
    if (!search) return true;
    const name = `${p.first_name || ''} ${p.last_name || ''}`.toLowerCase();
    const phone = p.phone || '';
    const passport = `${p.passport_series || ''}${p.passport_number || ''}`.toLowerCase();
    const teamName = (allTeamsMap[p.team_id] || '').toLowerCase();
    const query = search.toLowerCase();
    return name.includes(query) || phone.includes(query) || passport.includes(query) || teamName.includes(query);
  });

  return (
    <div className="archive-page-container">
      {/* Header Banner */}
      <div className="archive-header-banner">
        <div className="archive-header-left">
          <div className="archive-header-icon-box">
            <ArchiveIcon size={26} color="#F59E0B" />
          </div>
          <div>
            <h1 className="archive-header-title">Arxivlangan Ma'lumotlar</h1>
            <p className="archive-header-sub">
              O'chirilgan jamoalar va o'yinchilar ro'yxati (Barcha statistika va o'yinlar bazada saqlangan)
            </p>
          </div>
        </div>

        {/* Global Search Box */}
        <div className="archive-search-box">
          <Search size={18} color="#94A3B8" />
          <input
            type="text"
            placeholder={activeTab === 'teams' ? "Arxivlangan jamoani qidirish..." : "Arxivlangan o'yinchini qidirish..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Tabs Row (Jamoalar vs O'yinchilar) */}
      <div className="archive-tabs-row">
        <button
          className={`archive-tab-btn ${activeTab === 'teams' ? 'active' : ''}`}
          onClick={() => setActiveTab('teams')}
        >
          <Shield size={18} />
          <span>Arxivlangan Jamoalar ({archivedTeams.length})</span>
        </button>

        <button
          className={`archive-tab-btn ${activeTab === 'players' ? 'active' : ''}`}
          onClick={() => setActiveTab('players')}
        >
          <Users size={18} />
          <span>Arxivlangan O'yinchilar ({archivedPlayers.length})</span>
        </button>
      </div>

      {/* Content Section */}
      <div className="archive-content-body">
        {loading ? (
          <div className="archive-skeleton-list">
            {[1, 2, 3, 4].map(n => (
              <div key={n} className="archive-skeleton-card">
                <div className="archive-skeleton-avatar" />
                <div className="archive-skeleton-lines">
                  <div className="archive-skeleton-title" />
                  <div className="archive-skeleton-sub" />
                </div>
              </div>
            ))}
          </div>
        ) : activeTab === 'teams' ? (
          filteredTeams.length === 0 ? (
            <div className="archive-empty-card">
              <Shield size={48} color="rgba(255, 255, 255, 0.2)" />
              <h3>Arxivlangan jamoalar topilmadi</h3>
              <p>Hozircha hech qanday jamoa arxivlanmagan.</p>
            </div>
          ) : (
            <div className="archive-grid">
              {filteredTeams.map(team => (
                <div key={team.id} className="archive-item-card">
                  <div className="archive-card-avatar-box">
                    <img
                      src={team.logo_url || 'https://via.placeholder.com/100'}
                      alt={team.name}
                      className="archive-card-avatar team"
                    />
                  </div>
                  <div className="archive-card-info">
                    <h3 className="archive-card-name">{team.name}</h3>
                    <p className="archive-card-meta">
                      <Trophy size={13} style={{ display: 'inline', marginRight: '4px' }} />
                      {team.league || 'Liga kiritilmagan'}
                    </p>
                    <p className="archive-card-sub">
                      Sardor tel: {team.captain_phone || '—'}
                    </p>
                  </div>
                  <button
                    className="archive-restore-btn"
                    onClick={() => handleRestoreTeam(team.id)}
                    title="Jamoani arxivdan aktiv holatga qaytarish"
                  >
                    <RotateCcw size={16} />
                    <span>Qaytarish</span>
                  </button>
                </div>
              ))}
            </div>
          )
        ) : (
          filteredPlayers.length === 0 ? (
            <div className="archive-empty-card">
              <Users size={48} color="rgba(255, 255, 255, 0.2)" />
              <h3>Arxivlangan o'yinchilar topilmadi</h3>
              <p>Hozircha hech qanday o'yinchi arxivlanmagan.</p>
            </div>
          ) : (
            <div className="archive-grid">
              {filteredPlayers.map(player => (
                <div key={player.id} className="archive-item-card">
                  <div className="archive-card-avatar-box">
                    <img
                      src={player.photo_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop'}
                      alt={`${player.first_name} ${player.last_name}`}
                      className="archive-card-avatar player"
                    />
                  </div>
                  <div className="archive-card-info">
                    <h3 className="archive-card-name">{player.first_name} {player.last_name}</h3>
                    <p className="archive-card-meta">
                      Jamoasi: <strong>{allTeamsMap[player.team_id] || 'Yakkaxon'}</strong>
                    </p>
                    <p className="archive-card-sub">
                      {player.passport_series}{player.passport_number} • {player.phone || '—'}
                    </p>
                  </div>
                  <button
                    className="archive-restore-btn"
                    onClick={() => handleRestorePlayer(player.id)}
                    title="O'yinchini arxivdan aktiv holatga qaytarish"
                  >
                    <RotateCcw size={16} />
                    <span>Qaytarish</span>
                  </button>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
