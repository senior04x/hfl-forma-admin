import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useOrg } from '../context/OrgContext';
import { 
  ArrowLeftRight, 
  Check, 
  X, 
  Pencil, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Layers, 
  Save, 
  User, 
  Shield 
} from 'lucide-react';
import './Transfers.css';

const Transfers = () => {
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending'); // pending, approved, rejected, all
  const [editingTransfer, setEditingTransfer] = useState(null);
  const [editForm, setEditForm] = useState({
    player_name: '',
    reason: '',
    status: 'pending',
    old_team_name: '',
    new_team_name: ''
  });
  const [savingEdit, setSavingEdit] = useState(false);
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
      const { error: transferError } = await supabase
        .from('transfers')
        .update({ status: 'approved' })
        .eq('id', transfer.id);
      
      if (transferError) throw transferError;

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

  const handleOpenEditModal = (transfer) => {
    setEditingTransfer(transfer);
    setEditForm({
      player_name: transfer.player_name || '',
      reason: transfer.reason || '',
      status: transfer.status || 'pending',
      old_team_name: transfer.old_team_name || '',
      new_team_name: transfer.new_team_name || ''
    });
  };

  const handleSaveEdit = async () => {
    if (!editingTransfer) return;
    setSavingEdit(true);
    try {
      const { error } = await supabase
        .from('transfers')
        .update({
          player_name: editForm.player_name,
          reason: editForm.reason,
          status: editForm.status,
          old_team_name: editForm.old_team_name,
          new_team_name: editForm.new_team_name
        })
        .eq('id', editingTransfer.id);

      if (error) throw error;

      if (editForm.status === 'approved' && editingTransfer.player_id && editingTransfer.new_team_id) {
        await supabase
          .from('applications')
          .update({ team_id: editingTransfer.new_team_id })
          .eq('id', editingTransfer.player_id);
      }

      setEditingTransfer(null);
      fetchTransfers();
    } catch (err) {
      console.error('Error saving transfer edit:', err);
      alert('Saqlashda xatolik yuz berdi: ' + (err.message || ''));
    } finally {
      setSavingEdit(false);
    }
  };

  const filteredTransfers = transfers.filter(t => {
    if (filter === 'all') return true;
    return t.status === filter;
  });

  const pendingCount = transfers.filter(t => t.status === 'pending').length;
  const approvedCount = transfers.filter(t => t.status === 'approved').length;
  const rejectedCount = transfers.filter(t => t.status === 'rejected').length;

  return (
    <div className="transfers-page">
      <div className="page-header">
        <div className="header-title">
          <div className="header-icon-wrap">
            <ArrowLeftRight size={24} />
          </div>
          <div>
            <h1>Transferlar Boshqaruvi</h1>
            <p className="header-subtitle">Jamoalar o'rtasidagi o'yinchilar o'tish so'rovlari</p>
          </div>
        </div>
        
        {/* Custom Segmented Filter */}
        <div className="transfer-filter-segmented">
          <button 
            className={`filter-tab ${filter === 'pending' ? 'active' : ''}`} 
            onClick={() => setFilter('pending')}
          >
            <Clock size={16} />
            <span>Kutilayotgan</span>
            {pendingCount > 0 && <span className="tab-badge pending">{pendingCount}</span>}
          </button>

          <button 
            className={`filter-tab ${filter === 'approved' ? 'active' : ''}`} 
            onClick={() => setFilter('approved')}
          >
            <CheckCircle2 size={16} />
            <span>Tasdiqlangan</span>
            {approvedCount > 0 && <span className="tab-badge approved">{approvedCount}</span>}
          </button>

          <button 
            className={`filter-tab ${filter === 'rejected' ? 'active' : ''}`} 
            onClick={() => setFilter('rejected')}
          >
            <XCircle size={16} />
            <span>Rad etilgan</span>
            {rejectedCount > 0 && <span className="tab-badge rejected">{rejectedCount}</span>}
          </button>

          <button 
            className={`filter-tab ${filter === 'all' ? 'active' : ''}`} 
            onClick={() => setFilter('all')}
          >
            <Layers size={16} />
            <span>Barchasi</span>
            <span className="tab-badge total">{transfers.length}</span>
          </button>
        </div>
      </div>

      {/* Loading Skeleton */}
      {loading ? (
        <div className="transfers-grid">
          {[1, 2, 3, 4, 5, 6].map(n => (
            <div className="transfer-card skeleton-card" key={n}>
              <div className="skeleton-top">
                <div className="skeleton-circle avatar"></div>
                <div className="skeleton-lines">
                  <div className="skeleton-line title"></div>
                  <div className="skeleton-line sub"></div>
                </div>
              </div>
              <div className="skeleton-middle">
                <div className="skeleton-circle team"></div>
                <div className="skeleton-circle swap"></div>
                <div className="skeleton-circle team"></div>
              </div>
              <div className="skeleton-bottom">
                <div className="skeleton-line btn"></div>
              </div>
            </div>
          ))}
        </div>
      ) : filteredTransfers.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon-wrap"><ArrowLeftRight size={48} /></div>
          <h3>Transfer so'rovlari topilmadi</h3>
          <p>Ushbu bo'limda mos keladigan so'rovlar mavjud emas.</p>
        </div>
      ) : (
        <div className="transfers-grid">
          {filteredTransfers.map(transfer => (
            <div className={`transfer-card ${transfer.status}`} key={transfer.id}>
              
              {/* Card Action Header */}
              <div className="card-action-bar">
                <span className={`status-pill ${transfer.status}`}>
                  {transfer.status === 'approved' && <CheckCircle2 size={12} />}
                  {transfer.status === 'rejected' && <XCircle size={12} />}
                  {transfer.status === 'pending' && <Clock size={12} />}
                  {transfer.status === 'approved' ? 'Tasdiqlangan' : transfer.status === 'rejected' ? 'Rad etilgan' : 'Kutilmoqda'}
                </span>

                {/* Edit Button in Corner */}
                <button 
                  className="card-edit-btn" 
                  onClick={() => handleOpenEditModal(transfer)} 
                  title="Transferni tahrirlash"
                >
                  <Pencil size={14} />
                </button>
              </div>
              
              <div className="card-top">
                <div className="photo-wrapper">
                  <img src={transfer.player_photo || 'https://via.placeholder.com/60'} alt={transfer.player_name} className="player-photo" />
                </div>
                <div className="player-info">
                  <h4>{transfer.player_name || "O'yinchi"}</h4>
                  <span className="player-meta">
                    {transfer.reason ? `"${transfer.reason}"` : "Transfer so'rovi"}
                  </span>
                </div>
              </div>
              
              <div className="card-middle">
                <div className="team-side old-team">
                  {transfer.old_team_logo ? (
                    <img src={transfer.old_team_logo} alt={transfer.old_team_name} className="team-logo" />
                  ) : (
                    <div className="team-logo-placeholder"><Shield size={20} /></div>
                  )}
                  <span className="team-name">{transfer.old_team_name || 'Eski jamoasi'}</span>
                </div>
                
                <div className="swap-icon">
                  <ArrowLeftRight size={20} />
                </div>
                
                <div className="team-side new-team">
                  {transfer.new_team_logo ? (
                    <img src={transfer.new_team_logo} alt={transfer.new_team_name} className="team-logo" />
                  ) : (
                    <div className="team-logo-placeholder"><Shield size={20} /></div>
                  )}
                  <span className="team-name">{transfer.new_team_name || 'Yangi jamoasi'}</span>
                </div>
              </div>
              
              {transfer.status === 'pending' && (
                <div className="card-bottom">
                  <button className="action-btn reject" onClick={() => handleReject(transfer.id)} title="Rad etish">
                    <X size={18} /> Rad etish
                  </button>
                  <button className="action-btn approve" onClick={() => handleApprove(transfer)} title="Tasdiqlash">
                    <Check size={18} /> Tasdiqlash
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Edit Transfer Modal */}
      {editingTransfer && (
        <div className="transfer-edit-modal-overlay" onClick={() => setEditingTransfer(null)}>
          <div className="transfer-edit-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="header-title-flex">
                <Pencil size={20} />
                <h2>Transfer So'rovini Tahrirlash</h2>
              </div>
              <button className="modal-close-btn" onClick={() => setEditingTransfer(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label><User size={14} /> O'yinchi ismi</label>
                <input 
                  type="text" 
                  value={editForm.player_name}
                  onChange={e => setEditForm({ ...editForm, player_name: e.target.value })}
                  placeholder="O'yinchi ismini kiriting"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label><Shield size={14} /> Eski jamoa</label>
                  <input 
                    type="text" 
                    value={editForm.old_team_name}
                    onChange={e => setEditForm({ ...editForm, old_team_name: e.target.value })}
                    placeholder="Eski jamoa nomi"
                  />
                </div>
                <div className="form-group">
                  <label><Shield size={14} /> Yangi jamoa</label>
                  <input 
                    type="text" 
                    value={editForm.new_team_name}
                    onChange={e => setEditForm({ ...editForm, new_team_name: e.target.value })}
                    placeholder="Yangi jamoa nomi"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>O'tish sababi</label>
                <textarea 
                  rows={3}
                  value={editForm.reason}
                  onChange={e => setEditForm({ ...editForm, reason: e.target.value })}
                  placeholder="Transfer sababini yozing..."
                />
              </div>

              <div className="form-group">
                <label>Status</label>
                <select 
                  value={editForm.status} 
                  onChange={e => setEditForm({ ...editForm, status: e.target.value })}
                >
                  <option value="pending">Kutilmoqda (Pending)</option>
                  <option value="approved">Tasdiqlangan (Approved)</option>
                  <option value="rejected">Rad etilgan (Rejected)</option>
                </select>
              </div>
            </div>

            <div className="modal-footer">
              <button 
                type="button" 
                className="btn-cancel" 
                onClick={() => setEditingTransfer(null)}
              >
                Bekor qilish
              </button>
              <button 
                type="button" 
                className="btn-save" 
                onClick={handleSaveEdit}
                disabled={savingEdit}
              >
                <Save size={18} /> {savingEdit ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Transfers;
