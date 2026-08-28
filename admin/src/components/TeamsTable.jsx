import React, { useState, useEffect } from 'react';
import { supabase, supabase } from '../supabaseClient';
import { useOrg } from '../context/OrgContext';
import { getActiveOrgLeagues, applyOrgAndCollabFilter } from '../utils/leagueUtils';
import { fetchAllTeams } from '../utils/supabaseHelpers';
import { Search, Eye, Edit, Trash2, ChevronLeft, ChevronRight, Filter, Trophy, Check, X } from 'lucide-react';
import SwipeRow from './SwipeRow';
import TeamModal from './TeamModal';
import CustomSelect from './CustomSelect';
import { searchAndRankItems } from '../utils/fuzzySearch';
import './PlayersTable.css';
import DeleteConfirmModal from './DeleteConfirmModal';

const TeamsTable = ({ onStatusChange = () => {} }) => {
  const [teams, setTeams] = useState([]);
  const [activeLeagues, setActiveLeagues] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [modalMode, setModalMode] = useState('view');
  const [loading, setLoading] = useState(true);
  const [deleteTargetId, setDeleteTargetId] = useState(null);
  const { orgId } = useOrg();
  
  const [allOrgTeams, setAllOrgTeams] = useState([]);

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
    fetchTeams(activeLeagues);
  }, [page, filter, leagueFilter, search, orgId, activeLeagues]);

  const fetchTeams = async (leaguesList = activeLeagues) => {
    setLoading(true);
    try {
      const data = await fetchAllTeams('*');
      
      const activeNames = (leaguesList || []).map(l => l.name);
      let orgTeams = (data || []).filter(t => 
        !t.is_archived && (
          t.organization_id === orgId || 
          (t.league && t.league.split(',').some(l => activeNames.includes(l.trim()))) || 
          (!orgId)
        )
      );
      setAllOrgTeams(orgTeams);

      let filtered = [...orgTeams];

      // 1. Status Filter
      if (filter !== 'all') {
        if (filter === 'approved') {
          filtered = filtered.filter(t => t.status === 'approved' || t.status === 'partially_approved');
        } else {
          filtered = filtered.filter(t => t.status === filter);
        }
      }

      // 2. League Filter
      if (leagueFilter !== 'all') {
        filtered = filtered.filter(t => t.league && t.league.split(',').map(s => s.trim()).includes(leagueFilter));
      }

      // 3. Search Filter
      if (search && search.trim()) {
        filtered = searchAndRankItems(filtered, search, ['name', 'captain_phone', 'league']);
      }

      setTotalCount(filtered.length);
      const from = (page - 1) * itemsPerPage;
      const paginated = filtered.slice(from, from + itemsPerPage);

      setTeams(paginated);
    } catch (error) {
      console.error('Error fetching teams:', error);
    } finally {
      setLoading(false);
    }
  };

  const getLeagueTeamCount = (targetLeague) => {
    if (!allOrgTeams || allOrgTeams.length === 0) return 0;
    if (targetLeague === 'all') return allOrgTeams.length;
    return allOrgTeams.filter(t => t.league && t.league.split(',').map(s => s.trim()).includes(targetLeague)).length;
  };

  const handleConfirmDelete = async () => {
    if (!deleteTargetId) return;
    const id = deleteTargetId;
    setTeams(prev => prev.filter(t => t.id !== id));
    try {
      const { error } = await supabase.from('teams').update({ is_archived: true }).eq('id', id);
      if (error) throw error;

      // Also cascade archive to all players of this team
      try {
        await supabase.from('applications').update({ is_archived: true }).eq('team_id', id);
        await supabase.from('players').update({ is_archived: true }).eq('team_id', id);
      } catch (e) {}

      fetchTeams();
      onStatusChange();
    } catch (error) {
      console.error('Error deleting team:', error);
      alert("Jamoani arxivlashda xatolik yuz berdi: " + (error.message || ''));
      fetchTeams();
    } finally {
      setDeleteTargetId(null);
    }
  };

  const updateTeamStatus = async (teamId, newStatus) => {
    setTeams(prev => prev.map(t => t.id === teamId ? { ...t, status: newStatus } : t));
    try {
      const { error } = await supabase.from('teams').update({ status: newStatus }).eq('id', teamId);
      if (error) throw error;
      
      let pStatus = 'pending';
      if (newStatus === 'approved') pStatus = 'approved';
      if (newStatus === 'rejected') pStatus = 'rejected';
      
      await supabase.from('applications').update({ status: pStatus }).eq('team_id', teamId);
      
      fetchTeams();
      onStatusChange();
    } catch (error) {
      console.error('Error updating team status:', error);
      alert("Jamoa holatini o'zgartirishda xatolik yuz berdi");
      fetchTeams();
    }
  };

  const renderStatus = (team) => {
    const { id, status } = team;
    if (status === 'pending') {
      return (
        <div className="quick-actions">
          <button className="quick-btn approve" onClick={() => updateTeamStatus(id, 'approved')} title="Tasdiqlash">
            <Check size={24} strokeWidth={3} />
          </button>
          <button className="quick-btn reject" onClick={() => updateTeamStatus(id, 'rejected')} title="Rad etish">
            <X size={24} strokeWidth={3} />
          </button>
        </div>
      );
    }

    const classes = {
      approved: 'status-approved',
      partially_approved: 'status-approved',
      rejected: 'status-rejected'
    };
    const labels = {
      approved: 'Tasdiqlandi',
      partially_approved: 'Qisman',
      rejected: 'Rad etildi'
    };
    return <span className={`status-badge ${classes[status] || ''}`}>{labels[status] || status}</span>;
  };

  const totalPages = Math.ceil(totalCount / itemsPerPage) || 1;

  const handleSearch = (e) => {
    setSearch(e.target.value);
    setPage(1);
  };

  return (
    <div className="table-wrapper">
      <div className="table-controls">
        <div className="search-box">
          <Search size={18} className="search-icon" />
          <input 
            type="text" 
            placeholder="Jamoa nomi, telefon yoki liga..." 
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
        ) : teams.length === 0 ? (
          <div className="empty-state">Hech qanday ma'lumot topilmadi</div>
        ) : (
          teams.map(team => (
            <SwipeRow 
              key={team.id} 
              actions={
                <>
                  <button className="action-btn delete" title="O'chirish" onClick={() => setDeleteTargetId(team.id)}><Trash2 size={20} /></button>
                  <button className="action-btn edit" title="Tahrirlash" onClick={() => { setSelectedTeam(team); setModalMode('edit'); }}><Edit size={20} /></button>
                </>
              }
            >
              <div className="list-cell avatar-cell">
                <img src={team.logo_url} alt="Logo" className="player-avatar" onClick={() => window.openImageViewer(team.logo_url)} />
              </div>
              <div className="list-cell info-cell">
                <div className="player-name" onClick={() => { setSelectedTeam(team); setModalMode('view'); }}>{team.name}</div>
                <div className="player-team">{team.league || 'Kiritilmagan'}</div>
                <div className="player-meta hide-mobile">
                  {team.captain_phone}
                </div>
              </div>
              <div className="action-status-wrapper">
                <div className="list-cell status-cell">
                  {renderStatus(team)}
                </div>
                
                <div className="list-cell desktop-actions hide-mobile">
                  <button className="btn-icon" title="Ko'rish" onClick={() => { setSelectedTeam(team); setModalMode('view'); }}><Eye size={17} /></button>
                  <button className="btn-icon text-blue" title="Tahrirlash" onClick={() => { setSelectedTeam(team); setModalMode('edit'); }}><Edit size={17} /></button>
                  <button className="btn-icon text-red" title="O'chirish" onClick={() => setDeleteTargetId(team.id)}><Trash2 size={17} /></button>
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
      {selectedTeam && (
        <TeamModal 
          team={selectedTeam} 
          mode={modalMode} 
          onClose={() => setSelectedTeam(null)} 
          onRefresh={() => { fetchTeams(); onStatusChange(); }} 
        />
      )}

      {/* 3s Countdown Archive Confirm Modal */}
      <DeleteConfirmModal
        isOpen={!!deleteTargetId}
        title="Jamoani arxivlash"
        message="Jamoa va uning tarkibi asosiy ro'yxatdan yashirilib, Arxiv bo'limiga o'tkaziladi."
        onConfirm={handleConfirmDelete}
        onClose={() => setDeleteTargetId(null)}
      />
    </div>
  );
};

export default TeamsTable;
