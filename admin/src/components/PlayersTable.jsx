import React, { useState, useEffect } from 'react';
import { supabase, supabaseAdmin } from '../supabaseClient';
import { useOrg } from '../context/OrgContext';
import { getActiveOrgLeagues, applyOrgAndCollabFilter } from '../utils/leagueUtils';
import { fetchAllApplications, fetchAllTeams } from '../utils/supabaseHelpers';
import { Search, Eye, Edit, ChevronLeft, ChevronRight, Filter, Check, X, Trash2, Trophy, Archive, RotateCcw } from 'lucide-react';
import SwipeRow from './SwipeRow';
import PlayerModal from './PlayerModal';
import CustomSelect from './CustomSelect';
import { searchAndRankItems } from '../utils/fuzzySearch';
import DeleteConfirmModal from './DeleteConfirmModal';
import TransferClosedModal from './TransferClosedModal';
import { isTransferWindowOpen } from '../utils/transferUtils';
import './PlayersTable.css';

const PlayersTable = ({ onStatusChange = () => {} }) => {
  const { orgId } = useOrg();
  const [players, setPlayers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [activeLeagues, setActiveLeagues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [modalMode, setModalMode] = useState('view');
  const [deleteTargetId, setDeleteTargetId] = useState(null);
  const [showTransferClosedModal, setShowTransferClosedModal] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [filter, setFilter] = useState('all');
  const [leagueFilter, setLeagueFilter] = useState('all');
  const itemsPerPage = 20;

  useEffect(() => {
    loadLeaguesAndData();
  }, [orgId]);

  const loadLeaguesAndData = async () => {
    const fetched = await getActiveOrgLeagues(orgId);
    setActiveLeagues(fetched);
    fetchTeams(fetched);
  };

  useEffect(() => {
    fetchPlayers(true);
  }, [page, filter, leagueFilter, search, showArchived, orgId, activeLeagues]);

  const fetchTeams = async (leaguesList = activeLeagues) => {
    const activeNames = (leaguesList || []).map(l => l.name);
    try {
      const data = await fetchAllTeams('*');
      if (data) {
        const filteredTeams = data.filter(t => 
          !t.is_archived && t.status !== 'archived' && (
            t.organization_id === orgId || 
            (t.league && t.league.split(',').some(l => activeNames.includes(l.trim()))) || 
            !orgId
          )
        );
        setTeams(filteredTeams);
      }
    } catch (err) {
      console.error('Error fetching teams:', err);
    }
  };

  const fetchPlayers = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const data = await fetchAllApplications('*');
      
      const activeNames = (activeLeagues || []).map(l => l.name);
      const validTeamIds = new Set(
        teams
          .filter(t => 
            t.organization_id === orgId || 
            (t.league && t.league.split(',').some(l => activeNames.includes(l.trim()))) || 
            !orgId
          )
          .map(t => t.id)
      );

      let filtered = (data || [])
        .filter(app => !app.comment || !app.comment.includes('[PROFILE_UPDATE]'))
        .filter(app => 
          app.organization_id === orgId || 
          (app.team_id && validTeamIds.has(app.team_id)) ||
          (!orgId)
        )
        .filter(app => {
          if (showArchived) {
            return app.is_archived === true || app.status === 'archived';
          } else {
            return !app.is_archived && app.status !== 'archived';
          }
        });

      // 1. Status Filter
      if (filter !== 'all' && !showArchived) {
        filtered = filtered.filter(p => {
          if (filter === 'approved') return p.status === 'approved' || p.status === 'partially_approved';
          return p.status === filter;
        });
      }

      // 2. League Filter
      if (leagueFilter !== 'all') {
        filtered = filtered.filter(p => {
          const team = teams.find(t => t.id === p.team_id);
          return team && team.league && team.league.split(',').map(s => s.trim()).includes(leagueFilter);
        });
      }

      // 3. Search Filter
      if (search && search.trim()) {
        filtered = searchAndRankItems(filtered, search, [
          'first_name',
          'last_name',
          p => `${p.first_name || ''} ${p.last_name || ''}`,
          'phone',
          'passport_series',
          'passport_number',
          p => {
            const team = teams.find(t => t.id === p.team_id);
            return team ? team.name : '';
          }
        ]);
      }

      setTotalCount(filtered.length);
      const from = (page - 1) * itemsPerPage;
      const paginated = filtered.slice(from, from + itemsPerPage);

      setPlayers(paginated);
    } catch (error) {
      console.error('Error fetching players:', error);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const getTeamName = (teamId) => {
    if (!teamId) return <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Yakkaxon</span>;
    const team = teams.find(t => t.id === teamId);
    return team ? team.name : "Noma'lum";
  };

  const updatePlayerStatus = async (id, newStatus) => {
    // Optimistic update
    setPlayers(prev => prev.map(p => p.id === id ? { ...p, status: newStatus } : p));
    try {
      const { error } = await supabaseAdmin.from('applications').update({ status: newStatus }).eq('id', id);
      if (error) throw error;
      fetchPlayers(false);
      onStatusChange();
    } catch (error) {
      console.error('Error updating status:', error);
      alert("Holatni o'zgartirishda xatolik yuz berdi");
      fetchPlayers(false); // revert optimistic update on error
    }
  };

  const handleEditPlayer = async (app) => {
    const windowOpen = await isTransferWindowOpen(orgId);
    if (!windowOpen) {
      setShowTransferClosedModal(true);
      return;
    }
    setSelectedPlayer(app);
    setModalMode('edit');
  };

  const handleConfirmDelete = async () => {
    if (!deleteTargetId) return;
    const id = deleteTargetId;
    setPlayers(prev => prev.filter(p => p.id !== id));
    try {
      try {
        await supabaseAdmin.from('applications').update({ is_archived: true, status: 'archived' }).eq('id', id);
      } catch (e) {
        await supabaseAdmin.from('applications').update({ status: 'archived' }).eq('id', id);
      }
      try {
        await supabaseAdmin.from('players').update({ is_archived: true }).eq('id', id);
      } catch (e) {}

      fetchPlayers(false);
      onStatusChange();
    } catch (error) {
      console.error('Error archiving player:', error);
      alert("O'yinchini arxivlashda xatolik yuz berdi");
      fetchPlayers(false);
    } finally {
      setDeleteTargetId(null);
    }
  };

  const handleRestorePlayer = async (id) => {
    setPlayers(prev => prev.filter(p => p.id !== id));
    try {
      try {
        await supabaseAdmin.from('applications').update({ is_archived: false, status: 'approved' }).eq('id', id);
      } catch (e) {
        await supabaseAdmin.from('applications').update({ status: 'approved' }).eq('id', id);
      }
      try {
        await supabaseAdmin.from('players').update({ is_archived: false }).eq('id', id);
      } catch (e) {}

      fetchPlayers(false);
      onStatusChange();
    } catch (error) {
      console.error('Error restoring player:', error);
      alert("O'yinchini arxivdan qaytarishda xatolik yuz berdi");
      fetchPlayers(false);
    }
  };

  const renderStatus = (app) => {
    const { id, status } = app;
    
    if (status === 'pending') {
      return (
        <div className="quick-actions">
          <button className="quick-btn approve" onClick={() => updatePlayerStatus(id, 'approved')} title="Tasdiqlash">
            <Check size={24} strokeWidth={3} />
          </button>
          <button className="quick-btn reject" onClick={() => updatePlayerStatus(id, 'rejected')} title="Rad etish">
            <X size={24} strokeWidth={3} />
          </button>
        </div>
      );
    }

    const classes = {
      approved: 'status-approved',
      rejected: 'status-rejected'
    };
    const labels = {
      approved: 'Tasdiqlandi',
      rejected: 'Rad etildi'
    };
    return <span className={`status-badge ${classes[status] || ''}`}>{labels[status] || status}</span>;
  };

  const totalPages = Math.ceil(totalCount / itemsPerPage) || 1;

  const handleSearch = (e) => {
    setSearch(e.target.value);
    setPage(1); // Reset to first page
  };

  const handleFilterChange = (e) => {
    setFilter(e.target.value);
    setPage(1);
  };

  const handleLeagueFilterChange = (e) => {
    setLeagueFilter(e.target.value);
    setPage(1);
  };

  const getLeagueTeamCount = (targetLeague) => {
    if (!teams || teams.length === 0) return 0;
    if (targetLeague === 'all') return teams.length;
    return teams.filter(t => t.league && t.league.split(',').map(s => s.trim()).includes(targetLeague)).length;
  };

  return (
    <div className="table-wrapper">
      <div className="table-controls">
        <div className="search-box">
          <Search size={18} className="search-icon" />
          <input 
            type="text" 
            placeholder="Ism, familiya yoki raqam..." 
            value={search}
            onChange={handleSearch}
          />
        </div>
        <CustomSelect
          value={filter}
          onChange={(val) => { setFilter(val); setPage(1); }}
          icon={Filter}
          options={[
            { value: 'all', label: 'Barcha holatlar' },
            { value: 'pending', label: 'Kutilmoqda' },
            { value: 'approved', label: 'Tasdiqlangan' },
            { value: 'rejected', label: 'Rad etilgan' },
          ]}
        />

        <button
          className={`archive-toggle-btn ${showArchived ? 'active' : ''}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 14px',
            borderRadius: '12px',
            background: showArchived ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.06)',
            border: showArchived ? '1px solid #F59E0B' : '1px solid rgba(255, 255, 255, 0.12)',
            color: showArchived ? '#F59E0B' : '#FFFFFF',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '700',
            transition: 'all 0.2s ease',
          }}
          onClick={() => { setShowArchived(!showArchived); setPage(1); }}
          title={showArchived ? "Aktiv o'yinchilarni ko'rish" : "Arxivlangan o'yinchilarni ko'rish"}
        >
          <Archive size={18} color={showArchived ? "#F59E0B" : "#FFFFFF"} />
          <span>{showArchived ? "Arxivlanganlar" : "Arxiv"}</span>
        </button>

        <div className="league-filter-container">
          <CustomSelect
            value={leagueFilter}
            onChange={(val) => { setLeagueFilter(val); setPage(1); }}
            icon={Trophy}
            options={[
              { value: 'all', label: 'Barcha ligalar' },
              ...activeLeagues.map(l => ({ value: l.name, label: l.name }))
            ]}
          />
          <div className="league-team-count-badge">
            <span>⚽ Jamoalar soni:</span> <strong>{getLeagueTeamCount(leagueFilter)} ta</strong>
          </div>
        </div>
      </div>

      <div className="list-container">
        {loading ? (
          <div className="skeleton-container">
            {[1, 2, 3, 4, 5].map(n => (
              <div className="skeleton-row" key={n}>
                <div className="skeleton-avatar"></div>
                <div className="skeleton-text-group">
                  <div className="skeleton-text-title"></div>
                  <div className="skeleton-text-sub"></div>
                </div>
                <div className="skeleton-badge"></div>
              </div>
            ))}
          </div>
        ) : players.length === 0 ? (
          <div className="empty-state">Hech qanday ma'lumot topilmadi</div>
        ) : (
          players.map(app => (
            <SwipeRow 
              key={app.id} 
              actions={
                showArchived ? (
                  <button className="action-btn approve" title="Arxivdan qaytarish" onClick={() => handleRestorePlayer(app.id)}><RotateCcw size={20} /></button>
                ) : (
                  <>
                    <button className="action-btn delete" title="Arxivlash" onClick={() => setDeleteTargetId(app.id)}><Trash2 size={20} /></button>
                    <button className="action-btn edit" title="Tahrirlash" onClick={() => handleEditPlayer(app)}><Edit size={20} /></button>
                  </>
                )
              }
            >
              <div className="list-cell avatar-cell">
                <img 
                  src={app.photo_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop'} 
                  alt="Avatar" 
                  className="player-avatar" 
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop';
                  }}
                  onClick={() => app.photo_url && window.openImageViewer && window.openImageViewer(app.photo_url)} 
                />
              </div>
              <div className="list-cell info-cell">
                <div 
                  className="player-name" 
                  onClick={() => { setSelectedPlayer(app); setModalMode('view'); }}
                  title="Profilni ko'rish"
                >
                  {app.first_name} {app.last_name}
                </div>
                <div className="player-team">{getTeamName(app.team_id)}</div>
                <div className="player-meta hide-mobile">
                  {app.passport_series}{app.passport_number} • {app.phone}
                </div>
              </div>
              <div className="action-status-wrapper">
                <div className="list-cell status-cell">
                  {showArchived ? (
                    <button
                      style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        background: 'rgba(74, 222, 128, 0.15)',
                        border: '1px solid #4ADE80',
                        color: '#4ADE80',
                        fontWeight: '700',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '12px',
                      }}
                      onClick={() => handleRestorePlayer(app.id)}
                      title="Arxivdan qaytarish"
                    >
                      <RotateCcw size={14} /> Qaytarish
                    </button>
                  ) : (
                    renderStatus(app)
                  )}
                </div>
                
                {/* Desktop Actions - Only visible on large screens */}
                <div className="list-cell desktop-actions hide-mobile">
                  {showArchived ? (
                    <button className="btn-icon text-blue" title="Arxivdan qaytarish" onClick={() => handleRestorePlayer(app.id)}><RotateCcw size={17} /></button>
                  ) : (
                    <>
                      <button className="btn-icon text-blue" title="Tahrirlash" onClick={() => handleEditPlayer(app)}><Edit size={17} /></button>
                      <button className="btn-icon text-red" title="Arxivlash" onClick={() => setDeleteTargetId(app.id)}><Trash2 size={17} /></button>
                    </>
                  )}
                </div>
              </div>
            </SwipeRow>
          ))
        )}
      </div>

      <div className="pagination">
        <button 
          disabled={page === 1} 
          onClick={() => setPage(p => p - 1)}
          className="page-btn"
        >
          <ChevronLeft size={18} /> Oldingi
        </button>
        <span className="page-info">Sahifa {page} / {totalPages}</span>
        <button 
          disabled={page === totalPages} 
          onClick={() => setPage(p => p + 1)}
          className="page-btn"
        >
          Keyingi <ChevronRight size={18} />
        </button>
      </div>

      {selectedPlayer && (
        <PlayerModal 
          player={selectedPlayer} 
          mode={modalMode} 
          onClose={() => setSelectedPlayer(null)} 
          onRefresh={() => { fetchPlayers(false); onStatusChange(); }} 
        />
      )}

      {/* 3s Countdown Archive Confirm Modal */}
      <DeleteConfirmModal
        isOpen={!!deleteTargetId}
        title="O'yinchini arxivlash"
        message="O'yinchi asosiy ro'yxatdan yashirilib, Arxiv bo'limiga o'tkaziladi."
        onConfirm={handleConfirmDelete}
        onClose={() => setDeleteTargetId(null)}
      />

      <TransferClosedModal
        isOpen={showTransferClosedModal}
        onClose={() => setShowTransferClosedModal(false)}
      />
    </div>
  );
};

export default PlayersTable;



