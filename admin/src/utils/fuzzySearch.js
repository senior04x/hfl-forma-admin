/**
 * Uzbek String Normalizer for Fuzzy Searching
 * Handles apostrophes (', ‘, `, ’, ʻ, ʼ), Uzbek letters (g', o', sh, ch), and typos (f/v).
 */
export const normalizeUzbekText = (str) => {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .replace(/['‘`’ʻʼ]/g, '') // Remove apostrophes and quotes
    .replace(/g['‘`’ʻʼh]/g, 'g') // Normalize g', gh -> g
    .replace(/o['‘`’ʻʼ]/g, 'o') // Normalize o' -> o
    .replace(/sh/g, 's') // Normalize sh -> s for flexible matching
    .replace(/ch/g, 'c') // Normalize ch -> c for flexible matching
    .replace(/f$/g, 'v') // Tail typo Gofurof -> Gofurov
    .trim();
};

/**
 * Calculates similarity score (0 to 100) between query and target string.
 */
export const getFuzzyMatchScore = (query, target) => {
  if (!query || !target) return 0;
  const rawQ = String(query).toLowerCase().trim();
  const rawT = String(target).toLowerCase().trim();

  // 1. Direct exact or substring match in raw text (Highest priority: 85 - 100)
  if (rawT === rawQ) return 100;
  if (rawT.startsWith(rawQ)) return 95;
  if (rawT.includes(rawQ)) return 85;

  // 2. Normalized Uzbek match (High priority: 70 - 90)
  const normQ = normalizeUzbekText(query);
  const normT = normalizeUzbekText(target);

  if (!normQ || !normT) return 0;

  if (normT === normQ) return 90;
  if (normT.startsWith(normQ)) return 80;
  if (normT.includes(normQ)) return 70;

  // 3. Word token matching
  const qWords = normQ.split(/\s+/).filter(Boolean);
  const tWords = normT.split(/\s+/).filter(Boolean);
  let matchedWords = 0;
  for (const qw of qWords) {
    if (tWords.some(tw => tw.includes(qw) || qw.includes(tw))) {
      matchedWords++;
    }
  }
  if (matchedWords > 0) {
    return 40 + Math.round((matchedWords / qWords.length) * 20);
  }

  // 4. Character overlap / Levenshtein distance for typos (e.g. Gafurov vs Gofurov)
  if (normQ.length >= 3 && normT.length >= 3) {
    let commonChars = 0;
    const tChars = normT.split('');
    for (const char of normQ) {
      const idx = tChars.indexOf(char);
      if (idx !== -1) {
        commonChars++;
        tChars.splice(idx, 1);
      }
    }
    const overlapRatio = commonChars / Math.max(normQ.length, normT.length);
    if (overlapRatio >= 0.65) {
      return Math.round(overlapRatio * 50); // 32 - 50 score
    }
  }

  return 0;
};

/**
 * Filter and sort items by maximum fuzzy match score across target fields
 */
export const searchAndRankItems = (items, searchQuery, searchFields) => {
  if (!items || !Array.isArray(items)) return [];
  if (!searchQuery || !String(searchQuery).trim()) return items;

  const scoredItems = items.map(item => {
    let maxScore = 0;
    for (const field of searchFields) {
      const val = typeof field === 'function' ? field(item) : item[field];
      if (val) {
        const score = getFuzzyMatchScore(searchQuery, String(val));
        if (score > maxScore) maxScore = score;
      }
    }
    return { item, score: maxScore };
  });

  return scoredItems
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(x => x.item);
};
