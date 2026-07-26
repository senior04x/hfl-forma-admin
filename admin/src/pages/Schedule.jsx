import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useOrg } from '../context/OrgContext';
import { getActiveOrgLeagues, applyOrgAndCollabFilter } from '../utils/leagueUtils';
import { Calendar, Plus, MapPin, Clock, Video, Trash2, Download, Filter, ChevronDown, Trophy, Layers, Image as ImageIcon, Upload, Pencil } from 'lucide-react';
import html2canvas from 'html2canvas';
import ImageCropperModal from '../components/ImageCropperModal';
import './Schedule.css';

const Schedule = () => {
  const navigate = useNavigate();
  const [matches, setMatches] = useState([]);
  const [teams, setTeams] = useState([]);
  const [activeLeagues, setActiveLeagues] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMatch, setEditingMatch] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all'); 
  const { currentOrg, orgId } = useOrg();

  const [selectedLeague, setSelectedLeague] = useState('');
  const [homeTeamId, setHomeTeamId] = useState('');
  const [awayTeamId, setAwayTeamId] = useState('');
  const [matchDate, setMatchDate] = useState('');
  const [matchTime, setMatchTime] = useState('');
  const [location, setLocation] = useState('');
  const [stadiumName, setStadiumName] = useState('');
  const [youtubeLink, setYoutubeLink] = useState('');
  const [matchRound, setMatchRound] = useState('');

  const [exportLeague, setExportLeague] = useState('');
  const [exportRound, setExportRound] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(true);
  const exportRef = useRef(null);

  const [scheduleBanner, setScheduleBanner] = useState('');
  const [cropperRawImage, setCropperRawImage] = useState(null);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const bannerFileInputRef = useRef(null);
  const [mainSponsor, setMainSponsor] = useState(null);
  const [selectedSponsors, setSelectedSponsors] = useState([]);

  useEffect(() => {
    fetchMainSponsor();
    fetchSelectedSponsors();
    loadLeaguesAndData();
  }, [orgId]);

  const fetchSelectedSponsors = async () => {
    try {
      const savedSelected = localStorage.getItem(`hfl_selectedSponsors_${orgId}`);
      if (savedSelected) {
        setSelectedSponsors(JSON.parse(savedSelected));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchMainSponsor = async () => {
    try {
      const saved = localStorage.getItem(`hfl_main_sponsor_${orgId}`);
      if (saved) setMainSponsor(JSON.parse(saved));

      try {
        let query = supabase.from('sponsors').select('*').eq('is_main', true);
        if (orgId) {
          query = query.or(`organization_id.eq.${orgId},organization_id.is.null`);
        }
        const { data } = await query.limit(1);
        if (data && data.length > 0) {
          setMainSponsor(data[0]);
          localStorage.setItem(`hfl_main_sponsor_${orgId}`, JSON.stringify(data[0]));
        }
      } catch (e) {}
    } catch (e) {
      console.error(e);
    }
  };

  const mainSponsorLogo = mainSponsor?.logo_url || '';

  const loadLeaguesAndData = async () => {
    setLoading(true);
    try {
      const fetchedLeagues = await getActiveOrgLeagues(orgId);
      setActiveLeagues(fetchedLeagues);
      if (fetchedLeagues.length > 0) {
        setExportLeague(fetchedLeagues[0].name);
      }
      await Promise.all([
        fetchTeams(fetchedLeagues),
        fetchMatches(fetchedLeagues)
      ]);
    } catch (err) {
      console.error('Error loading schedule:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!exportLeague || !activeLeagues.length) return;
    const currentLeagueObj = activeLeagues.find(l => l.name === exportLeague);
    if (!currentLeagueObj) return;

    const dbUrl = currentLeagueObj.schedule_banner_url || currentLeagueObj.banner_url;
    if (dbUrl) {
      setScheduleBanner(dbUrl);
    } else {
      const localKey = `hfl_schedule_banner_${orgId}_${currentLeagueObj.id}`;
      const savedLocal = localStorage.getItem(localKey);
      setScheduleBanner(savedLocal || '');
    }
  }, [exportLeague, activeLeagues, orgId]);

  useEffect(() => {
    const leagueMatches = matches.filter(m => m.league === exportLeague && m.round);
    if (leagueMatches.length > 0) {
      const maxR = Math.max(...leagueMatches.map(m => Number(m.round)));
      setExportRound(maxR.toString());
    } else {
      setExportRound('');
    }
  }, [matches, exportLeague]);

  const handleBannerFileSelect = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCropperRawImage(reader.result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleCroppedBannerSave = async (croppedDataUrl) => {
    if (!croppedDataUrl) return;
    const currentLeagueObj = activeLeagues.find(l => l.name === exportLeague);
    if (!currentLeagueObj) return;

    setUploadingBanner(true);
    try {
      setScheduleBanner(croppedDataUrl);

      const localKey = `hfl_schedule_banner_${orgId}_${currentLeagueObj.id}`;
      localStorage.setItem(localKey, croppedDataUrl);

      try {
        await supabase
          .from('leagues')
          .update({ schedule_banner_url: croppedDataUrl })
          .eq('id', currentLeagueObj.id);
      } catch (e) {}

    } catch (err) {
      console.error('Error saving schedule banner:', err);
    } finally {
      setUploadingBanner(false);
      setCropperRawImage(null);
    }
  };

  const handleDeleteBanner = async () => {
    const currentLeagueObj = activeLeagues.find(l => l.name === exportLeague);
    if (!currentLeagueObj) return;
    if (!window.confirm(`"${exportLeague}" ligasi uchun 1x1 orqa fon rasmini o'chirmoqchimisiz?`)) return;

    setScheduleBanner('');
    const localKey = `hfl_schedule_banner_${orgId}_${currentLeagueObj.id}`;
    localStorage.removeItem(localKey);

    try {
      await supabase
        .from('leagues')
        .update({ schedule_banner_url: null })
        .eq('id', currentLeagueObj.id);
    } catch (e) {}
  };

  const handleExport = async () => {
    if (!exportRef.current || isExporting) return;
    if (!exportLeague || !exportRound) {
      alert("Iltimos eksport qilish uchun liga va turni tanlang.");
      return;
    }
    setIsExporting(true);
    try {
      const canvas = await html2canvas(exportRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: null
      });
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `jadval_${exportLeague}_${exportRound}_tur.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error(err);
      alert("Xatolik yuz berdi");
    } finally {
      setIsExporting(false);
    }
  };

  const fetchTeams = async (leaguesList = activeLeagues) => {
    let query = supabase.from('teams').select('id, name, logo_url, league').eq('status', 'approved');
    query = applyOrgAndCollabFilter(query, orgId, leaguesList);
    const { data } = await query;
    if (data) setTeams(data);
  };

  const fetchMatches = async (leaguesList = activeLeagues) => {
    let query = supabase
      .from('matches')
      .select(`
        *,
        home_team:home_team_id (id, name, logo_url),
        away_team:away_team_id (id, name, logo_url)
      `)
      .order('match_date', { ascending: true })
      .order('match_time', { ascending: true });

    query = applyOrgAndCollabFilter(query, orgId, leaguesList);

    const { data } = await query;
    if (data) setMatches(data);
  };

  const handleOpenModal = () => {
    setEditingMatch(null);
    setSelectedLeague(exportLeague || (activeLeagues[0]?.name || ''));
    setHomeTeamId('');
    setAwayTeamId('');
    setMatchDate('');
    setMatchTime('');
    setLocation('');
    setStadiumName('');
    setYoutubeLink('');
    setMatchRound('');
    setIsModalOpen(true);
  };

  const handleEditMatch = (match) => {
    setEditingMatch(match);
    setSelectedLeague(match.league || '');
    setHomeTeamId(match.home_team_id || '');
    setAwayTeamId(match.away_team_id || '');
    setMatchDate(match.match_date || '');
    setMatchTime(match.match_time || '');
    setYoutubeLink(match.youtube_link || '');
    setMatchRound(match.round ? String(match.round) : '');

    if (match.location) {
      if (match.location.includes(',')) {
        const parts = match.location.split(',');
        setStadiumName(parts[0].trim());
        setLocation(parts.slice(1).join(',').trim());
      } else {
        setStadiumName('');
        setLocation(match.location);
      }
    } else {
      setStadiumName('');
      setLocation('');
    }

    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!selectedLeague || !homeTeamId || !awayTeamId || !matchDate || !matchTime) {
      alert("Iltimos, barcha majburiy maydonlarni (Liga, Jamoalar, Sana, Vaqt) to'ldiring.");
      return;
    }
    if (homeTeamId === awayTeamId) {
      alert("Mezbon va mehmon jamoalar har xil bo'lishi kerak.");
      return;
    }

    setLoading(true);
    try {
      const finalLocation = stadiumName.trim() && location.trim()
        ? `${stadiumName.trim()}, ${location.trim()}`
        : (stadiumName.trim() || location.trim() || 'Asosiy maydon');

      const matchData = {
        league: selectedLeague,
        home_team_id: homeTeamId,
        away_team_id: awayTeamId,
        match_date: matchDate,
        match_time: matchTime,
        location: finalLocation,
        youtube_link: youtubeLink,
        round: matchRound ? parseInt(matchRound) : null,
        organization_id: orgId,
      };

      if (editingMatch) {
        const { error } = await supabase
          .from('matches')
          .update(matchData)
          .eq('id', editingMatch.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from('matches').insert([{
          ...matchData,
          status: 'scheduled'
        }]);

        if (error) throw error;
      }

      setIsModalOpen(false);
      setEditingMatch(null);
      fetchMatches();
    } catch (error) {
      console.error(error);
      alert('Xatolik yuz berdi: ' + (error.message || ''));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm("Rostdan ham ushbu o'yinni o'chirmoqchimisiz?")) {
      const { error } = await supabase.from('matches').delete().eq('id', id);
      if (!error) {
        fetchMatches();
      }
    }
  };

  const availableTeams = teams.filter(t => t.league === selectedLeague);
  const availableRounds = Array.from(new Set(matches.filter(m => m.league === exportLeague && m.round).map(m => Number(m.round)))).sort((a, b) => b - a);

  return (
    <div className="schedule-page">
      {/* Header */}
      <div className="schedule-header">
        <div>
          <h1>O'yinlar Jadvali</h1>
          <p>{currentOrg?.name} ({exportLeague || 'Barcha ligalar'})</p>
        </div>
        <button className="btn-add-match" onClick={handleOpenModal}>
          <Plus size={18} /> O'yin qo'shish
        </button>
      </div>

      {/* Modern Filter & 1x1 Poster Banner Control Card */}
      <div className="schedule-filter-banner-card">
        {/* Header Bar */}
        <div className="filter-header-bar">
          <div className="filter-title-group" onClick={() => setIsFilterOpen(!isFilterOpen)}>
            <Filter size={18} className="filter-icon" />
            <span>O'yinlar Filteri (Liga, Tur, Holat)</span>
            <ChevronDown size={18} className={`chevron-icon ${isFilterOpen ? 'open' : ''}`} />
          </div>
          <div className="filter-active-status-badge">
            {filterStatus === 'all' && 'Barcha o\'yinlar'}
            {filterStatus === 'scheduled' && 'Rejalashtirilgan'}
            {filterStatus === 'live' && '🔴 Jonli (Live)'}
            {filterStatus === 'finished' && 'Yakunlangan'}
          </div>
        </div>

        {/* Expandable Select Filters */}
        {isFilterOpen && (
          <div className="filter-expanded-content">
            <div className="filter-row">
              <div className="filter-field">
                <label><Trophy size={14} /> Liga tanlang</label>
                <div className="custom-select-wrapper">
                  <select value={exportLeague} onChange={e => setExportLeague(e.target.value)}>
                    {activeLeagues.map(l => (
                      <option key={l.id} value={l.name}>
                        {l.name} {l.isCollab ? '(Co-Host)' : ''}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={16} className="select-arrow" />
                </div>
              </div>

              <div className="filter-field">
                <label><Layers size={14} /> Tur</label>
                <div className="custom-select-wrapper">
                  <select value={exportRound} onChange={e => setExportRound(e.target.value)}>
                    <option value="">Barcha turlar</option>
                    {availableRounds.map(r => (
                      <option key={r} value={r}>{r}-Tur</option>
                    ))}
                  </select>
                  <ChevronDown size={16} className="select-arrow" />
                </div>
              </div>

              <div className="filter-field">
                <label><Clock size={14} /> O'yin Holati</label>
                <div className="custom-select-wrapper">
                  <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                    <option value="all">Barchasi</option>
                    <option value="scheduled">Rejalashtirilgan</option>
                    <option value="live">Jonli (Live)</option>
                    <option value="finished">Tugagan</option>
                  </select>
                  <ChevronDown size={16} className="select-arrow" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 1x1 Poster Banner Section */}
        <div className="poster-banner-section">
          {/* Left: 1x1 Poster Image Box */}
          <div className="poster-preview-square">
            {scheduleBanner ? (
              <img src={scheduleBanner} alt="1x1 Schedule Banner" className="poster-img-1x1" />
            ) : (
              <div className="poster-placeholder-1x1">
                <ImageIcon size={32} />
                <span>1x1 Orqa Fon</span>
                <span className="sub-tag">({exportLeague || 'Tanlanmagan'})</span>
              </div>
            )}
          </div>

          {/* Right: Actions */}
          <div className="poster-action-buttons">
            <button className="btn-download-poster" onClick={handleExport} disabled={isExporting}>
              {isExporting ? (
                <><span className="btn-spinner"></span> <span>Yuklanmoqda...</span></>
              ) : (
                <><Download size={18} /> <span>Rasmni Yuklab Olish</span></>
              )}
            </button>
            <div className="poster-sub-buttons">
              <button className="btn-banner-action btn-upload" onClick={() => bannerFileInputRef.current?.click()} disabled={uploadingBanner}>
                <Upload size={15} /> <span>{scheduleBanner ? 'Boshqa rasm yuklash' : 'Rasm yuklash'}</span>
              </button>
              {scheduleBanner && (
                <button className="btn-banner-action btn-delete" onClick={handleDeleteBanner}>
                  <Trash2 size={15} /> <span>O'chirish</span>
                </button>
              )}
            </div>
            <input ref={bannerFileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleBannerFileSelect} />
          </div>
        </div>
      </div>

      {/* Matches Grid Wrapper with Glassmorphism overlay on 1x1 scheduleBanner */}
      <div 
        className={`schedule-matches-wrapper ${scheduleBanner ? 'has-bg-banner' : ''}`}
        style={scheduleBanner ? {
          backgroundImage: `linear-gradient(rgba(11, 14, 23, 0.55), rgba(11, 14, 23, 0.8)), url(${scheduleBanner})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat'
        } : {}}
      >
        <div className="matches-grid">
          {matches
            .filter(m => m.league === exportLeague && (!exportRound || m.round == exportRound))
            .filter(m => {
              if (filterStatus === 'all') return true;
              if (filterStatus === 'live') return m.status === 'first_half' || m.status === 'second_half' || m.status === 'half_time';
              return m.status === filterStatus;
            })
            .map(match => (
            <div key={match.id} className="match-card glassmorphic-card">
              <div style={{ display: 'flex', gap: '6px', position: 'absolute', top: '12px', right: '12px', zIndex: 5 }}>
                <button className="edit-match-btn" onClick={() => handleEditMatch(match)} title="Tahrirlash" style={{ background: 'rgba(0, 170, 255, 0.15)', border: '1px solid rgba(0, 170, 255, 0.3)', color: '#00aaff', padding: '6px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                  <Pencil size={14} />
                </button>
                <button className="delete-match-btn" onClick={() => handleDelete(match.id)} title="O'chirish" style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fca5a5', padding: '6px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="match-badges-container">
                 <div className="match-league-badge">{match.league}</div>
                 {match.round && <div className="match-league-badge round-badge">{match.round}-Tur</div>}
              </div>
              <div className="match-teams">
                <div className="team"><img src={match.home_team?.logo_url || '/images/default-team.png'} alt="Home" className="team-logo" /><span>{match.home_team?.name}</span></div>
                <div className="match-vs">{(match.status === 'finished' || match.home_score > 0 || match.away_score > 0) ? <>{match.home_score || 0} : {match.away_score || 0}</> : 'VS'}</div>
                <div className="team"><img src={match.away_team?.logo_url || '/images/default-team.png'} alt="Away" className="team-logo" /><span>{match.away_team?.name}</span></div>
              </div>
              <div className="match-details">
                <div className="detail-row"><Calendar size={14} /> <span>{match.match_date}</span></div>
                <div className="detail-row"><Clock size={14} /> <span>{match.match_time}</span></div>
                <div className="detail-row"><MapPin size={14} /> <span>{match.location}</span></div>
              </div>
              <button className="btn-manage-match" onClick={() => navigate('/match/' + match.id)}>⚙️ Boshqarish</button>
            </div>
          ))}
          {matches.filter(m => m.league === exportLeague && (!exportRound || m.round == exportRound)).length === 0 && (
            <div className="no-matches-box"><Calendar size={36} /><p>O'yinlar topilmadi.</p></div>
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content schedule-modal" onClick={e => e.stopPropagation()}>
            <h2>{editingMatch ? 'O\'yinni tahrirlash' : 'Yangi o\'yin rejalashtirish'}</h2>
            
            <div className="form-group">
              <label>Liga</label>
              <select value={selectedLeague} onChange={(e) => {setSelectedLeague(e.target.value); setHomeTeamId(''); setAwayTeamId('');}}>
                <option value="">Tanlang</option>
                {activeLeagues.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Nechanchi Tur (Round)</label>
              <input 
                type="number" 
                placeholder="Masalan: 1" 
                value={matchRound} 
                onChange={(e) => setMatchRound(e.target.value)} 
                min="1"
              />
            </div>

            <div className="form-group">
              <label>Mezbon Jamoa</label>
              <select value={homeTeamId} onChange={(e) => setHomeTeamId(e.target.value)}>
                <option value="">Tanlang</option>
                {availableTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Mehmon Jamoa</label>
              <select value={awayTeamId} onChange={(e) => setAwayTeamId(e.target.value)}>
                <option value="">Tanlang</option>
                {availableTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>

            <div className="datetime-row">
              <div className="form-group">
                <label>Sana</label>
                <input type="date" value={matchDate} onChange={(e) => setMatchDate(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Vaqt</label>
                <input type="time" value={matchTime} onChange={(e) => setMatchTime(e.target.value)} />
              </div>
            </div>

            <div className="form-group">
              <label>Stadion Nomi (Lokatsiya)</label>
              <input 
                type="text" 
                placeholder="Stadion nomi (masalan: Dinamo Arena)" 
                value={stadiumName} 
                onChange={(e) => setStadiumName(e.target.value)} 
              />
            </div>

            <div className="form-group">
              <label>Maydon / Sektor</label>
              <input 
                type="text" 
                placeholder="Masalan: 1-maydon yoki Asosiy maydon" 
                value={location} 
                onChange={(e) => setLocation(e.target.value)} 
              />
            </div>

            <div className="form-group">
              <label>YouTube Translyatsiya Linki (ixtiyoriy)</label>
              <input 
                type="url" 
                placeholder="https://youtube.com/live/..." 
                value={youtubeLink} 
                onChange={(e) => setYoutubeLink(e.target.value)} 
              />
            </div>

            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setIsModalOpen(false)}>Bekor qilish</button>
              <button className="btn-save" onClick={handleSave} disabled={loading}>
                {loading ? <><span className="btn-spinner"></span> Saqlanmoqda...</> : (editingMatch ? 'Yangilash' : 'Saqlash')}
              </button>
            </div>
          </div>
        </div>
      )}

      {cropperRawImage && (
        <ImageCropperModal
          isOpen={!!cropperRawImage}
          imageSrc={cropperRawImage}
          onClose={() => setCropperRawImage(null)}
          onSave={handleCroppedBannerSave}
          title="Schedule 1:1 Orqa Fon Rasmini Qirqish"
          aspect={1 / 1}
          showAspectSelector={false}
        />
      )}

      <div style={{ position: 'fixed', left: '-9999px', top: 0, pointerEvents: 'none', zIndex: -100 }}>
        {(() => {
          const currentLeagueObj = activeLeagues.find(l => l.name === exportLeague);
          const isCollab = currentLeagueObj?.isCollab;

          return (
            <div ref={exportRef} className="schedule-export-container 1x1-poster-export" style={{ width: '1080px', height: '1080px', backgroundImage: scheduleBanner ? `url(${scheduleBanner})` : 'none', backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative', display: 'flex', flexDirection: 'column', padding: '40px 50px', boxSizing: 'border-box' }}>
              {/* Header */}
              <div className="export-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', width: '100%' }}>
                <div className="export-logo-left" style={{ width: '250px', minWidth: '250px', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px', justifyContent: 'flex-start' }}>
                  {isCollab ? (
                    <>
                      <img src={currentLeagueObj.org1?.logo_url || '/logo-for-jadval.png'} alt="Org 1" crossOrigin="anonymous" style={{ height: '90px', objectFit: 'contain', background: 'transparent' }} />
                      <img src="/x.png" crossOrigin="anonymous" style={{ height: '18px', objectFit: 'contain', opacity: 0.7, background: 'transparent' }} />
                      <img src={currentLeagueObj.org2?.logo_url || '/llf-logo.png'} alt="Org 2" crossOrigin="anonymous" style={{ height: '75px', objectFit: 'contain', background: 'transparent' }} />
                    </>
                  ) : (
                    <img src={currentOrg?.logo_url || '/logo-for-jadval.png'} alt={currentOrg?.name || 'HFL'} crossOrigin="anonymous" style={{ height: '100px', objectFit: 'contain', background: 'transparent' }} />
                  )}
                </div>

                <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                  {currentLeagueObj?.logo_url ? (
                    <img src={currentLeagueObj.logo_url} alt={exportLeague} style={{ height: '110px', maxWidth: '380px', objectFit: 'contain', background: 'transparent', border: 'none' }} crossOrigin="anonymous" />
                  ) : (
                    <h2 style={{ color: '#fff', fontSize: '32px', fontWeight: '900', textTransform: 'uppercase', margin: 0 }}>{exportLeague} {exportRound ? `(${exportRound}-TUR)` : ''}</h2>
                  )}
                </div>

                <div className="export-logo-right" style={{ width: '250px', minWidth: '250px', textAlign: 'right', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                  {mainSponsorLogo ? (
                    <img src={mainSponsorLogo} alt="Bosh Homiy" crossOrigin="anonymous" style={{ height: '80px', objectFit: 'contain', background: 'transparent' }} />
                  ) : null}
                </div>
              </div>

              <div className="sch-export-body" style={{ flex: 1 }}>
                {matches.filter(m => m.league === exportLeague && m.round == exportRound).map(match => (
                  <div key={match.id} className="sch-match-row">
                    <img src={match.home_team?.logo_url} className="sch-team-logo" crossOrigin="anonymous" alt="" />
                    <div style={{ color: '#fff', fontSize: '20px', fontWeight: '800', textAlign: 'center' }}>{match.home_team?.name}</div>
                    <div className="sch-time-container"><div className="sch-time-date">{match.match_date?.split('-').reverse().join('.')}</div><div className="sch-time-box">{match.match_time?.substring(0, 5)}</div></div>
                    <div style={{ color: '#fff', fontSize: '20px', fontWeight: '800', textAlign: 'center' }}>{match.away_team?.name}</div>
                    <img src={match.away_team?.logo_url} className="sch-team-logo" crossOrigin="anonymous" alt="" />
                  </div>
                ))}
              </div>

              {/* Bottom Selected Secondary Sponsors Banner */}
              {selectedSponsors.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '30px', marginTop: '20px', marginBottom: '15px' }}>
                  {selectedSponsors.map((s, idx) => (
                    <React.Fragment key={s.id || idx}>
                      <img src={s.logo_url} alt={s.name} crossOrigin="anonymous" style={{ height: '42px', objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
                      {idx < selectedSponsors.length - 1 && (
                        <div style={{ height: '28px', width: '1px', backgroundColor: '#ffffff', opacity: 0.5 }}></div>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
};

export default Schedule;
