import React, { useState, useEffect, useRef } from 'react';
import { supabase, supabase } from '../supabaseClient';
import { X, Trash2, Save, Eye, Crop, Clock, Archive } from 'lucide-react';
import ImageCropperModal from './ImageCropperModal';
import DeleteConfirmModal from './DeleteConfirmModal';
import TransferClosedModal from './TransferClosedModal';
import { isTransferWindowOpen } from '../utils/transferUtils';
import './Modal.css';

const InstagramIcon = ({ size = 16, color = '#E1306C' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
  </svg>
);

const PlayerModal = ({ player, mode, onClose, onRefresh }) => {
  const [currentMode, setCurrentMode] = useState(mode);
  const [status, setStatus] = useState(player.status);
  const [loading, setLoading] = useState(false);
  const [teams, setTeams] = useState([]);
  const [selectedLeague, setSelectedLeague] = useState('');
  const fileInputRef = useRef(null);

  // Cropper and Delete confirm states
  const [cropperRawImage, setCropperRawImage] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showTransferClosedModal, setShowTransferClosedModal] = useState(false);

  useEffect(() => {
    const fetchTeams = async () => {
      const { data } = await supabase.from('teams').select('id, name, league');
      if (data) setTeams(data);
    };
    fetchTeams();
  }, []);

  useEffect(() => {
    if (player.team_id && teams.length > 0) {
      const t = teams.find(t => t.id === player.team_id);
      if (t && t.league) {
        const teamLeagues = t.league.split(',').map(s => s.trim()).filter(Boolean);
        if (teamLeagues.length > 0 && !teamLeagues.includes(selectedLeague)) {
          setSelectedLeague(teamLeagues[0]);
        }
      }
    }
  }, [player.team_id, teams]);

  const getInstaUsername = (p) => {
    if (!p) return '';
    if (p.instagram_username) return p.instagram_username;
    if (p.comment) {
      const match = p.comment.match(/\[INSTAGRAM:https?:\/\/[^/]+\/([^/\]]+)/);
      if (match?.[1]) return match[1];
    }
    return '';
  };

  const extractPlayerMeta = (p) => {
    let citizenship = p.citizenship || '';
    let height = p.height || '';
    let weight = p.weight || '';
    let instaUser = getInstaUsername(p);

    if (p.comment) {
      const metaMatch = p.comment.match(/\[METADATA:({[^\]]+})\]/);
      if (metaMatch?.[1]) {
        try {
          const obj = JSON.parse(metaMatch[1]);
          if (obj.citizenship) citizenship = obj.citizenship;
          if (obj.height) height = obj.height;
          if (obj.weight) weight = obj.weight;
        } catch (e) {}
      }
    }

    return { citizenship, height, weight, instaUser };
  };

  const initialMeta = extractPlayerMeta(player);

  const [formData, setFormData] = useState({
    first_name: player.first_name || '',
    last_name: player.last_name || '',
    father_name: player.father_name || '',
    phone: player.phone || '',
    passport_series: player.passport_series || '',
    passport_number: player.passport_number || '',
    birth_date: player.birth_date || '',
    position: player.position || '',
    player_number: player.player_number || '',
    photo_url: player.photo_url || '',
    team_id: player.team_id || '',
    instagram_username: initialMeta.instaUser,
    citizenship: initialMeta.citizenship,
    height: initialMeta.height,
    weight: initialMeta.weight
  });

  useEffect(() => {
    const meta = extractPlayerMeta(player);
    setFormData({
      first_name: player.first_name || '',
      last_name: player.last_name || '',
      father_name: player.father_name || '',
      phone: player.phone || '',
      passport_series: player.passport_series || '',
      passport_number: player.passport_number || '',
      birth_date: player.birth_date || '',
      position: player.position || '',
      player_number: player.player_number || '',
      photo_url: player.photo_url || '',
      team_id: player.team_id || '',
      instagram_username: meta.instaUser,
      citizenship: meta.citizenship,
      height: meta.height,
      weight: meta.weight
    });
  }, [player]);

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
    // 1. Immediately show cropped preview image
    setFormData(prev => ({ ...prev, photo_url: croppedBase64 }));
    setUploadingImage(true);
    setCropperRawImage(null);
    try {
      const response = await fetch(croppedBase64);
      const blob = await response.blob();
      const fileName = `player_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;

      const { error } = await supabase.storage.from('player-photos').upload(fileName, blob, {
        contentType: 'image/jpeg',
        upsert: true
      });
      if (error) throw error;

      const { data } = supabase.storage.from('player-photos').getPublicUrl(fileName);
      setFormData(prev => ({ ...prev, photo_url: data.publicUrl }));
    } catch (err) {
      console.error('Photo upload error:', err);
      alert('Rasm yuklashda xatolik yuz berdi: ' + (err.message || ''));
    } finally {
      setUploadingImage(false);
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleStatusChange = async (newStatus) => {
    try {
      setStatus(newStatus);
      const { error } = await supabase.from('applications').update({ status: newStatus }).eq('id', player.id);
      if (error) throw error;
      onRefresh();
    } catch (error) {
      console.error(error);
      alert('Xatolik yuz berdi');
    }
  };

  const handleStartEdit = async () => {
    const windowOpen = await isTransferWindowOpen(player.organization_id || 1);
    if (!windowOpen) {
      setShowTransferClosedModal(true);
      return;
    }
    setCurrentMode('edit');
  };

  const handleSave = async () => {
    const windowOpen = await isTransferWindowOpen(player.organization_id || 1);
    if (!windowOpen) {
      setShowTransferClosedModal(true);
      return;
    }
    setLoading(true);
    try {
      const cleanInsta = (formData.instagram_username || '').trim().replace(/^@/, '').replace(/[^a-zA-Z0-9._]/g, '');
      const instaUrl = cleanInsta ? `https://www.instagram.com/${cleanInsta}/` : null;

      const metaObj = {
        citizenship: formData.citizenship || '',
        height: formData.height || '',
        weight: formData.weight || ''
      };

      const currentComment = player.comment || '';
      const cleanComment = currentComment
        .replace(/\[METADATA:[^\]]+\]/g, '')
        .replace(/\[INSTAGRAM:[^\]]+\]/g, '')
        .trim();

      let updatedComment = cleanComment;
      if (metaObj.citizenship || metaObj.height || metaObj.weight) {
        updatedComment += ` [METADATA:${JSON.stringify(metaObj)}]`;
      }
      if (instaUrl) {
        updatedComment += ` [INSTAGRAM:${instaUrl}]`;
      }

      // ONLY update valid SQL columns to prevent 400 Bad Request error
      const updatePayload = {
        first_name: formData.first_name,
        last_name: formData.last_name,
        father_name: formData.father_name,
        phone: formData.phone,
        passport_series: formData.passport_series,
        passport_number: formData.passport_number,
        birth_date: formData.birth_date,
        position: formData.position,
        player_number: formData.player_number ? Number(formData.player_number) : null,
        photo_url: formData.photo_url,
        team_id: formData.team_id || null,
        comment: updatedComment.trim()
      };

      const { error } = await supabase.from('applications').update(updatePayload).eq('id', player.id);
      if (error) throw error;
      onRefresh();
      setCurrentMode('view');
    } catch (error) {
      console.error(error);
      alert('Xatolik yuz berdi: ' + (error.message || ''));
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    try {
      const { error: appErr } = await supabase.from('applications').update({ is_archived: true }).eq('id', player.id);
      if (appErr) throw appErr;

      try {
        await supabase.from('players').update({ is_archived: true }).eq('id', player.id);
      } catch (e) {}

      onRefresh();
      setShowDeleteModal(false);
      onClose();
    } catch (error) {
      console.error(error);
      alert("Arxivlashda xatolik yuz berdi: " + (error.message || ''));
    }
  };

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            {player.created_at ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: '600', color: 'rgba(255, 255, 255, 0.45)' }}>
                <Clock size={12} color="rgba(255, 255, 255, 0.45)" />
                <span>{new Date(player.created_at).toLocaleString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            ) : <div />}
            <button className="close-btn" style={{ position: 'static' }} onClick={onClose}><X size={20} /></button>
          </div>
          
          {currentMode === 'view' ? (
            <div className="modal-view">
              <div className="modal-header-profile">
                <img 
                  src={formData.photo_url || player.photo_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop'} 
                  alt="Profile" 
                  className="modal-avatar" 
                />
                <h2>{player.first_name} {player.last_name}</h2>
                <p>{player.phone || 'Telefon kiritilmagan'}</p>
                <p className="league-badge-text">
                  {teams.find(t => t.id === player.team_id)?.name || 'Yakkaxon'} 
                  {selectedLeague ? ` (${selectedLeague})` : ''}
                </p>
              </div>

              <div className="modal-details-grid">
                <div className="detail-item">
                  <span className="label">Pasport</span>
                  <span className="value">{player.passport_series || '—'} {player.passport_number || '—'}</span>
                </div>
                <div className="detail-item">
                  <span className="label">Tug'ilgan sana</span>
                  <span className="value">{player.birth_date || '—'}</span>
                </div>
                <div className="detail-item">
                  <span className="label">Pozitsiya</span>
                  <span className="value">{player.position || '—'}</span>
                </div>
                <div className="detail-item">
                  <span className="label">Raqam</span>
                  <span className="value">#{player.player_number || '—'}</span>
                </div>
                <div className="detail-item">
                  <span className="label">Instagram</span>
                  <span className="value" style={{ color: '#E1306C', fontWeight: '800' }}>
                    {formData.instagram_username ? `@${formData.instagram_username}` : '—'}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="label">Millati</span>
                  <span className="value">{formData.citizenship || '—'}</span>
                </div>
                <div className="detail-item">
                  <span className="label">Bo'yi</span>
                  <span className="value">{formData.height ? `${formData.height} SM` : '—'}</span>
                </div>
                <div className="detail-item">
                  <span className="label">Vazni</span>
                  <span className="value">{formData.weight ? `${formData.weight} KG` : '—'}</span>
                </div>
              </div>

              <div className="modal-actions">
                <select 
                  className="status-select" 
                  value={status} 
                  onChange={(e) => handleStatusChange(e.target.value)}
                >
                  <option value="pending">Kutilmoqda</option>
                  <option value="approved">Tasdiqlandi</option>
                  <option value="rejected">Rad etildi</option>
                </select>
                <button className="btn-edit" onClick={handleStartEdit}>Tahrirlash</button>
                <button className="btn-delete" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', borderColor: 'rgba(245, 158, 11, 0.3)' }} onClick={() => setShowDeleteModal(true)}><Archive size={16} /> Arxivlash</button>
              </div>
            </div>
          ) : (
            <div className="modal-edit">
              <h2 className="modal-edit-title">O'yinchini Tahrirlash</h2>
              
              {/* Photo 1:1 Crop Section */}
              <div className="crop-photo-picker">
                <img 
                  src={formData.photo_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop'} 
                  alt="Avatar" 
                  className="crop-preview-avatar"
                />
                <button type="button" className="btn-crop-upload" onClick={() => fileInputRef.current?.click()}>
                  <Crop size={16} /> {uploadingImage ? 'Yuklanmoqda...' : "1:1 Rasm Almashtirish"}
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
                  <label>Ism</label>
                  <input name="first_name" value={formData.first_name} onChange={handleChange} />
                </div>
                <div className="form-group">
                  <label>Familiya</label>
                  <input name="last_name" value={formData.last_name} onChange={handleChange} />
                </div>
                <div className="form-group">
                  <label>Otasining ismi</label>
                  <input name="father_name" value={formData.father_name} onChange={handleChange} />
                </div>
                <div className="form-group">
                  <label>Telefon</label>
                  <input name="phone" value={formData.phone} onChange={handleChange} />
                </div>
                <div className="form-group">
                  <label>Pasport seriya</label>
                  <input name="passport_series" value={formData.passport_series} onChange={handleChange} />
                </div>
                <div className="form-group">
                  <label>Pasport raqam</label>
                  <input name="passport_number" value={formData.passport_number} onChange={handleChange} />
                </div>
                <div className="form-group">
                  <label>Tug'ilgan sana</label>
                  <input type="text" name="birth_date" value={formData.birth_date} onChange={handleChange} placeholder="masalan: 10.07.1991" />
                </div>
                <div className="form-group">
                  <label>Pozitsiya</label>
                  <input name="position" value={formData.position} onChange={handleChange} />
                </div>
                <div className="form-group">
                  <label>Raqam</label>
                  <input type="number" name="player_number" value={formData.player_number} onChange={handleChange} />
                </div>
                <div className="form-group">
                  <label>Liga</label>
                  <select 
                    value={selectedLeague} 
                    onChange={(e) => {
                      setSelectedLeague(e.target.value);
                      setFormData({...formData, team_id: ''});
                    }}
                  >
                    <option value="">Ligani tanlang</option>
                    {Array.from(new Set(
                      teams
                        .flatMap(t => t.league ? t.league.split(',').map(s => s.trim()) : [])
                        .filter(Boolean)
                    )).sort().map(l => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Jamoa</label>
                  <select 
                    name="team_id" 
                    value={formData.team_id} 
                    onChange={handleChange}
                    disabled={!selectedLeague}
                  >
                    <option value="">Jamoani tanlang</option>
                    {teams.filter(t => t.league && t.league.split(',').map(s => s.trim()).includes(selectedLeague)).map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Millati</label>
                  <input name="citizenship" value={formData.citizenship} onChange={handleChange} placeholder="O'zbekiston" />
                </div>
                <div className="form-group">
                  <label>Bo'yi (SM)</label>
                  <input type="number" name="height" value={formData.height} onChange={handleChange} placeholder="178" />
                </div>
                <div className="form-group">
                  <label>Vazni (KG)</label>
                  <input type="number" name="weight" value={formData.weight} onChange={handleChange} placeholder="72" />
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#E1306C', fontWeight: '800' }}>
                    <InstagramIcon size={16} /> Instagram Username
                  </label>
                  <input 
                    name="instagram_username" 
                    value={formData.instagram_username} 
                    onChange={handleChange} 
                    placeholder="omankulofff" 
                    style={{ borderColor: 'rgba(225, 48, 108, 0.4)' }}
                  />
                  <small style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '4px', display: 'block' }}>
                    Faqat usernamening o'zini kiritasiz (masalan: omankulofff). Tizim avtomatik https://www.instagram.com/omankulofff/ deb saqlaydi.
                  </small>
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

      {/* 1:1 Image Cropper Modal */}
      {cropperRawImage && (
        <ImageCropperModal
          isOpen={!!cropperRawImage}
          imageSrc={cropperRawImage}
          onSave={handleCroppedSave}
          onClose={() => setCropperRawImage(null)}
          title="O'yinchi Rasmini 1:1 Formatda Qirqish"
        />
      )}

      {/* 3s Countdown Archive Confirm Modal */}
      <DeleteConfirmModal
        isOpen={showDeleteModal}
        title="O'yinchini arxivlash"
        message="O'yinchi asosiy ro'yxatdan yashirilib, Arxiv bo'limiga o'tkaziladi."
        onConfirm={handleConfirmDelete}
        onClose={() => setShowDeleteModal(false)}
      />

      <TransferClosedModal
        isOpen={showTransferClosedModal}
        onClose={() => setShowTransferClosedModal(false)}
      />
    </>
  );
};

export default PlayerModal;
