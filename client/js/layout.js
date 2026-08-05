// layout.js - Dynamically injects Navbar and global layout elements with full-screen universal search
document.addEventListener('DOMContentLoaded', () => {
    function getUrl(path) {
        if (typeof window.buildOrgUrl === 'function') {
            return window.buildOrgUrl(path);
        }
        const urlParams = new URLSearchParams(window.location.search);
        const orgParam = urlParams.get('org');
        if (!orgParam) return path;
        const separator = path.includes('?') ? '&' : '?';
        return `${path}${separator}org=${encodeURIComponent(orgParam)}`;
    }
    window.getUrl = getUrl;

    const homeUrl = getUrl('index.html');
    const teamsUrl = getUrl('teams.html');
    const matchesUrl = getUrl('matches.html');
    const standingsUrl = getUrl('standings.html');
    const applyUrl = getUrl('apply.html');

    // Insert Navbar at the top of the body (without Havas Liga text)
    const navbarHTML = `
        <nav class="navbar">
            <a href="${homeUrl}" class="nav-logo">
                <img src="images/logo.png" alt="AMATORA" onerror="this.onerror=null; this.src='images/logo.PNG'">
            </a>

            <!-- PERMANENT NAVBAR UNIVERSAL SEARCH INPUT -->
            <div class="nav-search-container">
                <div class="nav-search-wrapper">
                    <i data-lucide="search" style="width:16px; height:16px; color:rgba(255,255,255,0.5);"></i>
                    <input type="text" id="globalNavSearchInput" placeholder="Futbolchi, Jamoa, Liga qidirish..." autocomplete="off" />
                    <button id="globalNavSearchClear" class="search-clear-btn" style="display:none;">&times;</button>
                </div>
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

        <!-- FULL-SCREEN MAIN PAGE SEARCH RESULTS CONTAINER BELOW NAVBAR -->
        <div id="global-screen-search-results" class="global-screen-search-view hidden">
            <div id="search-results-content-holder" style="display:flex; flex-direction:column; gap:32px;"></div>
        </div>
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

        document.addEventListener('click', (event) => {
            if (navLinks.classList.contains('active') && 
                !navLinks.contains(event.target) && 
                !mobileMenuBtn.contains(event.target)) {
                navLinks.classList.remove('active');
                mobileMenuBtn.classList.remove('active');
            }
        });
    }

    // Initialize Permanent Full-Screen Search Engine
    initNavbarSearch();

    // Check & Enforce Registration Status (Open / Closed)
    async function enforceRegistrationStatus() {
        let isOpen = true;
        const orgId = window.currentOrg?.id || 1;
        try {
            const savedLocal = localStorage.getItem(`hfl_reg_open_${orgId}`) || localStorage.getItem('hfl_reg_open_1') || localStorage.getItem('hfl_reg_open');
            if (savedLocal === 'false') isOpen = false;
            if (savedLocal === 'true') isOpen = true;
        } catch (e) {}

        try {
            const dbClient = getSupabaseClient();
            if (dbClient) {
                const keysToSearch = [
                    `REGISTRATION_OPEN_${orgId}`,
                    `REGISTRATION_OPEN_1`,
                    `REGISTRATION_OPEN`
                ];

                const { data: spRows } = await dbClient
                    .from('sponsors')
                    .select('logo_url, name')
                    .in('name', keysToSearch);

                if (spRows && spRows.length > 0) {
                    const closedRow = spRows.find(r => r.logo_url === 'false');
                    if (closedRow) {
                        isOpen = false;
                    } else {
                        const openRow = spRows.find(r => r.logo_url === 'true');
                        if (openRow) isOpen = true;
                    }
                    try { localStorage.setItem(`hfl_reg_open_${orgId}`, isOpen ? 'true' : 'false'); } catch (e) {}
                }
            }
        } catch (e) {
            console.warn('Registration status check notice:', e);
        }

        if (!isOpen) {
            // 1. Inject global CSS rule into <head> so browser engine automatically hides any apply link
            if (!document.getElementById('reg-closed-css')) {
                const styleEl = document.createElement('style');
                styleEl.id = 'reg-closed-css';
                styleEl.innerHTML = `
                  a[href*="apply"], .nav-btn[href*="apply"], .nav-card[href*="apply"] {
                    display: none !important;
                    visibility: hidden !important;
                    opacity: 0 !important;
                    pointer-events: none !important;
                  }
                `;
                (document.head || document.documentElement).appendChild(styleEl);
            }

            // 2. Direct DOM element hiding
            const applyLinks = document.querySelectorAll('a[href*="apply"]');
            applyLinks.forEach(el => {
                el.style.setProperty('display', 'none', 'important');
            });

            // 3. Block direct URL access to /apply, /apply-team, /apply-individual
            const pathname = window.location.pathname.toLowerCase();
            if (pathname.includes('apply')) {
                document.body.innerHTML = `
                  <div style="min-height:100vh; background:#0b0f19; display:flex; align-items:center; justify-content:center; padding:20px; font-family:'Outfit','Inter',sans-serif; color:#fff; text-align:center;">
                    <div style="max-width:480px; width:100%; background:rgba(255,255,255,0.04); border:1px solid rgba(255,59,48,0.3); border-radius:24px; padding:40px 24px; box-shadow:0 20px 50px rgba(0,0,0,0.6);">
                      <div style="width:70px; height:70px; border-radius:50%; background:rgba(255,59,48,0.15); display:flex; align-items:center; justify-content:center; margin:0 auto 20px auto; font-size:32px;">
                        🚫
                      </div>
                      <h2 style="font-size:24px; font-weight:800; margin:0 0 10px 0; color:#ff4d4d;">Ro'yxatdan o'tish vaqtincha yopilgan</h2>
                      <p style="font-size:14px; color:#94a3b8; line-height:1.6; margin:0 0 28px 0;">
                        Hozirda yangi arizalar qabul qilish jarayoni to'xtatilgan. Qo'shimcha savollar bo'lsa, havaskorlar ligasi ma'muriyati bilan bog'laning.
                      </p>
                      <a href="${homeUrl}" style="display:inline-block; background:linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color:#fff; text-decoration:none; font-weight:700; padding:14px 28px; border-radius:14px; box-shadow:0 10px 25px rgba(59,130,246,0.3); font-size:15px;">
                        🏠 Bosh sahifaga qaytish
                      </a>
                    </div>
                  </div>
                `;
            }
        } else {
            const existingStyle = document.getElementById('reg-closed-css');
            if (existingStyle) existingStyle.remove();
        }
    }

    // Run enforcement immediately and on org resolution
    enforceRegistrationStatus();
    if (typeof window.resolveOrg === 'function') {
        window.resolveOrg().then(enforceRegistrationStatus).catch(enforceRegistrationStatus);
    } else {
        setTimeout(enforceRegistrationStatus, 200);
    }
});

// SAFE SUPABASE CLIENT RETRIEVAL
function getSupabaseClient() {
    if (window.db) return window.db;
    if (window.supabase && typeof window.supabase.createClient === 'function') {
        const url = 'https://xzzyhfyazwohdqqbjiiy.supabase.co';
        const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6enloZnlhendvaGRxcWJqaWl5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxMDM1NTEsImV4cCI6MjA5ODY3OTU1MX0.8KPZxd060ps2pc3oeDzBA9UG3fdHj_lPjnLhq0Q5eaM';
        window.db = window.supabase.createClient(url, key);
        return window.db;
    }
    return null;
}

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
    const screenResultsView = document.getElementById('global-screen-search-results');
    const contentHolder = document.getElementById('search-results-content-holder');

    if (!input || !screenResultsView || !contentHolder) return;

    let debounceTimer = null;
    let cachedData = null;

    async function loadSearchData() {
        if (cachedData) return cachedData;
        const supabase = getSupabaseClient();
        if (!supabase) return { players: [], teams: [], leagues: [] };

        try {
            const [pRes, tRes, lRes] = await Promise.all([
                supabase.from('applications').select('*').limit(1000),
                supabase.from('teams').select('*').limit(300),
                supabase.from('leagues').select('*').limit(100)
            ]);

            cachedData = {
                players: pRes.data || [],
                teams: tRes.data || [],
                leagues: lRes.data || []
            };
            return cachedData;
        } catch (e) {
            console.error('Error fetching search data:', e);
            return { players: [], teams: [], leagues: [] };
        }
    }

    function toggleMainContent(hide) {
        const siteContainer = document.querySelector('.site-container');
        const mainElements = document.querySelectorAll('main, section, .hero-section, #welcome-screen');
        if (siteContainer) siteContainer.style.display = hide ? 'none' : '';
        mainElements.forEach(el => {
            if (el.id !== 'global-screen-search-results') {
                el.style.display = hide ? 'none' : '';
            }
        });
    }

    function clearSearch() {
        input.value = '';
        if (clearBtn) clearBtn.style.display = 'none';
        screenResultsView.classList.add('hidden');
        contentHolder.innerHTML = '';
        toggleMainContent(false);
    }



    if (clearBtn) {
        clearBtn.addEventListener('click', clearSearch);
    }

    input.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        if (clearBtn) clearBtn.style.display = query ? 'block' : 'none';

        if (!query) {
            clearSearch();
            return;
        }

        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => performSearch(query), 120);
    });

    async function performSearch(query) {
        screenResultsView.classList.remove('hidden');
        toggleMainContent(true);

        // Skeleton loading cards
        const skeletonHTML = `
        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:18px;">
            ${Array(6).fill('').map(() => `
            <div class="screen-search-card" style="background:rgba(18,20,29,0.75); border:1px solid rgba(255,255,255,0.1); border-radius:24px; padding:20px;">
                <div style="display:flex; align-items:center; gap:14px; margin-bottom:14px;">
                    <div class="skeleton-circle" style="width:56px; height:56px; border-radius:16px; flex-shrink:0;"></div>
                    <div style="flex:1;">
                        <div class="skeleton-line" style="width:70%; height:16px; margin-bottom:8px;"></div>
                        <div class="skeleton-line" style="width:50%; height:12px;"></div>
                    </div>
                </div>
                <div style="padding-top:12px; border-top:1px solid rgba(255,255,255,0.06); display:flex; gap:8px;">
                    <div class="skeleton-line" style="width:70px; height:20px; border-radius:10px;"></div>
                    <div class="skeleton-line" style="width:90px; height:20px; border-radius:10px;"></div>
                </div>
            </div>`).join('')}
        </div>`;
        contentHolder.innerHTML = skeletonHTML;

        const data = await loadSearchData();
        if (!data) return;

        const teamMap = new Map();
        data.teams.forEach(t => teamMap.set(String(t.id), t));

        // 1. Players
        const scoredPlayers = data.players
            .map(p => {
                const team = p.team_id ? teamMap.get(String(p.team_id)) : null;
                const fullName = p.full_name || `${p.first_name || ''} ${p.last_name || ''}`.trim();
                const nameScore = getMatchScore(fullName, query);
                
                const phone1 = p.phone || '';
                const phone2 = p.phone_number || '';
                const phoneScore = Math.max(getMatchScore(phone1, query), getMatchScore(phone2, query));

                const posScore = getMatchScore(p.position || '', query);
                const numScore = String(p.player_number || p.number || '') === query.trim() ? 700 : 0;
                const teamScore = team ? getMatchScore(team.name, query) * 0.4 : 0;

                // Passport matching (series + number)
                const pSeries = p.passport_series || '';
                const pNum = p.passport_number || '';
                const passportCombo1 = `${pSeries}${pNum}`;
                const passportCombo2 = `${pSeries} ${pNum}`;
                const passportScore1 = getMatchScore(passportCombo1, query);
                const passportScore2 = getMatchScore(passportCombo2, query);
                const passportScore3 = pNum ? getMatchScore(pNum, query) : 0;
                const passportScore = Math.max(passportScore1, passportScore2, passportScore3);

                const score = Math.max(nameScore, phoneScore, posScore, numScore, teamScore, passportScore);
                return { item: p, team, score };
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
                
                const pCount = data.players.filter(p => String(p.team_id) === String(t.id)).length;
                return { item: t, pCount, score };
            })
            .filter(x => x.score > 0)
            .sort((a, b) => b.score - a.score);

        // 3. Leagues
        const scoredLeagues = data.leagues
            .map(l => {
                const score = getMatchScore(l.name, query);
                const tCount = data.teams.filter(t => (t.league_id && String(t.league_id) === String(l.id)) || (t.league && t.league.toLowerCase().includes(l.name.toLowerCase()))).length;
                return { item: l, tCount, score };
            })
            .filter(x => x.score > 0)
            .sort((a, b) => b.score - a.score);

        const pMax = scoredPlayers.length > 0 ? scoredPlayers[0].score : 0;
        const tMax = scoredTeams.length > 0 ? scoredTeams[0].score : 0;
        const lMax = scoredLeagues.length > 0 ? scoredLeagues[0].score : 0;

        const sections = [
            { key: 'teams', title: 'Jamoalar', maxScore: tMax, list: scoredTeams, color: '#60A5FA', icon: 'shield' },
            { key: 'players', title: 'Futbolchilar', maxScore: pMax, list: scoredPlayers, color: '#C084FC', icon: 'users' },
            { key: 'leagues', title: 'Ligalar', maxScore: lMax, list: scoredLeagues, color: '#00FF66', icon: 'trophy' }
        ];

        sections.sort((a, b) => b.maxScore - a.maxScore);

        const totalResults = scoredPlayers.length + scoredTeams.length + scoredLeagues.length;

        if (totalResults === 0) {
            contentHolder.innerHTML = `<div style="text-align:center; padding:60px; color:#94A3B8; font-size:15px; font-weight:700;">Ushbu so'rov bo'yicha hech qanday ma'lumot topilmadi</div>`;
            return;
        }

        let html = '';
        sections.forEach(sec => {
            if (sec.list.length === 0) return;

            if (sec.key === 'teams') {
                html += `
                <div>
                    <h3 style="font-family:'Outfit',sans-serif; font-size:16px; font-weight:800; text-transform:uppercase; color:${sec.color}; margin-bottom:16px; display:flex; align-items:center; gap:8px;">
                        <i data-lucide="shield" style="width:18px; height:18px; color:${sec.color};"></i> Jamoalar (${sec.list.length})
                    </h3>
                    <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:18px;">
                        ${sec.list.map(x => {
                            const team = x.item;
                            const teamUrl = window.getUrl ? window.getUrl(`team-details.html?id=${team.id}`) : `team-details.html?id=${team.id}`;
                            return `
                            <div class="screen-search-card" onclick="window.location.href='${teamUrl}'" style="background:rgba(18,20,29,0.75); backdrop-filter:blur(15px); border:1px solid rgba(255,255,255,0.12); border-radius:24px; padding:20px; cursor:pointer; transition:all 0.3s; display:flex; flex-direction:column; justify-content:space-between; gap:16px;">
                                <div style="display:flex; align-items:center; gap:16px;">
                                    <div style="width:60px; height:60px; border-radius:18px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); overflow:hidden; flex-shrink:0; display:flex; align-items:center; justify-content:center; padding:6px;">
                                        ${team.logo_url ? `<img src="${team.logo_url}" style="width:100%; height:100%; object-fit:contain;">` : `<i data-lucide="shield" style="width:28px; height:28px; color:#60A5FA;"></i>`}
                                    </div>
                                    <div style="flex:1; min-width:0;">
                                        <div style="font-family:'Outfit',sans-serif; font-size:17px; font-weight:800; font-style:italic; text-transform:uppercase; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${team.name}</div>
                                        ${team.captain_phone ? `<div style="font-size:11px; font-family:monospace; color:#94A3B8; margin-top:2px;"><i data-lucide="phone" style="width:10px; height:10px; display:inline;"></i> ${team.captain_phone}</div>` : ''}
                                    </div>
                                </div>
                                <div style="padding-top:12px; border-top:1px solid rgba(255,255,255,0.08); display:flex; gap:8px; font-size:10px; font-weight:800;">
                                    <span style="background:rgba(0,255,102,0.1); border:1px solid rgba(0,255,102,0.2); color:#00FF66; padding:4px 10px; border-radius:10px; display:flex; align-items:center; gap:4px;"><i data-lucide="trophy" style="width:10px; height:10px;"></i> ${team.league || 'Liga'}</span>
                                    <span style="background:rgba(192,132,252,0.1); border:1px solid rgba(192,132,252,0.2); color:#C084FC; padding:4px 10px; border-radius:10px; display:flex; align-items:center; gap:4px;"><i data-lucide="users" style="width:10px; height:10px;"></i> ${x.pCount} Futbolchi</span>
                                </div>
                            </div>`;
                        }).join('')}
                    </div>
                </div>`;
            }

            if (sec.key === 'players') {
                html += `
                <div>
                    <h3 style="font-family:'Outfit',sans-serif; font-size:16px; font-weight:800; text-transform:uppercase; color:${sec.color}; margin-bottom:16px; display:flex; align-items:center; gap:8px;">
                        <i data-lucide="dribbble" style="width:18px; height:18px; color:${sec.color};"></i> Futbolchilar (${sec.list.length})
                    </h3>
                    <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:18px;">
                        ${sec.list.map(x => {
                            const p = x.item;
                            const team = x.team;
                            const displayName = p.full_name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Futbolchi';
                            const displayNum = p.player_number || p.number;
                            const targetUrl = window.getUrl ? window.getUrl(`player-details.html?id=${p.id}`) : `player-details.html?id=${p.id}`;

                            return `
                            <div class="screen-search-card" onclick="window.location.href='${targetUrl}'" style="background:rgba(18,20,29,0.75); backdrop-filter:blur(15px); border:1px solid rgba(255,255,255,0.12); border-radius:24px; padding:20px; cursor:pointer; transition:all 0.3s; display:flex; flex-direction:column; justify-content:space-between; gap:14px;">
                                <div style="display:flex; align-items:center; gap:14px;">
                                    <div style="width:56px; height:56px; border-radius:16px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); overflow:hidden; flex-shrink:0; display:flex; align-items:center; justify-content:center;">
                                        ${p.photo_url ? `<img src="${p.photo_url}" style="width:100%; height:100%; object-fit:cover;">` : `<i data-lucide="user" style="width:24px; height:24px; color:#C084FC;"></i>`}
                                    </div>
                                    <div style="flex:1; min-width:0;">
                                        <div style="font-family:'Outfit',sans-serif; font-size:16px; font-weight:800; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${displayName}</div>
                                        <div style="font-size:12px; font-weight:700; color:#94A3B8; margin-top:2px;">${p.position || 'Futbolchi'} ${displayNum ? '#' + displayNum : ''}</div>
                                        ${p.phone ? `<div style="font-size:11px; font-family:monospace; color:#00FF66; margin-top:2px;">${p.phone}</div>` : ''}
                                    </div>
                                </div>
                                <div style="padding-top:10px; border-top:1px solid rgba(255,255,255,0.08); display:flex; flex-wrap:wrap; gap:6px; font-size:10px; font-weight:800;">
                                    <span style="background:rgba(0,255,102,0.1); border:1px solid rgba(0,255,102,0.2); color:#00FF66; padding:3px 8px; border-radius:8px; display:flex; align-items:center; gap:4px;"><i data-lucide="trophy" style="width:10px; height:10px;"></i> ${team?.league || 'Liga'}</span>
                                    <span style="background:rgba(96,165,250,0.1); border:1px solid rgba(96,165,250,0.2); color:#60A5FA; padding:3px 8px; border-radius:8px; display:flex; align-items:center; gap:4px;"><i data-lucide="shield" style="width:10px; height:10px;"></i> ${team?.name || 'Jamoa mavjud emas'}</span>
                                </div>
                            </div>`;
                        }).join('')}
                    </div>
                </div>`;
            }

            if (sec.key === 'leagues') {
                html += `
                <div>
                    <h3 style="font-family:'Outfit',sans-serif; font-size:16px; font-weight:800; text-transform:uppercase; color:${sec.color}; margin-bottom:16px; display:flex; align-items:center; gap:8px;">
                        <i data-lucide="trophy" style="width:18px; height:18px; color:${sec.color};"></i> Ligalar (${sec.list.length})
                    </h3>
                    <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:18px;">
                        ${sec.list.map(x => {
                            const l = x.item;
                            const leagueUrl = window.getUrl ? window.getUrl('standings.html') : 'standings.html';
                            return `
                            <div class="screen-search-card" onclick="window.location.href='${leagueUrl}'" style="background:rgba(18,20,29,0.75); backdrop-filter:blur(15px); border:1px solid rgba(255,255,255,0.12); border-radius:20px; padding:18px; cursor:pointer; transition:all 0.3s; display:flex; align-items:center; gap:14px;">
                                <div style="width:48px; height:48px; border-radius:14px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); display:flex; align-items:center; justify-content:center;">
                                    <i data-lucide="trophy" style="width:24px; height:24px; color:#00FF66;"></i>
                                </div>
                                <div>
                                    <div style="font-family:'Outfit',sans-serif; font-size:16px; font-weight:800; color:#fff;">${l.name}</div>
                                    <div style="font-size:12px; color:#94A3B8; font-weight:600;">${x.tCount} Jamoalar</div>
                                </div>
                            </div>`;
                        }).join('')}
                    </div>
                </div>`;
            }
        });

        contentHolder.innerHTML = html;
        // Re-render Lucide icons for dynamically injected content
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
}
