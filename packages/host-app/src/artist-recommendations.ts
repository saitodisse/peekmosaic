export const ARTIST_RECOMMENDATIONS_SERVICE = 'peekmosaic.artist-recommendations';

export const contexts = {
  festa: 'Festa animada',
  karaoke: 'Karaokê',
  intimista: 'Escuta intimista',
  escrachado: 'Irreverência',
  cantar_junto: 'Cantar junto',
  casamento: 'Casamento',
  acustico: 'Acústico',
  pulsacao: 'Pulsação rítmica',
  vocal: 'Destaque vocal',
  experimental: 'Experimental',
} as const;
export type Context = keyof typeof contexts;
type Model = 'jev' | 'microsoft';
export type Discovery = 'both' | 'ab' | 'ba' | 'neither' | 'unknown';
export type Ratings = Partial<Record<Model, Partial<Record<Context, number>>>>;

export const models = ['jev', 'microsoft'] as const;
export type ArtistSummary = { slug: string; name: string; ratings?: Ratings };
export type Artist = ArtistSummary & { style?: string; careerStart?: number; listeners?: number };
export type Related = Artist & { sharedListeners?: number; discovery?: Partial<Record<Model, Discovery>>;
  evidence?: Array<{ kind: string; url: string; detail?: string }> };
export type Profile = Artist & {
  biographyUrl?: string;
  musicBrainzId?: string;
  audience?: { source: string; from: string; through: string; totalListeners: number;
    minArtistListeners: number; minSharedListeners: number };
  songs?: Array<{ title: string; url?: string; ratings?: Ratings }>;
  related: Related[];
};

export interface ArtistRecommendationsProvider {
  directory(): Promise<ArtistSummary[]>;
  profile(slug: string): Promise<Profile | undefined>;
}

export const goals = Object.keys(contexts) as Context[];
export const artistRankings = ['related', 'co-listening', ...goals] as const;
export type ArtistRanking = typeof artistRankings[number];
export const percentage = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 2 });

export function normalize(value: string) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR');
}

export function isDiscoveryCandidate(artist: Related, model: Model) {
  const choice = artist.discovery?.[model];
  return choice === 'ab' || choice === 'both';
}

export function contextScore(artist: ArtistSummary, context: Context) {
  const available = models.flatMap((model) => {
    const rating = artist.ratings?.[model]?.[context];
    return typeof rating === 'number' && Number.isFinite(rating) && rating >= 0 && rating <= 3 ? [rating] : [];
  });
  return available.length ? available.reduce((sum, rating) => sum + rating, 0) / available.length : -1;
}

export function formatDay(value: string) {
  return value.split('-').reverse().join('/');
}

export function audienceRates(profile: Profile, other: Related) {
  const { audience, listeners: listenersA } = profile;
  const { listeners: listenersB, sharedListeners } = other;
  if (!audience || listenersA === undefined || listenersB === undefined || sharedListeners === undefined
    || Math.min(listenersA, listenersB) < audience.minArtistListeners || sharedListeners < audience.minSharedListeners) return;
  return {
    fromArtist: sharedListeners / listenersA,
    fromOther: sharedListeners / listenersB,
    lift: sharedListeners * audience.totalListeners / (listenersA * listenersB),
  };
}

export function findArtist(artists: ArtistSummary[], name: string) {
  const exact = artists.filter((artist) => artist.name === name);
  if (exact.length === 1) return exact[0];
  const matches = artists.filter((artist) => normalize(artist.name.trim()) === normalize(name.trim()));
  return matches.length === 1 ? matches[0] : undefined;
}

function rankWithTies<T>(entries: T[], compare: (a: T, b: T) => number) {
  entries.sort(compare);
  let position = 0;
  return entries.map((entry, index) => {
    if (index === 0 || compare(entries[index - 1], entry) !== 0) position = index + 1;
    return { ...entry, position };
  });
}

export function rankContext(artists: ArtistSummary[], context: Context) {
  const scored = artists.map((artist) => ({ artist, score: contextScore(artist, context) }))
    .filter(({ score }) => score >= 0);
  return rankWithTies(scored, (a, b) => b.score - a.score);
}

export function rankRelated(profile: Profile) {
  const candidates = profile.related.map((artist) => ({
    artist,
    votes: models.filter((model) => isDiscoveryCandidate(artist, model)).length,
    facts: artist.evidence?.length ?? 0,
    rate: audienceRates(profile, artist)?.fromArtist ?? 0,
  })).filter(({ votes, facts, rate }) => votes || facts || rate);
  return rankWithTies(candidates, (a, b) => b.votes - a.votes || b.facts - a.facts || b.rate - a.rate);
}

export function rankCoListening(profile: Profile) {
  return profile.related.flatMap((artist) => {
    const rates = audienceRates(profile, artist);
    return rates ? [{ artist, rates }] : [];
  }).sort((a, b) => b.rates.fromArtist - a.rates.fromArtist || b.rates.lift - a.rates.lift
    || a.artist.name.localeCompare(b.artist.name, 'pt-BR'));
}
