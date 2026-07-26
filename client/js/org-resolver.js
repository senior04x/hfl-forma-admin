/**
 * org-resolver.js
 * URL'dan ?org=slug parametrini o'qib, Supabase'dan tashkilotni aniqlaydi.
 * Global o'zgaruvchilar: window.currentOrg, window.orgLeagues, window.orgSlug
 * 
 * Barcha apply sahifalari bu scriptni supabase.js dan keyin yuklaydi.
 */

(function () {
  // Defaults
  const DEFAULT_ORG_ID = 1;
  const DEFAULT_ORG_NAME = 'Havas Futbol Ligasi';

  // Parse ?org= from URL
  const urlParams = new URLSearchParams(window.location.search);
  const orgSlug = urlParams.get('org') || '';

  window.orgSlug = orgSlug;
  window.currentOrg = null;
  window.orgLeagues = [];
  window.orgReady = false;

  /**
   * Resolves the organization from slug.
   * Returns a promise that resolves when org data is ready.
   */
  window.resolveOrg = async function () {
    try {
      let org = null;

      if (orgSlug) {
        // Fetch org by slug
        const { data, error } = await db
          .from('organizations')
          .select('*')
          .eq('slug', orgSlug)
          .maybeSingle();

        if (!error && data) {
          org = data;
        }
      }

      // Fallback to default org
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

      // Fetch leagues for this organization
      const { data: leagues } = await db
        .from('leagues')
        .select('id, name, logo_url, is_junior, organization_id')
        .eq('organization_id', org.id)
        .order('name');

      window.orgLeagues = leagues || [];
      window.orgReady = true;

      // Dispatch custom event so pages can react
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
   * Helper: builds URL preserving ?org= parameter
   */
  window.buildOrgUrl = function (path) {
    if (orgSlug) {
      const separator = path.includes('?') ? '&' : '?';
      return path + separator + 'org=' + encodeURIComponent(orgSlug);
    }
    return path;
  };
})();
