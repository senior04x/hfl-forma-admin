import React, { useMemo } from 'react';
import { Medal } from 'lucide-react';
import SponsorLogo from './SponsorLogo';
import './TopScorersExport.css';

export default function TopScorersExport({ exportRef, events, matches, teams, competition, organization, tournament, round, background, mainSponsor, sponsors }) {
  const scorers = useMemo(() => {
    const teamIds = new Set(teams.filter(t => (t.league || '').split(',').map(s => s.trim()).includes(competition?.name)).map(t => String(t.id)));
    const matchIds = new Set(matches.filter(m => {
      if (tournament) return String(m.tournament_id) === String(competition?.id);
      return !m.tournament_id && teamIds.has(String(m.home_team_id)) &&
        (!round || round === 'all' || String(m.round) === String(round));
    }).map(m => String(m.id)));
    const players = new Map();
    events.forEach(e => {
      if (e.event_type !== 'goal' || !matchIds.has(String(e.match_id))) return;
      const id = e.player_id || e.id;
      if (!players.has(id)) players.set(id, {
        id, name: [e.player?.first_name, e.player?.last_name].filter(Boolean).join(' ') || "O'yinchi",
        team: e.team?.name || 'Jamoa', avatar: e.player?.photo_url || e.team?.logo_url, goals: 0,
      });
      players.get(id).goals += 1;
    });
    return [...players.values()].sort((a, b) => b.goals - a.goals).slice(0, 10);
  }, [events, matches, teams, competition, tournament, round]);
  const roundLabel = tournament || !round || round === 'all' ? 'BARCHA TURLAR' : `${round}-TUR`;
  return (
    <div ref={exportRef} className="top-scorers-poster" aria-hidden="true" style={background ? { backgroundImage: `linear-gradient(rgba(10,13,18,.82), rgba(10,13,18,.82)), url(${background})` } : undefined}>
      <header className="top-scorers-header">
        <div className="top-scorers-brand">
          {competition?.isCollab ? <>
            <img src={competition.org1?.logo_url || organization?.logo_url || '/logo-for-jadval.png'} crossOrigin="anonymous" alt="" />
            <span>×</span><img src={competition.org2?.logo_url || '/llf-logo.png'} crossOrigin="anonymous" alt="" />
          </> : organization?.logo_url ? <img src={organization.logo_url} crossOrigin="anonymous" alt="" /> : <strong>AMATORA</strong>}
        </div>
        <div className="top-scorers-league">{competition?.logo_url ? <img src={competition.logo_url} crossOrigin="anonymous" alt="" /> : competition?.name}</div>
        <div className="top-scorers-main-sponsor">{mainSponsor ? <img src={mainSponsor} crossOrigin="anonymous" alt="" /> : 'OFFICIAL'}</div>
      </header>
      <main className="top-scorers-content">
        <div className="top-scorers-table">
          <div className="top-scorers-heading"><span>⚽ TO'PURARLAR JADVALI ({roundLabel})</span><span>GOLLAR</span></div>
          {scorers.length === 0 ? <div className="top-scorers-empty">TO'PURARLAR MAVJUD EMAS</div> : scorers.map((player, index) => (
            <div className="top-scorers-row" key={player.id}>
              <div className="top-scorers-rank">{index < 3 ? <Medal size={28} color={['#FFD700', '#C0C0C0', '#CD7F32'][index]} /> : index + 1}</div>
              <div className="top-scorers-avatar"><span>{player.name[0]}</span>{player.avatar && <img src={player.avatar} crossOrigin="anonymous" alt="" onError={e => { e.currentTarget.style.display = 'none'; }} />}</div>
              <div className="top-scorers-player"><strong>{player.name}</strong><span>{player.team}</span></div>
              <div className="top-scorers-goals">⚽ {player.goals} ta</div>
            </div>
          ))}
        </div>
      </main>
      <footer className="top-scorers-sponsors">{sponsors.slice(0, 6).map(s => <SponsorLogo key={s.id} sponsor={s} />)}</footer>
    </div>
  );
}
