import React, { useEffect, useState } from 'react';
import { loadObsPrematch } from '../utils/loadObsPrematch';
import { parseTournamentTier, getStageDisplayTitle } from '../utils/tournamentUtils';

function Photo({ src, className, fallback = '◆' }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return src && !failed ? <img src={src} alt="" className={className} onError={() => setFailed(true)} />
    : <span className={`${className} obs-prematch-placeholder`}>{fallback}</span>;
}

function Team({ team, stats, away = false }) {
  return <div className={`obs-prematch-team${away ? ' obs-prematch-team-away' : ''}`}>
    <div className="obs-prematch-identity">
      <Photo src={team?.logo_url} className="obs-prematch-crest" />
      <div><h2>{team?.name || 'Jamoa'}</h2>
        {stats?.standing && <div className="obs-prematch-standing"><strong>{stats.standing.position}-O‘RIN</strong>
          <span>{stats.standing.points} OCHKO</span><span>{stats.standing.played} O‘YIN</span></div>}
      </div>
    </div>
  </div>;
}

function Detail({ stats, mode, away }) {
  const standing = stats?.standing;
  return <div className={`obs-prematch-detail${away ? ' obs-prematch-detail-away' : ''}`}>
    {mode === 'form' && (standing?.form.length ? <div className="obs-prematch-form">
      {standing.form.map((result, i) => <b key={i} className={`obs-form-${result}`}>{result}</b>)}
    </div> : <small>NATIJA HALI YO‘Q</small>)}
    {mode === 'scorers' && (stats?.scorer ? <div className="obs-prematch-scorer">
      <Photo src={stats.scorer.photo} className="obs-prematch-photo" fallback={stats.scorer.name.charAt(0)} />
      <div><small>JAMOA TO‘PURARI</small><h3>{stats.scorer.name}</h3>
        <strong className="obs-prematch-goals">{stats.scorer.goals} <span>GOL</span></strong>
      </div>
    </div> : <small>GOL HALI QAYD ETILMAGAN</small>)}
    {mode === 'comparison' && (standing ? <dl className="obs-prematch-metrics">
      <div><dt>O‘YIN</dt><dd>{standing.played}</dd></div>
      <div><dt>URILGAN GOL</dt><dd>{standing.gf}</dd></div>
      <div><dt>O‘TKAZILGAN</dt><dd>{standing.ga}</dd></div>
    </dl> : <small>STATISTIKA MAVJUD EMAS</small>)}
  </div>;
}

export default function ObsPrematch({ match, homeTeam, awayTeam, leagueData, leagueLogo, exiting, onExited }) {
  const compact = match.obs_prematch_compact === true;
  const [data, setData] = useState(null);
  const [now, setNow] = useState(Date.now());
  const { id, tournament_id, league, organization_id, home_team_id, away_team_id } = match;
  useEffect(() => {
    let cancelled = false;
    setData(null);
    const update = value => { if (!cancelled) setData(value); };
    loadObsPrematch({ id, tournament_id, league, organization_id, home_team_id, away_team_id }, update).then(update)
      .catch(() => { /* Keep fixture visible when optional statistics are unavailable. */ });
    return () => { cancelled = true; };
  }, [id, tournament_id, league, organization_id, home_team_id, away_team_id]);
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  return <ObsPrematchView {...{ match, homeTeam, awayTeam, leagueData, leagueLogo, exiting, onExited, data, now, compact }} />;
}

export function ObsPrematchView({ match, homeTeam, awayTeam, leagueData, leagueLogo, exiting, onExited, data, now, compact = false }) {
  const modesKey = [
    (data?.home?.standing?.form.length || data?.away?.standing?.form.length) && 'form',
    (data?.home?.scorer || data?.away?.scorer) && 'scorers',
    (data?.home?.standing || data?.away?.standing) && 'comparison',
  ].filter(Boolean).join(',');
  const modes = modesKey ? modesKey.split(',') : [];
  const [slide, setSlide] = useState(0);
  useEffect(() => {
    setSlide(0);
    const count = modesKey ? modesKey.split(',').length : 0;
    if (count < 2 || exiting) return;
    const interval = setInterval(() => setSlide(previous => (previous + 1) % count), 8000);
    return () => clearInterval(interval);
  }, [modesKey, exiting, match.id]);
  const labels = { form: 'SO‘NGGI 5 O‘YIN', scorers: 'JAMOALAR TO‘PURARLARI', comparison: 'JAMOALAR STATISTIKASI' };
  const tournament = data?.tournament;
  const color = tournament ? parseTournamentTier(tournament).color : null;
  const safeColor = /^#[0-9a-f]{6}$/i.test(color || '') ? color : null;
  const background = !match.tournament_id && (leagueData?.export_bg_url || leagueData?.background_url || leagueData?.bg_url || leagueData?.banner_url);
  const kickoff = Date.parse(`${match.match_date}T${match.match_time}+05:00`);
  const remaining = Math.max(0, Math.ceil((kickoff - now) / 1000));
  const countdown = Number.isFinite(remaining) ? remaining >= 86400 ? `${Math.floor(remaining / 86400)} KUN`
    : [Math.floor(remaining / 3600), Math.floor(remaining % 3600 / 60), remaining % 60].map(n => String(n).padStart(2, '0')).join(':') : '';
  return <div className={`obs-prematch-anchor${compact ? ' is-compact' : ''}`}>
    <section className={`obs-prematch transformer-wrapper ${exiting ? 'transformer-exit' : 'transformer-enter'}`}
      style={safeColor ? { '--obs-prematch-accent': safeColor } : undefined}
      onAnimationEnd={e => { if (e.target === e.currentTarget && e.animationName === 'obsPrematchOut') onExited(); }}>
      {background && <div className="obs-prematch-backdrop" style={{ backgroundImage: `url(${background})` }} />}
      <div className="obs-prematch-compact-row" aria-hidden={!compact}>
        <Photo src={homeTeam?.logo_url} className="obs-compact-logo" />
        <strong>{homeTeam?.name || match.home_team_name || 'Mezbon'}</strong>
        <span className="obs-compact-divider">—</span>
        <strong>{awayTeam?.name || match.away_team_name || 'Mehmon'}</strong>
        <Photo src={awayTeam?.logo_url} className="obs-compact-logo" />
      </div>
      <div className="obs-prematch-content" aria-hidden={compact}>
        <header>
          <div><small>O‘YIN OLDIDAN</small><h1>{tournament?.name || match.league || 'FUTBOL'}</h1></div>
          <Photo src={tournament?.logo_url || (!match.tournament_id ? leagueData?.logo_url || leagueLogo : null)} className="obs-prematch-competition-logo" />
          <span>{getStageDisplayTitle(match.stage, match.round)}</span>
        </header>
        <div className="obs-prematch-teams"><Team team={homeTeam} stats={data?.home} />
          <div className="obs-prematch-versus">VS</div><Team team={awayTeam} stats={data?.away} away /></div>
        <div className="obs-prematch-details">
          {modes.map((mode, index) => <div key={mode} aria-hidden={slide % modes.length !== index}
            className={`obs-prematch-slide${slide % modes.length === index ? ' is-active' : ''}`}>
            <h4>{labels[mode]}</h4>
            <div className="obs-prematch-detail-pair"><Detail stats={data?.home} mode={mode} />
              <Detail stats={data?.away} mode={mode} away /></div>
          </div>)}
          {!modes.length && <div className="obs-prematch-details-empty">{getStageDisplayTitle(match.stage, match.round)} • O‘YIN OLDIDAN</div>}
          {modes.length > 1 && <div className="obs-prematch-slide-dots" aria-hidden="true">
            {modes.map((mode, index) => <i key={mode} className={slide % modes.length === index ? 'is-active' : ''} />)}
          </div>}
        </div>
        <footer><span>{[match.match_date?.split('-').reverse().join('.'), match.match_time?.slice(0, 5), match.location].filter(Boolean).join(' • ')}</span>
          <strong>{remaining > 0 ? `BOSHLANISHIGA ${countdown}` : 'BOSHLANISH ARAFASIDA'}</strong></footer>
      </div>
    </section>
  </div>;
}
