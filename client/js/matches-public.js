document.addEventListener('DOMContentLoaded', () => {
    const loadingMatches = document.getElementById('loadingMatches');
    const matchesGrid = document.getElementById('matchesGrid');
    
    // Filter State
    let currentStatus = 'all';
    let currentRound = 'all';
    let currentLeague = 'all';
    let allMatches = [];

    // Setup Custom Selects UI logic
    const setupCustomSelect = (containerId, triggerId, textId, optionsId, onSelectCallback) => {
        const container = document.getElementById(containerId);
        const trigger = document.getElementById(triggerId);
        const textSpan = document.getElementById(textId);
        const optionsContainer = document.getElementById(optionsId);

        if (!container || !trigger) return;

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            // Close all other dropdowns
            document.querySelectorAll('.custom-select-container').forEach(c => {
                if (c !== container) c.classList.remove('open');
            });
            container.classList.toggle('open');
        });

        // Delegate option clicks
        optionsContainer.addEventListener('click', (e) => {
            const option = e.target.closest('.custom-option');
            if (!option) return;

            e.stopPropagation();
            const value = option.dataset.value;
            const text = option.textContent.trim();

            optionsContainer.querySelectorAll('.custom-option').forEach(opt => opt.classList.remove('active'));
            option.classList.add('active');

            if (textSpan) textSpan.textContent = text;
            container.classList.remove('open');

            onSelectCallback(value);
        });
    };

    // Close dropdowns on outside click
    document.addEventListener('click', () => {
        document.querySelectorAll('.custom-select-container').forEach(c => c.classList.remove('open'));
    });

    const applyFilters = () => {
        matchesGrid.innerHTML = '';
        loadingMatches.classList.add('hidden');
        matchesGrid.classList.remove('hidden');

        let filtered = allMatches;

        // 1. Status Filter
        if (currentStatus !== 'all') {
            filtered = filtered.filter(m => {
                if (currentStatus === 'live') return m.status === 'first_half' || m.status === 'second_half' || m.status === 'half_time';
                return m.status === currentStatus;
            });
        }

        // 2. Round Filter
        if (currentRound !== 'all') {
            filtered = filtered.filter(m => String(m.round) === String(currentRound));
        }

        // 3. League Filter
        if (currentLeague !== 'all') {
            filtered = filtered.filter(m => m.league === currentLeague);
        }

        if (filtered.length === 0) {
            matchesGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px;">Hech qanday o\'yin topilmadi.</div>';
            return;
        }

        filtered.forEach(match => {
            const isLive = match.status === 'first_half' || match.status === 'second_half' || match.status === 'half_time';
            const isFinished = match.status === 'finished';
            
            let statusBadge = '';
            if (isLive) statusBadge = '<div class="badge badge-live">Jonli (Live)</div>';
            else if (isFinished) statusBadge = '<div class="badge badge-finished">Yakunlangan</div>';
            else statusBadge = '<div class="badge badge-scheduled">Rejalashtirilgan</div>';

            const homeLogo = match.home_team?.logo_url || 'images/logo.png';
            const awayLogo = match.away_team?.logo_url || 'images/logo.png';
            
            let scoreArea = '<div class="match-vs">VS</div>';
            if (isLive || isFinished || (match.home_score > 0 || match.away_score > 0)) {
                scoreArea = `<div class="match-score">${match.home_score || 0} : ${match.away_score || 0}</div>`;
            }

            const html = `
                <div class="match-card" onclick="localStorage.setItem('selectedMatchId', '${match.id}'); window.location.href='match-details.html?id=${match.id}';" style="cursor: pointer;">
                    <div class="match-badges-container">
                        <div class="badge badge-league">${match.league || ''}</div>
                        ${statusBadge}
                    </div>
                    
                    <div class="match-teams">
                        <div class="team">
                            <img src="${homeLogo}" alt="Home" class="team-logo" loading="lazy">
                            <span class="team-name">${match.home_team?.name || ''}</span>
                        </div>
                        ${scoreArea}
                        <div class="team">
                            <img src="${awayLogo}" alt="Away" class="team-logo" loading="lazy">
                            <span class="team-name">${match.away_team?.name || ''}</span>
                        </div>
                    </div>

                    <div class="match-details">
                        <div class="detail-row">
                            <i data-lucide="calendar" style="width: 14px; height: 14px;"></i> <span>${match.match_date || ''}</span>
                        </div>
                        <div class="detail-row">
                            <i data-lucide="clock" style="width: 14px; height: 14px;"></i> <span>${match.match_time || ''}</span>
                        </div>
                        <div class="detail-row">
                            <i data-lucide="map-pin" style="width: 14px; height: 14px;"></i> <span>${match.location || ''}</span>
                        </div>
                    </div>
                    
                    ${match.youtube_link ? `
                    <div class="btn-live" onclick="event.stopPropagation(); window.open('${match.youtube_link}', '_blank')">
                        <i data-lucide="play-circle"></i> Jonli ko'rish
                    </div>
                    ` : ''}
                </div>
            `;
            matchesGrid.insertAdjacentHTML('beforeend', html);
        });

        if (typeof lucide !== 'undefined') lucide.createIcons();
    };

    const populateDropdowns = () => {
        // 1. Populate Rounds dropdown
        const roundsSet = new Set();
        allMatches.forEach(m => { if (m.round) roundsSet.add(m.round); });
        const rounds = Array.from(roundsSet).sort((a, b) => Number(a) - Number(b));

        const roundOptionsContainer = document.getElementById('roundSelectOptions');
        if (roundOptionsContainer) {
            let roundsHtml = '<div class="custom-option active" data-value="all">Barcha turlar</div>';
            rounds.forEach(r => {
                roundsHtml += `<div class="custom-option" data-value="${r}">${r}-tur</div>`;
            });
            roundOptionsContainer.innerHTML = roundsHtml;
        }

        // 2. Populate Leagues dropdown
        const leaguesSet = new Set();
        allMatches.forEach(m => { if (m.league) leaguesSet.add(m.league); });
        const defaultLeagues = ['Super liga', 'Pro liga', '3-liga', '7x7 liga', 'Europa ligasi', 'Chempionlar ligasi'];
        defaultLeagues.forEach(l => leaguesSet.add(l));
        const leagues = Array.from(leaguesSet);

        const leagueOptionsContainer = document.getElementById('leagueSelectOptions');
        if (leagueOptionsContainer) {
            let leaguesHtml = '<div class="custom-option active" data-value="all">Barcha ligalar</div>';
            leagues.forEach(l => {
                leaguesHtml += `<div class="custom-option" data-value="${l}">${l}</div>`;
            });
            leagueOptionsContainer.innerHTML = leaguesHtml;
        }
    };

    // Initialize custom select event handlers
    setupCustomSelect('statusSelectContainer', 'statusSelectTrigger', 'statusSelectText', 'statusSelectOptions', (val) => {
        currentStatus = val;
        applyFilters();
    });

    setupCustomSelect('roundSelectContainer', 'roundSelectTrigger', 'roundSelectText', 'roundSelectOptions', (val) => {
        currentRound = val;
        applyFilters();
    });

    setupCustomSelect('leagueSelectContainer', 'leagueSelectTrigger', 'leagueSelectText', 'leagueSelectOptions', (val) => {
        currentLeague = val;
        applyFilters();
    });

    const fetchMatches = async () => {
        try {
            const { data, error } = await db
                .from('matches')
                .select(`
                    *,
                    home_team:home_team_id (name, logo_url),
                    away_team:away_team_id (name, logo_url)
                `)
                .order('match_date', { ascending: true })
                .order('match_time', { ascending: true });

            if (error) throw error;
            
            allMatches = data || [];
            populateDropdowns();
            applyFilters();
        } catch (err) {
            console.error(err);
            loadingMatches.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--error);">O\'yinlarni yuklashda xatolik yuz berdi.</div>';
        }
    };

    fetchMatches();
});
