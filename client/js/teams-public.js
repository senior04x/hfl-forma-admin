document.addEventListener('DOMContentLoaded', async () => {
    const loadingEl = document.getElementById('loadingTeams');
    const teamsGrid = document.getElementById('teamsGrid');

    try {
        if (typeof window.resolveOrg === 'function') {
            await window.resolveOrg();
        }
        const currentOrgId = (window.currentOrg && window.currentOrg.id) ? window.currentOrg.id : 1;

        // Fetch approved teams from Supabase
        const { data, error } = await db
            .from('teams')
            .select('id, name, logo_url, league, organization_id')
            .eq('organization_id', currentOrgId)
            .in('status', ['approved', 'partially_approved'])
            .order('created_at', { ascending: false });

        if (error) throw error;

        loadingEl.classList.add('hidden');
        teamsGrid.classList.remove('hidden');

        if (!data || data.length === 0) {
            teamsGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px;">Hali tasdiqlangan jamoalar mavjud emas.</div>';
            return;
        }

        window.allTeamsData = data;

        // Temporary fallback: return original url to fix broken images
        function optimizeImage(url) {
            return url;
        }

        function getLeagueBadgeHTML(leagueStr) {
            if (!leagueStr) return '';
            
            const leagues = leagueStr.split(',').map(l => l.trim()).filter(l => l);
            if (leagues.length === 0) return '';
            
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
                    displayText = 'LIGA CHEMP';
                }
                
                // We use relative positioning for multiple badges in a container
                badgesHTML += `<div class="team-league-badge ${badgeClass}" style="position: relative; top: auto; right: auto;">${displayText}</div>`;
            });
            
            return `<div style="position: absolute; top: 15px; right: 15px; display: flex; gap: 5px; flex-direction: column; align-items: flex-end; z-index: 2;">${badgesHTML}</div>`;
        }

        function renderTeams(teamsList) {
            teamsGrid.innerHTML = '';
            
            if (!teamsList || teamsList.length === 0) {
                teamsGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px;">Ushbu ligada tasdiqlangan jamoalar topilmadi.</div>';
                return;
            }

            teamsList.forEach(team => {
                const card = document.createElement('a');
                card.href = `team-details.html?id=${team.id}`;
                card.className = 'team-card-public';
                card.onclick = () => {
                    localStorage.setItem('selectedTeamId', team.id);
                };
                
                card.innerHTML = `
                    ${getLeagueBadgeHTML(team.league)}
                    <img src="${optimizeImage(team.logo_url)}" alt="${team.name}" loading="lazy" decoding="async" onerror="this.onerror=null; this.src='https://via.placeholder.com/100x100?text=Logo'">
                    <h3>${team.name}</h3>
                    <p>Batafsil ko'rish &rarr;</p>
                `;
                
                teamsGrid.appendChild(card);
            });
        }

        // Dastlabki barcha jamoalarni chiqarish
        renderTeams(window.allTeamsData);

        // Filter mantig'i
        const trigger = document.getElementById('leagueFilterTrigger');
        const container = document.getElementById('leagueSelectContainer');
        const options = document.querySelectorAll('.custom-option');

        if(trigger && container) {
            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                container.classList.toggle('open');
            });

            document.addEventListener('click', () => {
                container.classList.remove('open');
            });

            options.forEach(opt => {
                opt.addEventListener('click', (e) => {
                    options.forEach(o => o.classList.remove('active'));
                    e.target.classList.add('active');
                    
                    const selectedValue = e.target.getAttribute('data-value');
                    trigger.querySelector('span').innerText = e.target.innerText;
                    
                    if(selectedValue === 'all') {
                        document.querySelectorAll('.league-bg-layer').forEach(el => el.style.opacity = '0');
                        renderTeams(window.allTeamsData);
                    } else {
                        // Background theme update
                        document.querySelectorAll('.league-bg-layer').forEach(el => el.style.opacity = '0');
                        if (selectedValue.includes('Super')) {
                            const el = document.getElementById('bgThemeSuper');
                            if(el) el.style.opacity = '1';
                        } else if (selectedValue.includes('Pro')) {
                            const el = document.getElementById('bgThemePro');
                            if(el) el.style.opacity = '1';
                        } else if (selectedValue.includes('3-liga') || selectedValue.includes('3 liga') || selectedValue === '3liga') {
                            const el = document.getElementById('bgTheme3liga');
                            if(el) el.style.opacity = '1';
                        } else if (selectedValue.includes('Europa') || selectedValue.includes('yevropa')) {
                            const el = document.getElementById('bgThemeEuropa');
                            if(el) el.style.opacity = '1';
                        } else if (selectedValue.includes('Chempion')) {
                            const el = document.getElementById('bgThemeChampions');
                            if(el) el.style.opacity = '1';
                        }

                        // Liga bo'yicha filter qilish (team.league ustunidan qidiramiz, u bitta yoki bir necha liga bo'lishi mumkin)
                        const filtered = window.allTeamsData.filter(t => {
                            if (!t.league) return false;
                            return t.league.includes(selectedValue);
                        });
                        renderTeams(filtered);
                    }
                });
            });
        }

    } catch (err) {
        console.error("Jamoalarni yuklashda xatolik:", err);
        loadingEl.innerHTML = '<p style="color: var(--error);">Xatolik yuz berdi. Iltimos sahifani yangilang.</p>';
    }
});
