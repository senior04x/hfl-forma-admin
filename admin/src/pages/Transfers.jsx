import React, { useState, useEffect, useRef } from 'react';
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
  Shield,
  ChevronDown,
  Zap,
  Bell,
  Trash2
} from 'lucide-react';
import './Transfers.css';
import { loadAdminTransfers, saveAdminTransfer, deleteAdminTransfer } from '../utils/transferAdminService.mjs';

const Transfers = () => {
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [filterOpen, setFilterOpen] = useState(false);
  const [editingTransfer, setEditingTransfer] = useState(null);
  const [editForm, setEditForm] = useState({
    player_name: '',
    reason: '',
    status: 'pending',
    old_team_name: '',
    new_team_name: ''
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const { orgId, currentOrg } = useOrg();
  
  // Transfer Window State
  const [transferWindowOpen, setTransferWindowOpen] = useState(false);
  const [windowLoading, setWindowLoading] = useState(true);
  const [windowToggling, setWindowToggling] = useState(false);
  
  const filterRef = useRef(null);

  const [page, setPage] = useState(0);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [busyIds, setBusyIds] = useState(new Set());
  const operations = useRef(new Set());
  const currentOrgId = useRef(orgId);
  currentOrgId.current = orgId;

  const beginOperation = (id) => {
    if (operations.current.has(id)) return false;
    operations.current.add(id);
    setBusyIds(new Set(operations.current));
    return true;
  };
  const endOperation = (id) => {
    operations.current.delete(id);
    setBusyIds(new Set(operations.current));
  };

  useEffect(() => {
    let cancelled = false;
    setPage(0);
    setEditingTransfer(null);
    setWindowLoading(true);
    setTransferWindowOpen(false);
    const loadWindow = async () => {
      try {
        const { data, error } = await supabase.from('organizations')
          .select('transfer_window_open').eq('id', orgId).single();
        if (!cancelled && !error && data) setTransferWindowOpen(!!data.transfer_window_open);
      } catch { /* Keep the control closed when the window cannot be read. */ }
      finally { if (!cancelled) setWindowLoading(false); }
    };
    loadWindow();
    return () => { cancelled = true; };
  }, [orgId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    const load = async () => {
      try {
        const result = await loadAdminTransfers(supabase, orgId, filter, page);
        if (cancelled) return;
        setTransfers(result.items);
        setHasMore(result.hasMore);
      } catch {
        if (cancelled) return;
        setTransfers([]);
        setHasMore(false);
        setLoadError('Transferlar yuklanmadi. Qayta urinib ko‘ring.');
      } finally { if (!cancelled) setLoading(false); }
    };
    load();
    return () => { cancelled = true; };
  }, [orgId, filter, page, reloadVersion]);

  // Close filter dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) {
        setFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggleTransferWindow = async () => {
    if (windowToggling) return;
    setWindowToggling(true);
    const newState = !transferWindowOpen;
    
    try {
      const { error } = await supabase
        .from('organizations')
        .update({ transfer_window_open: newState })
        .eq('id', orgId);
      
      if (error) throw error;
      
      setTransferWindowOpen(newState);
      
      // Send push notifications when window opens
      if (newState) {
        sendTransferWindowNotification();
      }
    } catch (err) {
      console.error('Error toggling transfer window:', err);
      alert('Transfer oynasini o\'zgartirishda xatolik yuz berdi');
    } finally {
      setWindowToggling(false);
    }
  };

  const sendTransferWindowNotification = async () => {
    try {
      // Get all teams in this organization
      const { data: orgTeams } = await supabase
        .from('teams')
        .select('id')
        .eq('organization_id', orgId);
      
      if (!orgTeams || orgTeams.length === 0) return;
      
      const teamIds = orgTeams.map(t => t.id);
      
      // Get all players in these teams who have push tokens
      const { data: players } = await supabase
        .from('applications')
        .select('expo_push_token')
        .in('team_id', teamIds)
        .not('expo_push_token', 'is', null);
      
      if (!players || players.length === 0) return;
      
      const tokens = players
        .map(p => p.expo_push_token)
        .filter(t => t && t.startsWith('ExponentPushToken'));
      
      if (tokens.length === 0) return;
      
      // Send via Expo Push API
      const messages = tokens.map(token => ({
        to: token,
        sound: 'default',
        title: '🔄 Transfer oynasi ochildi!',
        body: `${currentOrg?.name || 'Tashkilot'} uchun transfer oynasi ochildi. Jamoa sardorlari transfer so'rovini yuborishi mumkin.`,
        data: { type: 'transfer_window_opened' }
      }));
      
      // Send in batches of 100
      for (let i = 0; i < messages.length; i += 100) {
        const batch = messages.slice(i, i + 100);
        await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(batch)
        }).catch(err => console.warn('Push send error:', err));
      }
      
      console.log(`Sent transfer window notifications to ${tokens.length} players`);
    } catch (err) {
      console.warn('Notification send error:', err);
    }
  };

  const handleUpdateTransferStatus = async (transfer, newStatus) => {
    if (transfer.status === newStatus || !beginOperation(transfer.id)) return;
    try {
      await saveAdminTransfer(supabase, orgId, transfer, { status: newStatus });
      if (currentOrgId.current === orgId) setReloadVersion(v => v + 1);
    } catch {
      alert('Transfer saqlanmadi. Holat yoki jamoa o‘zgargan bo‘lishi mumkin. Ro‘yxatni yangilang.');
    } finally { endOperation(transfer.id); }
  };

  const handleApprove = transfer => handleUpdateTransferStatus(transfer, 'approved');
  const handleReject = transfer => handleUpdateTransferStatus(transfer, 'rejected');

  const handleDeleteTransfer = async (transfer) => {
    if (!window.confirm("Haqiqatan ham ushbu transfer so'rovini o'chirib tashlamoqchimisiz?")) return;
    if (!beginOperation(transfer.id)) return;
    try {
      await deleteAdminTransfer(supabase, orgId, transfer);
      if (currentOrgId.current === orgId) setReloadVersion(v => v + 1);
    } catch {
      alert('O‘chirish bajarilmadi. Ro‘yxatni yangilab qayta tekshiring.');
    } finally { endOperation(transfer.id); }
  };

  const handleOpenEditModal = (transfer) => {
    setEditingTransfer(transfer);
    setEditForm({
      player_name: transfer.player_name || '',
      reason: transfer.reason || '',
      status: transfer.status || 'pending',
      old_team_id: transfer.old_team_id || '',
      old_team_name: transfer.old_team_name || '',
      old_team_logo: transfer.old_team_logo || '',
      new_team_id: transfer.new_team_id || '',
      new_team_name: transfer.new_team_name || '',
      new_team_logo: transfer.new_team_logo || ''
    });
  };

  const handleSaveEdit = async () => {
    if (!editingTransfer || !beginOperation(editingTransfer.id)) return;
    setSavingEdit(true);
    try {
      await saveAdminTransfer(supabase, orgId, editingTransfer, {
        player_name: editForm.player_name.trim(),
        reason: editForm.reason.trim(),
        status: editForm.status
      });
      if (currentOrgId.current === orgId) {
        setEditingTransfer(null);
        setReloadVersion(v => v + 1);
      }
    } catch {
      alert('Saqlash bajarilmadi. Holat yoki jamoa o‘zgargan bo‘lishi mumkin. Ro‘yxatni yangilang.');
    } finally { setSavingEdit(false); endOperation(editingTransfer.id); }
  };

  const filteredTransfers = transfers;
  const filterOptions = [
    { key: 'pending', label: 'Kutilmoqda', icon: <Clock size={15} />, color: '#f59e0b' },
    { key: 'approved', label: 'Tasdiqlangan', icon: <CheckCircle2 size={15} />, color: '#00ff66' },
    { key: 'rejected', label: 'Rad etilgan', icon: <XCircle size={15} />, color: '#ef4444' },
    { key: 'all', label: 'Barchasi', icon: <Layers size={15} />, color: '#8b5cf6' }
  ];

  const activeFilter = filterOptions.find(f => f.key === filter);

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
      </div>

      {/* Transfer Window Toggle Card */}
      <div className={`transfer-window-card ${transferWindowOpen ? 'open' : 'closed'}`}>
        <div className="tw-card-content">
          <div className="tw-info">
            <div className={`tw-icon-wrap ${transferWindowOpen ? 'active' : ''}`}>
              <Zap size={22} />
            </div>
            <div className="tw-text">
              <h3>Transfer Oynasi</h3>
              <p>{transferWindowOpen 
                ? "Transfer oynasi ochiq — jamoa sardorlari so'rov yuborishi mumkin"
                : "Transfer oynasi yopiq — jamoa sardorlari so'rov yuborolmaydi"
              }</p>
            </div>
          </div>
          
          <button 
            className={`tw-toggle-btn ${transferWindowOpen ? 'on' : 'off'} ${windowToggling ? 'toggling' : ''}`}
            onClick={handleToggleTransferWindow}
            disabled={windowToggling || windowLoading}
          >
            <div className="tw-toggle-track">
              <div className="tw-toggle-thumb">
                {windowToggling ? (
                  <div className="tw-toggle-spinner"></div>
                ) : transferWindowOpen ? (
                  <Check size={14} />
                ) : (
                  <X size={14} />
                )}
              </div>
            </div>
            <span className="tw-toggle-label">
              {windowLoading ? 'Yuklanmoqda...' : windowToggling ? "O'zgartirilmoqda..." : transferWindowOpen ? 'OCHIQ' : 'YOPIQ'}
            </span>
          </button>
        </div>
        
        {transferWindowOpen && (
          <div className="tw-notification-bar">
            <Bell size={14} />
            <span>Transfer arizalarini jamoa sardorlari yuboradi; qarorni admin beradi</span>
          </div>
        )}
      </div>

      {/* Collapsible Filter Dropdown */}
      <div className="filter-dropdown-container" ref={filterRef}>
        <button 
          className={`filter-dropdown-trigger ${filterOpen ? 'open' : ''}`}
          onClick={() => setFilterOpen(!filterOpen)}
        >
          <div className="filter-trigger-left">
            <span className="filter-active-dot" style={{ background: activeFilter?.color }}></span>
            {activeFilter?.icon}
            <span className="filter-trigger-label">{activeFilter?.label}</span>
          </div>
          <ChevronDown size={18} className={`filter-chevron ${filterOpen ? 'rotated' : ''}`} />
        </button>
        
        {filterOpen && (
          <div className="filter-dropdown-menu">
            {filterOptions.map(opt => (
              <button
                key={opt.key}
                className={`filter-dropdown-item ${filter === opt.key ? 'active' : ''}`}
                onClick={() => {
                  setFilter(opt.key);
                  setPage(0);
                  setFilterOpen(false);
                }}
              >
                <div className="filter-item-left">
                  <span className="filter-item-dot" style={{ background: opt.color }}></span>
                  {opt.icon}
                  <span>{opt.label}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="transfer-pagination">
        <button type="button" onClick={() => setReloadVersion(v => v + 1)} disabled={loading}>Yangilash</button>
        <button type="button" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={loading || page === 0}>Oldingi</button>
        <span>{page + 1}-sahifa</span>
        <button type="button" onClick={() => setPage(p => p + 1)} disabled={loading || !hasMore}>Keyingi</button>
      </div>
      {loadError && <p role="alert">{loadError}</p>}

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
              
              <div className="card-action-bar">
                <span className={`status-pill ${transfer.status}`}>
                  {transfer.status === 'approved' && <CheckCircle2 size={12} />}
                  {transfer.status === 'rejected' && <XCircle size={12} />}
                  {transfer.status === 'pending' && <Clock size={12} />}
                  {transfer.status === 'approved' ? 'Tasdiqlangan' : transfer.status === 'rejected' ? 'Rad etilgan' : 'Kutilmoqda'}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button 
                    className="card-edit-btn" 
                    disabled={busyIds.has(transfer.id)} onClick={() => handleOpenEditModal(transfer)}
                    title="Transferni tahrirlash"
                  >
                    <Pencil size={14} />
                  </button>
                  <button 
                    className="card-edit-btn card-delete-btn" 
                    disabled={busyIds.has(transfer.id)} onClick={() => handleDeleteTransfer(transfer)}
                    title="Transferni o'chirish"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
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
              
              <div className="card-bottom">
                {transfer.status === 'pending' && (
                  <>
                    <button className="action-btn reject" disabled={busyIds.has(transfer.id)} onClick={() => handleReject(transfer)} title="Rad etish">
                      <X size={18} /> Rad etish
                    </button>
                    <button className="action-btn approve" disabled={busyIds.has(transfer.id)} onClick={() => handleApprove(transfer)} title="Tasdiqlash">
                      <Check size={18} /> Tasdiqlash
                    </button>
                  </>
                )}
                {transfer.status === 'approved' && !transfer.requested_by_team_id && (
                  <button className="action-btn reject" style={{ width: '100%', background: 'rgba(255, 170, 0, 0.15)', color: '#ffaa00', borderColor: 'rgba(255, 170, 0, 0.3)' }} disabled={busyIds.has(transfer.id)} onClick={() => handleUpdateTransferStatus(transfer, 'pending')} title="Kutilmoqdaga qaytarish (O'yinchini eski jamoasiga qaytarish)">
                    <Clock size={16} /> Kutilmoqdaga qaytarish
                  </button>
                )}
                {transfer.status === 'rejected' && !transfer.requested_by_team_id && (
                  <>
                    <button className="action-btn reject" style={{ background: 'rgba(255, 170, 0, 0.15)', color: '#ffaa00', borderColor: 'rgba(255, 170, 0, 0.3)' }} disabled={busyIds.has(transfer.id)} onClick={() => handleUpdateTransferStatus(transfer, 'pending')} title="Kutilmoqdaga qaytarish">
                      <Clock size={16} /> Kutilmoqdaga
                    </button>
                    <button className="action-btn approve" disabled={busyIds.has(transfer.id)} onClick={() => handleApprove(transfer)} title="Tasdiqlash">
                      <Check size={18} /> Tasdiqlash
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Transfer Modal */}
      {editingTransfer && (
        <div className="transfer-edit-modal-overlay" onClick={() => { if (!savingEdit) setEditingTransfer(null); }}>
          <div className="transfer-edit-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="header-title-flex">
                <Pencil size={20} />
                <h2>Transfer So'rovini Tahrirlash</h2>
              </div>
              {editingTransfer.created_at && (
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  fontSize: '11px',
                  fontWeight: '600',
                  color: 'rgba(255, 255, 255, 0.45)',
                  marginLeft: 'auto',
                  marginRight: '12px'
                }}>
                  <Clock size={12} color="rgba(255, 255, 255, 0.45)" />
                  <span>{new Date(editingTransfer.created_at).toLocaleString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              )}
              <button className="modal-close-btn" onClick={() => { if (!savingEdit) setEditingTransfer(null); }}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label><User size={14} /> O'yinchi ismi</label>
                <input 
                  type="text" 
                  maxLength={200}
                  value={editForm.player_name}
                  onChange={e => setEditForm({ ...editForm, player_name: e.target.value })}
                  placeholder="O'yinchi ismini kiriting"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label><Shield size={14} /> Eski jamoa</label>
                  <input value={editForm.old_team_name} readOnly />
                </div>
                <div className="form-group">
                  <label><Shield size={14} /> Yangi jamoa</label>
                  <input value={editForm.new_team_name} readOnly />
                </div>
              </div>

              <div className="form-group">
                <label>O'tish sababi</label>
                <textarea 
                  rows={3}
                  maxLength={1000}
                  value={editForm.reason}
                  onChange={e => setEditForm({ ...editForm, reason: e.target.value })}
                  placeholder="Transfer sababini yozing..."
                />
              </div>

              <div className="form-group">
                <label>Status</label>
                <select 
                  value={editForm.status}
                  disabled={Boolean(editingTransfer.requested_by_team_id && editingTransfer.status !== 'pending')}
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
                onClick={() => { if (!savingEdit) setEditingTransfer(null); }}
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
