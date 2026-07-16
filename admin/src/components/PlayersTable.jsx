import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Search, Eye, Edit, ChevronLeft, ChevronRight, Filter, Check, X, Trash2 } from 'lucide-react';
import SwipeRow from './SwipeRow';
import PlayerModal from './PlayerModal';
import './PlayersTable.css';

const PlayersTable = ({ onStatusChange }) => {
  const [players, setPlayers] = useState([]);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [modalMode, setModalMode] = useState('view');
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Pagination & Filtering
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const itemsPerPage = 20;

  useEffect(() => {
    fetchTeams();
  }, []);

  useEffect(() => {
    fetchPlayers(true);
  }, [page, filter, search]); // Re-fetch when these change

  const fetchTeams = async () => {
    const { data } = await supabase.from('teams').select('id, name');
    if (data) setTeams(data);
  };

  const fetchPlayers = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      let query = supabase.from('applications').select('*', { count: 'exact' });

      // Apply Search (Local search approach or DB search)
      // Supabase supports full-text search, but simple ilike is fine
      if (search) {
        query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,phone.ilike.%${search}%`);
      }

      // Apply Filter
      if (filter !== 'all') {
        query = query.eq('status', filter);
      }

      // Apply Pagination
      const from = (page - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;
      query = query.order('created_at', { ascending: false }).range(from, to);

      const { data, count, error } = await query;
      if (error) throw error;
      
      setPlayers(data || []);
      setTotalCount(count || 0);
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
        <div className="filter-box">
          <Filter size={18} className="filter-icon" />
          <select value={filter} onChange={handleFilterChange}>
            <option value="all">Barchasi</option>
            <option value="pending">Kutilmoqda</option>
            <option value="approved">Tasdiqlangan</option>
            <option value="rejected">Rad etilgan</option>
          </select>
        </div>
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
                <img src={app.photo_url} alt="Avatar" className="player-avatar" onClick={() => window.openImageViewer(app.photo_url)} />
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
              <div className="list-cell status-cell">
                {renderStatus(app)}
              </div>
              
              {/* Desktop Actions - Only visible on large screens */}
              <div className="list-cell desktop-actions hide-mobile">
                <button className="btn-icon text-red" title="O'chirish" onClick={() => deletePlayer(app.id)}><Trash2 size={18} /></button>
                <button className="btn-icon text-blue" title="Tahrirlash" onClick={() => { setSelectedPlayer(app); setModalMode('edit'); }}><Edit size={18} /></button>
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



