import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useOrg } from '../context/OrgContext';
import { ArrowLeftRight, Check, X } from 'lucide-react';
import './Transfers.css';

const Transfers = () => {
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending'); // pending, all, approved, rejected
  const { orgId } = useOrg();

  useEffect(() => {
    fetchTransfers();
  }, [orgId]);

  const fetchTransfers = async () => {
    setLoading(true);
    try {
      // Fetch organization teams to match transfers by team ID
      const { data: orgTeams } = await supabase
        .from('teams')
        .select('id')
        .eq('organization_id', orgId);

      const teamIdSet = new Set((orgTeams || []).map(t => t.id));

      const { data, error } = await supabase
        .from('transfers')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching transfers:', error);
        setTransfers([]);
      } else {
        const orgTransfers = (data || []).filter(t => 
          t.organization_id === orgId ||
          (!t.organization_id && (teamIdSet.has(t.old_team_id) || teamIdSet.has(t.new_team_id)))
        );
        setTransfers(orgTransfers);
      }
    } catch (err) {
      console.error('Fetch transfers error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (transfer) => {
    try {
      // Update transfer status
      const { error: transferError } = await supabase
        .from('transfers')
        .update({ status: 'approved' })
        .eq('id', transfer.id);
      
      if (transferError) throw transferError;

      // Update application team_id if player_id and new_team_id exist
      if (transfer.player_id && transfer.new_team_id) {
        const { error: appError } = await supabase
          .from('applications')
          .update({ team_id: transfer.new_team_id })
          .eq('id', transfer.player_id);
          
        if (appError) throw appError;
      }

      fetchTransfers();
    } catch (err) {
      console.error('Error approving transfer:', err);
      alert('Xatolik yuz berdi');
    }
  };

  const handleReject = async (transferId) => {
    try {
      const { error } = await supabase
        .from('transfers')
        .update({ status: 'rejected' })
        .eq('id', transferId);
        
      if (error) throw error;
      
      fetchTransfers();
    } catch (err) {
      console.error('Error rejecting transfer:', err);
      alert('Xatolik yuz berdi');
    }
  };

  const filteredTransfers = transfers.filter(t => {
    if (filter === 'all') return true;
    return t.status === filter;
  });

  const pendingCount = transfers.filter(t => t.status === 'pending').length;

  return (
    <div className="transfers-page">
      <div className="page-header">
        <div className="header-title">
          <h1>Transferlar</h1>
          {pendingCount > 0 && <span className="badge-count">{pendingCount} kutilmoqda</span>}
        </div>
        
        <div className="filter-group">
          <button className={`filter-btn ${filter === 'pending' ? 'active' : ''}`} onClick={() => setFilter('pending')}>Kutilayotgan</button>
          <button className={`filter-btn ${filter === 'approved' ? 'active' : ''}`} onClick={() => setFilter('approved')}>Tasdiqlangan</button>
          <button className={`filter-btn ${filter === 'rejected' ? 'active' : ''}`} onClick={() => setFilter('rejected')}>Rad etilgan</button>
          <button className={`filter-btn ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>Barchasi</button>
        </div>
      </div>

      {loading ? (
        <div className="loading-state">Yuklanmoqda...</div>
      ) : filteredTransfers.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon-wrap"><ArrowLeftRight size={48} /></div>
          <h3>So'rovlar topilmadi</h3>
          <p>Ushbu bo'limda hech qanday transfer so'rovi mavjud emas.</p>
        </div>
      ) : (
        <div className="transfers-grid">
          {filteredTransfers.map(transfer => (
            <div className={`transfer-card ${transfer.status !== 'pending' ? 'dimmed' : ''}`} key={transfer.id}>
              {transfer.status !== 'pending' && (
                <div className={`status-badge ${transfer.status}`}>
                  {transfer.status === 'approved' ? 'Tasdiqlangan' : 'Rad etilgan'}
                </div>
              )}
              
              <div className="card-top">
                <img src={transfer.player_photo || 'https://via.placeholder.com/60'} alt={transfer.player_name} className="player-photo" />
                <div className="player-info">
                  <h4>{transfer.player_name || "O'yinchi"}</h4>
                  <span className="player-meta">
                    {transfer.reason ? <i>{transfer.reason}</i> : "Transfer so'rovi"}
                  </span>
                </div>
              </div>
              
              <div className="card-middle">
                <div className="team-side old-team">
                  {transfer.old_team_logo ? (
                    <img src={transfer.old_team_logo} alt={transfer.old_team_name} className="team-logo" />
                  ) : (
                    <div className="team-logo-placeholder">⚽</div>
                  )}
                  <span className="team-name">{transfer.old_team_name || 'Eski jamoasi'}</span>
                </div>
                
                <div className="swap-icon">
                  <ArrowLeftRight size={24} />
                </div>
                
                <div className="team-side new-team">
                  {transfer.new_team_logo ? (
                    <img src={transfer.new_team_logo} alt={transfer.new_team_name} className="team-logo" />
                  ) : (
                    <div className="team-logo-placeholder">⚽</div>
                  )}
                  <span className="team-name">{transfer.new_team_name || 'Yangi jamoasi'}</span>
                </div>
              </div>
              
              {transfer.status === 'pending' && (
                <div className="card-bottom">
                  <button className="action-btn reject" onClick={() => handleReject(transfer.id)} title="Rad etish">
                    <X size={24} />
                  </button>
                  <button className="action-btn approve" onClick={() => handleApprove(transfer)} title="Tasdiqlash">
                    <Check size={24} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Transfers;
