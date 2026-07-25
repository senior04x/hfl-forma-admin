import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useOrg } from '../context/OrgContext';
import { Settings as SettingsIcon, KeyRound, Mail, Check, AlertCircle, Trophy, Plus, Users, Send, X, ShieldAlert } from 'lucide-react';
import './Settings.css';

const Settings = () => {
  const { currentOrg, orgId, adminRole } = useOrg();
  const [userEmail, setUserEmail] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Leagues state
  const [leagues, setLeagues] = useState([]);
  const [otherOrgs, setOtherOrgs] = useState([]);
  const [leagueName, setLeagueName] = useState('');
  const [leagueLogo, setLeagueLogo] = useState('');
  const [isJunior, setIsJunior] = useState(false);
  const [creatingLeague, setCreatingLeague] = useState(false);

  // Collab modal / action state
  const [selectedLeagueForCollab, setSelectedLeagueForCollab] = useState(null);
  const [targetOrgId, setTargetOrgId] = useState('');
  const [sendingCollab, setSendingCollab] = useState(false);
  const [incomingCollabs, setIncomingCollabs] = useState([]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserEmail(user.email || '');
        setNewEmail(user.email || '');
      }
    });
    fetchLeaguesAndOrgs();
  }, [orgId]);

  const fetchLeaguesAndOrgs = async () => {
    try {
      // 1. Fetch own leagues
      const { data: ownLeagues } = await supabase
        .from('leagues')
        .select('*')
        .eq('organization_id', orgId)
        .order('id');
      setLeagues(ownLeagues || []);

      // 2. Fetch other organizations (for collab target selection)
      const { data: orgs } = await supabase
        .from('organizations')
        .select('id, name, slug, logo_url')
        .neq('id', orgId);
      setOtherOrgs(orgs || []);

      // 3. Fetch incoming collab requests
      const { data: collabs } = await supabase
        .from('league_collabs')
        .select(`
          *,
          league:league_id (*),
          sender_org:sender_org_id (id, name, logo_url)
        `)
        .eq('receiver_org_id', orgId)
        .order('created_at', { ascending: false });

      setIncomingCollabs(collabs || []);
    } catch (err) {
      console.error('Error fetching leagues/collabs:', err);
    }
  };

  const handleCreateLeague = async (e) => {
    e.preventDefault();
    if (!leagueName.trim()) return;
    setCreatingLeague(true);
    setMessage({ type: '', text: '' });

    try {
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
      fetchLeaguesAndOrgs();
    } catch (err) {
      setMessage({ type: 'error', text: 'Liga yaratishda xato: ' + err.message });
    } finally {
      setCreatingLeague(false);
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
                  <button className="btn-accept" onClick={() => handleRespondCollab(collab.id, 'accepted')}>
                    <Check size={14} /> Qabul qilish
                  </button>
                  <button className="btn-reject" onClick={() => handleRespondCollab(collab.id, 'rejected')}>
                    <X size={14} /> Rad etish
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

          <form onSubmit={handleCreateLeague} className="create-league-form">
            <div className="form-row">
              <div className="settings-form-group flex-2">
                <label>Yangi Liga Nomi</label>
                <input
                  type="text"
                  placeholder="Masalan: Farg'ona Super Liga"
                  value={leagueName}
                  onChange={e => setLeagueName(e.target.value)}
                  required
                />
              </div>
              <div className="settings-form-group flex-2">
                <label>Liga Logosi URL (ixtiyoriy)</label>
                <input
                  type="text"
                  placeholder="https://example.com/league-logo.png"
                  value={leagueLogo}
                  onChange={e => setLeagueLogo(e.target.value)}
                />
              </div>
              <div className="settings-form-group checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={isJunior}
                    onChange={e => setIsJunior(e.target.checked)}
                  />
                  <span>Junior (U-14)</span>
                </label>
              </div>
              <button type="submit" className="settings-btn settings-btn-primary add-league-btn" disabled={creatingLeague}>
                <Plus size={16} /> {creatingLeague ? 'Qo\'shilmoqda...' : 'Liga qo\'shish'}
              </button>
            </div>
          </form>

          {/* Current Leagues List */}
          <div className="leagues-list-container">
            <h3>Mavjud Ligalar ({leagues.length})</h3>
            {leagues.length === 0 ? (
              <p className="no-data-text">Hali ligalar qo'shilmagan.</p>
            ) : (
              <div className="leagues-grid">
                {leagues.map(l => (
                  <div key={l.id} className="league-card">
                    <div className="league-card-header">
                      <div className="league-icon">
                        {l.logo_url ? <img src={l.logo_url} alt={l.name} /> : <Trophy size={20} />}
                      </div>
                      <div>
                        <h4 className="league-title">{l.name}</h4>
                        {l.is_junior && <span className="junior-badge">JUNIOR U-14</span>}
                      </div>
                    </div>
                    <div className="league-card-actions">
                      <button
                        className="btn-collab"
                        onClick={() => setSelectedLeagueForCollab(l)}
                        title="Boshqa tashkilotga sheriklik taklifi yuborish"
                      >
                        <Send size={14} /> Sherikchilik (Collab)
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Profile Info Card */}
        <div className="settings-card">
          <div className="settings-card-header">
            <Mail size={20} />
            <h2>Email manzili</h2>
          </div>
          <form onSubmit={handleUpdateEmail}>
            <div className="settings-form-group">
              <label>Hozirgi Email</label>
              <input
                type="email"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="settings-btn" disabled={loading || newEmail === userEmail}>
              Emailni yangilash
            </button>
          </form>
        </div>

        {/* Change Password Card */}
        <div className="settings-card">
          <div className="settings-card-header">
            <KeyRound size={20} />
            <h2>Parolni almashtirish</h2>
          </div>
          <form onSubmit={handleUpdatePassword}>
            <div className="settings-form-group">
              <label>Yangi Parol</label>
              <input
                type="password"
                placeholder="Kamida 6 belgi"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
              />
            </div>
            <div className="settings-form-group">
              <label>Parolni takrorlang</label>
              <input
                type="password"
                placeholder="Yangi parolni takrorlang"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="settings-btn settings-btn-primary" disabled={loading}>
              Parolni saqlash
            </button>
          </form>
        </div>
      </div>

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
    </div>
  );
};

export default Settings;
