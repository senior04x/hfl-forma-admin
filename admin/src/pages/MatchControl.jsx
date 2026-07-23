import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { 
  ArrowLeft, Trash2, Monitor, Share2, Play, Pause, RotateCcw, 
  Clock
} from 'lucide-react';
import './MatchControl.css';

const EVENT_TYPES = {
  goal: { icon: '⚽', label: 'Gol', color: '#22c55e' },
  assist: { icon: '👟', label: 'Assist', color: '#3b82f6' },
  yellow_card: { icon: '🟨', label: 'Sariq kartochka', color: '#eab308' },
  red_card: { icon: '🟥', label: 'Qizil kartochka', color: '#ef4444' },
  substitution: { icon: '🔄', label: 'Almashtirish', color: '#a855f7' }
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

  // Live Timer State
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const timerRef = useRef(null);

  // Penalty Shootout State
  const [homePenalties, setHomePenalties] = useState(0);
  const [awayPenalties, setAwayPenalties] = useState(0);
  const [showPenaltySection, setShowPenaltySection] = useState(false);

  // Event modal state
  const [showEventModal, setShowEventModal] = useState(false);
  const [eventType, setEventType] = useState('goal');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [eventMinute, setEventMinute] = useState('');

  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, action: null, message: '' });

  const copyObsLink = () => {
    let streamId = 'stream1';
    if (match?.location?.includes('2-maydon')) streamId = 'stream2';
    
    const obsLink = `${window.location.origin}/obs/scoreboard/${streamId}`;
    navigator.clipboard.writeText(obsLink);
    alert(`${match?.location || '1-maydon'} uchun OBS Link nusxalandi!\n\n${obsLink}`);
  };

  const copyControlPanelLink = () => {
    const link = `${window.location.origin}/match/${id}`;
    navigator.clipboard.writeText(link);
    alert("Boshqaruv paneli havolasi nusxalandi!\n\n" + link);
  };

  // Timer Effect
  useEffect(() => {
    if (isTimerRunning) {
      timerRef.current = setInterval(() => {
        setTimerSeconds(prev => prev + 1);
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isTimerRunning]);

  // Sync Timer with Match Status
  useEffect(() => {
    if (!match) return;

    if (match.status === 'first_half') {
      setIsTimerRunning(true);
    } else if (match.status === 'second_half') {
      setIsTimerRunning(true);
      setTimerSeconds(prev => (prev < 2700 ? 2700 : prev)); // Start 2nd half at 45:00
    } else {
      setIsTimerRunning(false);
    }

    if (match.home_penalty_score !== undefined && match.away_penalty_score !== undefined) {
      setHomePenalties(match.home_penalty_score || 0);
      setAwayPenalties(match.away_penalty_score || 0);
    }
  }, [match?.status]);

  useEffect(() => {
    fetchMatchData();

    // Supabase Realtime Subscription
    const matchChannel = supabase
      .channel(`match_control_${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_events', filter: `match_id=eq.${id}` }, () => {
        fetchEvents();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${id}` }, (payload) => {
        setMatch(prev => ({ ...prev, ...payload.new }));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(matchChannel);
    };
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
      .select('*, player:player_id(first_name, last_name, player_number), team:team_id(name)')
      .eq('match_id', matchId || id)
      .order('minute', { ascending: true });
    
    setEvents(data || []);
  };

  // Current calculated match minute
  const getCurrentMinute = () => {
    const currentMin = Math.floor(timerSeconds / 60) + 1;
    return Math.max(1, currentMin);
  };

  // Format Timer MM:SS
  const formatTimer = (totalSeconds) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Quick Score Adjuster (+1 / -1)
  const adjustScore = async (teamType, delta) => {
    if (!match) return;
    const isHome = teamType === 'home';
    const currentScore = isHome ? (match.home_score || 0) : (match.away_score || 0);
    const newScore = Math.max(0, currentScore + delta);

    const updatePayload = isHome ? { home_score: newScore } : { away_score: newScore };

    setMatch(prev => ({
      ...prev,
      [isHome ? 'home_score' : 'away_score']: newScore
    }));

    await supabase.from('matches').update(updatePayload).eq('id', id);
  };

  // Quick Penalty Score Adjuster (+1 / -1)
  const adjustPenaltyScore = async (teamType, delta) => {
    if (!match) return;
    const isHome = teamType === 'home';
    const currentPen = isHome ? homePenalties : awayPenalties;
    const newPen = Math.max(0, currentPen + delta);

    if (isHome) setHomePenalties(newPen);
    else setAwayPenalties(newPen);

    const updatePayload = isHome ? { home_penalty_score: newPen } : { away_penalty_score: newPen };
    await supabase.from('matches').update(updatePayload).eq('id', id);
  };

  const requestStatusUpdate = (newStatus, message) => {
    setConfirmModal({
      isOpen: true,
      message,
      action: async () => {
        let updateData = { status: newStatus };
        if (newStatus === 'first_half') {
          setIsTimerRunning(true);
        } else if (newStatus === 'half_time') {
          setIsTimerRunning(false);
        } else if (newStatus === 'second_half') {
          setIsTimerRunning(true);
          setTimerSeconds(prev => (prev < 2700 ? 2700 : prev));
        } else if (newStatus === 'scheduled') {
          setIsTimerRunning(false);
          setTimerSeconds(0);
        }

        const { error } = await supabase.from('matches').update(updateData).eq('id', id);
        if (!error) setMatch(prev => ({ ...prev, ...updateData }));
        setConfirmModal({ isOpen: false, action: null, message: '' });
      }
    });
  };

  const requestFinishMatch = () => {
    setConfirmModal({
      isOpen: true,
      message: "O'yinni yakunlashni tasdiqlaysizmi?",
      action: async () => {
        const homeGoals = events.filter(e => e.event_type === 'goal' && e.team_id === match.home_team_id).length;
        const awayGoals = events.filter(e => e.event_type === 'goal' && e.team_id === match.away_team_id).length;

        // Use events count if goals exist, otherwise preserve manually adjusted score
        const finalHomeScore = homeGoals > 0 ? homeGoals : (match.home_score || 0);
        const finalAwayScore = awayGoals > 0 ? awayGoals : (match.away_score || 0);

        setIsTimerRunning(false);

        const { error } = await supabase
          .from('matches')
          .update({ 
            status: 'finished', 
            home_score: finalHomeScore, 
            away_score: finalAwayScore 
          })
          .eq('id', id);
        
        if (!error) {
          setMatch(prev => ({ 
            ...prev, 
            status: 'finished', 
            home_score: finalHomeScore, 
            away_score: finalAwayScore 
          }));
        }
        setConfirmModal({ isOpen: false, action: null, message: '' });
      }
    });
  };

  // Open Event Modal directly or pre-filled for a specific player
  const openEventModal = (type, teamId = '', playerId = '') => {
    setEventType(type);
    setSelectedTeamId(teamId || (match?.home_team_id || ''));
    setSelectedPlayerId(playerId || '');
    setEventMinute(getCurrentMinute().toString());
    setShowEventModal(true);
  };

  const handleSaveEvent = async () => {
    if (!selectedTeamId || !selectedPlayerId || !eventMinute) return;

    const minuteVal = parseInt(eventMinute) || getCurrentMinute();

    const { error } = await supabase.from('match_events').insert([{
      match_id: id,
      team_id: selectedTeamId,
      player_id: selectedPlayerId,
      event_type: eventType,
      minute: minuteVal
    }]);

    if (!error) {
      // If it's a goal, automatically increment the score
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

  // Helper to sort team players numerically by jersey number (1, 5, 10, 15...)
  const sortPlayersByNumber = (players) => {
    return [...players].sort((a, b) => {
      const numA = parseInt(a.player_number, 10) || 999;
      const numB = parseInt(b.player_number, 10) || 999;
      if (numA !== numB) return numA - numB;
      return (a.first_name || '').localeCompare(b.first_name || '');
    });
  };

  const sortedHomePlayers = sortPlayersByNumber(homePlayers);
  const sortedAwayPlayers = sortPlayersByNumber(awayPlayers);

  const getPlayersForTeam = () => {
    if (selectedTeamId === match?.home_team_id) return sortedHomePlayers;
    if (selectedTeamId === match?.away_team_id) return sortedAwayPlayers;
    return [];
  };

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
          <div>
            <h1 className="header-title">O'yin Boshqaruvi</h1>
            <div className="header-subtext">{match.league} • {match.location || '1-Maydon'}</div>
          </div>
        </div>
        
        <div className="match-header-actions">
          <button className="obs-action-btn obs-text-btn" style={{background: '#475569'}} onClick={copyControlPanelLink} title="Panelni ulashish">
            <Share2 size={16} className="btn-icon-mobile" /> <span className="btn-text-desktop">Boshqaruvni ulashish</span>
          </button>
          <div className="obs-divider"></div>
          <button className="obs-action-btn obs-text-btn" style={{background: '#1e40af'}} onClick={copyObsLink} title="OBS Linkini nusxalash">
            <Monitor size={16} className="btn-icon-mobile" /> <span className="btn-text-desktop">{match?.location?.includes('2-maydon') ? '2-Maydon (OBS)' : '1-Maydon (OBS)'}</span>
          </button>
        </div>
      </div>

      {/* Main Scoreboard */}
      <div className="scoreboard">
        <div className="scoreboard-teams">
          {/* Home Team */}
          <div className="scoreboard-team">
            <img src={homeTeam?.logo_url || '/images/default-team.png'} alt="" className="scoreboard-team-logo" />
            <span className="scoreboard-team-name">{homeTeam?.name}</span>
            <div className="score-adjuster-group">
              <button className="score-btn minus" onClick={() => adjustScore('home', -1)} title="Golni kamaytirish">-</button>
              <button className="score-btn plus" onClick={() => adjustScore('home', 1)} title="Gol qo'shish">+</button>
            </div>
          </div>

          {/* Main Score & Timer Display */}
          <div className="scoreboard-score-container">
            <div className="scoreboard-score">
              <span className="score-number">{match.home_score || 0}</span>
              <span className="score-separator">:</span>
              <span className="score-number">{match.away_score || 0}</span>
            </div>

            {/* Live Stopwatch Badge */}
            <div className="live-timer-badge">
              <Clock size={16} className={isTimerRunning ? 'timer-icon-pulsing' : ''} />
              <span className="timer-display">{formatTimer(timerSeconds)}</span>
              <span className="timer-minute">({getCurrentMinute()}')</span>
              <button 
                className="timer-control-btn"
                onClick={() => setIsTimerRunning(!isTimerRunning)}
                title={isTimerRunning ? 'Sekundomerni to\'xtatish' : 'Sekundomerni yurgizish'}
              >
                {isTimerRunning ? <Pause size={14} /> : <Play size={14} />}
              </button>
              <button 
                className="timer-control-btn reset"
                onClick={() => setTimerSeconds(match.status === 'second_half' ? 2700 : 0)}
                title="Taym boshiga qaytarish"
              >
                <RotateCcw size={12} />
              </button>
            </div>

            {/* Penalty Shootout Score Badge if present */}
            {(match.home_penalty_score > 0 || match.away_penalty_score > 0 || showPenaltySection) && (
              <div className="penalty-score-badge">
                <span>Penaltilar:</span>
                <strong>{homePenalties} : {awayPenalties}</strong>
              </div>
            )}
          </div>

          {/* Away Team */}
          <div className="scoreboard-team">
            <img src={awayTeam?.logo_url || '/images/default-team.png'} alt="" className="scoreboard-team-logo" />
            <span className="scoreboard-team-name">{awayTeam?.name}</span>
            <div className="score-adjuster-group">
              <button className="score-btn minus" onClick={() => adjustScore('away', -1)} title="Golni kamaytirish">-</button>
              <button className="score-btn plus" onClick={() => adjustScore('away', 1)} title="Gol qo'shish">+</button>
            </div>
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
            <Play size={16} /> 1-Taym Boshlash
          </button>
        )}
        {match.status === 'first_half' && (
          <button className="control-btn halftime" onClick={() => requestStatusUpdate('half_time', "Tanaffusni boshlashni tasdiqlaysizmi?")}>
            <Pause size={16} /> Tanaffus
          </button>
        )}
        {match.status === 'half_time' && (
          <button className="control-btn start" onClick={() => requestStatusUpdate('second_half', "2-Taymni boshlashni tasdiqlaysizmi?")}>
            <Play size={16} /> 2-Taym Boshlash
          </button>
        )}
        {(match.status === 'first_half' || match.status === 'second_half') && (
          <button className="control-btn finish" onClick={requestFinishMatch}>
            🏁 Yakunlash
          </button>
        )}
        {match.status === 'finished' && (
          <button className="control-btn reset-status" onClick={() => requestStatusUpdate('scheduled', "O'yin holatini orqaga qaytarishni tasdiqlaysizmi?")}>
            <RotateCcw size={14} /> Holatni qayta tiklash
          </button>
        )}

        <button 
          className="control-btn penalty-toggle"
          onClick={() => setShowPenaltySection(!showPenaltySection)}
        >
          ⚽ Penaltilar seriyasi {showPenaltySection ? '▲' : '▼'}
        </button>
      </div>

      {/* Penalty Shootout Section (If toggled or active) */}
      {showPenaltySection && (
        <div className="penalty-control-section">
          <h3>⚽ Penaltilar Seriyasi Boshqaruvi</h3>
          <div className="penalty-controls-grid">
            <div className="penalty-team-box">
              <span>{homeTeam?.name}</span>
              <div className="penalty-counter">
                <button onClick={() => adjustPenaltyScore('home', -1)}>-</button>
                <strong>{homePenalties}</strong>
                <button onClick={() => adjustPenaltyScore('home', 1)}>+</button>
              </div>
            </div>

            <div className="penalty-vs">vs</div>

            <div className="penalty-team-box">
              <span>{awayTeam?.name}</span>
              <div className="penalty-counter">
                <button onClick={() => adjustPenaltyScore('away', -1)}>-</button>
                <strong>{awayPenalties}</strong>
                <button onClick={() => adjustPenaltyScore('away', 1)}>+</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Event Buttons Shortcut */}
      <div className="event-buttons">
        {Object.entries(EVENT_TYPES).map(([key, val]) => (
          <button
            key={key}
            className="event-btn"
            style={{ borderBottom: `3px solid ${val.color}` }}
            onClick={() => openEventModal(key)}
          >
            <span className="event-btn-icon">{val.icon}</span>
            <span className="event-btn-label">{val.label}</span>
          </button>
        ))}
      </div>

      {/* Side-by-Side Team Roster Grid (Sorted Numerically by Jersey #) */}
      <div className="rosters-container">
        {/* Home Team Roster */}
        <div className="roster-card home-roster">
          <div className="roster-header">
            <img src={homeTeam?.logo_url || '/images/default-team.png'} alt="" />
            <h3>{homeTeam?.name} (Mezbon)</h3>
            <span className="roster-count">{sortedHomePlayers.length} ta o'yinchi</span>
          </div>

          <div className="roster-list">
            {sortedHomePlayers.length === 0 ? (
              <div className="roster-empty">Tarkib kiritilmagan</div>
            ) : (
              sortedHomePlayers.map(player => (
                <div key={player.id} className="roster-item">
                  <div className="player-number-badge">
                    #{player.player_number || '-'}
                  </div>
                  <div className="player-name-info">
                    <span className="player-full-name">{player.first_name} {player.last_name}</span>
                    <span className="player-pos">{player.position || 'O\'yinchi'}</span>
                  </div>
                  
                  {/* Quick Action Buttons for Player */}
                  <div className="player-quick-actions">
                    <button onClick={() => openEventModal('goal', match.home_team_id, player.id)} title="Gol ⚽">⚽</button>
                    <button onClick={() => openEventModal('assist', match.home_team_id, player.id)} title="Assist 👟">👟</button>
                    <button onClick={() => openEventModal('yellow_card', match.home_team_id, player.id)} title="Sariq kartochka 🟨">🟨</button>
                    <button onClick={() => openEventModal('red_card', match.home_team_id, player.id)} title="Qizil kartochka 🟥">🟥</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Away Team Roster */}
        <div className="roster-card away-roster">
          <div className="roster-header">
            <img src={awayTeam?.logo_url || '/images/default-team.png'} alt="" />
            <h3>{awayTeam?.name} (Mehmon)</h3>
            <span className="roster-count">{sortedAwayPlayers.length} ta o'yinchi</span>
          </div>

          <div className="roster-list">
            {sortedAwayPlayers.length === 0 ? (
              <div className="roster-empty">Tarkib kiritilmagan</div>
            ) : (
              sortedAwayPlayers.map(player => (
                <div key={player.id} className="roster-item">
                  <div className="player-number-badge away">
                    #{player.player_number || '-'}
                  </div>
                  <div className="player-name-info">
                    <span className="player-full-name">{player.first_name} {player.last_name}</span>
                    <span className="player-pos">{player.position || 'O\'yinchi'}</span>
                  </div>
                  
                  {/* Quick Action Buttons for Player */}
                  <div className="player-quick-actions">
                    <button onClick={() => openEventModal('goal', match.away_team_id, player.id)} title="Gol ⚽">⚽</button>
                    <button onClick={() => openEventModal('assist', match.away_team_id, player.id)} title="Assist 👟">👟</button>
                    <button onClick={() => openEventModal('yellow_card', match.away_team_id, player.id)} title="Sariq kartochka 🟨">🟨</button>
                    <button onClick={() => openEventModal('red_card', match.away_team_id, player.id)} title="Qizil kartochka 🟥">🟥</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Events Timeline */}
      <div className="timeline-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3>O'yin Voqealari</h3>
          <span className="events-count">{events.length} ta voqea</span>
        </div>

        {events.length === 0 ? (
          <div className="timeline-empty">Hali voqealar kiritilmagan</div>
        ) : (
          <div className="timeline">
            {events.map(event => (
              <div key={event.id} className="timeline-item">
                <span className="timeline-minute">{event.minute}'</span>
                <span className="timeline-icon">{EVENT_TYPES[event.event_type]?.icon}</span>
                <div className="timeline-details">
                  <div className="timeline-player">
                    {event.player?.player_number ? `#${event.player.player_number} ` : ''}
                    {event.player?.first_name} {event.player?.last_name}
                  </div>
                  <div className="timeline-team">{event.team?.name}</div>
                </div>
                <button className="timeline-delete" onClick={() => handleDeleteEvent(event)} title="O'chirish">
                  <Trash2 size={16} />
                </button>
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
              <label>O'yinchi (Raqami bo'yicha tartiblangan)</label>
              <select value={selectedPlayerId} onChange={e => setSelectedPlayerId(e.target.value)} disabled={!selectedTeamId}>
                <option value="">O'yinchini tanlang</option>
                {getPlayersForTeam().map(p => (
                  <option key={p.id} value={p.id}>
                    #{p.player_number || '?'} - {p.first_name} {p.last_name} ({p.position || '-'})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Daqiqa (Joriy daqiqa: {getCurrentMinute()}')</label>
              <input
                type="number"
                min="1"
                max="120"
                placeholder="Daqiqani kiriting"
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
