import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { Calendar, Plus, MapPin, Clock, Video, Trash2 } from 'lucide-react';
import './Schedule.css';

const LEAGUES = [
  'Super liga',
  'Pro liga',
  '3-liga',
  'Europa ligasi',
  'Chempionlar ligasi',
  '7x7 liga'
];

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
  const [youtubeLink, setYoutubeLink] = useState('');
  const [matchRound, setMatchRound] = useState('');

  useEffect(() => {
    fetchTeams();
    fetchMatches();
  }, []);

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
      const { error } = await supabase.from('matches').insert([{
        league: selectedLeague,
        home_team_id: homeTeamId,
        away_team_id: awayTeamId,
        match_date: matchDate,
        match_time: matchTime,
        location: location,
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

      <div className="matches-grid">
        {matches
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
              <label>Manzil / Stadion</label>
              <input type="text" placeholder="Masalan: Paxtakor stadioni" value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>

            <div className="form-group">
              <label>Nechanchi tur? (Majburiy emas)</label>
              <input type="number" placeholder="Masalan: 1" value={matchRound} onChange={(e) => setMatchRound(e.target.value)} />
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
    </div>
  );
};

export default Schedule;
