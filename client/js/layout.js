// layout.js - Dynamically injects Navbar and global layout elements with permanent universal search
document.addEventListener('DOMContentLoaded', () => {
    function getUrl(path) {
        if (typeof window.buildOrgUrl === 'function') {
            return window.buildOrgUrl(path);
        }
        const urlParams = new URLSearchParams(window.location.search);
        const orgParam = urlParams.get('org');
        return orgParam ? `${path}?org=${encodeURIComponent(orgParam)}` : path;
    }

    const homeUrl = getUrl('index.html');
    const teamsUrl = getUrl('teams.html');
    const matchesUrl = getUrl('matches.html');
    const standingsUrl = getUrl('standings.html');
    const applyUrl = getUrl('apply.html');

    // Insert Navbar at the top of the body (without Havas Liga text, with permanent search bar)
    const navbarHTML = `
        <nav class="navbar">
            <a href="${homeUrl}" class="nav-logo">
                <img src="images/logo.png" alt="AMATORA" onerror="this.onerror=null; this.src='images/logo.PNG'">
            </a>

            <!-- PERMANENT NAVBAR UNIVERSAL SEARCH -->
            <div class="nav-search-container">
                <div class="nav-search-wrapper">
                    <i data-lucide="search" style="width:16px; height:16px; color:rgba(255,255,255,0.5);"></i>
                    <input type="text" id="globalNavSearchInput" placeholder="Futbolchi, Jamoa, Liga qidirish..." autocomplete="off" />
                    <button id="globalNavSearchClear" class="search-clear-btn" style="display:none;">&times;</button>
                </div>
                <div id="globalNavSearchResults" class="nav-search-results hidden"></div>
            </div>
            
            <div class="nav-links" id="navLinks">
                <a href="${homeUrl}" class="${window.location.pathname.endsWith('index.html') || window.location.pathname === '/' ? 'active' : ''}">Bosh Sahifa</a>
                <a href="${teamsUrl}" class="${window.location.pathname.includes('teams') || window.location.pathname.includes('team-details') ? 'active' : ''}">Jamoalar</a>
                <a href="${matchesUrl}" class="${window.location.pathname.includes('matches') || window.location.pathname.includes('match-details') ? 'active' : ''}">O'yinlar</a>
                <a href="${standingsUrl}" class="${window.location.pathname.includes('standings') ? 'active' : ''}">Turnir jadvali</a>
                <a href="${applyUrl}" class="nav-btn">Ro'yxatdan o'tish</a>
            </div>
            
            <button class="mobile-menu-btn" id="mobileMenuBtn">
                <i data-lucide="menu" class="icon-menu"></i>
                <i data-lucide="x" class="icon-x"></i>
            </button>
        </nav>
    `;
    
    document.body.insertAdjacentHTML('afterbegin', navbarHTML);
    
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
    
    // Mobile Menu Toggle
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const navLinks = document.getElementById('navLinks');
    
    if (mobileMenuBtn && navLinks) {
        mobileMenuBtn.addEventListener('click', () => {
            navLinks.classList.toggle('active');
            mobileMenuBtn.classList.toggle('active');
        });

        // Close menu when clicking outside
        document.addEventListener('click', (event) => {
            if (navLinks.classList.contains('active') && 
                !navLinks.contains(event.target) && 
                !mobileMenuBtn.contains(event.target)) {
                navLinks.classList.remove('active');
                mobileMenuBtn.classList.remove('active');
            }
        });
    }

    // Initialize Permanent Universal Search Engine
    initNavbarSearch();
});

// FUZZY TRANSLITERATION ENGINE
function normalizeSearchText(str) {
    if (!str) return '';
    return str
        .toLowerCase()
        .replace(/[ʻ’'‘`\']/g, '')
        .replace(/g'/g, 'g')
        .replace(/g‘/g, 'g')
        .replace(/o'/g, 'o')
        .replace(/o‘/g, 'o')
        .replace(/x/g, 'h')
        .replace(/sh/g, 's')
        .replace(/ch/g, 'c')
        .replace(/[^a-z0-9]/g, '');
}

function getMatchScore(target, query) {
    if (!target || !query) return 0;
    const nTarget = normalizeSearchText(target);
    const nQuery = normalizeSearchText(query);
    if (!nTarget || !nQuery) return 0;

    if (nTarget === nQuery) return 1000;
    if (nTarget.startsWith(nQuery)) return 800;
    if (nTarget.includes(nQuery)) return 600;

    const rawT = String(target).toLowerCase();
    const rawQ = String(query).toLowerCase().trim();
    if (rawT.includes(rawQ)) return 500;

    return 0;
}

function initNavbarSearch() {
    const input = document.getElementById('globalNavSearchInput');
    const clearBtn = document.getElementById('globalNavSearchClear');
    const resultsContainer = document.getElementById('globalNavSearchResults');

    if (!input || !resultsContainer) return;

    let debounceTimer = null;
    let cachedData = null;

    async function loadSearchData() {
        if (cachedData) return cachedData;
        if (!window.db) return { players: [], teams: [], leagues: [], orgs: [] };

        try {
            const [pRes, tRes, lRes, oRes] = await Promise.all([
                window.db.from('applications').select('*').limit(800),
                window.db.from('teams').select('*').limit(200),
                window.db.from('leagues').select('*').limit(50),
                window.db.from('organizations').select('*').limit(20)
            ]);

            cachedData = {
                players: pRes.data || [],
                teams: tRes.data || [],
                leagues: lRes.data || [],
                orgs: oRes.data || []
            };
            return cachedData;
        } catch (e) {
            console.error('Error fetching search data:', e);
            return { players: [], teams: [], leagues: [], orgs: [] };
        }
    }

    input.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        if (clearBtn) clearBtn.style.display = query ? 'block' : 'none';

        if (!query) {
            resultsContainer.classList.add('hidden');
            resultsContainer.innerHTML = '';
            return;
        }

        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => performSearch(query), 150);
    });

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            input.value = '';
            clearBtn.style.display = 'none';
            resultsContainer.classList.add('hidden');
            resultsContainer.innerHTML = '';
        });
    }

    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !resultsContainer.contains(e.target)) {
            resultsContainer.classList.add('hidden');
        }
    });

    async function performSearch(query) {
        const data = await loadSearchData();
        if (!data) return;

        // 1. Players
        const scoredPlayers = data.players
            .map(p => {
                const fullName = p.full_name || `${p.first_name || ''} ${p.last_name || ''}`.trim();
                const nameScore = getMatchScore(fullName, query);
                const phoneScore = getMatchScore(p.phone || p.phone_number || '', query);
                const posScore = getMatchScore(p.position || '', query);
                const score = Math.max(nameScore, phoneScore, posScore);
                return { item: p, score };
            })
            .filter(x => x.score > 0)
            .sort((a, b) => b.score - a.score);

        // 2. Teams
        const scoredTeams = data.teams
            .map(t => {
                const nameScore = getMatchScore(t.name, query);
                const phoneScore = getMatchScore(t.captain_phone || '', query);
                const leagueScore = getMatchScore(t.league || '', query) * 0.5;
                const score = Math.max(nameScore, phoneScore, leagueScore);
                return { item: t, score };
            })
            .filter(x => x.score > 0)
            .sort((a, b) => b.score - a.score);

        // 3. Leagues
        const scoredLeagues = data.leagues
            .map(l => {
                const score = getMatchScore(l.name, query);
                return { item: l, score };
            })
            .filter(x => x.score > 0)
            .sort((a, b) => b.score - a.score);

        // 4. Organizations
        const scoredOrgs = data.orgs
            .map(o => {
                const score = Math.max(getMatchScore(o.name, query), getMatchScore(o.slug, query));
                return { item: o, score };
            })
            .filter(x => x.score > 0)
            .sort((a, b) => b.score - a.score);

        const pMax = scoredPlayers.length > 0 ? scoredPlayers[0].score : 0;
        const tMax = scoredTeams.length > 0 ? scoredTeams[0].score : 0;
        const lMax = scoredLeagues.length > 0 ? scoredLeagues[0].score : 0;
        const oMax = scoredOrgs.length > 0 ? scoredOrgs[0].score : 0;

        const sections = [
            { key: 'teams', title: 'Jamoalar', maxScore: tMax, list: scoredTeams.slice(0, 5).map(x => x.item), icon: 'shield', color: '#60A5FA' },
            { key: 'players', title: 'Futbolchilar', maxScore: pMax, list: scoredPlayers.slice(0, 5).map(x => x.item), icon: 'users', color: '#C084FC' },
            { key: 'leagues', title: 'Ligalar', maxScore: lMax, list: scoredLeagues.slice(0, 4).map(x => x.item), icon: 'trophy', color: '#00FF66' },
            { key: 'orgs', title: 'Tashkilotlar', maxScore: oMax, list: scoredOrgs.slice(0, 3).map(x => x.item), icon: 'building-2', color: '#34D399' },
        ];

        sections.sort((a, b) => b.maxScore - a.maxScore);

        const totalResults = scoredPlayers.length + scoredTeams.length + scoredLeagues.length + scoredOrgs.length;

        if (totalResults === 0) {
            resultsContainer.innerHTML = `<div style="text-align:center; padding:20px; color:#94A3B8; font-size:13px; font-weight:600;">Ma'lumot topilmadi</div>`;
            resultsContainer.classList.remove('hidden');
            return;
        }

        let html = '';
        sections.forEach(sec => {
            if (sec.list.length === 0) return;

            html += `<div style="margin-bottom: 12px;">
                <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: ${sec.color}; letter-spacing: 0.5px; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
                    ${sec.title} (${sec.list.length})
                </div>
                <div style="display: flex; flex-direction: column; gap: 6px;">`;

            sec.list.forEach(item => {
                if (sec.key === 'teams') {
                    html += `
                        <div class="search-card-item" onclick="window.location.href='team-details.html?id=${item.id}'">
                            <div style="width:36px; height:36px; border-radius:10px; background:rgba(255,255,255,0.06); display:flex; align-items:center; justify-content:center; overflow:hidden; flex-shrink:0;">
                                ${item.logo_url ? `<img src="${item.logo_url}" style="width:100%; height:100%; object-fit:contain;">` : `<span style="color:#60A5FA; font-weight:bold;">🛡️</span>`}
                            </div>
                            <div style="flex:1; min-width:0;">
                                <div style="font-weight:800; color:#fff; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.name}</div>
                                <div style="font-size:11px; color:#94A3B8;">${item.league || 'Liga'}</div>
                            </div>
                        </div>`;
                } else if (sec.key === 'players') {
                    const displayName = item.full_name || `${item.first_name || ''} ${item.last_name || ''}`.trim();
                    html += `
                        <div class="search-card-item" onclick="window.location.href='team-details.html?id=${item.team_id || ''}'">
                            <div style="width:36px; height:36px; border-radius:10px; background:rgba(255,255,255,0.06); display:flex; align-items:center; justify-content:center; overflow:hidden; flex-shrink:0;">
                                ${item.photo_url ? `<img src="${item.photo_url}" style="width:100%; height:100%; object-fit:cover;">` : `<span style="color:#C084FC; font-weight:bold;">⚽</span>`}
                            </div>
                            <div style="flex:1; min-width:0;">
                                <div style="font-weight:800; color:#fff; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${displayName}</div>
                                <div style="font-size:11px; color:#94A3B8;">${item.position || 'Futbolchi'} ${item.phone ? '• ' + item.phone : ''}</div>
                            </div>
                        </div>`;
                } else if (sec.key === 'leagues') {
                    html += `
                        <div class="search-card-item" onclick="window.location.href='standings.html'">
                            <div style="width:36px; height:36px; border-radius:10px; background:rgba(255,255,255,0.06); display:flex; align-items:center; justify-content:center; overflow:hidden; flex-shrink:0;">
                                <span style="color:#00FF66; font-weight:bold;">🏆</span>
                            </div>
                            <div style="flex:1; min-width:0;">
                                <div style="font-weight:800; color:#fff; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.name}</div>
                            </div>
                        </div>`;
                } else if (sec.key === 'orgs') {
                    html += `
                        <div class="search-card-item" onclick="window.location.href='index.html'">
                            <div style="width:36px; height:36px; border-radius:10px; background:rgba(255,255,255,0.06); display:flex; align-items:center; justify-content:center; overflow:hidden; flex-shrink:0;">
                                <span style="color:#34D399; font-weight:bold;">🏢</span>
                            </div>
                            <div style="flex:1; min-width:0;">
                                <div style="font-weight:800; color:#fff; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.name}</div>
                                <div style="font-size:11px; color:#94A3B8;">@${item.slug}</div>
                            </div>
                        </div>`;
                }
            });

            html += `</div></div>`;
        });

        resultsContainer.innerHTML = html;
        resultsContainer.classList.remove('hidden');
    }
}
