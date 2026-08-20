document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    let matchId = urlParams.get('id');

    if (!matchId) {
        // Fallback for local servers that strip URL parameters
        matchId = localStorage.getItem('selectedMatchId');
    }

    if (!matchId) {
        document.getElementById('loading').innerHTML = 'O\'yin topilmadi';
        return;
    }

    const loadingEl = document.getElementById('loading');
    const contentEl = document.getElementById('content');
    const headerScoreArea = document.getElementById('headerScoreArea');
    
    // Elements
    const statusCard = document.getElementById('matchStatusCard');
    const timelineContainer = document.getElementById('matchTimeline');
    const teamSelector = document.getElementById('teamSelector');
    const formationLayer = document.getElementById('formationLayer');
    const playersList = document.getElementById('playersList');

    const homeSelectBtn = document.getElementById('homeTeamSelectBtn');
    const awaySelectBtn = document.getElementById('awayTeamSelectBtn');
    const homeSelectLogo = document.getElementById('homeSelectLogo');
    const awaySelectLogo = document.getElementById('awaySelectLogo');
    const homeSelectName = document.getElementById('homeSelectName');
    const awaySelectName = document.getElementById('awaySelectName');

    let currentMatch = null;
    let matchEvents = [];
    let homePlayers = [];
    let awayPlayers = [];
    let activeTeamId = null;

    // Tabs logic
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.tab).classList.add('active');
        });
    });

    try {
        // Fetch match data
        const { data: match, error: matchErr } = await db
            .from('matches')
            .select(`
                *,
                home_team:home_team_id (id, name, logo_url),
                away_team:away_team_id (id, name, logo_url)
            `)
            .eq('id', matchId)
            .single();

        if (matchErr) throw matchErr;
        function getAbbr(name) {
            if (!name) return 'UNK';
            const clean = name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
            if (clean.length <= 3) return clean;
            return clean[0] + clean[Math.floor(clean.length / 2)] + clean[clean.length - 1];
        }

        if (headerScoreArea) {
            headerScoreArea.innerHTML = `
                <span class="header-team-abbr" style="font-family: 'Outfit', sans-serif; font-size: 16px; font-weight: 700; color: var(--text-main); letter-spacing: 1px;">${getAbbr(match.home_team?.name)}</span>
                <img src="${match.home_team?.logo_url || 'images/logo.png'}" class="header-team-logo" alt="Home">
                <span class="header-score">${match.home_score || 0} - ${match.away_score || 0}</span>
                <img src="${match.away_team?.logo_url || 'images/logo.png'}" class="header-team-logo" alt="Away">
                <span class="header-team-abbr" style="font-family: 'Outfit', sans-serif; font-size: 16px; font-weight: 700; color: var(--text-main); letter-spacing: 1px;">${getAbbr(match.away_team?.name)}</span>
            `;
        }
        
        currentMatch = match;
        
        // Fetch Events
        const { data: events } = await db
            .from('match_events')
            .select('*, player:player_id(first_name, last_name), team:team_id(id, name, logo_url)')
            .eq('match_id', matchId)
            .order('minute', { ascending: true });
        
        matchEvents = events || [];

        // Fetch Players (Both teams) - from applications table (excluding archived)
        const [homeRes, awayRes] = await Promise.all([
            db.from('applications').select('*').eq('team_id', match.home_team_id).eq('status', 'approved'),
            db.from('applications').select('*').eq('team_id', match.away_team_id).eq('status', 'approved')
        ]);

        homePlayers = (homeRes.data || []).filter(p => !p.is_archived);
        awayPlayers = (awayRes.data || []).filter(p => !p.is_archived);

        renderOverview();
        
        // Set up Lineups
        if (match.home_team) {
            homeSelectLogo.src = match.home_team.logo_url || 'images/logo.png';
            homeSelectName.innerText = match.home_team.name;
        }
        if (match.away_team) {
            awaySelectLogo.src = match.away_team.logo_url || 'images/logo.png';
            awaySelectName.innerText = match.away_team.name;
        }

        activeTeamId = match.home_team_id;
        
        homeSelectBtn.addEventListener('click', () => {
            homeSelectBtn.classList.add('active');
            awaySelectBtn.classList.remove('active');
            activeTeamId = match.home_team_id;
            renderLineups();
        });
        
        awaySelectBtn.addEventListener('click', () => {
            awaySelectBtn.classList.add('active');
            homeSelectBtn.classList.remove('active');
            activeTeamId = match.away_team_id;
            renderLineups();
        });

        renderLineups();

        loadingEl.style.display = 'none';
        contentEl.style.display = 'block';

        if (typeof lucide !== 'undefined') lucide.createIcons();

    } catch (err) {
        console.error(err);
        loadingEl.innerHTML = '<span style="color:red">Xatolik yuz berdi.</span>';
    }

    function renderOverview() {
        // Status Card
        let statusTitle = "O'yin holati nom'alum";
        if (currentMatch.status === 'scheduled') statusTitle = "Rejalashtirilgan";
        else if (currentMatch.status === 'first_half') statusTitle = "1-Taym ketyapdi";
        else if (currentMatch.status === 'half_time') statusTitle = "Tanaffus";
        else if (currentMatch.status === 'second_half') statusTitle = "2-Taym ketyapdi";
        else if (currentMatch.status === 'finished') statusTitle = "O'yin yakunlangan";

        statusCard.innerHTML = `
            <div class="status-title">${statusTitle}</div>
            <div class="status-score">Natija: ${currentMatch.home_team?.name} ${currentMatch.home_score || 0} - ${currentMatch.away_score || 0} ${currentMatch.away_team?.name}</div>
        `;

        // Timeline
        if (matchEvents.length === 0) {
            timelineContainer.innerHTML = '<div style="text-align:center; color:#64748b; padding: 20px;">Hozircha voqealar yo\'q</div>';
            return;
        }

        timelineContainer.innerHTML = '';
        matchEvents.forEach((ev, idx) => {
            let iconStr = '';
            let title = '';
            let desc = ev.player ? `${ev.player.first_name[0]||''}. ${ev.player.last_name}` : 'Noma\'lum o\'yinchi';

            if (ev.event_type === 'goal') {
                iconStr = '<i data-lucide="goal" style="color:white; width:16px;"></i>';
                title = 'Gol!';
                desc += ' gol urdi.';
                
                if (ev.assist_player_id) {
                    const isHome = ev.team_id === currentMatch.home_team_id;
                    const teamPlayers = isHome ? homePlayers : awayPlayers;
                    const assistPlayer = teamPlayers.find(p => p.id === ev.assist_player_id || p._id === ev.assist_player_id);
                    if (assistPlayer) {
                        desc += ` Pas berdi: ${assistPlayer.first_name[0]||''}. ${assistPlayer.last_name}`;
                    }
                }
            } else if (ev.event_type === 'yellow_card') {
                iconStr = '<div style="width:12px; height:16px; background:#FACC15; border-radius:2px;"></div>';
                title = 'Sariq kartochka';
                desc += ' sariq kartochka oldi.';
            } else if (ev.event_type === 'red_card') {
                iconStr = '<div style="width:12px; height:16px; background:#EF4444; border-radius:2px;"></div>';
                title = 'Qizil kartochka';
                desc += ' qizil kartochka oldi.';
            } else if (ev.event_type === 'substitution') {
                iconStr = '<i data-lucide="refresh-cw" style="color:#3b82f6; width:16px;"></i>';
                title = 'O\'zgarish';
                desc += ' maydonga tushdi.';
            }

            const isHome = ev.team_id === currentMatch.home_team_id;
            const logo = ev.team?.logo_url || 'images/logo.png';

            const html = `
                <div class="timeline-item">
                    <div class="timeline-left">
                        <div class="timeline-minute">${ev.minute}'</div>
                        <div class="timeline-icon">${iconStr}</div>
                        <div class="timeline-line"></div>
                    </div>
                    <div class="timeline-card">
                        <div class="timeline-info">
                            <h4>${title}</h4>
                            <p>${desc}</p>
                        </div>
                        <img src="${logo}" class="team-mini-logo" alt="team">
                    </div>
                </div>
            `;
            timelineContainer.insertAdjacentHTML('beforeend', html);
        });
    }

    function renderLineups() {
        const players = activeTeamId === currentMatch.home_team_id ? homePlayers : awayPlayers;
        
        // --- Render List ---
        playersList.innerHTML = '';
        if (players.length === 0) {
            playersList.innerHTML = '<div style="padding: 20px; text-align:center; color:#64748b;">O\'yinchilar topilmadi</div>';
            formationLayer.innerHTML = '';
            return;
        }

        // Calculate player events for badges
        const getPlayerEvents = (playerId) => {
            const evs = matchEvents.filter(e => e.player_id === playerId);
            let goals = 0, yellows = 0, reds = 0;
            evs.forEach(e => {
                if (e.event_type === 'goal') goals++;
                if (e.event_type === 'yellow_card') yellows++;
                if (e.event_type === 'red_card') reds++;
            });
            return { goals, yellows, reds };
        };

        players.forEach(p => {
            const stats = getPlayerEvents(p.id);
            let badgesHTML = '';
            if (stats.goals > 0) badgesHTML += `<span class="event-badge"><i data-lucide="goal"></i>x${stats.goals}</span>`;
            if (stats.yellows > 0) badgesHTML += `<span class="event-badge"><div style="width:10px;height:14px;background:#facc15;border-radius:2px;"></div></span>`;
            if (stats.reds > 0) badgesHTML += `<span class="event-badge"><div style="width:10px;height:14px;background:#ef4444;border-radius:2px;"></div></span>`;

            const imgUrl = p.photo_url || 'https://ui-avatars.com/api/?name=' + (p.first_name[0]||'P') + '&background=1e293b&color=ffffff';
            const position = p.position || 'O\'yinchi';
            const number = p.number ? `#${p.number}` : '';

            const html = `
                <div class="player-list-item">
                    <div class="player-list-avatar">
                        <img src="${imgUrl}" alt="player">
                    </div>
                    <div class="player-list-info">
                        <div class="player-list-name">${p.first_name[0]||''}. ${p.last_name} <span class="player-number">${number}</span></div>
                        <div class="player-position">${position}</div>
                    </div>
                    <div class="player-list-events">
                        ${badgesHTML}
                    </div>
                </div>
            `;
            playersList.insertAdjacentHTML('beforeend', html);
        });

        // --- Render Pitch (Simple 4 rows layout: GK, DEF, MID, FWD) ---
        // Group players by position
        const gks = players.filter(p => (p.position||'').toLowerCase().includes('darvozabon') || (p.position||'').toLowerCase() === 'gk');
        const defs = players.filter(p => (p.position||'').toLowerCase().includes('himoyachi') || (p.position||'').toLowerCase() === 'df');
        const mids = players.filter(p => (p.position||'').toLowerCase().includes('yarim') || (p.position||'').toLowerCase() === 'mf');
        const fwds = players.filter(p => (p.position||'').toLowerCase().includes('hujumchi') || (p.position||'').toLowerCase() === 'fw');
        
        // If we don't have properly categorized positions, just distribute them randomly or put everyone in mid
        const rows = [];
        if (gks.length > 0) rows.push(fwds);
        else { rows.push(fwds); } // This is top row (opponent goal direction)
        
        rows.push(mids);
        rows.push(defs);
        if (gks.length > 0) rows.push(gks); // Bottom row (own goal)
        else {
            // fallback if positions are unassigned
            if (players.length > 0 && fwds.length === 0 && defs.length === 0 && mids.length === 0 && gks.length === 0) {
                // Just put max 5 in a row
                let chunk = [];
                players.forEach((p, i) => {
                    chunk.push(p);
                    if (chunk.length === 5 || i === players.length - 1) {
                        rows.unshift([...chunk]);
                        chunk = [];
                    }
                });
            }
        }

        formationLayer.innerHTML = '';
        rows.forEach(rowPlayers => {
            if (!rowPlayers || rowPlayers.length === 0) return;
            let rowHTML = '<div class="formation-row">';
            rowPlayers.forEach(p => {
                const stats = getPlayerEvents(p.id);
                let eventBadge = '';
                if (stats.goals > 0) eventBadge = `<div class="shirt-event"><i data-lucide="goal" style="width:10px;height:10px;"></i> x${stats.goals}</div>`;
                else if (stats.reds > 0) eventBadge = `<div class="shirt-event" style="background:#ef4444;"></div>`;
                else if (stats.yellows > 0) eventBadge = `<div class="shirt-event" style="background:#facc15;"></div>`;

                rowHTML += `
                    <div class="player-marker">
                        <div class="shirt">
                            ${p.number || ''}
                            ${eventBadge}
                        </div>
                        <div class="player-name-pitch">${p.first_name[0]||''}. ${p.last_name}</div>
                    </div>
                `;
            });
            rowHTML += '</div>';
            formationLayer.insertAdjacentHTML('beforeend', rowHTML);
        });

        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
});
