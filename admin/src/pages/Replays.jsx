import React, { useState, useEffect, useMemo } from 'react';
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
  ArrowLeft
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useOrg } from '../context/OrgContext';
import { getActiveOrgTournaments, getStageDisplayTitle } from '../utils/tournamentUtils';
import { getActiveOrgLeagues } from '../utils/leagueUtils';
import './Replays.css';

const Replays = () => {
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
  const [isFilterOpen, setIsFilterOpen] = useState(true);
  const [filterType, setFilterType] = useState('all'); // 'all' | 'league' | 'tournament'
  const [selectedLeague, setSelectedLeague] = useState('all');
  const [selectedTournament, setSelectedTournament] = useState('all');
  const [selectedRound, setSelectedRound] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyWithReplays, setOnlyWithReplays] = useState(true);

  // Selected Match Detail state
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [matchEvents, setMatchEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  const [copiedId, setCopiedId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);

  // Load initial data (Leagues, Tournaments, Matches, and replay counts)
  useEffect(() => {
    if (!orgId) return;
    loadAllData();
  }, [orgId]);

  const loadAllData = async () => {
    try {
      setLoading(true);

      // 1. Fetch Leagues and Tournaments in parallel
      const [leaguesData, tournamentsData] = await Promise.all([
        getActiveOrgLeagues(orgId),
        getActiveOrgTournaments(orgId),
      ]);
      setLeagues(leaguesData || []);
      setTournaments(tournamentsData || []);

      const collabLeagueNames = (leaguesData || [])
        .filter(l => l.isCollab)
        .map(l => l.name);

      // 2. Fetch Teams for quick name/logo lookups
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

      // 3. Fetch Matches (optimized select)
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

      // 4. Fetch Replay count per match to show badges and fast filtering
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

  const handleRefresh = () => {
    setRefreshing(true);
    loadAllData();
  };

  // Load events (goals with replays) when a match is selected
  const handleSelectMatch = async (match) => {
    setSelectedMatch(match);
    setLoadingEvents(true);
    setMatchEvents([]);

    try {
      const { data: eventsData, error: evErr } = await supabase
        .from('match_events')
        .select(`
          id,
          match_id,
          team_id,
          player_id,
          assist_player_id,
          event_type,
          minute,
          replay_video_url,
          created_at,
          player:player_id (id, first_name, last_name, player_number, photo_url),
          assist_player:assist_player_id (id, first_name, last_name, player_number),
          team:team_id (id, name, logo_url)
        `)
        .eq('match_id', match.id)
        .order('minute', { ascending: true })
        .order('created_at', { ascending: true });

      if (evErr) throw evErr;

      // Filter to goals / replays
      const goalsAndReplays = (eventsData || []).filter(e => 
        ['goal', 'penalty_goal', 'own_goal'].includes(e.event_type) || e.replay_video_url
      );

      setMatchEvents(goalsAndReplays);
    } catch (err) {
      console.error('Error loading match replay events:', err);
    } finally {
      setLoadingEvents(false);
    }
  };

  // Available rounds calculation based on current match list / filters
  const availableRounds = useMemo(() => {
    const rounds = new Set();
    matches.forEach(m => {
      if (m.round !== null && m.round !== undefined) {
        rounds.add(String(m.round));
      }
    });
    return Array.from(rounds).sort((a, b) => Number(a) - Number(b));
  }, [matches]);

  // Filter matches based on user filter selections
  const filteredMatches = useMemo(() => {
    return matches.filter(m => {
      // 1. Only with replays filter
      const replaysCount = matchReplaysCount.get(m.id) || 0;
      if (onlyWithReplays && replaysCount === 0) {
        return false;
      }

      // 2. Filter Type (League vs Tournament)
      if (filterType === 'league' && m.tournament_id) return false;
      if (filterType === 'tournament' && !m.tournament_id) return false;

      // 3. Selected League
      if (selectedLeague !== 'all') {
        if (m.league !== selectedLeague) return false;
      }

      // 4. Selected Tournament
      if (selectedTournament !== 'all') {
        if (String(m.tournament_id) !== String(selectedTournament)) return false;
      }

      // 5. Selected Round
      if (selectedRound !== 'all') {
        if (String(m.round) !== String(selectedRound)) return false;
      }

      // 6. Search Query (Team names or league name)
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

  // Stats calculation
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

  // Download Video function (direct MP4 blob download with clean filename)
  const handleDownloadVideo = async (event, match) => {
    if (!event.replay_video_url) return;
    setDownloadingId(event.id);

    try {
      const homeTeam = teamsMap.get(match.home_team_id)?.name || 'Home';
      const awayTeam = teamsMap.get(match.away_team_id)?.name || 'Away';
      const playerName = event.player ? `${event.player.first_name}_${event.player.last_name}` : 'Goal';
      const minute = event.minute ? `${event.minute}m` : 'Goal';
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
      console.warn('Direct blob download failed, falling back to new window download:', err);
      window.open(event.replay_video_url, '_blank');
    } finally {
      setDownloadingId(null);
    }
  };

  // Copy Link function
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
      {/* Top Header Banner */}
      <div className="replays-header">
        <div className="header-title-block">
          <div className="header-icon-box">
            <Film size={26} className="text-white" />
          </div>
          <div>
            <h1 className="header-title">O'yin Replaylari va Gollar</h1>
            <p className="header-subtitle">
              OBS orqali yozib olingan gollar va replay videolarini ko'rish va montaj uchun yuklab olish
            </p>
          </div>
        </div>

        {/* Stats and Refresh Action */}
        <div className="header-actions">
          <div className="stat-pill">
            <span className="stat-num">{totalReplaysCount}</span>
            <span className="stat-label">Jami Replaylar</span>
          </div>
          <div className="stat-pill highlight">
            <span className="stat-num">{matchesWithReplaysCount}</span>
            <span className="stat-label">Replayli O'yinlar</span>
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

      {/* Main Container */}
      <div className="replays-content">
        {/* If match is selected, show detail view */}
        {selectedMatch ? (
          <div className="replay-detail-view">
            {/* Back to match list button */}
            <div className="detail-top-nav">
              <button className="btn-back" onClick={() => setSelectedMatch(null)}>
                <ArrowLeft size={18} />
                <span>O'yinlar ro'yxatiga qaytish</span>
              </button>

              <div className="detail-match-info-tag">
                {selectedMatch.tournament_id ? (
                  <span className="tag-tournament">
                    <Trophy size={14} /> Turnir
                  </span>
                ) : (
                  <span className="tag-league">{selectedMatch.league}</span>
                )}
                {selectedMatch.round && (
                  <span className="tag-round">
                    {getStageDisplayTitle(selectedMatch.stage, selectedMatch.round)}
                  </span>
                )}
                <span className="tag-date">
                  <Calendar size={14} /> {selectedMatch.match_date} {selectedMatch.match_time?.slice(0, 5)}
                </span>
              </div>
            </div>

            {/* Match Header Scorecard */}
            <div className="detail-match-card">
              <div className="team-side home">
                {teamsMap.get(selectedMatch.home_team_id)?.logo_url ? (
                  <img 
                    src={teamsMap.get(selectedMatch.home_team_id).logo_url} 
                    alt="Home" 
                    className="team-logo-lg" 
                  />
                ) : (
                  <div className="team-logo-placeholder">⚽</div>
                )}
                <span className="team-name-lg">{teamsMap.get(selectedMatch.home_team_id)?.name || 'Home'}</span>
              </div>

              <div className="score-center">
                <div className="score-display-lg">
                  {selectedMatch.home_score ?? 0} : {selectedMatch.away_score ?? 0}
                </div>
                <div className="match-status-badge">
                  {selectedMatch.status === 'live' || selectedMatch.status === 'first_half' || selectedMatch.status === 'second_half' ? (
                    <span className="live-dot-pulse">● Jonli efir</span>
                  ) : selectedMatch.status === 'finished' ? (
                    'Tugagan'
                  ) : (
                    'Kutilmoqda'
                  )}
                </div>
              </div>

              <div className="team-side away">
                {teamsMap.get(selectedMatch.away_team_id)?.logo_url ? (
                  <img 
                    src={teamsMap.get(selectedMatch.away_team_id).logo_url} 
                    alt="Away" 
                    className="team-logo-lg" 
                  />
                ) : (
                  <div className="team-logo-placeholder">⚽</div>
                )}
                <span className="team-name-lg">{teamsMap.get(selectedMatch.away_team_id)?.name || 'Away'}</span>
              </div>
            </div>

            {/* Replay Videos List */}
            <div className="replays-section-header">
              <div className="section-title">
                <Video size={20} className="text-emerald" />
                <h2>O'yin Gollari va Replay Videolari ({matchEvents.length})</h2>
              </div>
              <p className="section-desc">
                Montaj qilish uchun har bir videoni to'g'ridan-to'g'ri yuklab olishingiz yoki ko'rishingiz mumkin
              </p>
            </div>

            {loadingEvents ? (
              <div className="loading-state">
                <RefreshCw size={28} className="spinning" />
                <p>Replay videolari va gollar yuklanmoqda...</p>
              </div>
            ) : matchEvents.length === 0 ? (
              <div className="empty-state-box">
                <Film size={44} className="text-muted" />
                <h3>Ushbu o'yinda hozircha replay videolari mavjud emas</h3>
                <p>OBS avtomatik yuklagichi orqali gol urilganda replay videolari shu yerda paydo bo'ladi.</p>
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
                      {/* Video lazy player / preview box */}
                      <div className="replay-video-container">
                        {hasVideo ? (
                          <div className="video-lazy-wrapper">
                            <video 
                              src={event.replay_video_url} 
                              preload="none" 
                              controls 
                              className="lazy-video-element"
                              onPlay={(e) => {
                                document.querySelectorAll('video').forEach(v => {
                                  if (v !== e.target) v.pause();
                                });
                              }}
                            />
                            <div className="video-overlay-badge">
                              <span className="minute-badge">{event.minute ? `${event.minute}'` : `Gol #${idx+1}`}</span>
                              {getEventBadge(event.event_type)}
                            </div>
                          </div>
                        ) : (
                          <div className="video-placeholder-box">
                            <Film size={36} className="text-muted" />
                            <span>Video biriktirilmagan</span>
                            <div className="video-overlay-badge">
                              <span className="minute-badge">{event.minute ? `${event.minute}'` : `Gol #${idx+1}`}</span>
                              {getEventBadge(event.event_type)}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Author / Player & Team Details below video */}
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
                            <div className="player-name">
                              {player ? `${player.first_name} ${player.last_name}` : 'Muallif belgilanmagan'}
                            </div>
                            <div className="team-subtext">
                              {team?.logo_url && (
                                <img src={team.logo_url} alt="Team" className="team-sublogo" />
                              )}
                              <span>{team?.name || 'Jamoa'}</span>
                            </div>
                          </div>
                        </div>

                        {/* Assist player if any */}
                        {assist && (
                          <div className="assist-row">
                            <span className="assist-label">👟 Assist:</span>
                            <span className="assist-name">{assist.first_name} {assist.last_name}</span>
                          </div>
                        )}

                        {/* Action buttons (Download MP4 & Copy URL) */}
                        {hasVideo && (
                          <div className="replay-actions-row">
                            <button
                              className="btn-action-download"
                              onClick={() => handleDownloadVideo(event, selectedMatch)}
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
                                  <Download size={15} />
                                  <span>Yuklab olish (MP4)</span>
                                </>
                              )}
                            </button>

                            <button
                              className="btn-action-copy"
                              onClick={() => handleCopyLink(event.replay_video_url, event.id)}
                              title="To'g'ridan-to'g'ri havolani nusxalash"
                            >
                              {copiedId === event.id ? (
                                <>
                                  <Check size={15} className="text-emerald" />
                                  <span>Nusxalandi!</span>
                                </>
                              ) : (
                                <>
                                  <Copy size={15} />
                                  <span>Havola</span>
                                </>
                              )}
                            </button>

                            <a
                              href={event.replay_video_url}
                              target="_blank"
                              rel="noreferrer"
                              className="btn-action-open"
                              title="Yangi oynada ochish"
                            >
                              <ExternalLink size={15} />
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
                  <Filter size={18} className="text-emerald" />
                  <span>Filtrlar va Saralash</span>
                  {(selectedLeague !== 'all' || selectedTournament !== 'all' || selectedRound !== 'all' || !onlyWithReplays || searchQuery) && (
                    <span className="active-filter-badge">Faol</span>
                  )}
                </div>
                <div className="filter-header-right">
                  <span className="filter-toggle-hint">{isFilterOpen ? 'Yopish' : 'Ochish'}</span>
                  {isFilterOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </div>
              </div>

              {/* Collapsible Filter Body */}
              {isFilterOpen && (
                <div className="filter-card-body">
                  <div className="filter-grid">
                    {/* Search query input */}
                    <div className="filter-group full-width">
                      <label>Jamoa yoki o'yin qidirish</label>
                      <div className="search-input-wrapper">
                        <Search size={16} className="search-icon" />
                        <input 
                          type="text"
                          placeholder="Jamoa nomi yoki liga bo'yicha qidiring..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        {searchQuery && (
                          <button className="clear-search-btn" onClick={() => setSearchQuery('')}>
                            <X size={14} />
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
                        <option value="tournament">Faqat Turnirlar / Kuboklar</option>
                      </select>
                    </div>

                    {/* League Select (if not tournament-only) */}
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
                              {l.name} {l.isCollab ? '(Hamkorlik)' : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Tournament Select (if not league-only) */}
                    {filterType !== 'league' && (
                      <div className="filter-group">
                        <label>Turnir / Kubok</label>
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

                    {/* Round (Tur) Select */}
                    <div className="filter-group">
                      <label>Tur (Bosqich)</label>
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
                      <span>Faqat Replay videosi bor o'yinlarni ko'rsatish</span>
                    </label>

                    <button className="btn-reset-filters" onClick={resetFilters}>
                      Filtrlarni tozalash
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Match Cards List */}
            <div className="matches-list-section">
              <div className="matches-results-header">
                <h3>O'yinlar ro'yxati ({filteredMatches.length})</h3>
                <span className="results-subtitle">Replaylarni ko'rish uchun o'yin kartasiga bosing</span>
              </div>

              {loading ? (
                <div className="loading-state">
                  <RefreshCw size={32} className="spinning" />
                  <p>O'yinlar va replay ma'lumotlari yuklanmoqda...</p>
                </div>
              ) : filteredMatches.length === 0 ? (
                <div className="empty-state-box">
                  <Film size={44} className="text-muted" />
                  <h3>Tanlangan filtrlarga mos o'yin topilmadi</h3>
                  <p>Filtrlarni o'zgartirib yoki tozalab qayta urinib ko'ring.</p>
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
                        {/* Top Info Header */}
                        <div className="card-top-bar">
                          <div className="competition-badge">
                            {match.tournament_id ? (
                              <span className="badge-tournament"><Trophy size={13} /> Turnir</span>
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
                            <Calendar size={13} />
                            <span>{match.match_date}</span>
                            {match.match_time && (
                              <>
                                <Clock size={13} className="ml-1" />
                                <span>{match.match_time.slice(0, 5)}</span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Teams & Score Row */}
                        <div className="card-teams-body">
                          {/* Home Team */}
                          <div className="team-col home">
                            {homeTeam?.logo_url ? (
                              <img src={homeTeam.logo_url} alt="Home" className="team-logo-md" />
                            ) : (
                              <div className="team-logo-placeholder-sm">⚽</div>
                            )}
                            <span className="team-name-md">{homeTeam?.name || 'Home'}</span>
                          </div>

                          {/* Score Center */}
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

                          {/* Away Team */}
                          <div className="team-col away">
                            {awayTeam?.logo_url ? (
                              <img src={awayTeam.logo_url} alt="Away" className="team-logo-md" />
                            ) : (
                              <div className="team-logo-placeholder-sm">⚽</div>
                            )}
                            <span className="team-name-md">{awayTeam?.name || 'Away'}</span>
                          </div>
                        </div>

                        {/* Card Bottom: Replay Counter Badge & Enter action */}
                        <div className="card-bottom-bar">
                          {replaysCount > 0 ? (
                            <div className="replays-count-badge active">
                              <Film size={14} />
                              <span>{replaysCount} ta replay video</span>
                            </div>
                          ) : (
                            <div className="replays-count-badge empty">
                              <span>Replaysiz</span>
                            </div>
                          )}

                          <div className="open-action">
                            <span>Gollarni ko'rish</span>
                            <ChevronRight size={16} />
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
