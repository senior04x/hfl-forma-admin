import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { Calendar, Plus, MapPin, Clock, Video, Trash2, Download } from 'lucide-react';
import html2canvas from 'html2canvas';
import './Schedule.css';

const LEAGUES = [
  'Super liga',
  'Pro liga',
  '3-liga',
  'Europa ligasi',
  'Chempionlar ligasi',
  '7x7 liga'
];

const LEAGUE_LOGOS = {
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
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all'); // all, scheduled, live, finished

  // Form states
  const [selectedLeague, setSelectedLeague] = useState('');
  const [homeTeamId, setHomeTeamId] = useState('');
  const [awayTeamId, setAwayTeamId] = useState('');
  const [matchDate, setMatchDate] = useState('');
  const [matchTime, setMatchTime] = useState('');
  const [location, setLocation] = useState('');
  const [stadiumName, setStadiumName] = useState('');
  const [youtubeLink, setYoutubeLink] = useState('');
  const [matchRound, setMatchRound] = useState('');

  // Export states
  const [exportLeague, setExportLeague] = useState(LEAGUES[0]);
  const [exportRound, setExportRound] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [selectedSponsors, setSelectedSponsors] = useState([]);
  const exportRef = useRef(null);

  useEffect(() => {
    fetchTeams();
    fetchMatches();
    try {
      const saved = localStorage.getItem('hfl_selectedSponsors');
      if (saved) setSelectedSponsors(JSON.parse(saved));
    } catch (e) {}
  }, []);

  useEffect(() => {
    const leagueMatches = matches.filter(m => m.league === exportLeague && m.round);
    if (leagueMatches.length > 0) {
      const maxR = Math.max(...leagueMatches.map(m => m.round));
      setExportRound(maxR.toString());
    } else {
      setExportRound('');
    }
  }, [matches, exportLeague]);

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

  const fetchTeams = async () => {
    const { data } = await supabase.from('teams').select('id, name, logo_url, league').eq('status', 'approved');
    if (data) setTeams(data);
  };

  const fetchMatches = async () => {
    const { data } = await supabase
      .from('matches')
      .select(`
        *,
        home_team:home_team_id (id, name, logo_url),
        away_team:away_team_id (id, name, logo_url)
      `)
      .order('match_date', { ascending: true })
      .order('match_time', { ascending: true });
    
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
        round: matchRound ? parseInt(matchRound) : null
      }]);

      if (error) throw error;

      setIsModalOpen(false);
      fetchMatches();
    } catch (error) {
      console.error(error);
      alert('Xatolik yuz berdi');
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

  // Filtered teams for dropdowns
  const availableTeams = teams.filter(t => t.league === selectedLeague);

  return (
    <div className="schedule-container">
      <div className="schedule-header">
        <h1>O'yinlar Jadvali</h1>
        <button className="btn-add-match" onClick={handleOpenModal}>
          <Plus size={18} /> O'yin qo'shish
        </button>
      </div>

      <div className="schedule-filters">
        <button 
          className={`filter-btn ${filterStatus === 'all' ? 'active' : ''}`} 
          onClick={() => setFilterStatus('all')}
        >Barchasi</button>
        <button 
          className={`filter-btn ${filterStatus === 'scheduled' ? 'active' : ''}`} 
          onClick={() => setFilterStatus('scheduled')}
        >Rejalashtirilgan</button>
        <button 
          className={`filter-btn ${filterStatus === 'live' ? 'active' : ''}`} 
          onClick={() => setFilterStatus('live')}
        >Jonli (Live)</button>
        <button 
          className={`filter-btn ${filterStatus === 'finished' ? 'active' : ''}`} 
          onClick={() => setFilterStatus('finished')}
        >Tugagan</button>
      </div>

      <div className="admin-controls" style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '20px', padding: '15px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
        <div className="filter-group" style={{ width: '100%' }}>
          <label>Liga tanlang (Ekranda ko'rish va Eksport uchun)</label>
          <select value={exportLeague} onChange={(e) => setExportLeague(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
            {LEAGUES.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div className="filter-group" style={{ width: '100%' }}>
          <label>Tur (Eksport va ekranda ko'rish uchun)</label>
          <select value={exportRound} onChange={(e) => setExportRound(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
            <option value="">Barchasi</option>
            {Array.from(new Set(matches.filter(m => m.league === exportLeague && m.round).map(m => m.round)))
              .sort((a, b) => b - a)
              .map(r => <option key={r} value={r}>{r}-tur</option>)}
          </select>
        </div>
        <div className="filter-group" style={{ width: '100%', display: 'flex' }}>
          <button 
            className="btn-export" 
            onClick={handleExport} 
            disabled={isExporting}
            style={{ display: 'flex', width: '100%', justifyContent: 'center', alignItems: 'center', gap: '8px', padding: '12px 16px', background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '500' }}
          >
            <Download size={18} /> {isExporting ? 'Yuklanmoqda...' : 'Rasmni yuklab olish'}
          </button>
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
            <button className="delete-match-btn" onClick={() => handleDelete(match.id)}>
              <Trash2 size={16} />
            </button>
            <div className="match-badges-container">
               <div className="match-league-badge">{match.league}</div>
               {match.round && <div className="match-league-badge" style={{background: '#3b82f6'}}>{match.round}-Tur</div>}
               {match.status === 'scheduled' && <div className="match-status-badge scheduled">Rejalashtirilgan</div>}
               {(match.status === 'first_half' || match.status === 'second_half' || match.status === 'half_time') && <div className="match-status-badge live">Jonli (Live)</div>}
               {match.status === 'finished' && <div className="match-status-badge finished">Yakunlangan</div>}
            </div>
            
            <div className="match-teams">
              <div className="team">
                <img src={match.home_team?.logo_url || '/images/default-team.png'} alt="Home" className="team-logo" />
                <span className="team-name">{match.home_team?.name}</span>
              </div>
              <div className="match-vs">
              {(match.status === 'finished' || match.home_score > 0 || match.away_score > 0) 
                ? <>{match.home_score || 0} : {match.away_score || 0}</>
                : 'VS'}
            </div>
              <div className="team">
                <img src={match.away_team?.logo_url || '/images/default-team.png'} alt="Away" className="team-logo" />
                <span className="team-name">{match.away_team?.name}</span>
              </div>
            </div>

            <div className="match-details">
              <div className="detail-row">
                <Calendar size={14} /> <span>{match.match_date}</span>
              </div>
              <div className="detail-row">
                <Clock size={14} /> <span>{match.match_time}</span>
              </div>
              <div className="detail-row">
                <MapPin size={14} /> <span>{match.location}</span>
              </div>
              {match.youtube_link && (
                <div className="detail-row">
                  <Video size={14} color="#ef4444" /> 
                  <a href={match.youtube_link} target="_blank" rel="noreferrer" className="youtube-link">Jonli ko'rish</a>
                </div>
              )}
            </div>

            <button
              className="btn-add-match"
              style={{width: '100%', justifyContent: 'center', borderRadius: '10px', marginTop: '0'}}
              onClick={() => navigate('/match/' + match.id)}
            >
              ⚙️ Boshqarish
            </button>
          </div>
        ))}
        {matches.length === 0 && (
          <div style={{gridColumn: '1 / -1', textAlign: 'center', color: '#64748b', padding: '40px'}}>
            Hali o'yinlar rejalashtirilmagan.
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content schedule-modal" onClick={e => e.stopPropagation()}>
            <h2>Yangi o'yin rejalashtirish</h2>
            
            <div className="form-group">
              <label>Liga</label>
              <select value={selectedLeague} onChange={(e) => {
                setSelectedLeague(e.target.value);
                setHomeTeamId('');
                setAwayTeamId('');
              }}>
                <option value="">Ligani tanlang</option>
                {LEAGUES.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Mezbon jamoa</label>
              <select value={homeTeamId} onChange={(e) => setHomeTeamId(e.target.value)} disabled={!selectedLeague}>
                <option value="">Jamoani tanlang</option>
                {availableTeams.map(t => (
                  <option key={t.id} value={t.id} disabled={t.id === awayTeamId}>{t.name}</option>
                ))}
              </select>
            </div>

            <div className="vs-text">VS</div>

            <div className="form-group">
              <label>Mehmon jamoa</label>
              <select value={awayTeamId} onChange={(e) => setAwayTeamId(e.target.value)} disabled={!selectedLeague}>
                <option value="">Jamoani tanlang</option>
                {availableTeams.map(t => (
                  <option key={t.id} value={t.id} disabled={t.id === homeTeamId}>{t.name}</option>
                ))}
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
              <label>Nechanchi tur? (Majburiy emas)</label>
              <input type="number" placeholder="Masalan: 1" value={matchRound} onChange={(e) => setMatchRound(e.target.value)} />
            </div>

            <div className="form-group">
              <label>Lokatsiya / Stadion nomi (Majburiy emas)</label>
              <input type="text" placeholder="Masalan: Sergeli" value={stadiumName} onChange={(e) => setStadiumName(e.target.value)} />
            </div>

            <div className="form-group">
              <label>Maydonni tanlang (Majburiy, OBS uchun)</label>
              <select value={location} onChange={(e) => setLocation(e.target.value)}>
                <option value="">Maydonni tanlang</option>
                <option value="1-maydon">1-Maydon</option>
                <option value="2-maydon">2-Maydon</option>
              </select>
            </div>

            <div className="form-group">
              <label>YouTube Translatsiya Linki (Ixtiyoriy)</label>
              <input type="text" placeholder="https://youtube.com/..." value={youtubeLink} onChange={(e) => setYoutubeLink(e.target.value)} />
            </div>

            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setIsModalOpen(false)}>Bekor qilish</button>
              <button className="btn-save" onClick={handleSave} disabled={loading}>
                {loading ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HIDDEN EXPORT TEMPLATE */}
      <div style={{ position: 'fixed', left: '-9999px', top: 0, opacity: 1, pointerEvents: 'none', zIndex: -100 }}>
        <div 
          ref={exportRef} 
          className={`schedule-export-container theme-export-${exportLeague.split(' ')[0]}`}
        >
          <div className="sch-export-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0px', padding: '0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <img src="/hfl-logo-for-jadval.png" alt="HFL" style={{ height: '80px', objectFit: 'contain' }} crossOrigin="anonymous" />
              {exportLeague === '7x7 liga' && (
                <>
                  <img src="/x.png" crossOrigin="anonymous" style={{ height: '20px', objectFit: 'contain', opacity: 0.7 }} />
                  <img src="/llf-logo.png" alt="LLF" style={{ height: '65px', objectFit: 'contain' }} crossOrigin="anonymous" />
                </>
              )}
            </div>

            <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', marginTop: '10px' }}>
              {exportLeague === '7x7 liga' ? (
                <img src="/7x7-liga.png" alt="7x7 Liga" style={{ width: '520px', height: 'auto', maxHeight: '300px', objectFit: 'contain' }} crossOrigin="anonymous" />
              ) : (
                LEAGUE_LOGOS[exportLeague] && (
                  <img src={LEAGUE_LOGOS[exportLeague]} alt={exportLeague} style={{ height: '220px', maxWidth: '450px', objectFit: 'contain' }} crossOrigin="anonymous" />
                )
              )}
            </div>

            <img src="/joma.png" alt="Joma" style={{ height: '65px', filter: exportLeague !== '7x7 liga' ? 'brightness(0) invert(1)' : 'none', objectFit: 'contain' }} crossOrigin="anonymous" />
          </div>

          <div className="sch-export-body">
            {matches
              .filter(m => m.league === exportLeague && m.round == exportRound)
              .map(match => (
                <div key={match.id} className="sch-match-row">
                  {/* 1. Home Logo */}
                  <img 
                    src={match.home_team?.logo_url} 
                    alt="" 
                    crossOrigin="anonymous" 
                    className="sch-team-logo"
                    onError={(e) => { e.target.onerror = null; e.target.src = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 30'%3E%3Crect width='30' height='30' fill='%23ccc' rx='15'/%3E%3C/svg%3E"; }}
                  />

                  {/* 2. Home Team Name */}
                  <div style={{ textAlign: 'center', fontSize: '20px', fontWeight: '800', textTransform: 'uppercase', color: '#ffffff', wordBreak: 'break-word', whiteSpace: 'pre-wrap', lineHeight: '1.2', padding: '0 10px' }}>
                    {match.home_team?.name}
                  </div>
                  
                  {/* 3. Time Container */}
                  <div className="sch-time-container">
                    <div className="sch-time-date">
                      {match.match_date ? match.match_date.split('-').reverse().join('.') : ''}
                    </div>
                    <div className="sch-time-box">
                      {match.match_time ? match.match_time.substring(0, 5) : '00:00'}
                    </div>
                  </div>

                  {/* 4. Away Team Name */}
                  <div style={{ textAlign: 'center', fontSize: '20px', fontWeight: '800', textTransform: 'uppercase', color: '#ffffff', wordBreak: 'break-word', whiteSpace: 'pre-wrap', lineHeight: '1.2', padding: '0 10px' }}>
                    {match.away_team?.name}
                  </div>

                  {/* 5. Away Logo */}
                  <img 
                    src={match.away_team?.logo_url} 
                    alt="" 
                    crossOrigin="anonymous" 
                    className="sch-team-logo"
                    onError={(e) => { e.target.onerror = null; e.target.src = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 30'%3E%3Crect width='30' height='30' fill='%23ccc' rx='15'/%3E%3C/svg%3E"; }}
                  />
                </div>
              ))}
          </div>

          <div className="sch-export-footer">
            <div style={{ display: 'flex', gap: '30px', alignItems: 'center', marginBottom: '10px' }}>
              {exportLeague !== '7x7 liga' && selectedSponsors.map((s, idx) => (
                <React.Fragment key={s.id}>
                  <img src={s.logo_url} alt="Sponsor" style={{ height: '45px', filter: 'brightness(0) invert(1)' }} crossOrigin="anonymous" />
                  {idx < selectedSponsors.length - 1 && <div style={{ height: '30px', width: '1px', background: '#fff', opacity: 0.5 }}></div>}
                </React.Fragment>
              ))}
            </div>
            <div className="sch-social" style={{ color: exportLeague === '7x7 liga' ? '#ffffff' : 'white', marginBottom: '0px' }}>
              @havas_football
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Schedule;
