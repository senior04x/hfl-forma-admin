import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import './ObsScoreboard.css';

const ObsScoreboard = () => {
  const { id } = useParams();
  const [match, setMatch] = useState(null);
  const [homeTeam, setHomeTeam] = useState(null);
  const [awayTeam, setAwayTeam] = useState(null);

  useEffect(() => {
    fetchData();

    // Subscribe to real-time changes for this match
    const matchSubscription = supabase
      .channel(`match-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'matches',
          filter: `id=eq.${id}`
        },
        (payload) => {
          setMatch((prev) => ({ ...prev, ...payload.new }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(matchSubscription);
    };
  }, [id]);

  const fetchData = async () => {
    try {
      const { data: matchData } = await supabase
        .from('matches')
        .select('*')
        .eq('id', id)
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

  if (!match || !homeTeam || !awayTeam) {
    return null; // Empty transparent background until loaded
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

  return (
    <div className={`obs-container ${gradientClass}`}>
      <div className="obs-scoreboard">
        
        <div className="obs-top-row">
          <div className="obs-team obs-home-team">
            <div className="obs-team-content">{homeTeam.name}</div>
          </div>
          
          <div className="obs-score">
            <div className="obs-score-content">
              {match.home_score} - {match.away_score}
            </div>
          </div>
          
          <div className="obs-team obs-away-team">
            <div className="obs-team-content">{awayTeam.name}</div>
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
    </div>
  );
};

export default ObsScoreboard;
