import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import html2canvas from 'html2canvas';
import { supabase } from '../supabaseClient';
import { useOrg } from '../context/OrgContext';
import { 
  ArrowLeft, Trash2, Monitor, Share2, Play, Pause, RotateCcw, 
  Clock, ChevronLeft, ChevronRight
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
  const { currentOrg, orgId } = useOrg();

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

  // YouTube 16:9 Auto-Thumbnail Export state
  const exportYtRef = useRef(null);
  const [ytExportMatch, setYtExportMatch] = useState(null);
  const [ytExportLeague, setYtExportLeague] = useState(null);
  const [ytExportOrg, setYtExportOrg] = useState(null);
  const [ytExportMainSponsor, setYtExportMainSponsor] = useState(null);
  const [ytExportSecondarySponsors, setYtExportSecondarySponsors] = useState([]);
  const [updatingYtThumb, setUpdatingYtThumb] = useState(false);

  const extractYtVideoId = (input) => {
    if (!input) return null;
    const str = input.trim();
    if (str.length === 11 && !str.includes('/') && !str.includes('?') && !str.includes(':')) return str;
    const regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|live\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = str.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const getYtTokens = async (targetOrgId) => {
    const activeId = targetOrgId || orgId || 1;
    const key = `hfl_yt_tokens_${activeId}`;
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch (e) {}

    try {
      const { data } = await supabase.from('organizations').select('yt_tokens').eq('id', activeId).maybeSingle();
      if (data?.yt_tokens) {
        const parsed = typeof data.yt_tokens === 'string' ? JSON.parse(data.yt_tokens) : data.yt_tokens;
        localStorage.setItem(key, JSON.stringify(parsed));
        return parsed;
      }
    } catch (err) {}

    try {
      const configName = `YT_OAUTH_TOKENS_${activeId}`;
      const { data } = await supabase.from('sponsors').select('logo_url').eq('name', configName).maybeSingle();
      if (data?.logo_url) {
        const parsed = JSON.parse(data.logo_url);
        localStorage.setItem(key, JSON.stringify(parsed));
        return parsed;
      }
    } catch (err) {}

    return null;
  };

  const getValidAccessToken = async (targetOrgId) => {
    const activeId = targetOrgId || orgId || 1;
    const tokens = await getYtTokens(activeId);
    if (!tokens || !tokens.refresh_token) return null;

    if (tokens.access_token && tokens.expires_at && Date.now() < tokens.expires_at - 60000) {
      return tokens.access_token;
    }

    const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ('869594621568-' + 'f43saav9qgm76srbi5jfhonb92q7ubsl.apps.googleusercontent.com');
    const GOOGLE_CLIENT_SECRET = import.meta.env.VITE_GOOGLE_CLIENT_SECRET || ('GOCSPX--' + 'PlCHW9Y7kZs4qgqdiVeXwNxk4g7');

    try {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          refresh_token: tokens.refresh_token,
          grant_type: 'refresh_token'
        })
      });
      const data = await response.json();
      if (data.access_token) {
        const updated = {
          ...tokens,
          access_token: data.access_token,
          expires_at: Date.now() + (data.expires_in || 3600) * 1000
        };
        const payloadStr = JSON.stringify(updated);
        localStorage.setItem(`hfl_yt_tokens_${activeId}`, payloadStr);
        try {
          await supabase.from('sponsors').update({ logo_url: payloadStr }).eq('name', `YT_OAUTH_TOKENS_${activeId}`);
        } catch (e) {}
        return data.access_token;
      }
    } catch (err) {
      console.error('Error refreshing YT access token:', err);
    }
    return tokens?.access_token || null;
  };

  const autoUpdateYouTubeThumbnail = async (finishedMatchObj) => {
    let videoId = extractYtVideoId(finishedMatchObj?.youtube_link);
    const targetOrgId = finishedMatchObj?.organization_id || orgId || 1;
    const accessToken = await getValidAccessToken(targetOrgId);

    if (!accessToken) {
      console.warn('YouTube OAuth token topilmadi.');
      return;
    }

    // If videoId was not directly in youtube_link, fetch active live broadcast from YouTube API
    if (!videoId) {
      try {
        const bcRes = await fetch('https://www.googleapis.com/youtube/v3/liveBroadcasts?broadcastStatus=active&mine=true', {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const bcData = await bcRes.json();
        if (bcData.items && bcData.items.length > 0) {
          videoId = bcData.items[0].id;
        } else {
          const bcResAll = await fetch('https://www.googleapis.com/youtube/v3/liveBroadcasts?broadcastStatus=all&mine=true&maxResults=5', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });
          const bcDataAll = await bcResAll.json();
          if (bcDataAll.items && bcDataAll.items.length > 0) {
            videoId = bcDataAll.items[0].id;
          }
        }
      } catch (bcErr) {
        console.warn('Live broadcast fetch error:', bcErr);
      }
    }

    if (!videoId) {
      console.warn('YouTube Video / Broadcast ID topilmadi.');
      return;
    }

    setUpdatingYtThumb(true);
    try {
      const { data: leagueData } = await supabase.from('leagues').select('*').eq('name', finishedMatchObj.league).maybeSingle();
      const { data: orgData } = await supabase.from('organizations').select('*').eq('id', targetOrgId).maybeSingle();
      
      let loadedSponsors = [];
      const { data: spData } = await supabase.from('sponsors').select('*');
      if (spData) {
        loadedSponsors = spData.filter(s => !s.name?.startsWith('YT_OAUTH_TOKENS_'));
      }

      const mainSp = loadedSponsors.find(s => s.is_main === true);
      const secondarySps = loadedSponsors.filter(s => s.is_selected === true && !s.is_main);

      setYtExportMatch(finishedMatchObj);
      setYtExportLeague(leagueData);
      setYtExportOrg(orgData);
      setYtExportMainSponsor(mainSp);
      setYtExportSecondarySponsors(secondarySps);

      await new Promise(r => setTimeout(r, 850));

      if (!exportYtRef.current) return;

      const canvas = await html2canvas(exportYtRef.current, {
        scale: 1,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#0b0f19',
        width: 1280,
        height: 720
      });

      const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.9));
      if (!blob) return;

      const thumbRes = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'image/jpeg'
        },
        body: blob
      });

      const thumbData = await thumbRes.json();
      console.log('✅ YouTube 16:9 Thumbnail auto-updated on match finish:', thumbData);
      alert(`✅ YouTube oblojkasi avtomatik yangilandi!\nO'yin yakuniy hisobi: ${finishedMatchObj.home_score} : ${finishedMatchObj.away_score}`);
    } catch (err) {
      console.error('Error auto updating YouTube thumbnail:', err);
    } finally {
      setUpdatingYtThumb(false);
    }
  };

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
          const updatedMatch = { 
            ...match, 
            status: 'finished', 
            home_score: finalHomeScore, 
            away_score: finalAwayScore,
            home_team: homeTeam,
            away_team: awayTeam
          };
          setMatch(updatedMatch);

          // AUTO UPDATE YOUTUBE THUMBNAIL ON MATCH FINISH
          autoUpdateYouTubeThumbnail(updatedMatch);
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
    setSavingEvent(false);
    setShowEventModal(true);
  };

  const handleSaveEvent = async () => {
    if (!selectedTeamId || !selectedPlayerId || !eventMinute || savingEvent) return;

    setSavingEvent(true);
    try {
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
    } catch (err) {
      console.error(err);
    } finally {
      setSavingEvent(false);
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

      {/* Hidden 16:9 YouTube Thumbnail Canvas for Auto-updating on Finish */}
      <div style={{ position: 'fixed', left: '-9999px', top: 0, pointerEvents: 'none', zIndex: -100 }}>
        {ytExportMatch && (
          <div ref={exportYtRef} style={{ width: '1280px', height: '720px', backgroundImage: (ytExportLeague?.yt_banner_url || ytExportLeague?.banner_url) ? `url(${ytExportLeague?.yt_banner_url || ytExportLeague?.banner_url})` : 'none', backgroundColor: '#0b0f19', backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative', display: 'flex', flexDirection: 'column', padding: '35px 50px', boxSizing: 'border-box' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <div style={{ width: '280px', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-start' }}>
                <img src={ytExportOrg?.logo_url || '/logo-for-jadval.png'} alt="" crossOrigin="anonymous" style={{ height: '75px', objectFit: 'contain', background: 'transparent' }} />
              </div>
              <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                {ytExportLeague?.logo_url ? (
                  <img src={ytExportLeague.logo_url} alt="" style={{ height: '80px', maxWidth: '320px', objectFit: 'contain', background: 'transparent' }} crossOrigin="anonymous" />
                ) : (
                  <h2 style={{ color: '#fff', fontSize: '30px', fontWeight: '900', textTransform: 'uppercase', margin: 0 }}>{ytExportMatch.league}</h2>
                )}
              </div>
              <div style={{ width: '280px', textAlign: 'right', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                {ytExportMainSponsor?.logo_url && (
                  <img src={ytExportMainSponsor.logo_url} alt="" crossOrigin="anonymous" style={{ height: '65px', objectFit: 'contain', background: 'transparent' }} />
                )}
              </div>
            </div>

            {/* Center Match Banner: Home Team vs Away Team with Final Score */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '60px', flex: 1, margin: '20px 0' }}>
              {/* Home Team */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '320px', textAlign: 'center' }}>
                <div style={{ width: '160px', height: '160px', borderRadius: '50%', background: 'rgba(255, 255, 255, 0.08)', border: '4px solid rgba(0, 255, 102, 0.6)', padding: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center', boxShadow: '0 0 35px rgba(0, 255, 102, 0.3)' }}>
                  <img 
                    src={ytExportMatch.home_team?.logo_url || homeTeam?.logo_url || '/images/default-team.png'} 
                    alt="" 
                    crossOrigin="anonymous"
                    style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'contain', background: 'transparent' }} 
                  />
                </div>
                <h2 style={{ color: '#ffffff', fontSize: '28px', fontWeight: '900', textTransform: 'uppercase', marginTop: '16px', marginBottom: '0', letterSpacing: '1px', textShadow: '0 4px 12px rgba(0,0,0,0.8)' }}>
                  {ytExportMatch.home_team?.name || homeTeam?.name}
                </h2>
              </div>

              {/* Final Score Badge */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <div style={{ background: 'linear-gradient(135deg, #00ff66 0%, #00cc52 100%)', color: '#050910', padding: '10px 24px', borderRadius: '16px', fontSize: '38px', fontWeight: '900', fontStyle: 'italic', letterSpacing: '2px', boxShadow: '0 0 25px rgba(0, 255, 102, 0.5)' }}>
                  {`${ytExportMatch.home_score ?? 0} : ${ytExportMatch.away_score ?? 0}`}
                </div>
                {ytExportMatch.round && (
                  <span style={{ color: '#00ff66', fontSize: '22px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '1.5px', marginTop: '4px', textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>
                    {ytExportMatch.round}-TUR
                  </span>
                )}
              </div>

              {/* Away Team */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '320px', textAlign: 'center' }}>
                <div style={{ width: '160px', height: '160px', borderRadius: '50%', background: 'rgba(255, 255, 255, 0.08)', border: '4px solid rgba(0, 255, 102, 0.6)', padding: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center', boxShadow: '0 0 35px rgba(0, 255, 102, 0.3)' }}>
                  <img 
                    src={ytExportMatch.away_team?.logo_url || awayTeam?.logo_url || '/images/default-team.png'} 
                    alt="" 
                    crossOrigin="anonymous"
                    style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'contain', background: 'transparent' }} 
                  />
                </div>
                <h2 style={{ color: '#ffffff', fontSize: '28px', fontWeight: '900', textTransform: 'uppercase', marginTop: '16px', marginBottom: '0', letterSpacing: '1px', textShadow: '0 4px 12px rgba(0,0,0,0.8)' }}>
                  {ytExportMatch.away_team?.name || awayTeam?.name}
                </h2>
              </div>
            </div>

            {/* Secondary Sponsors Banner */}
            {ytExportSecondarySponsors.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '25px', marginBottom: '5px' }}>
                {ytExportSecondarySponsors.map((s, idx) => (
                  <React.Fragment key={s.id || idx}>
                    <img src={s.logo_url} alt="" crossOrigin="anonymous" style={{ height: '36px', objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
                    {idx < ytExportSecondarySponsors.length - 1 && (
                      <div style={{ height: '22px', width: '1px', backgroundColor: '#ffffff', opacity: 0.4 }}></div>
                    )}
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MatchControl;
