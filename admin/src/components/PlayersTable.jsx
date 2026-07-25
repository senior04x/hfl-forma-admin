import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useOrg } from '../context/OrgContext';
import { getActiveOrgLeagues, applyOrgAndCollabFilter } from '../utils/leagueUtils';
import { Search, Eye, Edit, ChevronLeft, ChevronRight, Filter, Check, X, Trash2, Trophy } from 'lucide-react';
import SwipeRow from './SwipeRow';
import PlayerModal from './PlayerModal';
import CustomSelect from './CustomSelect';
import { searchAndRankItems } from '../utils/fuzzySearch';
import './PlayersTable.css';

const PlayersTable = ({ onStatusChange }) => {
  const [players, setPlayers] = useState([]);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [modalMode, setModalMode] = useState('view');
  const [teams, setTeams] = useState([]);
  const [activeLeagues, setActiveLeagues] = useState([]);
  const [loading, setLoading] = useState(true);
  const { orgId } = useOrg();
  
  // Pagination & Filtering
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState('');
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
  }, [page, filter, leagueFilter, search, orgId, activeLeagues]);

  const fetchTeams = async (leaguesList = activeLeagues) => {
    const activeNames = (leaguesList || []).map(l => l.name);
    let query = supabase.from('teams').select('id, name, league, organization_id');
    const { data } = await query;
    if (data) {
      const filteredTeams = data.filter(t => t.organization_id === orgId || activeNames.includes(t.league) || !orgId);
      setTeams(filteredTeams);
    }
  };

  const fetchPlayers = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const { data, error } = await supabase
        .from('applications')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching players:', error);
        setPlayers([]);
        setTotalCount(0);
        return;
      }
      
      const activeNames = (activeLeagues || []).map(l => l.name);
      const validTeamIds = new Set(
        teams
          .filter(t => t.organization_id === orgId || activeNames.includes(t.league) || !orgId)
          .map(t => t.id)
      );

      let filtered = (data || []).filter(app => 
        app.organization_id === orgId || 
        (app.team_id && validTeamIds.has(app.team_id)) ||
        (!orgId)
      );

      // 1. Status Filter
      if (filter !== 'all') {
        filtered = filtered.filter(p => {
          if (filter === 'approved') return p.status === 'approved' || p.status === 'partially_approved';
          return p.status === filter;
        });
      }

      // 2. League Filter
      if (leagueFilter !== 'all') {
        filtered = filtered.filter(p => {
          const team = teams.find(t => t.id === p.team_id);
          return team && team.league === leagueFilter;
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
      const { error } = await supabase.from('applications').update({ status: newStatus }).eq('id', id);
      if (error) throw error;
      fetchPlayers(false);
      onStatusChange();
    } catch (error) {
      console.error('Error updating status:', error);
      alert("Holatni o'zgartirishda xatolik yuz berdi");
      fetchPlayers(false); // revert optimistic update on error
    }
  };

  const deletePlayer = async (id) => {
    if (window.confirm("Haqiqatan ham bu zayavkani o'chirib tashlamoqchimisiz?")) {
      // Optimistic update
      setPlayers(prev => prev.filter(p => p.id !== id));
      try {
        const { error } = await supabase.from('applications').delete().eq('id', id);
        if (error) throw error;
        fetchPlayers(false);
        onStatusChange();
      } catch (error) {
        console.error('Error deleting player:', error);
        alert("Zayavkani o'chirishda xatolik yuz berdi");
        fetchPlayers(false); // revert optimistic update on error
      }
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

        <CustomSelect
          value={leagueFilter}
          onChange={(val) => { setLeagueFilter(val); setPage(1); }}
          icon={Trophy}
          options={[
            { value: 'all', label: 'Barcha ligalar' },
            ...activeLeagues.map(l => ({ value: l.name, label: l.name }))
          ]}
        />
      </div>

      <div className="list-container">
        {loading ? (
          <div className="loading-state">Yuklanmoqda...</div>
        ) : players.length === 0 ? (
          <div className="empty-state">Hech qanday ma'lumot topilmadi</div>
        ) : (
          players.map(app => (
            <SwipeRow 
              key={app.id} 
              actions={
                <>
                  <button className="action-btn delete" title="O'chirish" onClick={() => deletePlayer(app.id)}><Trash2 size={20} /></button>
                  <button className="action-btn edit" title="Tahrirlash" onClick={() => { setSelectedPlayer(app); setModalMode('edit'); }}><Edit size={20} /></button>
                </>
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
                  {app.passport_series}{app.passport_number} вЂў {app.phone}
                </div>
              </div>
              <div className="action-status-wrapper">
                <div className="list-cell status-cell">
                  {renderStatus(app)}
                </div>
                
                {/* Desktop Actions - Only visible on large screens */}
                <div className="list-cell desktop-actions hide-mobile">
                  <button className="btn-icon text-blue" title="Tahrirlash" onClick={() => { setSelectedPlayer(app); setModalMode('edit'); }}><Edit size={17} /></button>
                  <button className="btn-icon text-red" title="O'chirish" onClick={() => deletePlayer(app.id)}><Trash2 size={17} /></button>
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
    </div>
  );
};

export default PlayersTable;



