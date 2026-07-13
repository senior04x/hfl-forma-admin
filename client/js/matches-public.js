document.addEventListener('DOMContentLoaded', () => {
    const loadingMatches = document.getElementById('loadingMatches');
    const matchesGrid = document.getElementById('matchesGrid');
    const filterBtns = document.querySelectorAll('.filter-btn');
    
    // Modal elements
    const matchModal = document.getElementById('matchModal');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const modalTeams = document.getElementById('modalTeams');
    const modalDetails = document.getElementById('modalDetails');
    const modalTimeline = document.getElementById('modalTimeline');
    
    let allMatches = [];

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
            renderMatches('all');
        } catch (err) {
            console.error(err);
            loadingMatches.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--error);">O\'yinlarni yuklashda xatolik yuz berdi.</div>';
        }
    };

    const renderMatches = (filter) => {
        matchesGrid.innerHTML = '';
        loadingMatches.classList.add('hidden');
        matchesGrid.classList.remove('hidden');

        let filtered = allMatches;
        if (filter !== 'all') {
            filtered = allMatches.filter(m => {
                if (filter === 'live') return m.status === 'first_half' || m.status === 'second_half' || m.status === 'half_time';
                return m.status === filter;
            });
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

            const homeLogo = match.home_team?.logo_url || 'images/default-team.png';
            const awayLogo = match.away_team?.logo_url || 'images/default-team.png';
            
            let scoreArea = '<div class="match-vs">VS</div>';
            if (isLive || isFinished || (match.home_score > 0 || match.away_score > 0)) {
                scoreArea = `<div class="match-score">${match.home_score || 0} : ${match.away_score || 0}</div>`;
            }

            const html = `
                <div class="match-card" onclick="openMatchModal('${match.id}')">
                    <div class="match-badges-container">
                        <div class="badge badge-league">${match.league}</div>
                        ${statusBadge}
                    </div>
                    
                    <div class="match-teams">
                        <div class="team">
                            <img src="${homeLogo}" alt="Home" class="team-logo" loading="lazy">
                            <span class="team-name">${match.home_team?.name}</span>
                        </div>
                        ${scoreArea}
                        <div class="team">
                            <img src="${awayLogo}" alt="Away" class="team-logo" loading="lazy">
                            <span class="team-name">${match.away_team?.name}</span>
                        </div>
                    </div>

                    <div class="match-details">
                        <div class="detail-row">
                            <i data-lucide="calendar" style="width: 14px; height: 14px;"></i> <span>${match.match_date}</span>
                        </div>
                        <div class="detail-row">
                            <i data-lucide="clock" style="width: 14px; height: 14px;"></i> <span>${match.match_time}</span>
                        </div>
                        <div class="detail-row">
                            <i data-lucide="map-pin" style="width: 14px; height: 14px;"></i> <span>${match.location}</span>
                        </div>
                    </div>
                    
                    ${match.youtube_link ? `
                    <a href="${match.youtube_link}" target="_blank" rel="noreferrer" class="btn-live" onclick="event.stopPropagation()">
                        <i data-lucide="play-circle"></i> Jonli ko'rish
                    </a>
                    ` : ''}
                </div>
            `;
            matchesGrid.insertAdjacentHTML('beforeend', html);
        });

        if (typeof lucide !== 'undefined') lucide.createIcons();
    };

    filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            filterBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            renderMatches(e.target.dataset.filter);
        });
    });

    // --- Modal Logic ---
    window.openMatchModal = async (matchId) => {
        const match = allMatches.find(m => m.id === matchId);
        if (!match) return;

        const isLive = match.status === 'first_half' || match.status === 'second_half' || match.status === 'half_time';
        const isFinished = match.status === 'finished';
        const homeLogo = match.home_team?.logo_url || 'images/default-team.png';
        const awayLogo = match.away_team?.logo_url || 'images/default-team.png';

        let scoreArea = '<div class="match-vs">VS</div>';
        if (isLive || isFinished || (match.home_score > 0 || match.away_score > 0)) {
            scoreArea = `<div class="match-score" style="font-size: 40px;">${match.home_score || 0} : ${match.away_score || 0}</div>`;
        }

        // Populate Teams
        modalTeams.innerHTML = `
            <div class="team">
                <img src="${homeLogo}" class="team-logo" style="width:80px;height:80px;">
                <span class="team-name">${match.home_team?.name}</span>
            </div>
            ${scoreArea}
            <div class="team">
                <img src="${awayLogo}" class="team-logo" style="width:80px;height:80px;">
                <span class="team-name">${match.away_team?.name}</span>
            </div>
        `;

        // Populate Details
        modalDetails.innerHTML = `
            <div class="detail-row"><i data-lucide="calendar" style="width:16px;height:16px;"></i> <span>Sana: ${match.match_date}</span></div>
            <div class="detail-row"><i data-lucide="clock" style="width:16px;height:16px;"></i> <span>Vaqt: ${match.match_time}</span></div>
            <div class="detail-row"><i data-lucide="map-pin" style="width:16px;height:16px;"></i> <span>Manzil: ${match.location}</span></div>
            <div class="detail-row"><i data-lucide="info" style="width:16px;height:16px;"></i> <span>Holati: ${match.status}</span></div>
        `;

        modalTimeline.innerHTML = '<div style="text-align:center; color: var(--text-muted);">Voqealar yuklanmoqda...</div>';
        matchModal.classList.add('active');
        if (typeof lucide !== 'undefined') lucide.createIcons();

        // Fetch events
        try {
            const { data: events } = await db
                .from('match_events')
                .select('*, player:player_id(first_name, last_name), team:team_id(name)')
                .eq('match_id', matchId)
                .order('minute', { ascending: true });

            if (!events || events.length === 0) {
                modalTimeline.innerHTML = '<div style="text-align:center; color: var(--text-muted);">Hozircha voqealar yo\'q</div>';
                return;
            }

            const icons = {
                goal: '⚽',
                yellow_card: '🟨',
                red_card: '🟥',
                substitution: '🔄'
            };

            modalTimeline.innerHTML = events.map(e => `
                <div class="timeline-event">
                    <span class="timeline-minute">${e.minute}'</span>
                    <span class="timeline-icon">${icons[e.event_type] || '•'}</span>
                    <div class="timeline-details">
                        <span class="timeline-player">${e.player ? e.player.first_name + ' ' + e.player.last_name : 'Noma\'lum o\'yinchi'}</span>
                        <span class="timeline-team">${e.team?.name || ''}</span>
                    </div>
                </div>
            `).join('');

        } catch (err) {
            console.error(err);
            modalTimeline.innerHTML = '<div style="color: var(--error);">Voqealarni yuklashda xatolik.</div>';
        }
    };

    closeModalBtn.addEventListener('click', () => {
        matchModal.classList.remove('active');
    });

    matchModal.addEventListener('click', () => {
        matchModal.classList.remove('active');
    });

    fetchMatches();
});
