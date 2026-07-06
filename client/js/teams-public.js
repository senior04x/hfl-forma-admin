document.addEventListener('DOMContentLoaded', async () => {
    const loadingEl = document.getElementById('loadingTeams');
    const teamsGrid = document.getElementById('teamsGrid');

    try {
        // Fetch approved teams from Supabase
        const { data, error } = await db
            .from('teams')
            .select('id, name, logo_url')
            .in('status', ['approved', 'partially_approved'])
            .order('created_at', { ascending: false });

        if (error) throw error;

        loadingEl.classList.add('hidden');
        teamsGrid.classList.remove('hidden');

        if (!data || data.length === 0) {
            teamsGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px;">Hali tasdiqlangan jamoalar mavjud emas.</div>';
            return;
        }

        // Temporary fallback: return original url to fix broken images
        function optimizeImage(url) {
            return url;
        }

        data.forEach(team => {
            const card = document.createElement('a');
            card.href = `team-details.html?id=${team.id}`;
            card.className = 'team-card-public';
            
            card.innerHTML = `
                <img src="${optimizeImage(team.logo_url)}" alt="${team.name}" loading="lazy" decoding="async" onerror="this.src='https://via.placeholder.com/100x100?text=Logo'">
                <h3>${team.name}</h3>
                <p>Batafsil ko'rish &rarr;</p>
            `;
            
            teamsGrid.appendChild(card);
        });

    } catch (err) {
        console.error("Jamoalarni yuklashda xatolik:", err);
        loadingEl.innerHTML = '<p style="color: var(--error);">Xatolik yuz berdi. Iltimos sahifani yangilang.</p>';
    }
});
