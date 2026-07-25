import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useOrg } from '../context/OrgContext';
import { getActiveOrgLeagues, applyOrgAndCollabFilter } from '../utils/leagueUtils';
import { Search, Eye, Edit, Trash2, ChevronLeft, ChevronRight, Filter, Trophy } from 'lucide-react';
import SwipeRow from './SwipeRow';
import TeamModal from './TeamModal';
import CustomSelect from './CustomSelect';
import { searchAndRankItems } from '../utils/fuzzySearch';
// Reusing same CSS as PlayersTable
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
      const { data, error } = await supabase
        .from('teams')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching teams:', error);
        setTeams([]);
        setTotalCount(0);
        return;
      }
      
      const activeNames = (leaguesList || []).map(l => l.name);
      let filtered = (data || []).filter(t => 
        t.organization_id === orgId || 
        activeNames.includes(t.league) || 
        (!orgId)
      );

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
        filtered = filtered.filter(t => t.league === leagueFilter);
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

  const handleConfirmDelete = async () => {
    if (!deleteTargetId) return;
    const id = deleteTargetId;
    setTeams(prev => prev.filter(t => t.id !== id));
    try {
      const { error } = await supabase.from('teams').delete().eq('id', id);
      if (error) throw error;
      fetchTeams();
      onStatusChange();
    } catch (error) {
      console.error('Error deleting team:', error);
      alert("Jamoani o'chirishda xatolik yuz berdi");
      fetchTeams();
    } finally {
      setDeleteTargetId(null);
    }
  };

  const renderStatus = (status) => {
    const classes = {
      pending: 'status-pending',
      approved: 'status-approved',
      partially_approved: 'status-approved', // or a different color
      rejected: 'status-rejected'
    };
    const labels = {
      pending: 'Kutilmoqda',
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
                  {renderStatus(team.status)}
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

      {/* 5s Countdown Delete Confirm Modal */}
      <DeleteConfirmModal
        isOpen={!!deleteTargetId}
        title="Jamoani o'chirish"
        message="O'chirsangiz barcha ma'lumotlar o'chib ketadi!"
        onConfirm={handleConfirmDelete}
        onClose={() => setDeleteTargetId(null)}
      />
    </div>
  );
};

export default TeamsTable;
