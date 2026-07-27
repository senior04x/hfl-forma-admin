// player-details.js — O'yinchi profil sahifasi logikasi
document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const playerId = urlParams.get('id');

    const loadingEl = document.getElementById('playerLoading');
    const contentEl = document.getElementById('playerContent');
    const errorEl = document.getElementById('playerError');

    if (!playerId) {
        loadingEl.classList.add('hidden');
        errorEl.classList.remove('hidden');
        return;
    }

    try {
        // Fetch player data
        const { data: player, error: playerError } = await db
            .from('applications')
            .select('*')
            .eq('id', playerId)
            .single();

        if (playerError || !player) {
            throw new Error('O\'yinchi topilmadi');
        }

        const fullName = player.full_name || `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Noma\'lum';
        const playerNum = player.player_number || player.number || '-';
        const position = player.position || 'Futbolchi';
        const birthDate = player.birth_date || '-';
        const photoUrl = player.photo_url || '';

        // Set page title
        document.title = `${fullName} - Amatora O'yinchi Profili`;

        // Fill hero
        const photoEl = document.getElementById('pPhoto');
        if (photoUrl) {
            photoEl.src = photoUrl;
        } else {
            photoEl.src = 'https://via.placeholder.com/200x200?text=Rasm+yo%27q';
        }
        photoEl.onerror = function() {
            this.onerror = null;
            this.src = 'https://via.placeholder.com/200x200?text=Rasm+yo%27q';
        };

        document.getElementById('pFullName').textContent = fullName;
        document.getElementById('pNumberRing').textContent = `#${playerNum}`;
        document.getElementById('pPositionBadge').innerHTML = `<i data-lucide="dribbble" style="width:14px; height:14px;"></i> ${position}`;

        // Stats cards
        document.getElementById('pBirthDate').textContent = birthDate;
        document.getElementById('pNumber').textContent = `#${playerNum}`;

        // Fetch team info if team_id exists
        let teamData = null;
        if (player.team_id) {
            const { data: team, error: teamError } = await db
                .from('teams')
                .select('id, name, logo_url, league, captain_phone, status')
                .eq('id', player.team_id)
                .single();

            if (!teamError && team) {
                teamData = team;
            }
        }

        if (teamData) {
            document.getElementById('pTeamName').textContent = teamData.name;
            document.getElementById('pLeague').textContent = teamData.league || '-';

            // Team section
            const teamSection = document.getElementById('teamSection');
            teamSection.classList.remove('hidden');

            const teamLogo = document.getElementById('teamLogo');
            if (teamData.logo_url) {
                teamLogo.src = teamData.logo_url;
            } else {
                teamLogo.style.display = 'none';
            }

            document.getElementById('teamName').textContent = teamData.name;
            document.getElementById('teamLeague').innerHTML = `<i data-lucide="trophy" style="width:14px; height:14px; display:inline;"></i> ${teamData.league || 'Liga'}`;

            // Click to go to team page
            document.getElementById('teamHeaderLink').addEventListener('click', () => {
                const teamUrl = window.getUrl ? window.getUrl(`team-details.html?id=${teamData.id}`) : `team-details.html?id=${teamData.id}`;
                window.location.href = teamUrl;
            });

            // Fetch teammates
            const { data: teammates, error: tmError } = await db
                .from('applications')
                .select('id, first_name, last_name, full_name, photo_url, position, player_number')
                .eq('team_id', player.team_id)
                .eq('status', 'approved')
                .neq('id', playerId);

            if (!tmError && teammates && teammates.length > 0) {
                const grid = document.getElementById('teammatesGrid');
                grid.innerHTML = teammates.map(tm => {
                    const tmName = tm.full_name || `${tm.first_name || ''} ${tm.last_name || ''}`.trim() || 'Futbolchi';
                    const tmPhoto = tm.photo_url || 'https://via.placeholder.com/80x80?text=%E2%9A%BD';
                    const tmPos = tm.position || 'Futbolchi';
                    const tmNum = tm.player_number || tm.number || '';
                    const tmUrl = window.getUrl ? window.getUrl(`player-details.html?id=${tm.id}`) : `player-details.html?id=${tm.id}`;

                    return `
                        <div class="teammate-card" onclick="window.location.href='${tmUrl}'">
                            <img class="teammate-photo" src="${tmPhoto}" alt="${tmName}" onerror="this.onerror=null; this.src='https://via.placeholder.com/80x80?text=%E2%9A%BD'">
                            <div class="teammate-name">${tmName}</div>
                            <div class="teammate-pos">${tmPos} ${tmNum ? '#' + tmNum : ''}</div>
                        </div>
                    `;
                }).join('');
            } else {
                document.getElementById('teammatesGrid').innerHTML = '<div style="color:#94A3B8; font-size:13px; grid-column:1/-1;">Jamodoshlar topilmadi</div>';
            }
        } else {
            document.getElementById('pTeamName').textContent = '-';
            document.getElementById('pLeague').textContent = '-';
        }

        // Show content
        loadingEl.classList.add('hidden');
        contentEl.classList.remove('hidden');

        // Re-render Lucide icons for dynamically inserted content
        if (typeof lucide !== 'undefined') lucide.createIcons();

    } catch (err) {
        console.error('Player details error:', err);
        loadingEl.classList.add('hidden');
        errorEl.classList.remove('hidden');
    }
});
