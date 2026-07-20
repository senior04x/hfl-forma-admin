import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { ArrowLeft, Trash2, Monitor, Camera, Gamepad2 } from 'lucide-react';
import './MatchControl.css';

const EVENT_TYPES = {
  goal: { icon: '⚽', label: 'Gol' },
  assist: { icon: '👟', label: 'Assist' },
  yellow_card: { icon: '🟨', label: 'Sariq kartochka' },
  red_card: { icon: '🟥', label: 'Qizil kartochka' },
  substitution: { icon: '🔄', label: 'Almashtirish' }
};

const STATUS_LABELS = {
  scheduled: 'Rejalashtirilgan',
  first_half: '1-Taym',
  half_time: 'Tanaffus',
  second_half: '2-Taym',
  finished: 'Yakunlangan'
};

const MatchControl = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [match, setMatch] = useState(null);
  const [homeTeam, setHomeTeam] = useState(null);
  const [awayTeam, setAwayTeam] = useState(null);
  const [homePlayers, setHomePlayers] = useState([]);
  const [awayPlayers, setAwayPlayers] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  // Event modal state
  const [showEventModal, setShowEventModal] = useState(false);
  const [eventType, setEventType] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [eventMinute, setEventMinute] = useState('');

  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, action: null, message: '' });

  const copyObsLink = () => {
    const link = `${window.location.origin}/obs/scoreboard/${id}`;
    navigator.clipboard.writeText(link);
    alert('OBS Link nusxalandi: ' + link);
  };

  useEffect(() => {
    fetchMatchData();
  }, [id]);

  const fetchMatchData = async () => {
    setLoading(true);
    try {
      // Fetch match
      const { data: matchData } = await supabase
        .from('matches')
        .select('*')
        .eq('id', id)
        .single();

      if (!matchData) return;
      setMatch(matchData);

      // Fetch teams
      const { data: home } = await supabase.from('teams').select('*').eq('id', matchData.home_team_id).single();
      const { data: away } = await supabase.from('teams').select('*').eq('id', matchData.away_team_id).single();
      setHomeTeam(home);
      setAwayTeam(away);

      // Fetch approved players for each team
      const { data: hp } = await supabase
        .from('applications')
        .select('id, first_name, last_name, position, player_number')
        .eq('team_id', matchData.home_team_id)
        .eq('status', 'approved');
      
      const { data: ap } = await supabase
        .from('applications')
        .select('id, first_name, last_name, position, player_number')
        .eq('team_id', matchData.away_team_id)
        .eq('status', 'approved');

      setHomePlayers(hp || []);
      setAwayPlayers(ap || []);

      // Fetch events
      await fetchEvents(matchData.id);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchEvents = async (matchId) => {
    const { data } = await supabase
      .from('match_events')
      .select('*, player:player_id(first_name, last_name), team:team_id(name)')
      .eq('match_id', matchId || id)
      .order('minute', { ascending: true });
    
    setEvents(data || []);
  };

  const requestStatusUpdate = (newStatus, message) => {
    setConfirmModal({
      isOpen: true,
      message,
      action: async () => {
        const { error } = await supabase.from('matches').update({ status: newStatus }).eq('id', id);
        if (!error) setMatch(prev => ({ ...prev, status: newStatus }));
        setConfirmModal({ isOpen: false, action: null, message: '' });
      }
    });
  };

  const requestFinishMatch = () => {
    setConfirmModal({
      isOpen: true,
      message: "O'yinni yakunlashni tasdiqlaysizmi? (Bu amalni orqaga qaytarib bo'lmaydi va bot orqali barchaga xabar ketadi)",
      action: async () => {
        const homeGoals = events.filter(e => e.event_type === 'goal' && e.team_id === match.home_team_id).length;
        const awayGoals = events.filter(e => e.event_type === 'goal' && e.team_id === match.away_team_id).length;

        const { error } = await supabase
          .from('matches')
          .update({ status: 'finished', home_score: homeGoals, away_score: awayGoals })
          .eq('id', id);
        
        if (!error) {
          setMatch(prev => ({ ...prev, status: 'finished', home_score: homeGoals, away_score: awayGoals }));
        }
        setConfirmModal({ isOpen: false, action: null, message: '' });
      }
    });
  };

  const openEventModal = (type) => {
    setEventType(type);
    setSelectedTeamId('');
    setSelectedPlayerId('');
    setEventMinute('');
    setShowEventModal(true);
  };

  const handleSaveEvent = async () => {
    if (!selectedTeamId || !selectedPlayerId || !eventMinute) return;

    const { error } = await supabase.from('match_events').insert([{
      match_id: id,
      team_id: selectedTeamId,
      player_id: selectedPlayerId,
      event_type: eventType,
      minute: parseInt(eventMinute)
    }]);

    if (!error) {
      // If it's a goal, update the score
      if (eventType === 'goal') {
        const isHome = selectedTeamId === match.home_team_id;
        const newHomeScore = (match.home_score || 0) + (isHome ? 1 : 0);
        const newAwayScore = (match.away_score || 0) + (isHome ? 0 : 1);
        
        await supabase.from('matches').update({
          home_score: newHomeScore,
          away_score: newAwayScore
        }).eq('id', id);

        setMatch(prev => ({ ...prev, home_score: newHomeScore, away_score: newAwayScore }));
      }

      await fetchEvents();
      setShowEventModal(false);
    }
  };

  const handleDeleteEvent = async (event) => {
    if (!window.confirm("Bu voqeani o'chirishni tasdiqlaysizmi?")) return;

    const { error } = await supabase.from('match_events').delete().eq('id', event.id);
    if (!error) {
      // If deleted event was a goal, update score
      if (event.event_type === 'goal') {
        const isHome = event.team_id === match.home_team_id;
        const newHomeScore = Math.max(0, (match.home_score || 0) - (isHome ? 1 : 0));
        const newAwayScore = Math.max(0, (match.away_score || 0) - (isHome ? 0 : 1));
        
        await supabase.from('matches').update({
          home_score: newHomeScore,
          away_score: newAwayScore
        }).eq('id', id);

        setMatch(prev => ({ ...prev, home_score: newHomeScore, away_score: newAwayScore }));
      }
      await fetchEvents();
    }
  };

  const getPlayersForTeam = () => {
    if (selectedTeamId === match?.home_team_id) return homePlayers;
    if (selectedTeamId === match?.away_team_id) return awayPlayers;
    return [];
  };

  const isLive = match?.status === 'first_half' || match?.status === 'second_half';

  if (loading) return <div className="match-control" style={{display:'flex',justifyContent:'center',alignItems:'center',height:'100vh'}}>Yuklanmoqda...</div>;
  if (!match) return <div className="match-control">O'yin topilmadi</div>;

  return (
    <div className="match-control">
      {/* Header */}
      <div className="match-control-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <button className="btn-back" onClick={() => navigate('/schedule')}>
            <ArrowLeft size={20} />
          </button>
          <h1 style={{ margin: 0 }}>O'yin Boshqaruvi</h1>
        </div>
        
        <div className="match-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button className="obs-action-btn" onClick={copyObsLink} title="OBS Linkini nusxalash">
            <Monitor size={18} />
          </button>
          <button className="obs-action-btn obs-text-btn" onClick={copyObsLink} title="OBS Linkini nusxalash">
            Output settings
          </button>
          <div className="obs-divider"></div>
          <button className="obs-action-btn">
            <Camera size={18} />
          </button>
          <div className="obs-divider"></div>
          <button className="obs-action-btn">
            <Gamepad2 size={18} />
          </button>
        </div>
      </div>

      {/* Scoreboard */}
      <div className="scoreboard">
        <div className="scoreboard-teams">
          <div className="scoreboard-team">
            <img src={homeTeam?.logo_url || '/images/default-team.png'} alt="" className="scoreboard-team-logo" />
            <span className="scoreboard-team-name">{homeTeam?.name}</span>
          </div>

          <div className="scoreboard-score">
            <span className="score-number">{match.home_score || 0}</span>
            <span className="score-separator">:</span>
            <span className="score-number">{match.away_score || 0}</span>
          </div>

          <div className="scoreboard-team">
            <img src={awayTeam?.logo_url || '/images/default-team.png'} alt="" className="scoreboard-team-logo" />
            <span className="scoreboard-team-name">{awayTeam?.name}</span>
          </div>
        </div>

        <div className="scoreboard-info">
          <span>{match.league}</span>
          <span>•</span>
          <span className={`match-status-badge ${match.status}`}>
            {STATUS_LABELS[match.status] || match.status}
          </span>
        </div>
      </div>

      {/* Match Status Controls */}
      <div className="match-controls">
        {match.status === 'scheduled' && (
          <button className="control-btn start" onClick={() => requestStatusUpdate('first_half', "1-Taymni boshlashni tasdiqlaysizmi?")}>
            ▶ 1-Taym Boshlash
          </button>
        )}
        {match.status === 'first_half' && (
          <button className="control-btn halftime" onClick={() => requestStatusUpdate('half_time', "Tanaffusni boshlashni tasdiqlaysizmi?")}>
            ⏸ Tanaffus
          </button>
        )}
        {match.status === 'half_time' && (
          <button className="control-btn start" onClick={() => requestStatusUpdate('second_half', "2-Taymni boshlashni tasdiqlaysizmi?")}>
            ▶ 2-Taym Boshlash
          </button>
        )}
        {(match.status === 'first_half' || match.status === 'second_half') && (
          <button className="control-btn finish" onClick={requestFinishMatch}>
            🏁 Yakunlash
          </button>
        )}
        {match.status === 'finished' && (
          <button className="control-btn" style={{background: '#475569', color: 'white'}} onClick={() => requestStatusUpdate('scheduled', "O'yin holatini orqaga qaytarishni tasdiqlaysizmi? O'yin qayta 'Rejalashtirilgan' holatiga o'tadi.")}>
            ⏪ Holatni qayta tiklash
          </button>
        )}
      </div>

      {/* Event Buttons */}
      <div className="event-buttons">
        {Object.entries(EVENT_TYPES).map(([key, val]) => (
          <button
            key={key}
            className="event-btn"
            onClick={() => openEventModal(key)}
            disabled={!isLive && match.status !== 'half_time'}
          >
            <span className="event-btn-icon">{val.icon}</span>
            <span className="event-btn-label">{val.label}</span>
          </button>
        ))}
      </div>

      {/* Timeline */}
      <div className="timeline-section">
        <h3>Voqealar</h3>
        {events.length === 0 ? (
          <div className="timeline-empty">Hali voqealar yo'q</div>
        ) : (
          <div className="timeline">
            {events.map(event => (
              <div key={event.id} className="timeline-item">
                <span className="timeline-minute">{event.minute}'</span>
                <span className="timeline-icon">{EVENT_TYPES[event.event_type]?.icon}</span>
                <div className="timeline-details">
                  <div className="timeline-player">
                    {event.player?.first_name} {event.player?.last_name}
                  </div>
                  <div className="timeline-team">{event.team?.name}</div>
                </div>
                {match.status !== 'finished' && (
                  <button className="timeline-delete" onClick={() => handleDeleteEvent(event)}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Event Modal */}
      {showEventModal && (
        <div className="event-modal-overlay" onClick={() => setShowEventModal(false)}>
          <div className="event-modal" onClick={e => e.stopPropagation()}>
            <h3>{EVENT_TYPES[eventType]?.icon} {EVENT_TYPES[eventType]?.label} qo'shish</h3>
            
            <div className="form-group">
              <label>Jamoa</label>
              <select value={selectedTeamId} onChange={e => { setSelectedTeamId(e.target.value); setSelectedPlayerId(''); }}>
                <option value="">Jamoani tanlang</option>
                <option value={match.home_team_id}>{homeTeam?.name} (Mezbon)</option>
                <option value={match.away_team_id}>{awayTeam?.name} (Mehmon)</option>
              </select>
            </div>

            <div className="form-group">
              <label>O'yinchi</label>
              <select value={selectedPlayerId} onChange={e => setSelectedPlayerId(e.target.value)} disabled={!selectedTeamId}>
                <option value="">O'yinchini tanlang</option>
                {getPlayersForTeam().map(p => (
                  <option key={p.id} value={p.id}>
                    {p.player_number ? `#${p.player_number} ` : ''}{p.first_name} {p.last_name} ({p.position || '-'})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Daqiqa</label>
              <input
                type="number"
                min="1"
                max="120"
                placeholder="Masalan: 23"
                value={eventMinute}
                onChange={e => setEventMinute(e.target.value)}
              />
            </div>

            <div className="event-modal-actions">
              <button className="btn-modal-cancel" onClick={() => setShowEventModal(false)}>Bekor</button>
              <button
                className="btn-modal-save"
                onClick={handleSaveEvent}
                disabled={!selectedTeamId || !selectedPlayerId || !eventMinute}
              >
                Saqlash
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal.isOpen && (
        <div className="event-modal-overlay">
          <div className="event-modal confirm-modal">
            <h3>Tasdiqlash</h3>
            <p>{confirmModal.message}</p>
            <div className="event-modal-actions">
              <button className="btn-modal-cancel" onClick={() => setConfirmModal({ isOpen: false, action: null, message: '' })}>Bekor qilish</button>
              <button className="btn-modal-save" style={{background: '#ef4444'}} onClick={confirmModal.action}>Tasdiqlash</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MatchControl;
