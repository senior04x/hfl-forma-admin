import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase, supabaseAdmin } from '../supabaseClient';
import './ObsScoreboard.css';

const ObsScoreboard = () => {
  const { id } = useParams();
  const [activeMatchId, setActiveMatchId] = useState(null);
  const [match, setMatch] = useState(null);
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
    const targetOrgId = queryParams.get('org_id');

    if (id !== 'stream1' && id !== 'stream2') {
      setActiveMatchId(id);
      return;
    }

    const findLiveMatch = async () => {
      let query = supabaseAdmin.from('matches').select('*').order('id', { ascending: false });

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

        // 1. Prefer currently active live match on this field
        let selectedMatch = candidateList.find((m) =>
          ['first_half', 'half_time', 'second_half'].includes(m.status)
        );

        // 2. Fallback to latest match on this field
        if (!selectedMatch) {
          selectedMatch = candidateList[0];
        }

        if (selectedMatch) {
          setActiveMatchId(selectedMatch.id);
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
            }
          }
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(streamChannel);
    };
  }, [id]);

  // Helper to apply persistent timer payload in OBS
  const applyTimerPayload = (payload) => {
    if (!payload) return;
    const baseSec = payload.timer_seconds !== undefined ? Number(payload.timer_seconds) : 0;
    const isRunning = !!payload.is_timer_running;
    const startedAt = payload.timer_started_at;

    setIsTimerRunning(isRunning);
    baseTimerSecondsRef.current = baseSec;
    timerStartedAtRef.current = startedAt || null;

    if (isRunning && startedAt) {
      const startedMs = new Date(startedAt).getTime();
      if (!isNaN(startedMs)) {
        const elapsedSec = Math.max(0, Math.floor((Date.now() - startedMs) / 1000));
        setTimerSeconds(baseSec + elapsedSec);
      } else {
        setTimerSeconds(baseSec);
      }
    } else {
      setTimerSeconds(baseSec);
    }
  };

  // Timer interval for OBS display
  useEffect(() => {
    if (isTimerRunning) {
      timerRef.current = setInterval(() => {
        if (timerStartedAtRef.current) {
          const startedMs = new Date(timerStartedAtRef.current).getTime();
          if (!isNaN(startedMs)) {
            const elapsedSec = Math.max(0, Math.floor((Date.now() - startedMs) / 1000));
            setTimerSeconds(baseTimerSecondsRef.current + elapsedSec);
            return;
          }
        }
        setTimerSeconds(prev => prev + 1);
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

    // Subscribe to real-time match changes
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
          if (payload.new?.timer_seconds !== undefined || payload.new?.is_timer_running !== undefined) {
            applyTimerPayload(payload.new);
          }
        }
      )
      .subscribe();

    // Subscribe to timer changes via sponsors table fallback
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
              const { data: player } = await supabaseAdmin.from('applications').select('first_name, last_name, photo_url').eq('id', newEvent.player_id).maybeSingle();
              if (player) {
                pName = `${player.first_name || ''} ${player.last_name || ''}`.trim() || pName;
                pPhoto = player.photo_url;
              }
            }
            const { data: tData } = await supabaseAdmin.from('teams').select('name, logo_url').eq('id', newEvent.team_id).maybeSingle();
            
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
      supabase.removeChannel(matchSubscription);
      supabase.removeChannel(timerSubscription);
      supabase.removeChannel(eventsSubscription);
    };
  }, [activeMatchId]);

  const fetchData = async (matchId) => {
    try {
      const { data: matchData } = await supabaseAdmin
        .from('matches')
        .select('*')
        .eq('id', matchId)
        .maybeSingle();
      
      if (matchData) {
        setMatch(matchData);

        let homeObj = null;
        let awayObj = null;

        if (matchData.home_team_id) {
          const { data: h } = await supabaseAdmin.from('teams').select('*').eq('id', matchData.home_team_id).maybeSingle();
          homeObj = h;
        }
        if (!homeObj) {
          homeObj = {
            name: matchData.home_team_name || 'Mezbon',
            logo_url: matchData.home_team_logo || 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=100&auto=format&fit=crop'
          };
        }

        if (matchData.away_team_id) {
          const { data: a } = await supabaseAdmin.from('teams').select('*').eq('id', matchData.away_team_id).maybeSingle();
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
        const { data: timerSp } = await supabaseAdmin
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

  if (!activeMatchId || !match) {
    return null; // Empty transparent background until a match is loaded
  }

  // Determine gradient based on league
  let gradientClass = 'theme-default';
  if (match.league === '3-liga') gradientClass = 'theme-3liga';
  else if (match.league === 'Pro liga') gradientClass = 'theme-pro';
  else if (match.league === 'Super liga') gradientClass = 'theme-super';
  else if (match.league === 'Europa ligasi') gradientClass = 'theme-europa';
  else if (match.league === 'Chempionlar ligasi') gradientClass = 'theme-chemp';
  else if (match.league === '7x7 liga') gradientClass = 'theme-7x7';

  // Format status for top bar
  const formatStatus = (status) => {
    if (status === 'first_half') return '1-TAYM';
    if (status === 'second_half') return '2-TAYM';
    if (status === 'half_time') return 'TANAFFUS';
    if (status === 'scheduled') return 'REJALASHTIRILGAN';
    if (status === 'finished') return 'YAKUNLANDI';
    return '';
  };

  // Format Timer MM:SS
  const formatTimer = (totalSeconds) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const statusText = formatStatus(match.status);

  const isHidden = match.status === 'finished';
  const visibilityClass = isHidden ? 'transformer-exit' : 'transformer-enter';

  return (
    <div className={`obs-container ${gradientClass}`}>
      <div className={`obs-scoreboard transformer-wrapper ${visibilityClass}`}>
        
        <div className="obs-top-row">
          <div className="obs-team obs-home-team">
            <div className="obs-team-content" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <img src={homeTeam.logo_url || '/images/default-team.png'} className="obs-scoreboard-logo" alt="" />
              {homeTeam.name}
            </div>
          </div>
          
          <div className="obs-score">
            <div className="obs-score-content">
              {match.home_score} - {match.away_score}
            </div>
          </div>
          
          <div className="obs-team obs-away-team">
            <div className="obs-team-content" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {awayTeam.name}
              <img src={awayTeam.logo_url || '/images/default-team.png'} className="obs-scoreboard-logo" alt="" />
            </div>
          </div>
        </div>

        <div className="obs-separator"></div>

        <div className="obs-bottom-row">
          <div className="obs-league-name">
            <div className="obs-league-content">
              {match.league ? match.league.toUpperCase() : 'HFL'}
              {statusText && <span className="obs-status-text"> • {statusText} ({formatTimer(timerSeconds)})</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Lower Third Goal/Card Player Graphic */}
      {activeEvent && (
        <div className={`obs-lower-third-container transformer-wrapper ${isEventExiting ? 'transformer-exit' : 'transformer-enter'}`}>
          <div style={{ display: 'flex', gap: '6px' }}>
            <div className="obs-lt-top-bar">
               <div className="obs-lt-content">
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
