import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { 
  ArrowLeft, Trash2, Monitor, Share2, Play, Pause, RotateCcw, 
  Clock, ChevronLeft, ChevronRight, Video, Wifi, WifiOff, Settings
} from 'lucide-react';
import { obsService } from '../services/obsService';
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

const ORPHAN_REPLAYS_BY_MATCH = new Map();

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

  // Active Team Roster Switcher ('home' or 'away')
  const [activeRosterTeam, setActiveRosterTeam] = useState('home');

  // Live Timer State
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const timerRef = useRef(null);

  // Penalty Shootout State
  const [homePenalties, setHomePenalties] = useState(0);
  const [awayPenalties, setAwayPenalties] = useState(0);
  const [showPenaltySection, setShowPenaltySection] = useState(false);

  // Event modal state & saving loading state
  const [showEventModal, setShowEventModal] = useState(false);
  const [eventType, setEventType] = useState('goal');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [eventMinute, setEventMinute] = useState('');
  const [savingEvent, setSavingEvent] = useState(false);

  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, action: null, message: '' });

  // OBS WebSocket Integration state
  const [isObsConnected, setIsObsConnected] = useState(false);
  const [obsAddress, setObsAddress] = useState('ws://localhost:4455');
  const [obsPassword, setObsPassword] = useState('');
  const [showObsModal, setShowObsModal] = useState(false);
  const [isTriggeringReplay, setIsTriggeringReplay] = useState(false);
  const [orgStingerUrl, setOrgStingerUrl] = useState('');

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

  // OBS WebSocket Auto-Connect Effect (Strictly separated per field: 1-maydon vs 2-maydon)
  useEffect(() => {
    if (!match) return;
    const locationKey = match?.location?.includes('2-maydon') ? 'stream2' : 'stream1';
    const defaultPortAddress = locationKey === 'stream2' ? 'ws://localhost:4456' : 'ws://localhost:4455';
    const savedAddress = localStorage.getItem(`obs_address_${locationKey}`) || defaultPortAddress;
    const savedPassword = localStorage.getItem(`obs_password_${locationKey}`) || '';
    
    setObsAddress(savedAddress);
    setObsPassword(savedPassword);

    const unsub = obsService.onStatusChange((connected) => {
      setIsObsConnected(connected);
    });

    const switchFieldConnection = async () => {
      if (obsService.isConnected()) {
        await obsService.disconnect();
      }
      await obsService.connect(savedAddress, savedPassword);
    };

    switchFieldConnection().catch(() => {});

    return () => {
      unsub();
    };
  }, [match?.id, match?.location]);

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

      // Fetch organization info for custom Stinger logo animation
      if (matchData.organization_id) {
        const { data: orgData } = await supabase
          .from('organizations')
          .select('stinger_url')
          .eq('id', matchData.organization_id)
          .single();
        if (orgData?.stinger_url) {
          setOrgStingerUrl(orgData.stinger_url);
        }
      }

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

  const handleConnectObs = async (e) => {
    if (e) e.preventDefault();
    const locationKey = match?.location?.includes('2-maydon') ? 'stream2' : 'stream1';
    localStorage.setItem(`obs_address_${locationKey}`, obsAddress);
    localStorage.setItem(`obs_password_${locationKey}`, obsPassword);
    localStorage.setItem('obs_websocket_address', obsAddress);
    localStorage.setItem('obs_websocket_password', obsPassword);

    try {
      const res = await obsService.connect(obsAddress, obsPassword);
      if (res.success) {
        setIsObsConnected(true);
        alert(`${match?.location || '1-Maydon'} OBS Studio-ga va paroli muvaffaqiyatli ulandi va saqlandi!`);
        setShowObsModal(false);
      } else {
        setIsObsConnected(false);
        alert(`OBS WebSocket Sozlamalari va paroli saqlandi!\n\n(Eslatma: Hozirda OBS Studio o'chiq yoki ulanmadi: ${res.error || 'Server javob bermadi'})`);
        setShowObsModal(false);
      }
    } catch (err) {
      alert(`OBS WebSocket Sozlamalari saqlandi!`);
      setShowObsModal(false);
    }
  };

  const handleManualReplay = async () => {
    if (!isObsConnected) {
      setShowObsModal(true);
      return;
    }
    setIsTriggeringReplay(true);
    try {
      await obsService.triggerGoalReplay({
        stingerUrl: orgStingerUrl || null,
        mainScene: 'MainScene',
        replayScene: 'ReplayScene',
        replaySource: 'ReplaySource'
      });
    } catch (err) {
      alert(`Replay xatoligi: ${err.message || 'OBS replay bajarilmadi'}`);
    } finally {
      setIsTriggeringReplay(false);
    }
  };

  const executeStatusChange = async (newStatus) => {
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

    setMatch(prev => ({ ...prev, ...updateData }));

    const targetId = match?.id || id;
    try {
      await supabase.from('matches').update(updateData).eq('id', targetId);
      if (!isNaN(Number(targetId))) {
        await supabase.from('matches').update(updateData).eq('id', Number(targetId));
      }
    } catch (e) {
      console.warn('Status update error:', e);
    }
  };

  const requestStatusUpdate = (newStatus, message) => {
    setConfirmModal({
      isOpen: true,
      message,
      action: async () => {
        try {
          await executeStatusChange(newStatus);
        } catch (err) {
          console.error('Status change error:', err);
        } finally {
          setConfirmModal({ isOpen: false, action: null, message: '' });
        }
      }
    });
  };

  const requestFinishMatch = () => {
    setConfirmModal({
      isOpen: true,
      message: "O'yinni yakunlashni tasdiqlaysizmi?",
      action: async () => {
        try {
          const homeGoals = events.filter(e => e.event_type === 'goal' && e.team_id === match.home_team_id).length;
          const awayGoals = events.filter(e => e.event_type === 'goal' && e.team_id === match.away_team_id).length;

          const finalHomeScore = homeGoals > 0 ? homeGoals : (match.home_score || 0);
          const finalAwayScore = awayGoals > 0 ? awayGoals : (match.away_score || 0);

          setIsTimerRunning(false);

          const finishData = { 
            status: 'finished', 
            home_score: finalHomeScore, 
            away_score: finalAwayScore 
          };

          setMatch(prev => ({ 
            ...prev, 
            ...finishData 
          }));

          const targetId = match?.id || id;
          await supabase.from('matches').update(finishData).eq('id', targetId);
          if (!isNaN(Number(targetId))) {
            await supabase.from('matches').update(finishData).eq('id', Number(targetId));
          }
        } catch (err) {
          console.error('Finish match error:', err);
        } finally {
          setConfirmModal({ isOpen: false, action: null, message: '' });
        }
      }
    });
  };

  // Open Event Modal directly or pre-filled for a specific player
  const openEventModal = (type, teamId = '', playerId = '') => {
    setEventType(type);
    setSelectedTeamId(teamId || (match?.home_team_id || ''));
    setSelectedPlayerId(playerId || '');
    setEventMinute(getCurrentMinute().toString());
    setSavingEvent(false);
    setShowEventModal(true);
  };

  const handleSaveEvent = async () => {
    if (!selectedTeamId || !selectedPlayerId || !eventMinute || savingEvent) return;

    setSavingEvent(true);
    try {
      const minuteVal = parseInt(eventMinute) || getCurrentMinute();
      const isGoal = eventType === 'goal';

      // Check if there is an existing orphan replay from a recently deleted mistake goal
      const orphanReplay = ORPHAN_REPLAYS_BY_MATCH.get(String(id));
      const isOrphanFresh = orphanReplay && (Date.now() - orphanReplay.timestamp < 10 * 60 * 1000);
      const existingReplayUrl = isGoal && isOrphanFresh ? orphanReplay.url : null;
      if (existingReplayUrl) {
        ORPHAN_REPLAYS_BY_MATCH.delete(String(id));
      }

      const { error } = await supabase.from('match_events').insert([{
        match_id: id,
        team_id: selectedTeamId,
        player_id: selectedPlayerId,
        event_type: eventType,
        type: eventType,
        minute: minuteVal,
        replay_video_url: existingReplayUrl || null,
      }]);

      if (!error) {
        // If it's a goal, automatically increment the score and trigger OBS replay
        if (eventType === 'goal') {
          const isHome = selectedTeamId === match.home_team_id;
          const newHomeScore = (match.home_score || 0) + (isHome ? 1 : 0);
          const newAwayScore = (match.away_score || 0) + (isHome ? 0 : 1);
          
          await supabase.from('matches').update({
            home_score: newHomeScore,
            away_score: newAwayScore,
            updated_at: new Date().toISOString(),
          }).eq('id', id);

          setMatch(prev => ({ ...prev, home_score: newHomeScore, away_score: newAwayScore }));

          // Auto-trigger OBS Goal Replay if OBS is connected
          if (isObsConnected) {
            obsService.triggerGoalReplay({ stingerUrl: orgStingerUrl }).catch(err => {
              console.warn('Avto-replay uzatishda xatolik:', err);
            });
          }
        }

        await fetchEvents();
        setShowEventModal(false);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingEvent(false);
    }
  };

  const handleDeleteEvent = async (event) => {
    if (!window.confirm("Bu voqeani o'chirishni tasdiqlaysizmi?")) return;

    if (event.event_type === 'goal' && event.replay_video_url) {
      ORPHAN_REPLAYS_BY_MATCH.set(String(id), {
        url: event.replay_video_url,
        timestamp: Date.now(),
      });
    }

    const { error } = await supabase.from('match_events').delete().eq('id', event.id);
    if (!error) {
      if (event.event_type === 'goal') {
        const isHome = event.team_id === match.home_team_id;
        const newHomeScore = Math.max(0, (match.home_score || 0) - (isHome ? 1 : 0));
        const newAwayScore = Math.max(0, (match.away_score || 0) - (isHome ? 0 : 1));
        
        await supabase.from('matches').update({
          home_score: newHomeScore,
          away_score: newAwayScore,
          updated_at: new Date().toISOString(),
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

  const currentRosterPlayers = activeRosterTeam === 'home' ? sortedHomePlayers : sortedAwayPlayers;
  const currentRosterTeam = activeRosterTeam === 'home' ? homeTeam : awayTeam;
  const currentRosterTeamId = activeRosterTeam === 'home' ? match?.home_team_id : match?.away_team_id;

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
        <div className="header-top-row">
          <button className="btn-back" onClick={() => navigate('/schedule')}>
            <ArrowLeft size={20} />
          </button>
          
          <div className="match-header-actions">
            {/* OBS Status Indicator Badge */}
            <button 
              className={`obs-action-btn ${isObsConnected ? 'obs-connected' : 'obs-disconnected'}`}
              onClick={() => setShowObsModal(true)}
              style={{ background: isObsConnected ? '#15803d' : '#991b1b', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
              title="OBS WebSocket Sozlamalari"
            >
              {isObsConnected ? <Wifi size={16} /> : <WifiOff size={16} />}
              <span className="btn-text-desktop">{isObsConnected ? 'OBS Ulandi' : 'OBS Sozlash'}</span>
            </button>

            <div className="obs-divider"></div>
            <button className="obs-action-btn obs-text-btn" style={{background: '#475569'}} onClick={copyControlPanelLink} title="Panelni ulashish">
              <Share2 size={16} className="btn-icon-mobile" /> <span className="btn-text-desktop">Boshqaruvni ulashish</span>
            </button>
            <div className="obs-divider"></div>
            <button className="obs-action-btn obs-text-btn" style={{background: '#1e40af'}} onClick={copyObsLink} title="OBS Linkini nusxalash">
              <Monitor size={16} className="btn-icon-mobile" /> <span className="btn-text-desktop">{match?.location?.includes('2-maydon') ? '2-Maydon (OBS)' : '1-Maydon (OBS)'}</span>
            </button>
          </div>
        </div>

        <div className="header-info-subtext">
          {match.league} • {match.location || '1-Maydon'}
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
        {(!match.status || match.status === 'scheduled' || match.status === 'not_started' || match.status === 'pending' || match.status === 'upcoming') && (
          <button className="control-btn start" onClick={() => requestStatusUpdate('first_half', "1-Taymni boshlashni tasdiqlaysizmi?")}>
            <Play size={16} /> 1-Taym Boshlash
          </button>
        )}
        {(match.status === 'first_half' || match.status === 'live' || match.status === 'in_progress') && (
          <button className="control-btn halftime" onClick={() => requestStatusUpdate('half_time', "Tanaffusni boshlashni tasdiqlaysizmi?")}>
            <Pause size={16} /> Tanaffus
          </button>
        )}
        {(match.status === 'half_time' || match.status === 'break') && (
          <button className="control-btn start" onClick={() => requestStatusUpdate('second_half', "2-Taymni boshlashni tasdiqlaysizmi?")}>
            <Play size={16} /> 2-Taym Boshlash
          </button>
        )}
        {(match.status === 'second_half' || match.status === 'extra_time') && (
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

      {/* Single Team Roster Section with Arrow & Tab Switcher (< >) */}
      <div className="single-roster-container">
        {/* Team Switcher Bar */}
        <div className="team-switcher-header">
          <button 
            className="team-switch-arrow"
            onClick={() => setActiveRosterTeam(prev => prev === 'home' ? 'away' : 'home')}
            title="Oldingi jamoaga o'tish"
          >
            <ChevronLeft size={28} />
          </button>

          <div className="team-switch-info">
            <div className="team-tabs">
              <button 
                className={`team-tab-btn ${activeRosterTeam === 'home' ? 'active' : ''}`}
                onClick={() => setActiveRosterTeam('home')}
              >
                <img src={homeTeam?.logo_url || '/images/default-team.png'} alt="" />
                <span>{homeTeam?.name} (Mezbon)</span>
              </button>

              <button 
                className={`team-tab-btn ${activeRosterTeam === 'away' ? 'active' : ''}`}
                onClick={() => setActiveRosterTeam('away')}
              >
                <img src={awayTeam?.logo_url || '/images/default-team.png'} alt="" />
                <span>{awayTeam?.name} (Mehmon)</span>
              </button>
            </div>
          </div>

          <button 
            className="team-switch-arrow"
            onClick={() => setActiveRosterTeam(prev => prev === 'home' ? 'away' : 'home')}
            title="Keyingi jamoaga o'tish"
          >
            <ChevronRight size={28} />
          </button>
        </div>

        {/* Selected Team Roster List */}
        <div className="roster-card single-roster-card">
          <div className="roster-header">
            <img src={currentRosterTeam?.logo_url || '/images/default-team.png'} alt="" />
            <h3>{currentRosterTeam?.name} ({activeRosterTeam === 'home' ? 'Mezbon' : 'Mehmon'})</h3>
            <span className="roster-count">{currentRosterPlayers.length} ta o'yinchi</span>
          </div>

          <div className="roster-list">
            {currentRosterPlayers.length === 0 ? (
              <div className="roster-empty">Tarkib kiritilmagan</div>
            ) : (
              currentRosterPlayers.map(player => (
                <div key={player.id} className="roster-item">
                  <div className={`player-number-badge ${activeRosterTeam === 'away' ? 'away' : ''}`}>
                    #{player.player_number || '-'}
                  </div>
                  <div className="player-name-info">
                    <span className="player-full-name">{player.first_name} {player.last_name}</span>
                    <span className="player-pos">{player.position || 'O\'yinchi'}</span>
                  </div>
                  
                  {/* Quick Action Buttons for Player */}
                  <div className="player-quick-actions">
                    <button onClick={() => openEventModal('goal', currentRosterTeamId, player.id)} title="Gol ⚽">⚽ <span className="quick-btn-label">Gol</span></button>
                    <button onClick={() => openEventModal('assist', currentRosterTeamId, player.id)} title="Assist 👟">👟 <span className="quick-btn-label">Assist</span></button>
                    <button onClick={() => openEventModal('yellow_card', currentRosterTeamId, player.id)} title="Sariq kartochka 🟨">🟨</button>
                    <button onClick={() => openEventModal('red_card', currentRosterTeamId, player.id)} title="Qizil kartochka 🟥">🟥</button>
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
        <div className="event-modal-overlay" onClick={() => !savingEvent && setShowEventModal(false)}>
          <div className="event-modal" onClick={e => e.stopPropagation()}>
            <h3>{EVENT_TYPES[eventType]?.icon} {EVENT_TYPES[eventType]?.label} qo'shish</h3>
            
            <div className="form-group">
              <label>Jamoa</label>
              <select value={selectedTeamId} onChange={e => { setSelectedTeamId(e.target.value); setSelectedPlayerId(''); }} disabled={savingEvent}>
                <option value="">Jamoani tanlang</option>
                <option value={match.home_team_id}>{homeTeam?.name} (Mezbon)</option>
                <option value={match.away_team_id}>{awayTeam?.name} (Mehmon)</option>
              </select>
            </div>

            <div className="form-group">
              <label>O'yinchi (Raqami bo'yicha tartiblangan)</label>
              <select value={selectedPlayerId} onChange={e => setSelectedPlayerId(e.target.value)} disabled={!selectedTeamId || savingEvent}>
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
                disabled={savingEvent}
              />
            </div>

            <div className="event-modal-actions">
              <button className="btn-modal-cancel" onClick={() => setShowEventModal(false)} disabled={savingEvent}>Bekor</button>
              <button
                className="btn-modal-save"
                onClick={handleSaveEvent}
                disabled={savingEvent || !selectedTeamId || !selectedPlayerId || !eventMinute}
              >
                {savingEvent ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="btn-spinner">⏳</span> Saqlanmoqda...
                  </span>
                ) : (
                  'Saqlash'
                )}
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
      {/* OBS Settings Modal */}
      {showObsModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '420px' }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Video size={24} color="#7c3aed" /> OBS WebSocket Sozlamalari
            </h2>
            <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '15px' }}>
              Admin panel OBS Studio bilan WebSocket 5 (port 4455) orqali ulanadi va 20s gol takrorini efirga beradi.
            </p>
            <form onSubmit={handleConnectObs}>
              <div className="form-group">
                <label>OBS WebSocket Manzili (Address):</label>
                <input
                  type="text"
                  value={obsAddress}
                  onChange={(e) => setObsAddress(e.target.value)}
                  placeholder="ws://localhost:4455"
                  required
                />
              </div>

              <div className="form-group">
                <label>OBS Paroli (Server Password):</label>
                <input
                  type="password"
                  value={obsPassword}
                  onChange={(e) => setObsPassword(e.target.value)}
                  placeholder="Agar bo'sh bo'lsa, qoldiring"
                />
              </div>

              <div style={{ marginTop: '10px', fontSize: '12px', color: '#cbd5e1' }}>
                Holat: <strong style={{ color: isObsConnected ? '#22c55e' : '#ef4444' }}>{isObsConnected ? '🟢 Ulanib turibdi' : '🔴 Ulanmagan'}</strong>
              </div>

              <div className="modal-actions" style={{ marginTop: '20px' }}>
                <button type="button" className="btn-cancel" onClick={() => setShowObsModal(false)}>Yopish</button>
                <button type="submit" className="btn-save" style={{ background: '#7c3aed' }}>Ulanish</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default MatchControl;
