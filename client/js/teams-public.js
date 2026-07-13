document.addEventListener('DOMContentLoaded', async () => {
    const loadingEl = document.getElementById('loadingTeams');
    const teamsGrid = document.getElementById('teamsGrid');

    try {
        // Fetch approved teams from Supabase
        const { data, error } = await db
            .from('teams')
            .select('id, name, logo_url, league')
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
                    <img src="${optimizeImage(team.logo_url)}" alt="${team.name}" loading="lazy" decoding="async" onerror="this.src='https://via.placeholder.com/100x100?text=Logo'">
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
                        renderTeams(window.allTeamsData);
                    } else {
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
