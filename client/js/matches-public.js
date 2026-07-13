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
                <div class="match-card" onclick="window.location.href='match-details.html?id=${match.id}'">
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

    
