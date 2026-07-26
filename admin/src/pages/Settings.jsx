import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useOrg } from '../context/OrgContext';
import { Settings as SettingsIcon, KeyRound, Mail, Check, AlertCircle, Trophy, Plus, Users, Send, X, ShieldAlert, Building2, Pencil, Trash2, Save, Crop } from 'lucide-react';
import ImageCropperModal from '../components/ImageCropperModal';
import './Settings.css';

const Settings = () => {
  const { currentOrg, orgId, adminRole, updateCurrentOrg } = useOrg();
  const [userEmail, setUserEmail] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [orgLogo, setOrgLogo] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });

  // Org Logo Cropper
  const orgFileInputRef = useRef(null);
  const [orgCropperRawImage, setOrgCropperRawImage] = useState(null);
  const [uploadingOrgLogo, setUploadingOrgLogo] = useState(false);

  // League Logo Cropper
  const leagueFileInputRef = useRef(null);
  const [leagueCropperRawImage, setLeagueCropperRawImage] = useState(null);
  const [uploadingLeagueLogo, setUploadingLeagueLogo] = useState(false);

  useEffect(() => {
    if (currentOrg) {
      setOrgLogo(currentOrg.logo_url || '');
    }
  }, [currentOrg]);

  const handleOrgFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setOrgCropperRawImage(reader.result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleOrgCroppedSave = async (croppedBase64) => {
    setUploadingOrgLogo(true);
    setOrgCropperRawImage(null);
    try {
      const response = await fetch(croppedBase64);
      const blob = await response.blob();
      const fileName = `org_logo_${orgId}_${Date.now()}.png`;

      const { error } = await supabase.storage.from('player-photos').upload(fileName, blob, {
        contentType: 'image/png',
        upsert: true
      });
      if (error) throw error;

      const { data } = supabase.storage.from('player-photos').getPublicUrl(fileName);
      const publicUrl = data.publicUrl;

      const { error: dbErr } = await supabase
        .from('organizations')
        .update({ logo_url: publicUrl })
        .eq('id', orgId);

      if (dbErr) throw dbErr;

      setOrgLogo(publicUrl);
      updateCurrentOrg({ logo_url: publicUrl });
      setMessage({ type: 'success', text: 'Tashkilot logotipi muvaffaqiyatli saqlandi!' });
    } catch (err) {
      console.error('Org logo upload error:', err);
      setMessage({ type: 'error', text: 'Logotip yuklashda xatolik: ' + (err.message || '') });
    } finally {
      setUploadingOrgLogo(false);
    }
  };

  const handleLeagueFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setLeagueCropperRawImage(reader.result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleLeagueCroppedSave = async (croppedBase64) => {
    setUploadingLeagueLogo(true);
    setLeagueCropperRawImage(null);
    try {
      const response = await fetch(croppedBase64);
      const blob = await response.blob();
      const fileName = `league_logo_${Date.now()}_${Math.random().toString(36).substring(7)}.png`;

      const { error } = await supabase.storage.from('player-photos').upload(fileName, blob, {
        contentType: 'image/png',
        upsert: true
      });
      if (error) throw error;

      const { data } = supabase.storage.from('player-photos').getPublicUrl(fileName);
      setLeagueLogo(data.publicUrl);
    } catch (err) {
      console.error('League logo upload error:', err);
      setMessage({ type: 'error', text: 'Liga logotipini yuklashda xatolik: ' + (err.message || '') });
    } finally {
      setUploadingLeagueLogo(false);
    }
  };

  // Leagues state
  const [leagues, setLeagues] = useState([]);
  const [otherOrgs, setOtherOrgs] = useState([]);
  const [leagueName, setLeagueName] = useState('');
  const [leagueLogo, setLeagueLogo] = useState('');
  const [isJunior, setIsJunior] = useState(false);
  const [creatingLeague, setCreatingLeague] = useState(false);

  // League Edit/Delete state
  const [editingLeague, setEditingLeague] = useState(null);

  // Collab modal / action state
  const [selectedLeagueForCollab, setSelectedLeagueForCollab] = useState(null);
  const [targetOrgId, setTargetOrgId] = useState('');
  const [sendingCollab, setSendingCollab] = useState(false);
  const [incomingCollabs, setIncomingCollabs] = useState([]);
  const [allCollabs, setAllCollabs] = useState([]);
  const [collabToDisconnect, setCollabToDisconnect] = useState(null);
  const [disconnectingCollab, setDisconnectingCollab] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAllSettingsData();
  }, [orgId]);

  const loadAllSettingsData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchUserData(),
        fetchLeaguesAndOrgs()
      ]);
    } catch (err) {
      console.error('Error loading settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setUserEmail(user.email || '');
      setNewEmail(user.email || '');
    }
  };

  const fetchLeaguesAndOrgs = async () => {
    try {
      const { data: ownLeagues } = await supabase
        .from('leagues')
        .select('*')
        .eq('organization_id', orgId)
        .order('id', { ascending: true });

      setLeagues(ownLeagues || []);

      const { data: orgs } = await supabase
        .from('organizations')
        .select('id, name, slug, logo_url')
        .neq('id', orgId);
      setOtherOrgs(orgs || []);

      const { data: collabs } = await supabase
        .from('league_collabs')
        .select(`
          *,
          league:league_id (*),
          sender_org:sender_org_id (id, name, logo_url),
          receiver_org:receiver_org_id (id, name, logo_url)
        `)
        .or(`receiver_org_id.eq.${orgId},sender_org_id.eq.${orgId}`)
        .order('created_at', { ascending: false });

      if (collabs) {
        setAllCollabs(collabs);
        setIncomingCollabs(collabs.filter(c => c.receiver_org_id === orgId));
      } else {
        setAllCollabs([]);
        setIncomingCollabs([]);
      }

      // Merge own leagues and accepted collab leagues
      const acceptedCollabs = (collabs || []).filter(c => c.status === 'accepted');
      const collabLeagues = acceptedCollabs
        .map(c => c.league)
        .filter(l => l && l.organization_id !== orgId);

      const allLeaguesMap = new Map();
      (ownLeagues || []).forEach(l => allLeaguesMap.set(l.id, { ...l, isOwn: true }));
      collabLeagues.forEach(l => {
        if (!allLeaguesMap.has(l.id)) {
          allLeaguesMap.set(l.id, { ...l, isOwn: false, isCollab: true });
        }
      });

      setLeagues(Array.from(allLeaguesMap.values()));
    } catch (err) {
      console.error('Error fetching leagues/collabs:', err);
    }
  };

  const startEditLeague = (league) => {
    setEditingLeague(league);
    setLeagueName(league.name);
    setLeagueLogo(league.logo_url || '');
    setIsJunior(!!league.is_junior);
    setMessage({ type: '', text: '' });
  };

  const cancelEditLeague = () => {
    setEditingLeague(null);
    setLeagueName('');
    setLeagueLogo('');
    setIsJunior(false);
  };

  const handleSaveLeague = async (e) => {
    e.preventDefault();
    if (!leagueName.trim()) return;
    setCreatingLeague(true);
    setMessage({ type: '', text: '' });

    try {
      if (editingLeague) {
        const oldName = editingLeague.name;
        const newName = leagueName.trim();

        const { error } = await supabase
          .from('leagues')
          .update({
            name: newName,
            logo_url: leagueLogo.trim() || null,
            is_junior: isJunior
          })
          .eq('id', editingLeague.id);

        if (error) throw error;

        if (oldName !== newName) {
          await supabase.from('teams').update({ league: newName }).eq('league', oldName).eq('organization_id', orgId);
          await supabase.from('matches').update({ league: newName }).eq('league', oldName).eq('organization_id', orgId);
          await supabase.from('applications').update({ league: newName }).eq('league', oldName).eq('organization_id', orgId);
        }

        setMessage({ type: 'success', text: 'Liga ma\'lumotlari muvaffaqiyatli yangilandi!' });
        cancelEditLeague();
      } else {
        const { error } = await supabase.from('leagues').insert({
          name: leagueName.trim(),
          logo_url: leagueLogo.trim() || null,
          organization_id: orgId,
          is_junior: isJunior,
        });

        if (error) throw error;

        setMessage({ type: 'success', text: `"${leagueName}" ligasi muvaffaqiyatli yaratildi!` });
        setLeagueName('');
        setLeagueLogo('');
        setIsJunior(false);
      }
      fetchLeaguesAndOrgs();
    } catch (err) {
      setMessage({ type: 'error', text: 'Liga saqlashda xato: ' + err.message });
    } finally {
      setCreatingLeague(false);
    }
  };

  const handleDeleteLeague = async (league) => {
    if (!window.confirm(`"${league.name}" ligasini o'chirmoqchimisiz? Ushbu ligaga tegishli collab sherikchiliklari ham o'chib ketadi.`)) {
      return;
    }
    setMessage({ type: '', text: '' });
    try {
      await supabase.from('league_collabs').delete().eq('league_id', league.id);
      const { error } = await supabase.from('leagues').delete().eq('id', league.id);
      if (error) throw error;

      setMessage({ type: 'success', text: `"${league.name}" ligasi o'chirildi.` });
      fetchLeaguesAndOrgs();
    } catch (err) {
      setMessage({ type: 'error', text: 'O\'chirishda xato: ' + err.message });
    }
  };

  const handleSendCollab = async (e) => {
    e.preventDefault();
    if (!selectedLeagueForCollab || !targetOrgId) return;
    setSendingCollab(true);

    try {
      const { error } = await supabase.from('league_collabs').insert({
        league_id: selectedLeagueForCollab.id,
        sender_org_id: orgId,
        receiver_org_id: parseInt(targetOrgId),
        status: 'pending',
      });

      if (error) throw error;

      setMessage({ type: 'success', text: 'Sherikchilik taklifi muvaffaqiyatli yuborildi!' });
      setSelectedLeagueForCollab(null);
      setTargetOrgId('');
      fetchLeaguesAndOrgs();
    } catch (err) {
      setMessage({ type: 'error', text: 'Taklif yuborishda xato: ' + err.message });
    } finally {
      setSendingCollab(false);
    }
  };

  const handleRespondCollab = async (collabId, status) => {
    try {
      const { error } = await supabase
        .from('league_collabs')
        .update({ status })
        .eq('id', collabId);

      if (error) throw error;

      setMessage({ type: 'success', text: status === 'accepted' ? 'Sheriklik taklifi qabul qilindi!' : 'Taklif rad etildi.' });
      fetchLeaguesAndOrgs();
    } catch (err) {
      setMessage({ type: 'error', text: 'Xatolik: ' + err.message });
    }
  };

  const handleConfirmDisconnectCollab = async () => {
    if (!collabToDisconnect) return;
    setDisconnectingCollab(true);
    try {
      const { error } = await supabase
        .from('league_collabs')
        .delete()
        .eq('id', collabToDisconnect.id);

      if (error) throw error;

      setMessage({ type: 'success', text: `"${collabToDisconnect.leagueName}" ligasi bo'yicha sheriklik bitimi muvaffaqiyatli uzildi!` });
      setCollabToDisconnect(null);
      fetchLeaguesAndOrgs();
    } catch (err) {
      setMessage({ type: 'error', text: 'Sheriklikni uzishda xatolik: ' + err.message });
    } finally {
      setDisconnectingCollab(false);
    }
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });

    if (!newPassword) {
      setMessage({ type: 'error', text: 'Yangi parolni kiriting!' });
      return;
    }
    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: 'Parol kamida 6 ta belgidan iborat bo\'lishi kerak!' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Parollar mos kelmadi!' });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setMessage({ type: 'success', text: 'Parolingiz muvaffaqiyatli almashtirildi!' });
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setMessage({ type: 'error', text: 'Xato: ' + err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateEmail = async (e) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });

    if (!newEmail || newEmail === userEmail) return;

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail });
      if (error) throw error;

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('admin_users').update({ email: newEmail }).eq('id', user.id);
      }

      setMessage({ type: 'success', text: 'Email yangilandi! Tasdiqlash havolasi yuborildi.' });
      setUserEmail(newEmail);
    } catch (err) {
      setMessage({ type: 'error', text: 'Xato: ' + err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="settings-page">
      <div className="settings-header">
        <SettingsIcon size={28} />
        <div>
          <h1>Hisob va Ligalar Sozlamalari</h1>
          <p>{currentOrg?.name} ({adminRole === 'super_admin' ? 'Super Admin' : 'Tashkilot Admini'})</p>
        </div>
      </div>

      {message.text && (
        <div className={`settings-alert ${message.type}`}>
          {message.type === 'success' ? <Check size={18} /> : <AlertCircle size={18} />}
          <span>{message.text}</span>
        </div>
      )}

      {loading ? (
        <>
          {/* Settings Grid Skeleton (1:1 identical to real cards) */}
          <div className="settings-grid">
            <div className="settings-card full-width">
              <div className="settings-card-header">
                <div className="skeleton-box" style={{ width: '20px', height: '20px', borderRadius: '4px' }}></div>
                <div className="skeleton-box" style={{ width: '220px', height: '20px' }}></div>
              </div>

              <div className="create-league-form">
                <div className="form-row">
                  <div className="settings-form-group flex-2">
                    <div className="skeleton-box" style={{ width: '120px', height: '14px', marginBottom: '8px' }}></div>
                    <div className="skeleton-box" style={{ width: '100%', height: '42px', borderRadius: '10px' }}></div>
                  </div>
                  <div className="settings-form-group flex-2">
                    <div className="skeleton-box" style={{ width: '90px', height: '14px', marginBottom: '8px' }}></div>
                    <div className="skeleton-box" style={{ width: '160px', height: '38px', borderRadius: '10px' }}></div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                    <div className="skeleton-box" style={{ width: '120px', height: '42px', borderRadius: '10px' }}></div>
                  </div>
                </div>
              </div>

              <div className="leagues-list-container">
                <div className="skeleton-box" style={{ width: '140px', height: '14px', marginBottom: '14px' }}></div>
                <div className="leagues-grid">
                  <div className="league-card">
                    <div className="league-card-header">
                      <div className="skeleton-box" style={{ width: '36px', height: '36px', borderRadius: '50%' }}></div>
                      <div className="skeleton-box" style={{ width: '110px', height: '16px' }}></div>
                    </div>
                    <div className="league-card-actions">
                      <div className="skeleton-box" style={{ width: '65px', height: '32px', borderRadius: '8px' }}></div>
                      <div className="skeleton-box" style={{ width: '32px', height: '32px', borderRadius: '8px' }}></div>
                      <div className="skeleton-box" style={{ width: '32px', height: '32px', borderRadius: '8px' }}></div>
                    </div>
                  </div>
                  <div className="league-card">
                    <div className="league-card-header">
                      <div className="skeleton-box" style={{ width: '36px', height: '36px', borderRadius: '50%' }}></div>
                      <div className="skeleton-box" style={{ width: '130px', height: '16px' }}></div>
                    </div>
                    <div className="league-card-actions">
                      <div className="skeleton-box" style={{ width: '65px', height: '32px', borderRadius: '8px' }}></div>
                      <div className="skeleton-box" style={{ width: '32px', height: '32px', borderRadius: '8px' }}></div>
                      <div className="skeleton-box" style={{ width: '32px', height: '32px', borderRadius: '8px' }}></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="settings-card">
              <div className="settings-card-header">
                <div className="skeleton-box" style={{ width: '20px', height: '20px', borderRadius: '4px' }}></div>
                <div className="skeleton-box" style={{ width: '160px', height: '20px' }}></div>
              </div>
              <div className="settings-org-logo-preview">
                <div className="skeleton-box" style={{ width: '90px', height: '90px', borderRadius: '16px' }}></div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <div className="skeleton-box" style={{ width: '180px', height: '42px', borderRadius: '10px' }}></div>
              </div>
            </div>

            <div className="settings-card">
              <div className="settings-card-header">
                <div className="skeleton-box" style={{ width: '20px', height: '20px', borderRadius: '4px' }}></div>
                <div className="skeleton-box" style={{ width: '150px', height: '20px' }}></div>
              </div>
              <div className="settings-form">
                <div className="settings-form-group">
                  <div className="skeleton-box" style={{ width: '100px', height: '14px', marginBottom: '8px' }}></div>
                  <div className="skeleton-box" style={{ width: '100%', height: '42px', borderRadius: '10px' }}></div>
                </div>
                <div className="skeleton-box" style={{ width: '130px', height: '40px', borderRadius: '10px', marginTop: '12px' }}></div>
              </div>

              <div className="settings-divider"></div>

              <div className="settings-card-header" style={{ border: 'none', padding: '0', marginBottom: '16px' }}>
                <div className="skeleton-box" style={{ width: '20px', height: '20px', borderRadius: '4px' }}></div>
                <div className="skeleton-box" style={{ width: '160px', height: '20px' }}></div>
              </div>
              <div className="settings-form">
                <div className="settings-form-group">
                  <div className="skeleton-box" style={{ width: '90px', height: '14px', marginBottom: '8px' }}></div>
                  <div className="skeleton-box" style={{ width: '100%', height: '42px', borderRadius: '10px' }}></div>
                </div>
                <div className="settings-form-group">
                  <div className="skeleton-box" style={{ width: '110px', height: '14px', marginBottom: '8px' }}></div>
                  <div className="skeleton-box" style={{ width: '100%', height: '42px', borderRadius: '10px' }}></div>
                </div>
                <div className="skeleton-box" style={{ width: '130px', height: '40px', borderRadius: '10px', marginTop: '12px' }}></div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Incoming Collab Requests Banner */}
          {incomingCollabs.filter(c => c.status === 'pending').length > 0 && (
            <div className="collab-incoming-banner">
              <div className="collab-incoming-header">
                <Users size={20} />
                <div>
                  <h3>Yangi Sheriklik (Collab) Takliflari</h3>
                  <p>Boshqa tashkilotlar sizga ligani birga olib borish taklifini yuborgan:</p>
                </div>
              </div>
              <div className="collab-incoming-list">
                {incomingCollabs.filter(c => c.status === 'pending').map(collab => (
                  <div key={collab.id} className="collab-incoming-item">
                    <div className="collab-incoming-info">
                      <strong>{collab.sender_org?.name}</strong> tashkiloti <span>"{collab.league?.name}"</span> ligasini birgalikda (co-host) olib borishni taklif qilmoqda.
                    </div>
                    <div className="collab-incoming-actions">
                      <button className="btn-accept" onClick={() => handleRespondCollab(collab.id, 'accepted')} title="Qabul qilish">
                        <Check size={18} color="#0b0e17" />
                      </button>
                      <button className="btn-reject" onClick={() => handleRespondCollab(collab.id, 'rejected')} title="Rad etish">
                        <X size={18} color="#ffffff" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="settings-grid">
            {/* Dynamic League Management Card */}
            <div className="settings-card full-width">
              <div className="settings-card-header">
                <Trophy size={20} />
                <h2>Tashkilot Ligalari Boshqaruvi</h2>
              </div>

              <form onSubmit={handleSaveLeague} className="create-league-form">
                <div className="form-row">
                  <div className="settings-form-group flex-2">
                    <label>{editingLeague ? 'Liga Nominı Tahrirlash' : 'Yangi Liga Nomi'}</label>
                    <input
                      type="text"
                      placeholder="Masalan: Farg'ona Super Liga"
                      value={leagueName}
                      onChange={e => setLeagueName(e.target.value)}
                      required
                    />
                  </div>

                  {/* League Logo Crop Upload */}
                  <div className="settings-form-group flex-2">
                    <label>Liga Logosi</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
                      {leagueLogo && (
                        <img src={leagueLogo} alt="League Logo" style={{ width: '36px', height: '36px', borderRadius: '8px', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.2)', flexShrink: 0 }} />
                      )}
                      <button
                        type="button"
                        onClick={() => leagueFileInputRef.current?.click()}
                        disabled={uploadingLeagueLogo}
                        style={{
                          padding: '9px 14px',
                          background: 'rgba(0, 170, 255, 0.12)',
                          border: '1px solid rgba(0, 170, 255, 0.3)',
                          color: '#00aaff',
                          borderRadius: '10px',
                          fontWeight: '600',
                          fontSize: '13px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <Crop size={15} />
                        <span>{uploadingLeagueLogo ? 'Yuklanmoqda...' : (leagueLogo ? 'Almashtirish' : 'Logo tanlash (16:9 / Erkin)')}</span>
                      </button>

                      <input
                        ref={leagueFileInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={handleLeagueFileSelect}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                    <button type="submit" className="settings-btn settings-btn-primary add-league-btn" disabled={creatingLeague}>
                      {editingLeague ? <Save size={16} /> : <Plus size={16} />}
                      <span>{creatingLeague ? 'Saqlanmoqda...' : (editingLeague ? 'Saqlash' : 'Liga qo\'shish')}</span>
                    </button>
                    {editingLeague && (
                      <button type="button" className="settings-btn" onClick={cancelEditLeague}>
                        Bekor qilish
                      </button>
                    )}
                  </div>
                </div>
              </form>

              {/* Current Leagues List */}
              <div className="leagues-list-container">
                <h3>Mavjud Ligalar ({leagues.length})</h3>
                {leagues.length === 0 ? (
                  <p className="no-data-text">Hali ligalar qo'shilmagan.</p>
                ) : (
                  <div className="leagues-grid">
                    {leagues.map(l => {
                      const activeCollab = (allCollabs || []).find(c => c.league_id === l.id && c.status === 'accepted');
                      const partnerOrg = activeCollab 
                        ? (activeCollab.sender_org_id === orgId ? activeCollab.receiver_org : activeCollab.sender_org)
                        : null;

                      // Faqat ligani asl yaratgan/egasi bo'lgan tashkilot (owner) boshqaruv huquqiga ega
                      const isOwner = l.isOwn !== false && l.organization_id === orgId;

                      return (
                        <div key={l.id} className={`league-card ${editingLeague?.id === l.id ? 'editing' : ''}`}>
                          <div className="league-card-header">
                            <div className="league-icon">
                              {l.logo_url ? <img src={l.logo_url} alt={l.name} /> : <Trophy size={20} />}
                            </div>
                            <div>
                              <h4 className="league-title">{l.name}</h4>
                              {l.is_junior && <span className="junior-badge">JUNIOR U-14</span>}
                              {!isOwner && <span className="junior-badge" style={{ background: 'rgba(0, 255, 102, 0.15)', color: '#00ff66', marginLeft: '6px' }}>SHERIKLIK (CO-HOST)</span>}
                            </div>
                          </div>

                          {partnerOrg && (
                            <div className="league-collab-partner-badge">
                              <div className="partner-logo-box">
                                {partnerOrg.logo_url ? (
                                  <img src={partnerOrg.logo_url} alt={partnerOrg.name} />
                                ) : (
                                  <Building2 size={12} />
                                )}
                              </div>
                              <span className="partner-text">
                                Sherik: <strong>{partnerOrg.name}</strong>
                              </span>
                              {isOwner && activeCollab && (
                                <button
                                  type="button"
                                  className="btn-collab-disconnect"
                                  onClick={() => setCollabToDisconnect({ id: activeCollab.id, leagueName: l.name, partnerName: partnerOrg.name })}
                                  title="Sheriklikni uzish"
                                >
                                  <X size={14} />
                                </button>
                              )}
                            </div>
                          )}

                          <div className="league-card-actions">
                            {/* Faqat liga asl egasi hamkorligi bo'lmaganda collab yuborishi mumkin */}
                            {isOwner && !activeCollab && (
                              <button
                                className="btn-collab"
                                onClick={() => setSelectedLeagueForCollab(l)}
                                title="Boshqa tashkilotga sheriklik taklifi yuborish"
                              >
                                <Send size={13} /> Collab
                              </button>
                            )}

                            {isOwner && (
                              <>
                                <button
                                  className="btn-league-action btn-league-edit"
                                  onClick={() => startEditLeague(l)}
                                  title="Liga ma'lumotlarini tahrirlash"
                                >
                                  <Pencil size={14} />
                                </button>
                                <button
                                  className="btn-league-action btn-league-delete"
                                  onClick={() => handleDeleteLeague(l)}
                                  title="Liganı o'chirish"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Organization Logo Card */}
            <div className="settings-card">
              <div className="settings-card-header">
                <Building2 size={20} />
                <h2>Tashkilot Logotipi</h2>
              </div>
              <div className="settings-org-logo-preview">
                {orgLogo ? (
                  <img src={orgLogo} alt={currentOrg?.name} />
                ) : (
                  <div className="no-logo-placeholder">
                    <Building2 size={24} />
                    <span>Logo yo'q</span>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => orgFileInputRef.current?.click()}
                  disabled={uploadingOrgLogo}
                  style={{
                    padding: '10px 18px',
                    background: 'rgba(0, 255, 102, 0.12)',
                    border: '1px solid rgba(0, 255, 102, 0.3)',
                    color: '#00ff66',
                    borderRadius: '10px',
                    fontWeight: '700',
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Crop size={16} />
                  <span>{uploadingOrgLogo ? 'Yuklanmoqda...' : (orgLogo ? 'Logotipni Almashtirish' : 'Logo Yuklash va Qirqish')}</span>
                </button>

                <input
                  ref={orgFileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleOrgFileSelect}
                />
              </div>
            </div>

            {/* Account Settings */}
            <div className="settings-card">
              <div className="settings-card-header">
                <Mail size={20} />
                <h2>Hisob Sozlamalari</h2>
              </div>
              <form onSubmit={handleUpdateEmail} className="settings-form">
                <div className="settings-form-group">
                  <label>Email Manzili</label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    placeholder="yangi@email.com"
                    required
                  />
                </div>
                <button type="submit" className="settings-btn settings-btn-primary" disabled={loading || newEmail === userEmail}>
                  Emailni Saqlash
                </button>
              </form>

              <div className="settings-divider"></div>

              <div className="settings-card-header" style={{ marginBottom: '16px', border: 'none', padding: 0 }}>
                <KeyRound size={20} />
                <h2>Parolni O'zgartirish</h2>
              </div>
              <form onSubmit={handleUpdatePassword} className="settings-form">
                <div className="settings-form-group">
                  <label>Yangi Parol</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Kamida 6 ta belgi"
                  />
                </div>
                <div className="settings-form-group">
                  <label>Parolni Tasdiqlang</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Parolni qayta kiriting"
                  />
                </div>
                <button type="submit" className="settings-btn settings-btn-primary" disabled={loading || !newPassword}>
                  Parolni Saqlash
                </button>
              </form>
            </div>
          </div>
        </>
      )}

      {/* Collab Request Modal */}
      {selectedLeagueForCollab && (
        <div className="settings-modal-overlay" onClick={() => setSelectedLeagueForCollab(null)}>
          <div className="settings-modal" onClick={e => e.stopPropagation()}>
            <div className="settings-modal-header">
              <h2>Sherikchilik Taklifi Yuborish</h2>
              <button className="close-btn" onClick={() => setSelectedLeagueForCollab(null)}><X size={18} /></button>
            </div>
            <form onSubmit={handleSendCollab} className="settings-modal-body">
              <p><strong>"{selectedLeagueForCollab.name}"</strong> ligasini qaysi tashkilot bilan birga olib borasiz (co-host)?</p>
              <div className="settings-form-group">
                <label>Hamkor Tashkilotni Tanlang</label>
                <select
                  value={targetOrgId}
                  onChange={e => setTargetOrgId(e.target.value)}
                  required
                >
                  <option value="">-- Tashkilotni tanlang --</option>
                  {otherOrgs.map(org => (
                    <option key={org.id} value={org.id}>{org.name}</option>
                  ))}
                </select>
              </div>
              <div className="settings-modal-footer">
                <button type="button" className="btn-cancel" onClick={() => setSelectedLeagueForCollab(null)}>Bekor qilish</button>
                <button type="submit" className="settings-btn settings-btn-primary" disabled={sendingCollab || !targetOrgId}>
                  <Send size={14} /> {sendingCollab ? 'Yuborilmoqda...' : 'Taklifni yuborish'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Org Logo Cropper Modal */}
      {orgCropperRawImage && (
        <ImageCropperModal
          isOpen={!!orgCropperRawImage}
          imageSrc={orgCropperRawImage}
          onClose={() => setOrgCropperRawImage(null)}
          onSave={handleOrgCroppedSave}
          title="Tashkilot Logotipini 1:1 Qirqish"
        />
      )}

      {/* League Logo Cropper Modal */}
      {leagueCropperRawImage && (
        <ImageCropperModal
          isOpen={!!leagueCropperRawImage}
          imageSrc={leagueCropperRawImage}
          onClose={() => setLeagueCropperRawImage(null)}
          onSave={handleLeagueCroppedSave}
          title="Liga Logotipini Qirqish"
          aspect={16 / 9}
          showAspectSelector={true}
        />
      )}

      {/* Collab Disconnect Confirmation Modal */}
      {collabToDisconnect && (
        <div className="settings-modal-overlay" onClick={() => setCollabToDisconnect(null)}>
          <div className="settings-modal disconnect-confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="disconnect-modal-icon-box">
              <ShieldAlert size={36} color="#ff3b30" />
            </div>
            <h2 className="disconnect-modal-title">Sheriklikni Uzish</h2>
            <p className="disconnect-modal-desc">
              Siz rostdan ham <strong>"{collabToDisconnect.leagueName}"</strong> ligasi bo'yicha <span>{collabToDisconnect.partnerName}</span> tashkiloti bilan tuzilgan sheriklikni (co-host) bekor qilmoqchimisiz?
            </p>
            <div className="disconnect-modal-actions">
              <button
                type="button"
                className="btn-disconnect-cancel"
                onClick={() => setCollabToDisconnect(null)}
                disabled={disconnectingCollab}
              >
                Yo'q, bekor qilish
              </button>
              <button
                type="button"
                className="btn-disconnect-confirm"
                onClick={handleConfirmDisconnectCollab}
                disabled={disconnectingCollab}
              >
                {disconnectingCollab ? 'Uzilmoqda...' : 'Ha, sheriklikni uzish'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
