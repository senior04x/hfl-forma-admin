import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Search, Eye, Edit, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import SwipeRow from './SwipeRow';
// Reusing same CSS as PlayersTable
import './PlayersTable.css';

const TeamsTable = ({ onStatusChange }) => {
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
  }, [page, filter, search]);

  const fetchTeams = async () => {
    setLoading(true);
    try {
      let query = supabase.from('teams').select('*', { count: 'exact' });

      if (search) {
        query = query.or(`name.ilike.%${search}%,captain_phone.ilike.%${search}%`);
      }

      if (filter !== 'all') {
        if (filter === 'approved') {
          query = query.in('status', ['approved', 'partially_approved']);
        } else {
          query = query.eq('status', filter);
        }
      }

      const from = (page - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;
      query = query.order('created_at', { ascending: false }).range(from, to);

      const { data, count, error } = await query;
      if (error) throw error;
      
      setTeams(data || []);
      setTotalCount(count || 0);
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
    return <span className={status-badge  + (classes[status] || '')}>{labels[status] || status}</span>;
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
        ) : teams.length === 0 ? (
          <div className="empty-state">Hech qanday ma'lumot topilmadi</div>
        ) : (
          teams.map(team => (
            <SwipeRow 
              key={team.id} 
              actions={
                <>
                  <button className="action-btn view" title="Ko'rish"><Eye size={20} /></button>
                  <button className="action-btn edit" title="Tahrirlash"><Edit size={20} /></button>
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
                <button className="btn-icon" title="Ko'rish"><Eye size={18} /></button>
                <button className="btn-icon text-blue" title="Tahrirlash"><Edit size={18} /></button>
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
    </div>
  );
};

export default TeamsTable;


