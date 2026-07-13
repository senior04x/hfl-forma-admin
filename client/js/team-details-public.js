document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    let teamId = urlParams.get('id');

    if (!teamId) {
        teamId = localStorage.getItem('selectedTeamId');
    }

    const fromIndividual = urlParams.get('from') === 'individual';
    const backBtn = document.getElementById('backBtn');
    
    if (backBtn && fromIndividual) {
        backBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.history.back();
        });
    }

    if (!teamId) {
        window.location.href = 'teams.html';
        return;
    }

    const loadingEl = document.getElementById('loadingDetails');
    const teamContent = document.getElementById('teamContent');
    const playersGrid = document.getElementById('playersGrid');

    try {
        // Fetch Team Info
        const { data: teamData, error: teamError } = await db
            .from('teams')
            .select('name, logo_url, status, league')
            .eq('id', teamId)
            .single();

        if (teamError || !teamData || !['approved', 'partially_approved'].includes(teamData.status)) {
            throw new Error("Jamoa topilmadi yoki tasdiqlanmagan");
        }

        // Temporary fallback: return original url to fix broken images
        function optimizeImage(url) {
            return url;
        }

        // Set Team UI
        document.getElementById('tdLogo').src = optimizeImage(teamData.logo_url);
        document.getElementById('tdName').textContent = teamData.name;
        
        // Render Leagues
        const tdLeagues = document.getElementById('tdLeagues');
        if (teamData.league) {
            const leagues = teamData.league.split(',').map(l => l.trim()).filter(l => l);
            let badgesHTML = '';
            leagues.forEach(league => {
                const lowerLeague = league.toLowerCase();
                let badgeClass = 'badge-default';
                let displayText = league;
                
                if (lowerLeague.includes('super')) {
                    badgeClass = 'badge-super';
                    displayText = 'SUPER';
                } else if (lowerLeague.includes('pro')) {
                    badgeClass = 'badge-pro';
                    displayText = 'PRO';
                } else if (lowerLeague.includes('3-liga') || lowerLeague.includes('3 liga') || lowerLeague === '3liga') {
                    badgeClass = 'badge-3liga';
                    displayText = '3-LIGA';
                } else if (lowerLeague.includes('europa') || lowerLeague.includes('yevropa')) {
                    badgeClass = 'badge-europa';
                    displayText = 'EUROPE';
                } else if (lowerLeague.includes('chempion')) {
                    badgeClass = 'badge-champions';
                    displayText = 'CHAMPION';
                }
                
                badgesHTML += `<div class="team-league-badge ${badgeClass}">${displayText}</div>`;
            });
            tdLeagues.innerHTML = badgesHTML;
        }

        // Fetch Approved Players (NO passport info in select!)
        const { data: playersData, error: playersError } = await db
            .from('applications')
            .select('id, first_name, last_name, photo_url, player_number, position, birth_date')
            .eq('team_id', teamId)
            .eq('status', 'approved');

        if (playersError) throw playersError;

        loadingEl.classList.add('hidden');
        teamContent.classList.remove('hidden');

        document.getElementById('tdCount').textContent = `${playersData ? playersData.length : 0} ta o'yinchi`;

        if (!playersData || playersData.length === 0) {
            playersGrid.innerHTML = '<div style="grid-column: 1/-1; color: var(--text-muted);">Hali tasdiqlangan o\'yinchilar yo\'q.</div>';
            return;
        }

        // Render Players
        playersData.forEach(player => {
            const card = document.createElement('div');
            card.className = 'player-card-public';
            
            const pNumber = player.player_number ? player.player_number : '-';
            const position = player.position ? player.position : '-';
            const birth = player.birth_date ? player.birth_date : '-';

            card.innerHTML = `
                <div class="player-number-badge">${pNumber}</div>
                <img src="${optimizeImage(player.photo_url)}" alt="${player.first_name}" loading="lazy" decoding="async" onerror="this.src='https://via.placeholder.com/100x100?text=Rasm'">
                <h4>${player.first_name}</h4>
                <p>${player.last_name}</p>
            `;

            // Click to open modal
            card.addEventListener('click', () => {
                document.getElementById('pdPhoto').src = player.photo_url;
                document.getElementById('pdName').textContent = `${player.first_name} ${player.last_name}`;
                document.getElementById('pdNumber').textContent = `#${pNumber}`;
                document.getElementById('pdPosition').textContent = position;
                document.getElementById('pdBirth').textContent = birth;
                document.getElementById('playerDetailModal').classList.remove('hidden');
            });

            playersGrid.appendChild(card);
        });

    } catch (err) {
        console.error("Xatolik:", err);
        loadingEl.innerHTML = '<p style="color: var(--error);">Xatolik yuz berdi yoki jamoa topilmadi.</p><a href="teams.html" style="color: var(--gold-primary); text-decoration: underline;">Ortga qaytish</a>';
    }

    // Modal Close
    document.getElementById('closePlayerModal').addEventListener('click', () => {
        document.getElementById('playerDetailModal').classList.add('hidden');
    });
});
