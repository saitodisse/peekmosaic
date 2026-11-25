const SOURCE_CATALOG_PRINCIPAL = /^(?:principal|original)$/i;
const CIFRA_CLUB = /^(?:www\.)?cifraclub\.com\.br$/;
export const LOCAL_SCRAPER_ROOT = 'https://local-upload.invalid/scraper/';

/** Derive the song identity from the source route, including for older imports. */
export function chartVersionIdentity(chart) {
  if (chart.sourceId === 'artist-portal-scraper' && chart.sourceUrl) {
    const url = URL.canParse(chart.sourceUrl) ? new URL(chart.sourceUrl) : null;
    if (!url || !CIFRA_CLUB.test(url.hostname)) return undefined;
    const [artist, song, ...version] = url.pathname.split('/').filter(Boolean);
    if (!artist || !song) return undefined;
    return {
      work: `cifraclub:${artist}/${song}`,
      version: version.length ? version.join('/') + '/' : 'principal',
      principal: version.length === 0,
    };
  }
  return chart.versionIdentity;
}

export function chartVersionRecord(chart, root = chart.sourceRoot) {
  const identity = chartVersionIdentity(chart);
  if (!identity) return undefined;
  return {
    ...identity, root, id: chart.id,
    label: identity.principal ? 'Principal'
      : chart.versionLabel && chart.versionLabel !== 'Imported version' ? chart.versionLabel
      : identity.version.replace(/(?:\.html)?\/$/i, ''),
    updatedAt: chart.collectedAt ?? chart.updatedAt ?? '',
    ...(root?.startsWith(LOCAL_SCRAPER_ROOT) ? { directlyImported: true } : {}),
  };
}

export function sourceCatalogVersion(work, version, label) {
  return { work, version, principal: SOURCE_CATALOG_PRINCIPAL.test(label?.trim() ?? '') };
}

export function preferVersion(candidate, current) {
  if (candidate.principal !== current.principal) return candidate.principal;
  if (Boolean(candidate.directlyImported) !== Boolean(current.directlyImported)) return candidate.directlyImported === true;
  return candidate.updatedAt > current.updatedAt;
}

/** Keep one catalogue entry per song and retain a usable result for partial imports. */
export function principalCharts(items, identityOf) {
  const works = new Map();
  const identities = items.map(identityOf);
  for (const [index, identity] of identities.entries()) {
    if (!identity) continue;
    const current = works.get(identity.work);
    if (!current || preferVersion(identity, current.identity)) works.set(identity.work, { index, identity });
  }
  return items.filter((_, index) => {
    const identity = identities[index];
    return !identity || works.get(identity.work).index === index;
  });
}
