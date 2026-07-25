import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useOrg } from '../context/OrgContext';
import { Search, Eye, Edit, ChevronLeft, ChevronRight, Filter, Trophy } from 'lucide-react';
import SwipeRow from './SwipeRow';
import TeamModal from './TeamModal';
import { searchAndRankItems } from '../utils/fuzzySearch';
// Reusing same CSS as PlayersTable
import './PlayersTable.css';

const TeamsTable = ({ onStatusChange }) => {
  const [teams, setTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [modalMode, setModalMode] = useState('view');
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
    fetchTeams();
  }, [page, filter, leagueFilter, search, orgId]);

  const fetchTeams = async () => {
    setLoading(true);
    try {
      let query = supabase.from('teams').select('*').eq('organization_id', orgId).order('created_at', { ascending: false });

      const { data, error } = await query;
      if (error) throw error;
      
      let filtered = data || [];

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

      // 3. Uzbek Fuzzy Search & Relevance Ranking
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
            placeholder="Jamoa nomi yoki telefon..." 
            value={search}
            onChange={handleSearch}
          />
        </div>
        <div className="filter-box">
          <Filter size={18} className="filter-icon" />
          <select value={filter} onChange={handleFilterChange} title="Holat bo'yicha filter">
            <option value="all">Barcha holatlar</option>
            <option value="pending">Kutilmoqda</option>
            <option value="approved">Tasdiqlangan</option>
            <option value="rejected">Rad etilgan</option>
          </select>
        </div>
        <div className="filter-box">
          <Trophy size={18} className="filter-icon" />
          <select value={leagueFilter} onChange={handleLeagueFilterChange} title="Liga bo'yicha filter">
            <option value="all">Barcha ligalar</option>
            <option value="Super liga">Super liga</option>
            <option value="Pro liga">Pro liga</option>
            <option value="3-liga">3-liga</option>
            <option value="Chempionlar ligasi">Chempionlar ligasi</option>
            <option value="Europa ligasi">Europa ligasi</option>
            <option value="7x7 liga">7x7 liga</option>
          </select>
        </div>
      </div>

      <div className="list-container">
        {loading ? (
          <div className="loading-state">Yuklanmoqda...</div>
        ) : teams.length === 0 ? (
          <div className="empty-state">Hech qanday ma'lumot topilmadi</div>
        ) : (
          teams.map(team => (
            <SwipeRow 
              key={team.id} 
              actions={
                <>
                  <button className="action-btn view" title="Ko'rish" onClick={() => { setSelectedTeam(team); setModalMode('view'); }}><Eye size={20} /></button>
                  <button className="action-btn edit" title="Tahrirlash" onClick={() => { setSelectedTeam(team); setModalMode('edit'); }}><Edit size={20} /></button>
                </>
              }
            >
              <div className="list-cell avatar-cell">
                <img src={team.logo_url} alt="Logo" className="player-avatar" onClick={() => window.openImageViewer(team.logo_url)} />
              </div>
              <div className="list-cell info-cell">
                <div className="player-name">{team.name}</div>
                <div className="player-team">{team.league || 'Kiritilmagan'}</div>
                <div className="player-meta hide-mobile">
                  {team.captain_phone}
                </div>
              </div>
              <div className="list-cell status-cell">
                {renderStatus(team.status)}
              </div>
              
              <div className="list-cell desktop-actions hide-mobile">
                <button className="btn-icon" title="Ko'rish" onClick={() => { setSelectedTeam(team); setModalMode('view'); }}><Eye size={18} /></button>
                <button className="btn-icon text-blue" title="Tahrirlash" onClick={() => { setSelectedTeam(team); setModalMode('edit'); }}><Edit size={18} /></button>
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
    </div>
  );
};

export default TeamsTable;



