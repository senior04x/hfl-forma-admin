import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import './ObsScoreboard.css';

const DEFAULT_LEAGUE_LOGOS = {
  'Super liga': '/super-liga.PNG',
  'Pro liga': '/Pro-liga.PNG',
  '3-liga': '/3-liga.PNG',
  'Europa ligasi': '/europen-liga.PNG',
  'Chempionlar ligasi': '/chemp-liga.PNG',
  '7x7 liga': '/7x7-liga.png',
};

const ObsScoreboard = () => {
  const { id } = useParams();
  const [activeMatchId, setActiveMatchId] = useState(null);
  const [match, setMatch] = useState(null);
  const [leagueData, setLeagueData] = useState(null);
  const [homeTeam, setHomeTeam] = useState(null);
  const [awayTeam, setAwayTeam] = useState(null);
  const [activeEvent, setActiveEvent] = useState(null);
  const [isEventExiting, setIsEventExiting] = useState(false);

  // Realtime Timer State for OBS
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const timerRef = useRef(null);
  const timerStartedAtRef = useRef(null);
  const baseTimerSecondsRef = useRef(0);

  // 1. Identify active match ID (Direct Match ID vs. Stream + Organization)
  useEffect(() => {
    if (!id) return;

    const queryParams = new URLSearchParams(window.location.search);
    const targetOrgId = queryParams.get('org_id') || 1;

    if (id !== 'stream1' && id !== 'stream2') {
      // Direct Match ID
      setActiveMatchId(id);
      return;
    }

    const findLiveMatch = async () => {
      let query = supabase.from('matches').select('*').order('id', { ascending: false });

      if (targetOrgId) {
        query = query.eq('organization_id', targetOrgId);
      }

      const { data } = await query;

      if (data && data.length > 0) {
        const isStream1 = id === 'stream1';
        const isStream2 = id === 'stream2';

        const isMatchForThisStream = (m) => {
          const loc = String(m.location || '').toLowerCase();
          if (isStream2) {
            return loc.includes('2') || loc.includes('stream2');
          }
          if (isStream1) {
            return loc.includes('1') || loc.includes('stream1') || (!loc.includes('2') && !loc.includes('stream2'));
          }
          return true;
        };

        // Filter matches strictly for this stream field
        const fieldMatches = data.filter(isMatchForThisStream);
        const candidateList = fieldMatches.length > 0 ? fieldMatches : data;

        // 1. Prefer currently active playing match on this field ('first_half', 'second_half', 'half_time')
        let selectedMatch = candidateList.find((m) =>
          ['first_half', 'second_half', 'half_time'].includes(m.status)
        );

        // 2. Fallback to latest match on this field so realtime connection stays active
        if (!selectedMatch) {
          selectedMatch = candidateList[0];
        }

        if (selectedMatch) {
          setActiveMatchId(selectedMatch.id);
          setMatch(selectedMatch);
        }
      }
    };

    findLiveMatch();

    const streamChannel = supabase.channel(`global-matches-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, (payload) => {
        const newMatch = payload.new;
        if (newMatch) {
          if (!targetOrgId || String(newMatch.organization_id) === String(targetOrgId)) {
            const isStream1 = id === 'stream1';
            const isStream2 = id === 'stream2';
            const loc = String(newMatch.location || '').toLowerCase();

            const isMatchForThisStream =
              (isStream2 && (loc.includes('2') || loc.includes('stream2'))) ||
              (isStream1 && (loc.includes('1') || loc.includes('stream1') || (!loc.includes('2') && !loc.includes('stream2'))));

            if (isMatchForThisStream) {
              setActiveMatchId(newMatch.id);
              setMatch(newMatch);
            }
          }
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(streamChannel);
    };
  }, [id]);

  // Dynamic Half Duration Calculation (masalan 25 daqiqa yoki 30 daqiqa)
  const getHalfDurationSecs = (mObj, lObj) => {
    const lName = (mObj?.league || '').toLowerCase();
    let mins = 30;
    if (lName.includes('7x7')) mins = 25;
    else if (lName.includes('3-liga') || lName.includes('3 liga')) mins = 25;
    
    if (mObj?.half_duration) mins = Number(mObj.half_duration);
    else if (lObj?.half_duration) mins = Number(lObj.half_duration);
    else if (lObj?.match_duration) mins = Math.round(Number(lObj.match_duration) / 2);
    else if (mObj?.match_duration) mins = Math.round(Number(mObj.match_duration) / 2);
    
    return mins * 60;
  };

  // Helper to apply persistent timer payload in OBS (Countdown Mode)
  const applyTimerPayload = (payload) => {
    if (!payload) return;
    const isRunning = String(payload.is_timer_running) === 'true' || payload.is_timer_running === true;
    const startedAt = payload.timer_started_at;
    const defaultSec = getHalfDurationSecs(match, leagueData);
    
    let baseSec = payload.timer_seconds !== undefined && payload.timer_seconds !== null 
      ? Number(payload.timer_seconds) 
      : defaultSec;

    if (baseSec === 0 && (payload.status === 'scheduled' || !isRunning)) {
      baseSec = defaultSec;
    }

    setIsTimerRunning(isRunning);
    baseTimerSecondsRef.current = baseSec;
    timerStartedAtRef.current = startedAt || null;

    if (isRunning && startedAt) {
      const startedMs = new Date(startedAt).getTime();
      if (!isNaN(startedMs)) {
        const elapsedSec = Math.max(0, Math.floor((Date.now() - startedMs) / 1000));
        const remaining = Math.max(0, baseSec - elapsedSec);
        setTimerSeconds(remaining);
      } else {
        setTimerSeconds(baseSec);
      }
    } else {
      setTimerSeconds(baseSec);
    }
  };

  // Realtime Countdown Timer interval for OBS display (25:00 -> 00:00)
  useEffect(() => {
    if (isTimerRunning) {
      timerRef.current = setInterval(() => {
        if (timerStartedAtRef.current) {
          const startedMs = new Date(timerStartedAtRef.current).getTime();
          if (!isNaN(startedMs)) {
            const elapsedSec = Math.max(0, Math.floor((Date.now() - startedMs) / 1000));
            const remaining = Math.max(0, baseTimerSecondsRef.current - elapsedSec);
            setTimerSeconds(remaining);
            if (remaining === 0) {
              setIsTimerRunning(false);
            }
            return;
          }
        }
        setTimerSeconds(prev => {
          if (prev <= 1) {
            setIsTimerRunning(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isTimerRunning]);

  // 2. Fetch match details & subscribe to live updates
  useEffect(() => {
    if (!activeMatchId) return;

    fetchData(activeMatchId);

    // 1. Web BroadcastChannel for local 0ms instant sync (same PC / OBS)
    let bcMatch = null;
    let bcStream = null;
    try {
      bcMatch = new BroadcastChannel(`amatora_timer_${activeMatchId}`);
      bcMatch.onmessage = (e) => {
        if (e.data) applyTimerPayload(e.data);
      };

      const streamKey = id?.includes('stream2') ? 'stream2' : 'stream1';
      bcStream = new BroadcastChannel(`amatora_${streamKey}_timer`);
      bcStream.onmessage = (e) => {
        if (e.data) applyTimerPayload(e.data);
      };
    } catch (e) {}

    // 2. Fast Supabase Broadcast Channels (Match-level + Stream-level for 0ms cross-network sync)
    const streamKey = id?.includes('stream2') ? 'stream2' : 'stream1';
    const fastTimerChannel = supabase
      .channel(`obs_fast_timer_${activeMatchId}`)
      .on('broadcast', { event: 'timer_update' }, (msg) => {
        if (msg.payload) applyTimerPayload(msg.payload);
      })
      .subscribe();

    const fastStreamChannel = supabase
      .channel(`obs_fast_${streamKey}`)
      .on('broadcast', { event: 'timer_update' }, (msg) => {
        if (msg.payload) applyTimerPayload(msg.payload);
      })
      .subscribe();

    // 3. High-Frequency Lightweight Fallback Polling (Every 1s for resilience)
    const fallbackPollInterval = setInterval(async () => {
      try {
        const { data: matchRow } = await supabase
          .from('matches')
          .select('timer_seconds, timer_started_at, is_timer_running, status, home_score, away_score')
          .eq('id', activeMatchId)
          .maybeSingle();

        if (matchRow) {
          applyTimerPayload(matchRow);
          if (matchRow.home_score !== undefined || matchRow.away_score !== undefined) {
            setMatch((prev) => ({ ...prev, ...matchRow }));
          }
        }

        const { data: timerRow } = await supabase
          .from('sponsors')
          .select('logo_url')
          .eq('name', `MATCH_TIMER_${activeMatchId}`)
          .maybeSingle();

        if (timerRow?.logo_url) {
          try {
            const parsed = JSON.parse(timerRow.logo_url);
            applyTimerPayload(parsed);
          } catch (pe) {}
        }
      } catch (pollErr) {}
    }, 1000);

    // 4. Subscribe to real-time match changes
    const matchSubscription = supabase
      .channel(`obs-match-${activeMatchId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'matches',
          filter: `id=eq.${activeMatchId}`
        },
        (payload) => {
          setMatch((prev) => ({ ...prev, ...payload.new }));
          if (payload.new) {
            applyTimerPayload(payload.new);
          }
        }
      )
      .subscribe();

    // 5. Subscribe to timer changes via sponsors table realtime
    const timerSubscription = supabase
      .channel(`obs-timer-${activeMatchId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sponsors',
          filter: `name=eq.MATCH_TIMER_${activeMatchId}`
        },
        (payload) => {
          const record = payload.new || payload.record;
          if (record?.logo_url) {
            try {
              const parsed = JSON.parse(record.logo_url);
              applyTimerPayload(parsed);
            } catch (e) {}
          }
        }
      )
      .subscribe();

    // Subscribe to goal & card events for lower third graphic
    const eventsSubscription = supabase
      .channel(`obs-match-events-${activeMatchId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'match_events',
          filter: `match_id=eq.${activeMatchId}`
        },
        async (payload) => {
          const newEvent = payload.new;
          
          if (['goal', 'yellow_card', 'red_card'].includes(newEvent.event_type)) {
            let pName = newEvent.event_type === 'goal' ? 'GOOOL' : 'O\'YINCHI';
            let pPhoto = null;
            if (newEvent.player_id) {
              const { data: player } = await supabase.from('applications').select('first_name, last_name, photo_url').eq('id', newEvent.player_id).maybeSingle();
              if (player) {
                pName = `${player.first_name || ''} ${player.last_name || ''}`.trim() || pName;
                pPhoto = player.photo_url;
              }
            }
            const { data: tData } = await supabase.from('teams').select('name, logo_url').eq('id', newEvent.team_id).maybeSingle();
            
            const eventPayload = { 
              playerName: pName, 
              playerPhoto: pPhoto, 
              teamName: tData?.name, 
              teamLogo: tData?.logo_url,
              eventType: newEvent.event_type 
            };

            // All events (goals, yellow cards, red cards) wait 25 seconds (20s replay + 5s delay after replay finishes)
            const delayMs = 25000;

            setTimeout(() => {
              setActiveEvent(eventPayload);
              setIsEventExiting(false);
              
              setTimeout(() => {
                setIsEventExiting(true);
              }, 7000);

              setTimeout(() => {
                setActiveEvent(null);
                setIsEventExiting(false);
              }, 8000);
            }, delayMs);
          }
        }
      )
      .subscribe();

    return () => {
      try { if (bcMatch) bcMatch.close(); } catch (e) {}
      try { if (bcStream) bcStream.close(); } catch (e) {}
      clearInterval(fallbackPollInterval);
      supabase.removeChannel(fastTimerChannel);
      supabase.removeChannel(fastStreamChannel);
      supabase.removeChannel(matchSubscription);
      supabase.removeChannel(timerSubscription);
      supabase.removeChannel(eventsSubscription);
    };
  }, [activeMatchId]);

  // Subscribe to real-time league logo and background image updates
  useEffect(() => {
    if (!activeMatchId) return;

    const leaguesSubscription = supabase
      .channel(`obs-admin-leagues-live-${activeMatchId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'leagues',
        },
        () => {
          fetchData(activeMatchId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(leaguesSubscription);
    };
  }, [activeMatchId]);

  const fetchData = async (matchId) => {
    try {
      const { data: matchData } = await supabase
        .from('matches')
        .select('*')
        .eq('id', matchId)
        .maybeSingle();
      
      if (matchData) {
        setMatch(matchData);

        // Fetch League Data (logo & background image) for THIS specific organization
        if (matchData.league || matchData.organization_id) {
          try {
            let lQuery = supabase.from('leagues').select('*');
            if (matchData.organization_id) {
              lQuery = lQuery.eq('organization_id', matchData.organization_id);
            }
            const { data: lDataList } = await lQuery;
            if (lDataList && lDataList.length > 0) {
              const matchedL = lDataList.find(
                (l) => l.name?.trim().toLowerCase() === matchData.league?.trim().toLowerCase()
              );
              setLeagueData(matchedL || lDataList[0]);
            }
          } catch (e) {}
        }

        let homeObj = null;
        let awayObj = null;

        if (matchData.home_team_id) {
          const { data: h } = await supabase.from('teams').select('*').eq('id', matchData.home_team_id).maybeSingle();
          homeObj = h;
        }
        if (!homeObj) {
          homeObj = {
            name: matchData.home_team_name || 'Mezbon',
            logo_url: matchData.home_team_logo || 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=100&auto=format&fit=crop'
          };
        }

        if (matchData.away_team_id) {
          const { data: a } = await supabase.from('teams').select('*').eq('id', matchData.away_team_id).maybeSingle();
          awayObj = a;
        }
        if (!awayObj) {
          awayObj = {
            name: matchData.away_team_name || 'Mehmon',
            logo_url: matchData.away_team_logo || 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=100&auto=format&fit=crop'
          };
        }

        setHomeTeam(homeObj);
        setAwayTeam(awayObj);

        // Fetch timer state
        const { data: timerSp } = await supabase
          .from('sponsors')
          .select('logo_url')
          .eq('name', `MATCH_TIMER_${matchId}`)
          .maybeSingle();

        if (timerSp?.logo_url) {
          try {
            const parsed = JSON.parse(timerSp.logo_url);
            applyTimerPayload(parsed);
          } catch (e) {
            applyTimerPayload(matchData);
          }
        } else {
          applyTimerPayload(matchData);
        }
      }
    } catch (err) {
      console.error('Error fetching OBS data:', err);
    }
  };

  const isDirectMatch = Boolean(id && id !== 'stream1' && id !== 'stream2');
  const isPlayingStatus = Boolean(
    match && ['first_half', 'second_half'].includes(match.status)
  );

  const [shouldRender, setShouldRender] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [renderMatch, setRenderMatch] = useState(null);

  useEffect(() => {
    if (isPlayingStatus) {
      setRenderMatch(match);
      setShouldRender(true);
      setIsExiting(false);
    } else if (shouldRender && !isExiting) {
      setIsExiting(true);
      const timer = setTimeout(() => {
        setShouldRender(false);
        setIsExiting(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isPlayingStatus, match]);

  if (!activeMatchId || !renderMatch || !shouldRender) {
    return null; // Empty transparent background when not rendering
  }

  const displayMatch = isExiting ? renderMatch : match;

  // Determine gradient based on league
  let gradientClass = 'theme-default';
  if (displayMatch.league === '3-liga') gradientClass = 'theme-3liga';
  else if (displayMatch.league === 'Pro liga') gradientClass = 'theme-pro';
  else if (displayMatch.league === 'Super liga') gradientClass = 'theme-super';
  else if (displayMatch.league === 'Europa ligasi') gradientClass = 'theme-europa';
  else if (displayMatch.league === 'Chempionlar ligasi') gradientClass = 'theme-chemp';
  else if (displayMatch.league === '7x7 liga') gradientClass = 'theme-7x7';

  const leagueBgUrl =
    leagueData?.export_bg_url ||
    leagueData?.background_url ||
    leagueData?.bg_url ||
    leagueData?.banner_url ||
    null;

  // Format status for top bar
  const formatStatus = (status) => {
    if (status === 'first_half') return '1-TAYM';
    if (status === 'second_half') return '2-TAYM';
    if (status === 'half_time') return 'TANAFFUS';
    if (status === 'scheduled') return 'REJALASHTIRILGAN';
    if (status === 'finished') return 'YAKUNLANDI';
    return '';
  };

  // Calculate elapsed time (Count-UP: to'g'ri sanash) for OBS Scoreboard Display
  const getElapsedSeconds = () => {
    const halfSec = getHalfDurationSecs(match, leagueData);
    if (!match || match.status === 'scheduled' || match.status === 'not_started' || match.status === 'pending') {
      return 0;
    }
    if (match.status === 'half_time' || match.status === 'break') {
      return halfSec;
    }
    if (match.status === 'second_half' || match.status === 'extra_time') {
      const secondHalfElapsed = Math.max(0, halfSec - timerSeconds);
      return halfSec + secondHalfElapsed;
    }
    if (match.status === 'finished') {
      return halfSec * 2;
    }
    // first_half / default
    return Math.max(0, halfSec - timerSeconds);
  };

  // Format Timer MM:SS (Count-UP display for OBS)
  const formatTimer = (rawSeconds) => {
    const totalSeconds = getElapsedSeconds();
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const statusText = formatStatus(displayMatch.status);
  const visibilityClass = isExiting ? 'transformer-exit' : 'transformer-enter';

  return (
    <div className={`obs-container ${gradientClass}`}>
      <div className={`obs-scoreboard transformer-wrapper ${visibilityClass}`}>
        <div className="obs-top-row">
          <div className="obs-team obs-home-team">
            <div className="obs-team-content" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <img src={homeTeam?.logo_url || '/images/default-team.png'} className="obs-scoreboard-logo" alt="" />
              {homeTeam?.name || 'Mezbon'}
            </div>
          </div>
          
          <div className="obs-score">
            {leagueBgUrl && (
              <>
                <div className="obs-score-bg-overlay" style={{ backgroundImage: `url(${leagueBgUrl})` }} />
                <div className="obs-score-darken-shade" />
              </>
            )}
            <div className="obs-score-content">
              {displayMatch.home_score ?? 0} - {displayMatch.away_score ?? 0}
            </div>
          </div>
          
          <div className="obs-team obs-away-team">
            <div className="obs-team-content" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {awayTeam?.name || 'Mehmon'}
              <img src={awayTeam?.logo_url || '/images/default-team.png'} className="obs-scoreboard-logo" alt="" />
            </div>
          </div>
        </div>

        <div className="obs-separator">
          {leagueBgUrl && (
            <div className="obs-separator-bg-overlay" style={{ backgroundImage: `url(${leagueBgUrl})` }} />
          )}
        </div>

        <div className="obs-bottom-row">
          <div className="obs-league-name">
            <div className="obs-league-content">
              {displayMatch.league ? displayMatch.league.toUpperCase() : 'HFL'}
              {statusText && (
                <span className="obs-status-text">
                  {' '}• {statusText} (<span className={`obs-timer-display ${!isTimerRunning ? 'obs-timer-paused' : ''}`}>{formatTimer(timerSeconds)}</span>)
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Lower Third Goal/Card Player Graphic */}
      {activeEvent && (
        <div className={`obs-lower-third-container transformer-wrapper ${isEventExiting ? 'transformer-exit' : 'transformer-enter'}`}>
          <div style={{ display: 'flex', gap: '6px' }}>
            <div className="obs-lt-top-bar">
              {leagueBgUrl && (
                <div className="obs-separator-bg-overlay" style={{ backgroundImage: `url(${leagueBgUrl})` }} />
              )}
               <div className="obs-lt-content" style={{ position: 'relative', zIndex: 2 }}>
                 {activeEvent.teamName?.toUpperCase()}
               </div>
            </div>
            
            {activeEvent.eventType === 'goal' && (
              <div className="obs-lt-event-box obs-bg-black">
                 <div className="obs-lt-content" style={{ display: 'flex', alignItems: 'center' }}>
                   <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                     <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.75 3.31L13 7.82l-2 0-1.75-2.51c.9-.22 1.83-.22 2.75 0zM17.43 8.35l-3.38 1.34 0 3.93 2.8 2.1c-.88 1.4-2.18 2.52-3.7 3.2l-1.15-3.32-2 0-1.15 3.32c-1.52-.68-2.82-1.8-3.7-3.2l2.8-2.1 0-3.93-3.38-1.34c.48-1.29 1.25-2.43 2.22-3.35l2.4 1.7 1-.95 1 .95 2.4-1.7c.97.92 1.74 2.06 2.22 3.35z" />
                   </svg>
                 </div>
              </div>
            )}
            {activeEvent.eventType === 'yellow_card' && (
              <div className="obs-lt-event-box obs-bg-yellow" style={{ width: '40px' }}></div>
            )}
            {activeEvent.eventType === 'red_card' && (
              <div className="obs-lt-event-box obs-bg-red" style={{ width: '40px' }}></div>
            )}
          </div>
          <div className="obs-lt-bottom-bar">
             <div className="obs-lt-content obs-lt-player-info">
               {activeEvent.playerPhoto ? (
                 <img src={activeEvent.playerPhoto} className="obs-lt-player-photo" alt="" />
               ) : (
                 <div className="obs-lt-player-photo-placeholder"></div>
               )}
               <div className="obs-lt-name-container">
                 {activeEvent.playerName.split(' ').map((n, i) => <span key={i} className={i===0?'obs-lt-fname':'obs-lt-lname'}>{n}</span>)}
               </div>
               {activeEvent.teamLogo && (
                 <img src={activeEvent.teamLogo} className="obs-lt-team-logo" alt="" />
               )}
             </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default ObsScoreboard;
