let allTeamsData = [];
let allMatchesData = [];
let allEventsData = [];

document.addEventListener('DOMContentLoaded', async () => {
    const contentContainer = document.getElementById('contentContainer');

    try {
        // Fetch Teams
        const { data: teamsData, error: teamsError } = await db
            .from('teams')
            .select('id, name, logo_url, league')
            .in('status', ['approved', 'partially_approved']);
        
        if (teamsError) throw teamsError;
        allTeamsData = teamsData;

        // Fetch Finished Matches
        const { data: matchesData, error: matchesError } = await db
            .from('matches')
            .select('*')
            .eq('status', 'finished')
            .order('match_date', { ascending: false });

        if (matchesError) throw matchesError;
        allMatchesData = matchesData;

        // Fetch Match Events (goals and assists) with pagination to exceed 1000 limit
        let allEvents = [];
        let page = 0;
        const PAGE_SIZE = 1000;
        while (true) {
            const { data: pageData, error: pageError } = await db
                .from('match_events')
                .select('id, event_type, player_id, team_id, player:player_id(first_name, last_name, photo_url), team:team_id(name, logo_url, league)')
                .in('event_type', ['goal', 'assist'])
                .order('id', { ascending: true })
                .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

            if (pageError) throw pageError;
            if (!pageData || pageData.length === 0) break;
            allEvents.push(...pageData);
            if (pageData.length < PAGE_SIZE) break;
            page++;
        }
        allEventsData = allEvents;

        // Filter State
        let currentLeague = 'Super';
        let currentRound = '1';

        // Dynamically populate Round options based on maximum round in matches
        const roundOptionsContainer = document.getElementById('roundFilterOptions');
        const roundFilterTrigger = document.getElementById('roundFilterTrigger');
        
        if (roundOptionsContainer && allMatchesData.length > 0) {
            let maxRound = 0;
            let maxYear = new Date().getFullYear();

            allMatchesData.forEach(m => {
                if (m.round && parseInt(m.round) > maxRound) {
                    maxRound = parseInt(m.round);
                }
                if (m.match_date) {
                    const year = new Date(m.match_date).getFullYear();
                    if (year > maxYear) maxYear = year;
                }
            });

            const seasonStr = `${maxYear}/${maxYear + 1}`;
            currentRound = maxRound > 0 ? maxRound.toString() : '1';

            // Update trigger text initially
            if(roundFilterTrigger) {
                roundFilterTrigger.querySelector('span').innerText = `${currentRound}-tur ${seasonStr}`;
            }

            // Rebuild the HTML for round options up to maxRound
            let roundHTML = ``;
            for (let i = 1; i <= maxRound; i++) {
                roundHTML += `<div class="custom-option ${i.toString() === currentRound ? 'active' : ''}" data-value="${i}">${i}-tur ${seasonStr}</div>`;
            }
            roundOptionsContainer.innerHTML = roundHTML;
        }

        // Setup Custom Selects
        function setupSelect(containerId, triggerId, onSelect) {
            const container = document.getElementById(containerId);
            const trigger = document.getElementById(triggerId);
            if(!container || !trigger) return;
            
            const options = container.querySelectorAll('.custom-option');
            
            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                // Close others
                document.querySelectorAll('.custom-select-container').forEach(c => {
                    if(c !== container) c.classList.remove('open');
                });
                container.classList.toggle('open');
            });

            options.forEach(opt => {
                opt.addEventListener('click', (e) => {
                    options.forEach(o => o.classList.remove('active'));
                    e.target.classList.add('active');
                    
                    const selectedValue = e.target.getAttribute('data-value');
                    trigger.querySelector('span').innerText = e.target.innerText;
                    
                    onSelect(selectedValue);
                });
            });
        }

        document.addEventListener('click', () => {
            document.querySelectorAll('.custom-select-container').forEach(c => c.classList.remove('open'));
        });

        // Initialize Selects
        setupSelect('leagueSelectContainer', 'leagueFilterTrigger', (val) => {
            currentLeague = val;
            renderStandingsByLeague(currentLeague, currentRound);
        });

        setupSelect('roundSelectContainer', 'roundFilterTrigger', (val) => {
            currentRound = val;
            renderStandingsByLeague(currentLeague, currentRound);
        });
        
        // Initial render
        renderStandingsByLeague(currentLeague, currentRound);

    } catch (err) {
        console.error("Standings error:", err);
        if (contentContainer) {
            contentContainer.innerHTML = `<div class="glass-panel" style="grid-column: 1/-1; text-align: center; color: #ef4444;">Ma'lumotlarni yuklashda xatolik yuz berdi.</div>`;
        }
    }
});

function renderStandingsByLeague(selectedLeague, selectedRound = 'all') {
    // Background theme update
    document.querySelectorAll('.league-bg-layer').forEach(el => el.style.opacity = '0');
    if (selectedLeague.includes('Super')) {
        const el = document.getElementById('bgThemeSuper');
        if(el) el.style.opacity = '1';
    } else if (selectedLeague.includes('Pro')) {
        const el = document.getElementById('bgThemePro');
        if(el) el.style.opacity = '1';
    } else if (selectedLeague.includes('3-liga') || selectedLeague.includes('3 liga') || selectedLeague === '3liga') {
        const el = document.getElementById('bgTheme3liga');
        if(el) el.style.opacity = '1';
    } else if (selectedLeague.includes('Europa') || selectedLeague.includes('yevropa')) {
        const el = document.getElementById('bgThemeEuropa');
        if(el) el.style.opacity = '1';
    } else if (selectedLeague.includes('Chempion')) {
        const el = document.getElementById('bgThemeChampions');
        if(el) el.style.opacity = '1';
    }

    // 1. Filter teams by the selected league
    const filteredTeams = allTeamsData.filter(t => (t.league || 'Super liga').includes(selectedLeague));
    const filteredTeamIds = new Set(filteredTeams.map(t => t.id));

    // 2. Filter matches (only matches where BOTH teams are in the selected league, or at least one is)
    let filteredMatches = allMatchesData.filter(m => filteredTeamIds.has(m.home_team_id));
    if (selectedRound !== 'all') {
        filteredMatches = filteredMatches.filter(m => String(m.round) === selectedRound);
    }

    // 3. Filter events (only events belonging to teams in the selected league)
    const filteredEvents = allEventsData.filter(e => filteredTeamIds.has(e.team_id));

    // --- Calculate League Table ---
    const tableMap = {};
    filteredTeams.forEach(t => {
        tableMap[t.id] = {
            id: t.id,
            name: t.name,
            logo: t.logo_url,
            played: 0,
            gf: 0,
            ga: 0,
            gd: 0,
            points: 0
        };
    });

    filteredMatches.forEach(m => {
        const hId = m.home_team_id;
        const aId = m.away_team_id;
        const hScore = m.home_score || 0;
        const aScore = m.away_score || 0;

        if (tableMap[hId]) {
            tableMap[hId].played += 1;
            tableMap[hId].gf += hScore;
            tableMap[hId].ga += aScore;
            if (hScore > aScore) tableMap[hId].points += 3;
            else if (hScore === aScore) tableMap[hId].points += 1;
        }

        if (tableMap[aId]) {
            tableMap[aId].played += 1;
            tableMap[aId].gf += aScore;
            tableMap[aId].ga += hScore;
            if (aScore > hScore) tableMap[aId].points += 3;
            else if (aScore === hScore) tableMap[aId].points += 1;
        }
    });

    // Compute Goal Difference and sort
    const standings = Object.values(tableMap).map(t => {
        t.gd = t.gf - t.ga;
        return t;
    });

    standings.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.gd !== a.gd) return b.gd - a.gd;
        return b.gf - a.gf;
    });

    // --- Top Scorers & Assists ---
    const playerStats = {};
    filteredEvents.forEach(e => {
        if (!e.player || !e.player_id) return;
        if (!playerStats[e.player_id]) {
            playerStats[e.player_id] = {
                id: e.player_id,
                name: `${e.player.first_name} ${e.player.last_name}`,
                playerPhoto: e.player?.photo_url || '',
                teamName: e.team?.name || '',
                teamLogo: e.team?.logo_url || '',
                goals: 0,
                assists: 0
            };
        }
        if (e.event_type === 'goal') playerStats[e.player_id].goals += 1;
        if (e.event_type === 'assist') playerStats[e.player_id].assists += 1;
    });

    const topScorers = Object.values(playerStats)
        .filter(p => p.goals > 0)
        .sort((a, b) => b.goals - a.goals)
        .slice(0, 5);

    const topAssists = Object.values(playerStats)
        .filter(p => p.assists > 0)
        .sort((a, b) => b.assists - a.assists)
        .slice(0, 5);

    // --- Render UI ---
    renderUI(standings, filteredMatches.slice(0, 5), topScorers, topAssists, allTeamsData, selectedRound);
}

function renderUI(standings, recentMatches, topScorers, topAssists, allTeams, currentRound) {
    const container = document.getElementById('contentContainer');
    if(!container) return;
    
    container.innerHTML = '';

    // LEFT COLUMN: League Table
    const leftCol = document.createElement('div');
    
    let tableHtml = `
        <div class="glass-panel" style="overflow-x: auto;">
            <div class="panel-title">Turnir Jadvali</div>
            <table class="league-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>JAMOA</th>
                        <th>O'</th>
                        <th>T/N</th>
                        <th>O</th>
                    </tr>
                </thead>
                <tbody>
    `;

    if (standings.length === 0) {
        tableHtml += `<tr><td colspan="5" style="text-align:center; padding:30px; color:#94a3b8;">Ushbu ligada hozircha jamoalar yo'q</td></tr>`;
    } else {
        standings.forEach((team, idx) => {
            const sign = team.gd > 0 ? '+' : '';
            tableHtml += `
                <tr>
                    <td>${idx + 1}</td>
                    <td>
                        <div class="team-cell">
                            <img src="${team.logo}" alt="${team.name}" class="team-logo-small" onerror="this.onerror=null; this.src='https://via.placeholder.com/35x35?text=${team.name.charAt(0)}'">
                            <span>${team.name}</span>
                        </div>
                    </td>
                    <td>${team.played}</td>
                    <td>${sign}${team.gd}</td>
                    <td class="points">${team.points}</td>
                </tr>
            `;
        });
    }

    tableHtml += `</tbody></table></div>`;
    leftCol.innerHTML = tableHtml;

    // RIGHT COLUMN: Results, Top Scorers, Top Assists
    const rightCol = document.createElement('div');
    rightCol.style.display = 'flex';
    rightCol.style.flexDirection = 'column';
    
    // 1. Recent Results
    const displayRound = currentRound !== 'all' ? currentRound : 'OXIRGI';
    let resultsHtml = `
        <div class="glass-panel">
            <div class="panel-title" style="font-size: 18px; text-transform: uppercase;">${displayRound}-TUR NATIJALARI</div>
            <div class="results-list">
    `;

    if (recentMatches.length === 0) {
        resultsHtml += `<div style="text-align:center; padding:20px; color:#94a3b8;">Hozircha natijalar yo'q</div>`;
    } else {
        recentMatches.forEach(m => {
            const hTeam = allTeams.find(t => t.id === m.home_team_id);
            const aTeam = allTeams.find(t => t.id === m.away_team_id);
            if(!hTeam || !aTeam) return;

            resultsHtml += `
                <div class="result-item">
                    <div class="result-team">
                        <img src="${hTeam.logo_url}" alt="" onerror="this.onerror=null; this.src='https://via.placeholder.com/30x30?text=${hTeam.name.charAt(0)}'">
                        <span class="result-team-name">${hTeam.name}</span>
                    </div>
                    <div class="result-score">${m.home_score} - ${m.away_score}</div>
                    <div class="result-team away">
                        <img src="${aTeam.logo_url}" alt="" onerror="this.onerror=null; this.src='https://via.placeholder.com/30x30?text=${aTeam.name.charAt(0)}'">
                        <span class="result-team-name">${aTeam.name}</span>
                    </div>
                </div>
            `;
        });
    }
    resultsHtml += `</div></div>`;

    // 2. Top Scorers
    let scorersHtml = `
        <div class="glass-panel" style="margin-top: 25px;">
            <div class="panel-title" style="font-size: 18px;">To'purarlar</div>
            <table class="stats-table">
                <thead><tr><th>O'YINCHI</th><th>O'</th><th>G</th></tr></thead>
                <tbody>
    `;
    if(topScorers.length === 0) {
        scorersHtml += `<tr><td colspan="3" style="text-align:center; padding:20px; color:#94a3b8;">Ma'lumot yo'q</td></tr>`;
    } else {
        topScorers.forEach(p => {
            scorersHtml += `
                <tr>
                    <td>
                        <div class="stats-player">
                            <img src="${p.playerPhoto || p.teamLogo}" alt="" class="team-logo-small" style="width:25px; height:25px; border-radius:50%; object-fit:cover;" onerror="this.onerror=null; this.src='https://via.placeholder.com/25x25?text=?'">
                            <span class="stats-player-name">${p.name}</span>
                        </div>
                    </td>
                    <td>-</td>
                    <td class="stats-value">${p.goals}</td>
                </tr>
            `;
        });
    }
    scorersHtml += `</tbody></table></div>`;

    // 3. Top Assists
    let assistsHtml = `
        <div class="glass-panel" style="margin-top: 25px;">
            <div class="panel-title" style="font-size: 18px;">Assistentlar</div>
            <table class="stats-table">
                <thead><tr><th>O'YINCHI</th><th>O'</th><th>A</th></tr></thead>
                <tbody>
    `;
    if(topAssists.length === 0) {
        assistsHtml += `<tr><td colspan="3" style="text-align:center; padding:20px; color:#94a3b8;">Ma'lumot yo'q</td></tr>`;
    } else {
        topAssists.forEach(p => {
            assistsHtml += `
                <tr>
                    <td>
                        <div class="stats-player">
                            <img src="${p.playerPhoto || p.teamLogo}" alt="" class="team-logo-small" style="width:25px; height:25px; border-radius:50%; object-fit:cover;" onerror="this.onerror=null; this.src='https://via.placeholder.com/25x25?text=?'">
                            <span class="stats-player-name">${p.name}</span>
                        </div>
                    </td>
                    <td>-</td>
                    <td class="stats-value">${p.assists}</td>
                </tr>
            `;
        });
    }
    assistsHtml += `</tbody></table></div>`;

    rightCol.innerHTML = resultsHtml + scorersHtml + assistsHtml;

    container.appendChild(leftCol);
    container.appendChild(rightCol);

    if (window.lucide) lucide.createIcons();
}
