import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Film, 
  Video, 
  Download, 
  Copy, 
  Check, 
  Filter, 
  ChevronDown, 
  ChevronUp, 
  Calendar, 
  Clock, 
  Trophy, 
  Search, 
  X, 
  RefreshCw,
  ExternalLink,
  ChevronRight,
  ArrowLeft,
  Play
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useOrg } from '../context/OrgContext';
import { getActiveOrgTournaments, getStageDisplayTitle } from '../utils/tournamentUtils';
import { getActiveOrgLeagues } from '../utils/leagueUtils';
import './Replays.css';

const Replays = () => {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const { currentOrg, orgId } = useOrg();

  // Data states
  const [matches, setMatches] = useState([]);
  const [teamsMap, setTeamsMap] = useState(new Map());
  const [leagues, setLeagues] = useState([]);
  const [tournaments, setTournaments] = useState([]);
  const [matchReplaysCount, setMatchReplaysCount] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filter states
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filterType, setFilterType] = useState('all'); // 'all' | 'league' | 'tournament'
  const [selectedLeague, setSelectedLeague] = useState('all');
  const [selectedTournament, setSelectedTournament] = useState('all');
  const [selectedRound, setSelectedRound] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyWithReplays, setOnlyWithReplays] = useState(true);

  // Selected Match Detail state
  const [currentMatch, setCurrentMatch] = useState(null);
  const [matchEvents, setMatchEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [activeVideoId, setActiveVideoId] = useState(null);

  const [copiedId, setCopiedId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);

  // 1. Initial Data Load (Matches, Teams, Leagues, Tournaments)
  useEffect(() => {
    if (!orgId) return;
    loadAllData();
  }, [orgId]);

  const loadAllData = async () => {
    try {
      setLoading(true);

      // Leagues and Tournaments
      const [leaguesData, tournamentsData] = await Promise.all([
        getActiveOrgLeagues(orgId),
        getActiveOrgTournaments(orgId),
      ]);
      setLeagues(leaguesData || []);
      setTournaments(tournamentsData || []);

      const collabLeagueNames = (leaguesData || [])
        .filter(l => l.isCollab)
        .map(l => l.name);

      // Teams
      let teamsQuery = supabase
        .from('teams')
        .select('id, name, logo_url, league, organization_id');
      
      if (collabLeagueNames.length > 0) {
        teamsQuery = teamsQuery.or(`organization_id.eq.${orgId},league.in.(${collabLeagueNames.map(n => `"${n}"`).join(',')})`);
      } else {
        teamsQuery = teamsQuery.eq('organization_id', orgId);
      }
      const { data: teamsData } = await teamsQuery;
      const tMap = new Map();
      (teamsData || []).forEach(t => tMap.set(t.id, t));
      setTeamsMap(tMap);

      // Matches
      let matchesQuery = supabase
        .from('matches')
        .select('id, league, tournament_id, round, stage, home_team_id, away_team_id, home_score, away_score, match_date, match_time, status, organization_id')
        .order('match_date', { ascending: false })
        .order('match_time', { ascending: false });

      if (collabLeagueNames.length > 0) {
        matchesQuery = matchesQuery.or(`organization_id.eq.${orgId},league.in.(${collabLeagueNames.map(n => `"${n}"`).join(',')})`);
      } else {
        matchesQuery = matchesQuery.eq('organization_id', orgId);
      }

      const { data: matchesData, error: matchesErr } = await matchesQuery;
      if (matchesErr) throw matchesErr;

      const loadedMatches = matchesData || [];
      setMatches(loadedMatches);

      // Replay count per match
      if (loadedMatches.length > 0) {
        const matchIds = loadedMatches.map(m => m.id);
        const { data: replayEvents } = await supabase
          .from('match_events')
          .select('match_id, id')
          .in('match_id', matchIds)
          .not('replay_video_url', 'is', null);

        const rMap = new Map();
        (replayEvents || []).forEach(ev => {
          rMap.set(ev.match_id, (rMap.get(ev.match_id) || 0) + 1);
        });
        setMatchReplaysCount(rMap);
      }
    } catch (err) {
      console.error('Error loading replay data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // 2. URL-based Match Selection (Persists on page refresh / F5)
  useEffect(() => {
    if (!matchId) {
      setCurrentMatch(null);
      setMatchEvents([]);
      return;
    }

    loadMatchDetails(matchId);
  }, [matchId, matches, teamsMap]);

  const loadMatchDetails = async (targetId) => {
    setLoadingEvents(true);
    try {
      // Find match from loaded matches or query directly
      let foundMatch = matches.find(m => String(m.id) === String(targetId));
      if (!foundMatch) {
        const { data: mData } = await supabase
          .from('matches')
          .select('id, league, tournament_id, round, stage, home_team_id, away_team_id, home_score, away_score, match_date, match_time, status')
          .eq('id', targetId)
          .single();
        foundMatch = mData;
      }
      setCurrentMatch(foundMatch);

      // Fetch match_events
      const { data: eventsData, error: evErr } = await supabase
        .from('match_events')
        .select(`
          id,
          match_id,
          team_id,
          player_id,
          event_type,
          minute,
          details,
          replay_video_url,
          created_at,
          player:player_id (id, first_name, last_name, player_number, photo_url),
          team:team_id (id, name, logo_url)
        `)
        .eq('match_id', targetId)
        .order('minute', { ascending: true })
        .order('created_at', { ascending: true });

      if (evErr) {
        console.error('Error fetching match_events:', evErr);
        throw evErr;
      }

      const goalsAndReplays = (eventsData || []).filter(e => 
        ['goal', 'penalty_goal', 'own_goal'].includes(e.event_type) || e.replay_video_url
      );

      setMatchEvents(goalsAndReplays);
    } catch (err) {
      console.error('Error loading match details:', err);
    } finally {
      setLoadingEvents(false);
    }
  };

  const handleSelectMatch = (match) => {
    navigate(`/replays/${match.id}`);
  };

  const handleBackToList = () => {
    navigate('/replays');
  };

  const handleRefresh = () => {
    setRefreshing(true);
    if (matchId) {
      loadMatchDetails(matchId);
    }
    loadAllData();
  };

  // Available rounds calculation
  const availableRounds = useMemo(() => {
    const rounds = new Set();
    matches.forEach(m => {
      if (m.round !== null && m.round !== undefined) {
        rounds.add(String(m.round));
      }
    });
    return Array.from(rounds).sort((a, b) => Number(a) - Number(b));
  }, [matches]);

  // Filter matches
  const filteredMatches = useMemo(() => {
    return matches.filter(m => {
      const replaysCount = matchReplaysCount.get(m.id) || 0;
      if (onlyWithReplays && replaysCount === 0) return false;

      if (filterType === 'league' && m.tournament_id) return false;
      if (filterType === 'tournament' && !m.tournament_id) return false;

      if (selectedLeague !== 'all' && m.league !== selectedLeague) return false;
      if (selectedTournament !== 'all' && String(m.tournament_id) !== String(selectedTournament)) return false;
      if (selectedRound !== 'all' && String(m.round) !== String(selectedRound)) return false;

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const homeTeam = teamsMap.get(m.home_team_id)?.name?.toLowerCase() || '';
        const awayTeam = teamsMap.get(m.away_team_id)?.name?.toLowerCase() || '';
        const leagueName = (m.league || '').toLowerCase();
        if (!homeTeam.includes(query) && !awayTeam.includes(query) && !leagueName.includes(query)) {
          return false;
        }
      }

      return true;
    });
  }, [matches, matchReplaysCount, onlyWithReplays, filterType, selectedLeague, selectedTournament, selectedRound, searchQuery, teamsMap]);

  // Stats
  const totalReplaysCount = useMemo(() => {
    let count = 0;
    matchReplaysCount.forEach(v => { count += v; });
    return count;
  }, [matchReplaysCount]);

  const matchesWithReplaysCount = useMemo(() => {
    let count = 0;
    matchReplaysCount.forEach(v => { if (v > 0) count++; });
    return count;
  }, [matchReplaysCount]);

  // Download video
  const handleDownloadVideo = async (event, match) => {
    if (!event.replay_video_url) return;
    setDownloadingId(event.id);

    try {
      const homeTeam = teamsMap.get(match?.home_team_id)?.name || 'Home';
      const awayTeam = teamsMap.get(match?.away_team_id)?.name || 'Away';
      const playerName = event.player ? `${event.player.first_name}_${event.player.last_name}` : 'Goal';
      const minute = event.minute ? `${event.minute}m` : 'Replay';
      const safeFilename = `${minute}_${homeTeam}_vs_${awayTeam}_${playerName}.mp4`
        .replace(/[^a-zA-Z0-9_\-\.]/g, '_');

      const response = await fetch(event.replay_video_url);
      if (!response.ok) throw new Error('Network response was not ok');
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = safeFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.warn('Direct blob download failed, falling back:', err);
      window.open(event.replay_video_url, '_blank');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleCopyLink = (url, id) => {
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getEventBadge = (eventType) => {
    switch (eventType) {
      case 'penalty_goal':
        return <span className="event-badge penalty">⚽ Penalti</span>;
      case 'own_goal':
        return <span className="event-badge own-goal">❌ Avtogol</span>;
      default:
        return <span className="event-badge goal">⚽ Gol</span>;
    }
  };

  const resetFilters = () => {
    setFilterType('all');
    setSelectedLeague('all');
    setSelectedTournament('all');
    setSelectedRound('all');
    setSearchQuery('');
    setOnlyWithReplays(true);
  };

  return (
    <div className="replays-page">
      {/* Agar o'yin ichida bo'lsa: Katta header o'rniga faqat ixcham Nav Header ko'rsatiladi */}
      {matchId ? (
        <div className="detail-compact-nav">
          <button className="btn-back-compact" onClick={handleBackToList} title="Orqaga">
            <ArrowLeft size={18} />
            <span className="back-text">Orqaga</span>
          </button>

          <div className="detail-tags-compact">
            {currentMatch?.tournament_id ? (
              <span className="tag-compact tournament"><Trophy size={13} /> Turnir</span>
            ) : (
              <span className="tag-compact league">{currentMatch?.league}</span>
            )}
            {currentMatch?.round && (
              <span className="tag-compact round">
                {getStageDisplayTitle(currentMatch?.stage, currentMatch?.round)}
              </span>
            )}
            <span className="tag-compact date">
              <Calendar size={13} /> {currentMatch?.match_date}
            </span>
          </div>

          <button 
            className={`btn-refresh-compact ${refreshing ? 'spinning' : ''}`} 
            onClick={handleRefresh}
            title="Yangilash"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      ) : (
        /* O'yinlar ro'yxatida: Asosiy banner */
        <div className="replays-header">
          <div className="header-title-block">
            <div className="header-icon-box">
              <Film size={24} className="text-white" />
            </div>
            <div>
              <h1 className="header-title">Replaylar & Gollar</h1>
              <p className="header-subtitle">Montaj va tahlil uchun replay videolari</p>
            </div>
          </div>

          <div className="header-actions">
            <div className="stat-pill">
              <span className="stat-num">{totalReplaysCount}</span>
              <span className="stat-label">Replaylar</span>
            </div>
            <div className="stat-pill highlight">
              <span className="stat-num">{matchesWithReplaysCount}</span>
              <span className="stat-label">O'yinlar</span>
            </div>
            <button 
              className={`btn-refresh ${refreshing ? 'spinning' : ''}`} 
              onClick={handleRefresh}
              title="Yangilash"
            >
              <RefreshCw size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="replays-content">
        {matchId ? (
          /* Match Detail View */
          <div className="replay-detail-view">
            {/* Match Header Scorecard */}
            {currentMatch && (
              <div className="detail-match-card">
                {/* Home Team */}
                <div className="team-side home">
                  {teamsMap.get(currentMatch.home_team_id)?.logo_url ? (
                    <img 
                      src={teamsMap.get(currentMatch.home_team_id).logo_url} 
                      alt="Home" 
                      className="team-logo-lg" 
                    />
                  ) : (
                    <div className="team-logo-placeholder">⚽</div>
                  )}
                  <span className="team-name-lg">{teamsMap.get(currentMatch.home_team_id)?.name || 'Home'}</span>
                </div>

                {/* Score Center */}
                <div className="score-center">
                  <div className="score-display-lg">
                    {currentMatch.home_score ?? 0} : {currentMatch.away_score ?? 0}
                  </div>
                  <div className="match-status-badge">
                    {currentMatch.status === 'live' || currentMatch.status === 'first_half' || currentMatch.status === 'second_half' ? (
                      <span className="live-dot-pulse">● Jonli</span>
                    ) : currentMatch.status === 'finished' ? (
                      'Tugagan'
                    ) : (
                      'Kutilmoqda'
                    )}
                  </div>
                </div>

                {/* Away Team */}
                <div className="team-side away">
                  {teamsMap.get(currentMatch.away_team_id)?.logo_url ? (
                    <img 
                      src={teamsMap.get(currentMatch.away_team_id).logo_url} 
                      alt="Away" 
                      className="team-logo-lg" 
                    />
                  ) : (
                    <div className="team-logo-placeholder">⚽</div>
                  )}
                  <span className="team-name-lg">{teamsMap.get(currentMatch.away_team_id)?.name || 'Away'}</span>
                </div>
              </div>
            )}

            {/* Replay Videos Section Header */}
            <div className="replays-section-header-compact">
              <div className="section-title-compact">
                <Video size={18} className="text-emerald" />
                <h2>Gollar & Replay Videolari ({matchEvents.length})</h2>
              </div>
            </div>

            {loadingEvents ? (
              <div className="loading-state">
                <RefreshCw size={26} className="spinning" />
                <p>Replaylar yuklanmoqda...</p>
              </div>
            ) : matchEvents.length === 0 ? (
              <div className="empty-state-box">
                <Film size={40} className="text-muted" />
                <h3>Ushbu o'yinda hozircha replay videosi yo'q</h3>
                <p>OBS orqali gol urilganda replay videolari shu yerda paydo bo'ladi.</p>
              </div>
            ) : (
              <div className="replay-cards-grid">
                {matchEvents.map((event, idx) => {
                  const hasVideo = Boolean(event.replay_video_url);
                  const player = event.player;
                  const team = event.team || teamsMap.get(event.team_id);
                  const assist = event.assist_player;

                  return (
                    <div key={event.id} className={`replay-item-card ${hasVideo ? 'has-video' : 'no-video'}`}>
                      {/* Video Player (On-demand Lazy Loading: only 1 video loads when clicked) */}
                      <div className="replay-video-container">
                        {hasVideo ? (
                          activeVideoId === event.id ? (
                            <div className="video-lazy-wrapper active-playing-wrapper">
                              <video 
                                src={event.replay_video_url} 
                                autoPlay
                                playsInline
                                controls 
                                preload="auto"
                                className="lazy-video-element"
                              />
                              <button 
                                type="button"
                                className="btn-close-video"
                                title="Videoni to'xtatish"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveVideoId(null);
                                }}
                              >
                                <X size={15} />
                              </button>
                            </div>
                          ) : (
                            <div 
                              className="video-click-to-play-placeholder"
                              onClick={() => setActiveVideoId(event.id)}
                            >
                              <div className="play-button-glow">
                                <Play size={24} className="play-icon-triangle" fill="#ffffff" />
                              </div>
                              <span className="play-action-text">Ko'rish uchun bosing</span>
                            </div>
                          )
                        ) : (
                          <div className="video-placeholder-box">
                            <Film size={32} className="text-muted" />
                            <span>Video biriktirilmagan</span>
                          </div>
                        )}
                      </div>

                      {/* Author Details Below Video */}
                      <div className="replay-meta-footer">
                        {/* Player info */}
                        <div className="player-profile-row">
                          <div className="player-avatar-box">
                            {player?.photo_url ? (
                              <img src={player.photo_url} alt="Player" className="player-avatar-img" />
                            ) : (
                              <div className="player-avatar-placeholder">
                                {player ? `${player.first_name?.[0] || ''}${player.last_name?.[0] || ''}` : '⚽'}
                              </div>
                            )}
                            {player?.player_number && (
                              <span className="player-number-bubble">#{player.player_number}</span>
                            )}
                          </div>

                          <div className="player-text-info">
                            <div className="player-name-row">
                              <span className="player-name">
                                {player ? `${player.first_name} ${player.last_name}` : 'Muallif belgilanmagan'}
                              </span>
                              {event.minute && (
                                <span className="minute-tag">{event.minute}'</span>
                              )}
                              {event.event_type === 'penalty_goal' && (
                                <span className="type-tag penalty">Penalti</span>
                              )}
                              {event.event_type === 'own_goal' && (
                                <span className="type-tag own-goal">Avtogol</span>
                              )}
                            </div>
                            <div className="team-subtext">
                              {team?.logo_url && (
                                <img src={team.logo_url} alt="Team" className="team-sublogo" />
                              )}
                              <span>{team?.name || 'Jamoa'}</span>
                            </div>
                          </div>
                        </div>

                        {/* Assist info */}
                        {assist && (
                          <div className="assist-row">
                            <span className="assist-label">👟 Assist:</span>
                            <span className="assist-name">{assist.first_name} {assist.last_name}</span>
                          </div>
                        )}

                        {/* Icon-based Action Buttons (sig'adigan ixcham tugmalar) */}
                        {hasVideo && (
                          <div className="replay-actions-row">
                            <button
                              className="btn-action-download"
                              onClick={() => handleDownloadVideo(event, currentMatch)}
                              disabled={downloadingId === event.id}
                              title="Montaj uchun MP4 yuklab olish"
                            >
                              {downloadingId === event.id ? (
                                <>
                                  <RefreshCw size={15} className="spinning" />
                                  <span>Yuklanmoqda...</span>
                                </>
                              ) : (
                                <>
                                  <Download size={16} />
                                  <span>Yuklab olish (MP4)</span>
                                </>
                              )}
                            </button>

                            <button
                              className="btn-action-icon"
                              onClick={() => handleCopyLink(event.replay_video_url, event.id)}
                              title="Havolani nusxalash"
                            >
                              {copiedId === event.id ? <Check size={16} className="text-emerald" /> : <Copy size={16} />}
                            </button>

                            <a
                              href={event.replay_video_url}
                              target="_blank"
                              rel="noreferrer"
                              className="btn-action-icon"
                              title="Yangi oynada ochish"
                            >
                              <ExternalLink size={16} />
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* Match List with Collapsible Filters */
          <div className="match-list-view">
            {/* Collapsible Filter Bar */}
            <div className="filter-card">
              <div 
                className="filter-card-header" 
                onClick={() => setIsFilterOpen(!isFilterOpen)}
              >
                <div className="filter-header-title">
                  <Filter size={17} className="text-emerald" />
                  <span>Filtrlar</span>
                  {(selectedLeague !== 'all' || selectedTournament !== 'all' || selectedRound !== 'all' || !onlyWithReplays || searchQuery) && (
                    <span className="active-filter-badge">Faol</span>
                  )}
                </div>
                <div className="filter-header-right">
                  {isFilterOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </div>
              </div>

              {/* Collapsible Filter Body */}
              {isFilterOpen && (
                <div className="filter-card-body">
                  <div className="filter-grid">
                    {/* Search query input */}
                    <div className="filter-group full-width">
                      <label>Jamoa qidirish</label>
                      <div className="search-input-wrapper">
                        <Search size={15} className="search-icon" />
                        <input 
                          type="text"
                          placeholder="Jamoa nomi..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        {searchQuery && (
                          <button className="clear-search-btn" onClick={() => setSearchQuery('')}>
                            <X size={13} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Filter Type: All, League, Tournament */}
                    <div className="filter-group">
                      <label>Musobaqa turi</label>
                      <select 
                        value={filterType} 
                        onChange={(e) => {
                          setFilterType(e.target.value);
                          setSelectedLeague('all');
                          setSelectedTournament('all');
                        }}
                      >
                        <option value="all">Barchasi (Liga & Turnir)</option>
                        <option value="league">Faqat Ligalar</option>
                        <option value="tournament">Faqat Turnirlar</option>
                      </select>
                    </div>

                    {/* League Select */}
                    {filterType !== 'tournament' && (
                      <div className="filter-group">
                        <label>Liga</label>
                        <select 
                          value={selectedLeague} 
                          onChange={(e) => setSelectedLeague(e.target.value)}
                        >
                          <option value="all">Barcha Ligalar</option>
                          {leagues.map((l) => (
                            <option key={l.id || l.name} value={l.name}>
                              {l.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Tournament Select */}
                    {filterType !== 'league' && (
                      <div className="filter-group">
                        <label>Turnir</label>
                        <select 
                          value={selectedTournament} 
                          onChange={(e) => setSelectedTournament(e.target.value)}
                        >
                          <option value="all">Barcha Turnirlar</option>
                          {tournaments.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Round Select */}
                    <div className="filter-group">
                      <label>Tur</label>
                      <select 
                        value={selectedRound} 
                        onChange={(e) => setSelectedRound(e.target.value)}
                      >
                        <option value="all">Barcha Turlar</option>
                        {availableRounds.map((r) => (
                          <option key={r} value={r}>
                            {r}-Tur
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Filter Footer Controls */}
                  <div className="filter-card-footer">
                    <label className="checkbox-label">
                      <input 
                        type="checkbox" 
                        checked={onlyWithReplays} 
                        onChange={(e) => setOnlyWithReplays(e.target.checked)} 
                      />
                      <span>Faqat Replayli o'yinlar</span>
                    </label>

                    <button className="btn-reset-filters" onClick={resetFilters}>
                      Tozalash
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Match Cards List */}
            <div className="matches-list-section">
              <div className="matches-results-header">
                <h3>O'yinlar ({filteredMatches.length})</h3>
                <span className="results-subtitle">Replaylarni ko'rish uchun tanlang</span>
              </div>

              {loading ? (
                <div className="loading-state">
                  <RefreshCw size={28} className="spinning" />
                  <p>O'yinlar yuklanmoqda...</p>
                </div>
              ) : filteredMatches.length === 0 ? (
                <div className="empty-state-box">
                  <Film size={40} className="text-muted" />
                  <h3>O'yin topilmadi</h3>
                  <button className="btn-reset-filters mt-2" onClick={resetFilters}>
                    Filtrlarni tozalash
                  </button>
                </div>
              ) : (
                <div className="match-cards-grid">
                  {filteredMatches.map((match) => {
                    const replaysCount = matchReplaysCount.get(match.id) || 0;
                    const homeTeam = teamsMap.get(match.home_team_id);
                    const awayTeam = teamsMap.get(match.away_team_id);
                    const isLive = match.status === 'live' || match.status === 'first_half' || match.status === 'second_half';

                    return (
                      <div 
                        key={match.id} 
                        className={`match-overview-card ${replaysCount > 0 ? 'has-replays' : ''}`}
                        onClick={() => handleSelectMatch(match)}
                      >
                        {/* Top Info */}
                        <div className="card-top-bar">
                          <div className="competition-badge">
                            {match.tournament_id ? (
                              <span className="badge-tournament"><Trophy size={12} /> Turnir</span>
                            ) : (
                              <span className="badge-league">{match.league}</span>
                            )}
                            {match.round && (
                              <span className="badge-round">
                                {getStageDisplayTitle(match.stage, match.round)}
                              </span>
                            )}
                          </div>

                          <div className="match-timing">
                            <Calendar size={12} />
                            <span>{match.match_date}</span>
                            {match.match_time && (
                              <>
                                <Clock size={12} className="ml-1" />
                                <span>{match.match_time.slice(0, 5)}</span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Teams & Score */}
                        <div className="card-teams-body">
                          <div className="team-col home">
                            {homeTeam?.logo_url ? (
                              <img src={homeTeam.logo_url} alt="Home" className="team-logo-md" />
                            ) : (
                              <div className="team-logo-placeholder-sm">⚽</div>
                            )}
                            <span className="team-name-md">{homeTeam?.name || 'Home'}</span>
                          </div>

                          <div className="score-col">
                            <div className="score-text">
                              {match.home_score ?? 0} : {match.away_score ?? 0}
                            </div>
                            {isLive ? (
                              <span className="live-status-pill">● Jonli</span>
                            ) : match.status === 'finished' ? (
                              <span className="finished-status-pill">Tugagan</span>
                            ) : (
                              <span className="pending-status-pill">Kutilmoqda</span>
                            )}
                          </div>

                          <div className="team-col away">
                            {awayTeam?.logo_url ? (
                              <img src={awayTeam.logo_url} alt="Away" className="team-logo-md" />
                            ) : (
                              <div className="team-logo-placeholder-sm">⚽</div>
                            )}
                            <span className="team-name-md">{awayTeam?.name || 'Away'}</span>
                          </div>
                        </div>

                        {/* Card Bottom */}
                        <div className="card-bottom-bar">
                          {replaysCount > 0 ? (
                            <div className="replays-count-badge active">
                              <Film size={13} />
                              <span>{replaysCount} ta replay</span>
                            </div>
                          ) : (
                            <div className="replays-count-badge empty">
                              <span>Replaysiz</span>
                            </div>
                          )}

                          <div className="open-action">
                            <span>Ko'rish</span>
                            <ChevronRight size={15} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Replays;
