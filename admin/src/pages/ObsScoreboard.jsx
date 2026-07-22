import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import './ObsScoreboard.css';

const ObsScoreboard = () => {
  const { id } = useParams();
  const [activeMatchId, setActiveMatchId] = useState(null);
  const [match, setMatch] = useState(null);
  const [homeTeam, setHomeTeam] = useState(null);
  const [awayTeam, setAwayTeam] = useState(null);
  const [activeEvent, setActiveEvent] = useState(null);
  const [isEventExiting, setIsEventExiting] = useState(false);

  // Track specific streams via location
  useEffect(() => {
    if (id !== 'stream1' && id !== 'stream2') return;

    const locationFilter = id === 'stream1' ? '1-maydon' : '2-maydon';

    const findLiveMatch = async () => {
      const { data } = await supabase
        .from('matches')
        .select('id')
        .ilike('location', `%${locationFilter}%`)
        .in('status', ['first_half', 'half_time', 'second_half'])
        .order('id', { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        setActiveMatchId(data[0].id);
      }
    };

    findLiveMatch();

    const streamChannel = supabase.channel(`global-matches-${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches' }, (payload) => {
        const newMatch = payload.new;
        if (newMatch.location && newMatch.location.includes(locationFilter)) {
          if (['first_half', 'half_time', 'second_half'].includes(newMatch.status)) {
            setActiveMatchId(newMatch.id);
          }
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(streamChannel);
    };
  }, [id]);

  useEffect(() => {
    if (!activeMatchId) return;

    fetchData(activeMatchId);

    // Subscribe to real-time changes for this match
    const matchSubscription = supabase
      .channel(`match-${activeMatchId}`)
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
        }
      )
      .subscribe();

    // Subscribe to goal events
    const eventsSubscription = supabase
      .channel(`match-events-${activeMatchId}`)
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
              const { data: player } = await supabase.from('applications').select('first_name, last_name, photo_url').eq('id', newEvent.player_id).single();
              if (player) {
                pName = `${player.first_name} ${player.last_name}`;
                pPhoto = player.photo_url;
              }
            }
            const { data: tData } = await supabase.from('teams').select('name, logo_url').eq('id', newEvent.team_id).single();
            
            setActiveEvent({ 
              playerName: pName, 
              playerPhoto: pPhoto, 
              teamName: tData?.name, 
              teamLogo: tData?.logo_url,
              eventType: newEvent.event_type 
            });
            setIsEventExiting(false);
            
            setTimeout(() => {
              setIsEventExiting(true);
            }, 7000);

            setTimeout(() => {
              setActiveEvent(null);
              setIsEventExiting(false);
            }, 8000);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(matchSubscription);
      supabase.removeChannel(eventsSubscription);
    };
  }, [activeMatchId]);

  const fetchData = async (matchId) => {
    try {
      const { data: matchData } = await supabase
        .from('matches')
        .select('*')
        .eq('id', matchId)
        .single();
      
      if (matchData) {
        setMatch(matchData);
        
        const { data: hTeam } = await supabase.from('teams').select('*').eq('id', matchData.home_team_id).single();
        const { data: aTeam } = await supabase.from('teams').select('*').eq('id', matchData.away_team_id).single();
        
        setHomeTeam(hTeam);
        setAwayTeam(aTeam);
      }
    } catch (err) {
      console.error('Error fetching OBS data:', err);
    }
  };

  if (!activeMatchId || !match || !homeTeam || !awayTeam) {
    return null; // Empty transparent background until a match is pushed
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
    if (status === 'finished') return 'YAKUNLANDI';
    return '';
  };

  const statusText = formatStatus(match.status);

  const isHidden = match.status === 'half_time' || match.status === 'finished' || match.status === 'scheduled';
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
              {match.league.toUpperCase()}
              {statusText && <span className="obs-status-text"> • {statusText}</span>}
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
