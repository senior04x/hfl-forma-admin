import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useOrg } from '../context/OrgContext';
import { getActiveOrgLeagues } from '../utils/leagueUtils';
import { X, Trash2, Save, Eye, Crop, Plus, Check, Trophy } from 'lucide-react';
import PlayerModal from './PlayerModal';
import ImageCropperModal from './ImageCropperModal';
import DeleteConfirmModal from './DeleteConfirmModal';
import CustomSelect from './CustomSelect';
import './Modal.css';

const TeamModal = ({ team, mode, onClose, onRefresh }) => {
  const { orgId } = useOrg();
  const [currentMode, setCurrentMode] = useState(mode);
  const [status, setStatus] = useState(team.status);
  const [loading, setLoading] = useState(false);
  const [availableLeagues, setAvailableLeagues] = useState([]);
  const fileInputRef = useRef(null);

  // Multi-league selection state
  const parseLeagues = (str) => {
    if (!str) return [];
    return str.split(',').map(s => s.trim()).filter(Boolean);
  };
  const [selectedLeagues, setSelectedLeagues] = useState(() => parseLeagues(team.league));
  const [customLeagueInput, setCustomLeagueInput] = useState('');
  const [showCustomLeagueField, setShowCustomLeagueField] = useState(false);

  // Cropper and Delete Confirm states
  const [cropperRawImage, setCropperRawImage] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Form states for edit mode
  const [formData, setFormData] = useState({
    name: team.name || '',
    captain_name: team.captain_name || '',
    captain_phone: team.captain_phone || '',
    region: team.region || '',
    logo_url: team.logo_url || ''
  });

  useEffect(() => {
    setFormData({
      name: team.name || '',
      captain_name: team.captain_name || '',
      captain_phone: team.captain_phone || '',
      region: team.region || '',
      logo_url: team.logo_url || ''
    });
    setSelectedLeagues(parseLeagues(team.league));
  }, [team]);

  const [players, setPlayers] = useState([]);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState(null);

  useEffect(() => {
    loadLeagues();
  }, [orgId]);

  const loadLeagues = async () => {
    const fetched = await getActiveOrgLeagues(orgId);
    setAvailableLeagues(fetched);
  };

  useEffect(() => {
    if (currentMode === 'view') {
      fetchPlayers();
    }
  }, [currentMode, team.id]);

  const fetchPlayers = async () => {
    setLoadingPlayers(true);
    try {
      const { data, error } = await supabase.from('applications').select('*').eq('team_id', team.id).order('created_at', { ascending: false });
      if (error) throw error;
      if (data) setPlayers(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingPlayers(false);
    }
  };

  const updatePlayerStatus = async (playerId, newStatus) => {
    try {
      const { error } = await supabase.from('applications').update({ status: newStatus }).eq('id', playerId);
      if (error) throw error;
      
      const newPlayers = players.map(p => p.id === playerId ? { ...p, status: newStatus } : p);
      setPlayers(newPlayers);
      
      const allApproved = newPlayers.every(p => p.status === 'approved');
      const allRejected = newPlayers.every(p => p.status === 'rejected');
      const someApproved = newPlayers.some(p => p.status === 'approved');
      
      let newTeamStatus = 'pending';
      if (allApproved) newTeamStatus = 'approved';
      else if (allRejected) newTeamStatus = 'rejected';
      else if (someApproved) newTeamStatus = 'partially_approved';
      
      setStatus(newTeamStatus);
      await supabase.from('teams').update({ status: newTeamStatus }).eq('id', team.id);
      onRefresh();
    } catch (err) {
      console.error(err);
      alert('Xatolik yuz berdi');
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCropperRawImage(reader.result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleCroppedSave = async (croppedBase64) => {
    // 1. Immediately update preview in form data
    setFormData(prev => ({ ...prev, logo_url: croppedBase64 }));
    setUploadingImage(true);
    setCropperRawImage(null);
    try {
      const response = await fetch(croppedBase64);
      const blob = await response.blob();
      const fileName = `team_logo_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;

      const { error } = await supabase.storage.from('player-photos').upload(fileName, blob, {
        contentType: 'image/jpeg',
        upsert: true
      });
      if (error) throw error;

      const { data } = supabase.storage.from('player-photos').getPublicUrl(fileName);
      setFormData(prev => ({ ...prev, logo_url: data.publicUrl }));
    } catch (err) {
      console.error('Logo upload error:', err);
      alert('Rasm yuklashda xatolik yuz berdi: ' + (err.message || ''));
    } finally {
      setUploadingImage(false);
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const addLeague = (leagueName) => {
    if (!leagueName) return;
    if (!selectedLeagues.includes(leagueName)) {
      setSelectedLeagues(prev => [...prev, leagueName]);
    }
  };

  const removeLeague = (leagueName) => {
    setSelectedLeagues(prev => prev.filter(l => l !== leagueName));
  };

  const handleAddCustomLeague = () => {
    if (customLeagueInput.trim()) {
      addLeague(customLeagueInput.trim());
      setCustomLeagueInput('');
      setShowCustomLeagueField(false);
    }
  };

  const handleStatusChange = async (newStatus) => {
    if (window.confirm("Jamoaning barcha o'yinchilari holati o'zgartiriladi. Tasdiqlaysizmi?")) {
      try {
        setStatus(newStatus);
        await supabase.from('teams').update({ status: newStatus }).eq('id', team.id);
        
        let pStatus = 'pending';
        if (newStatus === 'approved') pStatus = 'approved';
        if (newStatus === 'rejected') pStatus = 'rejected';
        
        await supabase.from('applications').update({ status: pStatus }).eq('team_id', team.id);
        
        fetchPlayers();
        onRefresh();
      } catch (error) {
        console.error(error);
        alert('Xatolik yuz berdi');
      }
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const finalLeagueStr = selectedLeagues.join(', ');
      const updateData = {
        name: formData.name,
        logo_url: formData.logo_url,
        league: finalLeagueStr
      };

      if (formData.captain_phone !== undefined) updateData.captain_phone = formData.captain_phone;

      const { error } = await supabase.from('teams').update(updateData).eq('id', team.id);
      if (error) throw error;

      onRefresh();
      setCurrentMode('view');
    } catch (error) {
      console.error('handleSave error:', error);
      alert('Xatolik yuz berdi: ' + (error.message || error.details || ''));
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    try {
      await supabase.from('teams').delete().eq('id', team.id);
      onRefresh();
      setShowDeleteModal(false);
      onClose();
    } catch (error) {
      console.error(error);
      alert("Jamoani o'chirishda xatolik yuz berdi");
    }
  };

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={e => e.stopPropagation()}>
          <button className="close-btn" onClick={onClose}><X size={24} /></button>
          
          {currentMode === 'view' ? (
            <div className="modal-view">
              <div className="modal-header-profile">
                <img src={formData.logo_url || team.logo_url} alt="Logo" className="modal-avatar team" />
                <h2>{team.name}</h2>
                <div className="team-leagues-badges">
                  {selectedLeagues.length > 0 ? (
                    selectedLeagues.map(l => <span key={l} className="team-league-pill">{l}</span>)
                  ) : (
                    <span className="team-league-pill muted">Liga tanlanmagan</span>
                  )}
                </div>
              </div>
              
              <div className="modal-details-grid">
                <div className="detail-item">
                  <span className="label">Sardor:</span>
                  <span className="value">{team.captain_name || '—'}</span>
                </div>
                <div className="detail-item">
                  <span className="label">Telefon:</span>
                  <span className="value">{team.captain_phone || '—'}</span>
                </div>
                <div className="detail-item">
                  <span className="label">Viloyat:</span>
                  <span className="value">{team.region || '—'}</span>
                </div>
              </div>
              
              {team.payment_receipt && (
                <div style={{ marginTop: '20px' }}>
                  <span className="label" style={{display:'block', marginBottom: '10px'}}>To'lov cheki:</span>
                  <img 
                    src={team.payment_receipt} 
                    style={{maxWidth: '120px', cursor:'pointer', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.15)'}} 
                    onClick={() => window.open(team.payment_receipt, '_blank')} 
                  />
                </div>
              )}

              <div className="team-players-section" style={{ marginTop: '25px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '15px' }}>
                <h3 style={{ marginBottom: '15px', fontSize: '16px', color: '#ffffff' }}>Jamoa o'yinchilari ({players.length})</h3>
                {loadingPlayers ? (
                  <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '14px' }}>Yuklanmoqda...</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {players.map(p => (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '15px', background: '#0e1422', padding: '12px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                        <img 
                          src={p.photo_url} 
                          alt="Profile" 
                          style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', cursor: 'pointer' }} 
                          onClick={() => setSelectedPlayer(p)}
                        />
                        <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => setSelectedPlayer(p)}>
                          <div style={{ fontWeight: 700, fontSize: '14px', color: '#ffffff' }}>{p.first_name} {p.last_name}</div>
                          <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)' }}>{p.position} • #{p.player_number}</div>
                        </div>
                        <select 
                          value={p.status} 
                          onChange={(e) => updatePlayerStatus(p.id, e.target.value)}
                          style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.15)', background: '#141922', color: '#ffffff', fontSize: '12px', outline: 'none' }}
                        >
                          <option value="pending">Kutilmoqda</option>
                          <option value="approved">Tasdiqlangan</option>
                          <option value="rejected">Rad etilgan</option>
                        </select>
                      </div>
                    ))}
                    {players.length === 0 && <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '14px' }}>O'yinchilar topilmadi.</p>}
                  </div>
                )}
              </div>

              <div className="modal-actions mt-4">
                <select value={status} onChange={(e) => handleStatusChange(e.target.value)} className="status-select">
                  <option value="pending">Kutilmoqda</option>
                  <option value="approved">Tasdiqlash</option>
                  <option value="rejected">Rad etish</option>
                </select>
                <button className="btn-edit" onClick={() => setCurrentMode('edit')}>Tahrirlash</button>
                <button className="btn-delete" onClick={() => setShowDeleteModal(true)}><Trash2 size={18} /> O'chirish</button>
              </div>
            </div>
          ) : (
            <div className="modal-edit">
              <h2 className="modal-edit-title">Jamoani Tahrirlash</h2>

              {/* 1:1 Logo Cropper */}
              <div className="crop-photo-picker">
                <img 
                  src={formData.logo_url || 'https://via.placeholder.com/100'} 
                  alt="Preview" 
                  className="crop-preview-avatar team" 
                />
                <button type="button" className="btn-crop-upload" onClick={() => fileInputRef.current?.click()}>
                  <Crop size={16} /> {uploadingImage ? 'Yuklanmoqda...' : "1:1 Logotip Almashtirish"}
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  accept="image/*" 
                  onChange={handleFileSelect} 
                  style={{ display: 'none' }} 
                />
              </div>

              <div className="edit-form-grid">
                <div className="form-group">
                  <label>Jamoa nomi</label>
                  <input name="name" value={formData.name} onChange={handleChange} />
                </div>
                <div className="form-group">
                  <label>Sardor ismi va familiyasi</label>
                  <input name="captain_name" value={formData.captain_name} onChange={handleChange} placeholder="masalan: Jasur Abdullayev" />
                </div>
                <div className="form-group">
                  <label>Sardor telefoni</label>
                  <input name="captain_phone" value={formData.captain_phone} onChange={handleChange} />
                </div>
                <div className="form-group">
                  <label>Viloyat / Shahar</label>
                  <input name="region" value={formData.region} onChange={handleChange} placeholder="masalan: Toshkent sh." />
                </div>
                
                {/* Multi-league Selection */}
                <div className="form-group full-width">
                  <label>Biriktirilgan Ligalar (Bir nechta liga tanlashingiz mumkin)</label>
                  
                  <div className="selected-leagues-chips">
                    {selectedLeagues.map(l => (
                      <span key={l} className="league-chip">
                        {l}
                        <button type="button" onClick={() => removeLeague(l)} className="remove-chip-btn" title="O'chirish">
                          <X size={14} />
                        </button>
                      </span>
                    ))}
                    {selectedLeagues.length === 0 && (
                      <span className="no-leagues-text">Hozircha hech qanday liga tanlanmagan</span>
                    )}
                  </div>

                  <div className="add-league-row">
                    <CustomSelect
                      value=""
                      onChange={(val) => {
                        if (val) addLeague(val);
                      }}
                      icon={Trophy}
                      placeholder="+ Yangi liga biriktirish..."
                      options={[
                        { value: '', label: '+ Yangi liga biriktirish...' },
                        ...availableLeagues
                          .filter(l => !selectedLeagues.includes(l.name))
                          .map(l => ({ value: l.name, label: l.name }))
                      ]}
                    />
                  </div>
                </div>
              </div>

              <div className="modal-actions">
                <button className="btn-cancel" onClick={() => setCurrentMode('view')}>Bekor qilish</button>
                <button className="btn-save" onClick={handleSave} disabled={loading}>{loading ? 'Saqlanmoqda...' : 'Saqlash'}</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {selectedPlayer && (
        <PlayerModal 
          player={selectedPlayer} 
          mode="view" 
          onClose={() => setSelectedPlayer(null)} 
          onRefresh={fetchPlayers} 
        />
      )}

      {/* 1:1 Image Cropper Modal */}
      {cropperRawImage && (
        <ImageCropperModal
          isOpen={!!cropperRawImage}
          imageSrc={cropperRawImage}
          onSave={handleCroppedSave}
          onClose={() => setCropperRawImage(null)}
          title="Jamoa Logotipini 1:1 Formatda Qirqish"
        />
      )}

      {/* 5s Countdown Delete Confirm Modal */}
      <DeleteConfirmModal
        isOpen={showDeleteModal}
        title="Jamoani o'chirish"
        message="O'chirsangiz jamoaning barcha ma'lumotlari hamda o'yinchilari o'chib ketadi!"
        onConfirm={handleConfirmDelete}
        onClose={() => setShowDeleteModal(false)}
      />
    </>
  );
};

export default TeamModal;
