import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useOrg } from '../context/OrgContext';
import { getActiveOrgLeagues, applyOrgAndCollabFilter } from '../utils/leagueUtils';
import { Calendar, Plus, MapPin, Clock, Video, Trash2, Download, Filter, ChevronDown, Trophy, Layers, Image as ImageIcon, Upload } from 'lucide-react';
import html2canvas from 'html2canvas';
import ImageCropperModal from '../components/ImageCropperModal';
import './Schedule.css';

const DEFAULT_LEAGUE_LOGOS = {
  'Super liga': '/super-liga.PNG',
  'Pro liga': '/Pro-liga.PNG',
  '3-liga': '/3-liga.PNG',
  'Europa ligasi': '/europen-liga.PNG',
  'Chempionlar ligasi': '/chemp-liga.PNG',
  '7x7 liga': '/7x7-liga.PNG'
};

const Schedule = () => {
  const navigate = useNavigate();
  const [matches, setMatches] = useState([]);
  const [teams, setTeams] = useState([]);
  const [activeLeagues, setActiveLeagues] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
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
  const [selectedSponsors, setSelectedSponsors] = useState([]);
  const [isFilterOpen, setIsFilterOpen] = useState(true);
  const exportRef = useRef(null);

  const [scheduleBanner, setScheduleBanner] = useState('');
  const [cropperRawImage, setCropperRawImage] = useState(null);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const bannerFileInputRef = useRef(null);

  useEffect(() => {
    loadLeaguesAndData();
    try {
      const saved = localStorage.getItem('hfl_selectedSponsors');
      if (saved) setSelectedSponsors(JSON.parse(saved));
    } catch (e) {}
  }, [orgId]);

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

  const handleCroppedBannerSave = async (croppedBlob) => {
    if (!croppedBlob) return;
    const currentLeagueObj = activeLeagues.find(l => l.name === exportLeague);
    if (!currentLeagueObj) return;

    setUploadingBanner(true);
    try {
      const publicUrl = await new Promise((res) => {
        const reader = new FileReader();
        reader.onloadend = () => res(reader.result);
        reader.readAsDataURL(croppedBlob);
      });

      setScheduleBanner(publicUrl);
      const localKey = `hfl_schedule_banner_${orgId}_${currentLeagueObj.id}`;
      localStorage.setItem(localKey, publicUrl);

      try {
        await supabase
          .from('leagues')
          .update({ schedule_banner_url: publicUrl })
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
    setSelectedLeague('');
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

  const handleSave = async () => {
    if (!homeTeamId || !awayTeamId || !matchDate || !matchTime || !location) {
      alert("Iltimos, barcha majburiy maydonlarni to'ldiring.");
      return;
    }
    if (homeTeamId === awayTeamId) {
      alert("Mezbon va mehmon jamoalar har xil bo'lishi kerak.");
      return;
const [exportLeague, setExportLeague] = useState('');
  const [exportRound, setExportRound] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [selectedSponsors, setSelectedSponsors] = useState([]);
  const [isFilterOpen, setIsFilterOpen] = useState(true);
  const exportRef = useRef(null);

  const [scheduleBanner, setScheduleBanner] = useState('');
  const [cropperRawImage, setCropperRawImage] = useState(null);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const bannerFileInputRef = useRef(null);
  const [filterStatus, setFilterStatus] = useState('all');

  useEffect(() => {
    loadLeaguesAndData();
    try {
      const saved = localStorage.getItem('hfl_selectedSponsors');
      if (saved) setSelectedSponsors(JSON.parse(saved));
    } catch (e) {}
  }, [orgId]);

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

  const handleCroppedBannerSave = async (croppedBlob) => {
    if (!croppedBlob) return;
    const currentLeagueObj = activeLeagues.find(l => l.name === exportLeague);
    if (!currentLeagueObj) return;

    setUploadingBanner(true);
    try {
      const publicUrl = await new Promise((res) => {
        const reader = new FileReader();
        reader.onloadend = () => res(reader.result);
        reader.readAsDataURL(croppedBlob);
      });

      setScheduleBanner(publicUrl);
      const localKey = `hfl_schedule_banner_${orgId}_${currentLeagueObj.id}`;
      localStorage.setItem(localKey, publicUrl);

      try {
        await supabase
          .from('leagues')
          .update({ schedule_banner_url: publicUrl })
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
    setSelectedLeague('');
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

  const handleSave = async () => {
    if (!homeTeamId || !awayTeamId || !matchDate || !matchTime || !location) {
      alert("Iltimos, barcha majburiy maydonlarni to'ldiring.");
      return;
    }
    if (homeTeamId === awayTeamId) {
      alert("Mezbon va mehmon jamoalar har xil bo'lishi kerak.");
      return;
    }

    setLoading(true);
    try {
      const finalLocation = stadiumName.trim() ? `${stadiumName.trim()}, ${location}` : location;
      const { error } = await supabase.from('matches').insert([{
        league: selectedLeague,
        home_team_id: homeTeamId,
        away_team_id: awayTeamId,
        match_date: matchDate,
        match_time: matchTime,
        location: finalLocation,
        youtube_link: youtubeLink,
        round: matchRound ? parseInt(matchRound) : null,
        organization_id: orgId,
        status: 'scheduled'
      }]);

      if (error) throw error;

      setIsModalOpen(false);
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
              <Download size={18} /> <span>{isExporting ? 'Yuklanmoqda...' : 'Rasmni Yuklab Olish'}</span>
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

      <div className="matches-grid">
        {matches
          .filter(m => m.league === exportLeague && (!exportRound || m.round == exportRound))
          .filter(m => {
            if (filterStatus === 'all') return true;
            if (filterStatus === 'live') return m.status === 'first_half' || m.status === 'second_half' || m.status === 'half_time';
            return m.status === filterStatus;
          })
          .map(match => (
          <div key={match.id} className="match-card">
            <button className="delete-match-btn" onClick={() => handleDelete(match.id)} title="O'chiresh"><Trash2 size={16} /></button>
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

      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content schedule-modal" onClick={e => e.stopPropagation()}>
            <h2>Yangi o'yin rejalashtirish</h2>
            <div className="form-group"><label>Liga</label><select value={selectedLeague} onChange={(e) => {setSelectedLeague(e.target.value); setHomeTeamId(''); setAwayTeamId('');}}><option value="">Tanlang</option>{activeLeagues.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}</select></div>
            <div className="form-group"><label>Mezbon</label><select value={homeTeamId} onChange={(e) => setHomeTeamId(e.target.value)}><option value="">Tanlang</option>{availableTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
            <div className="form-group"><label>Mehmon</label><select value={awayTeamId} onChange={(e) => setAwayTeamId(e.target.value)}><option value="">Tanlang</option>{availableTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
            <div className="datetime-row"><div className="form-group"><label>Sana</label><input type="date" value={matchDate} onChange={(e) => setMatchDate(e.target.value)} /></div><div className="form-group"><label>Vaqt</label><input type="time" value={matchTime} onChange={(e) => setMatchTime(e.target.value)} /></div></div>
            <div className="form-group"><label>Maydon</label><select value={location} onChange={(e) => setLocation(e.target.value)}><option value="">Tanlang</option><option value="1-maydon">1-Maydon</option><option value="2-maydon">2-Maydon</option></select></div>
            <div className="modal-actions"><button className="btn-cancel" onClick={() => setIsModalOpen(false)}>Bekor</button><button className="btn-save" onClick={handleSave}>Saqlash</button></div>
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
        <div ref={exportRef} className="schedule-export-container 1x1-poster-export" style={{ width: '1080px', height: '1080px', backgroundImage: scheduleBanner ? `url(${scheduleBanner})` : 'none', backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative' }}>
          <div className="sch-export-body">
            {matches.filter(m => m.league === exportLeague && m.round == exportRound).map(match => (
              <div key={match.id} className="sch-match-row">
                <img src={match.home_team?.logo_url} className="sch-team-logo" crossOrigin="anonymous" alt="" />
                <div style={{ color: '#fff', fontSize: '20px', fontWeight: '800' }}>{match.home_team?.name}</div>
                <div className="sch-time-container"><div>{match.match_date?.split('-').reverse().join('.')}</div><div>{match.match_time?.substring(0, 5)}</div></div>
                <div style={{ color: '#fff', fontSize: '20px', fontWeight: '800' }}>{match.away_team?.name}</div>
                <img src={match.away_team?.logo_url} className="sch-team-logo" crossOrigin="anonymous" alt="" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Schedule;
