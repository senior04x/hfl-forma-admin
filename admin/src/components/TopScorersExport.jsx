import React, { useMemo } from 'react';
import { Medal } from 'lucide-react';
import { calculateScorers, scorerFilterLabel } from '../utils/scorers';
import SponsorLogo from './SponsorLogo';
import './TopScorersExport.css';

export default function TopScorersExport({ exportRef, events, matches, competition, organization, stage = 'all', round = 'all', background, mainSponsor, sponsors }) {
  const scorers = useMemo(() => calculateScorers(events, matches, stage, round), [events, matches, stage, round]);
  const roundLabel = scorerFilterLabel(stage, round);
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
