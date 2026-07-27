/**
 * org-resolver.js
 * URL'dan ?org=slug parametrini yoki URL path'dan (masalan /llf/apply-team) tashkilot slug'ini aniqlaydi.
 * Global o'zgaruvchilar: window.currentOrg, window.orgLeagues, window.orgSlug
 */

(function () {
  const DEFAULT_ORG_ID = 1;
  const DEFAULT_ORG_NAME = 'Havas Futbol Ligasi';

  const RESERVED_PATHS = new Set([
    '', 'index', 'index.html', 'teams', 'teams.html', 'matches', 'matches.html',
    'standings', 'standings.html', 'apply', 'apply.html', 'apply-team', 'apply-team.html',
    'apply-individual', 'apply-individual.html', 'team-details', 'team-details.html',
    'player-details', 'player-details.html',
    'match-details', 'match-details.html', 'css', 'js', 'images', 'assets', 'api',
    'favicon.svg', 'robots.txt', 'sitemap.xml', 'manifest.json'
  ]);

  function detectOrgSlug() {
    // 1. Query parameter: ?org=slug
    const urlParams = new URLSearchParams(window.location.search);
    const queryOrg = urlParams.get('org');
    if (queryOrg && queryOrg.trim()) {
      return queryOrg.trim().toLowerCase();
    }

    // 2. Path segment: /slug/page or /slug
    const pathSegments = window.location.pathname.split('/').filter(Boolean);
    if (pathSegments.length > 0) {
      const firstSegment = pathSegments[0].toLowerCase();
      if (!RESERVED_PATHS.has(firstSegment)) {
        return firstSegment;
      }
    }

    return '';
  }

  const orgSlug = detectOrgSlug();

  window.orgSlug = orgSlug;
  window.currentOrg = null;
  window.orgLeagues = [];
  window.orgReady = false;

  window.resolveOrg = async function () {
    try {
      let org = null;

      if (orgSlug) {
        const { data, error } = await db
          .from('organizations')
          .select('*')
          .eq('slug', orgSlug)
          .maybeSingle();

        if (!error && data) {
          org = data;
        }
      }

      if (!org) {
        const { data, error } = await db
          .from('organizations')
          .select('*')
          .eq('id', DEFAULT_ORG_ID)
          .maybeSingle();

        if (!error && data) {
          org = data;
        } else {
          org = { id: DEFAULT_ORG_ID, name: DEFAULT_ORG_NAME, slug: 'hfl', logo_url: null };
        }
      }

      window.currentOrg = org;

      const { data: leagues } = await db
        .from('leagues')
        .select('id, name, logo_url, is_junior, organization_id')
        .eq('organization_id', org.id)
        .order('name');

      window.orgLeagues = leagues || [];
      window.orgReady = true;

      window.dispatchEvent(new CustomEvent('orgResolved', { detail: { org, leagues: window.orgLeagues } }));

      return { org, leagues: window.orgLeagues };
    } catch (err) {
      console.error('Org resolver error:', err);
      window.currentOrg = { id: DEFAULT_ORG_ID, name: DEFAULT_ORG_NAME, slug: 'hfl', logo_url: null };
      window.orgLeagues = [];
      window.orgReady = true;
      window.dispatchEvent(new CustomEvent('orgResolved', { detail: { org: window.currentOrg, leagues: [] } }));
      return { org: window.currentOrg, leagues: [] };
    }
  };

  /**
   * Helper: builds URL preserving org slug (either as path /slug/page or ?org=slug)
   */
  window.buildOrgUrl = function (path) {
    if (!orgSlug) return path;

    // Clean page name from path (e.g., 'apply-team.html' -> 'apply-team', 'index.html' -> '')
    let page = path.split('?')[0].replace('.html', '').replace(/^\//, '');
    const queryStr = path.includes('?') ? '?' + path.split('?')[1] : '';

    if (page === 'index' || page === '') {
      return '/' + orgSlug + queryStr;
    }
    return '/' + orgSlug + '/' + page + queryStr;
  };
})();
