import { useEffect, useMemo, useRef, useState } from 'react';
import { contexts, contextScore, findArtist, formatDay, goals, models, normalize, percentage, rankCoListening, rankContext, rankRelated } from '../artist-recommendations';
import type { ArtistRanking, ArtistRecommendationsProvider, ArtistSummary, Profile } from '../artist-recommendations';

const scoreFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const shortListSize = 5;

interface ArtistRecommendationsProps {
  name: string;
  provider?: ArtistRecommendationsProvider;
  revision: number;
  ranking: ArtistRanking | null;
  query: string;
  onRankingChange: (ranking: ArtistRanking | null) => void;
  onArtistSearch: (name: string) => void;
}

export function ArtistRecommendations({ name, provider, revision, ranking, query, onRankingChange, onArtistSearch }: ArtistRecommendationsProps) {
  const [data, setData] = useState<{ directory: ArtistSummary[]; profile?: Profile }>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const rankingHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (ranking) rankingHeading.current?.focus(); }, [ranking]);

  useEffect(() => {
    let active = true;
    setData(undefined);
    setFailed(false);
    if (!provider) return;
    void (async () => {
      const directory = await provider.directory();
      const artist = findArtist(directory, name);
      const profile = artist ? await provider.profile(artist.slug) : undefined;
      if (active) setData({ directory, profile });
    })().catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [attempt, name, provider, revision]);

  const profile = data?.profile;
  const related = useMemo(() => profile ? rankRelated(profile) : [], [profile]);
  const coListening = useMemo(() => profile ? rankCoListening(profile) : [], [profile]);
  const contextRanking = useMemo(() => ranking && ranking !== 'related' && ranking !== 'co-listening' && data
    ? rankContext(data.directory, ranking) : [], [ranking, data]);
  const categories = goals.filter((goal) => data?.directory.some((artist) => contextScore(artist, goal) >= 0))
    .map((goal) => ({ goal, score: profile ? contextScore(profile, goal) : -1 }))
    .sort((a, b) => b.score - a.score);
  const relatedTitle = 'Artistas mais relacionados';
  const referenceArtist = profile?.name ?? name;
  const coListeningTitle = `Quem escuta ${referenceArtist} também escuta`;
  const title = ranking === 'related' ? `${relatedTitle} · ${referenceArtist}` : ranking === 'co-listening' ? coListeningTitle : ranking && contexts[ranking];
  const rankedArtists: { artist: ArtistSummary; detail: string; style?: string; position: number }[] = ranking === 'related'
    ? related.map(({ artist, votes, position }) => ({ artist, detail: `${votes} de ${models.length} modelos`, style: artist.style, position }))
    : ranking === 'co-listening'
      ? coListening.map(({ artist, rates }, index) => ({ artist, detail: percentage.format(rates.fromArtist), position: index + 1 }))
      : contextRanking.map(({ artist, score, position }) => ({ artist, detail: `${scoreFormat.format(score)}/3`, position }));
  const words = normalize(query.trim()).split(/\s+/).filter(Boolean);
  const visibleRanks = rankedArtists.filter(({ artist }) => words.every((word) => normalize(artist.name).includes(word)));
  const toggleRanking = (next: ArtistRanking) => onRankingChange(ranking === next ? null : next);
  const artistButton = (artist: ArtistSummary) => artist.slug === profile?.slug
    ? <strong aria-current="true">{artist.name}</strong>
    : <button type="button" className="host-recommendation-artist" onClick={() => onArtistSearch(artist.name)}>{artist.name}</button>;

  return (<>
    {ranking && <section id="artist-ranking" className="host-search-results host-artist-ranking" aria-labelledby="artist-ranking-title">
      <div className="host-artist-ranking-header">
        <h2 id="artist-ranking-title" ref={rankingHeading} tabIndex={-1}>{title}</h2>
        <button type="button" className="host-ranking-toggle" onClick={() => onRankingChange(null)}>Remover filtro</button>
      </div>
      {!provider && <p>Ative o catálogo de cifras para carregar o ranking.</p>}
      {provider && !data && <p role="status">{failed ? 'Ranking indisponível.' : 'Carregando ranking…'}</p>}
      {data && <p role="status">
        {query.trim() ? `${visibleRanks.length} de ${rankedArtists.length}` : rankedArtists.length} {rankedArtists.length === 1 ? 'artista no ranking' : 'artistas no ranking'}
        {query.trim() && ` para “${query.trim()}”`}.
      </p>}
      {data && !visibleRanks.length && <p>{query.trim() ? 'Nenhum artista corresponde à busca.' : 'O arquivo importado não tem dados para este ranking.'}</p>}
      {ranking === 'related' && visibleRanks.length > 0 && <p>
        Em ordem de concordância dos modelos sobre recomendações a partir de {referenceArtist}. Vínculos documentados e coescuta servem como desempate.
      </p>}
      {visibleRanks.length > 0 && <ol className="host-recommendation-list host-recommendation-ranking">
        {visibleRanks.map(({ artist, detail, style, position }) => (
          <li key={artist.slug} value={position}>
            {artistButton(artist)}{style && <small className="host-rank-artist-style">{style}</small>}<span>{detail}</span>
          </li>
        ))}
      </ol>}
    </section>}
    {provider &&
    <aside className="host-artist-sidebar" aria-label={`Recomendações para ${name}`}>
      <h2>Recomendações</h2>
      {failed && <p role="alert">Não foi possível carregar as recomendações.{' '}
        <button type="button" onClick={() => { setFailed(false); setAttempt((value) => value + 1); }}>Tentar novamente</button>
      </p>}
      {!failed && !data && <p role="status">Carregando recomendações…</p>}
      {data && data.directory.length === 0 && <p>Importe o arquivo de relações de artistas nas configurações do catálogo para ver as recomendações.</p>}
      {data && data.directory.length > 0 && !profile && <p>O arquivo importado não tem um perfil para {name}.</p>}
      {profile && <>
        <section aria-label="Artistas mais relacionados">
          <h3><button type="button" className="host-ranking-toggle" aria-pressed={ranking === 'related'} onClick={() => toggleRanking('related')}>{relatedTitle}</button></h3>
          {related.length ? <>
            <p>Ordenados pelos votos de recomendação, vínculos com fonte e coescuta.</p>
            <ul className="host-recommendation-list">{related.slice(0, shortListSize).map(({ artist }) => (
              <li key={artist.slug}>{artistButton(artist)}{artist.style && <small>{artist.style}</small>}</li>
            ))}</ul>
          </> : <p>Os dados importados não indicam artistas relacionados.</p>}
        </section>
        <section aria-label="Coescuta">
          <h3><button type="button" className="host-ranking-toggle" aria-pressed={ranking === 'co-listening'} onClick={() => toggleRanking('co-listening')}>{coListeningTitle}</button></h3>
          {coListening.length && profile.audience ? <>
            <p>Percentual dos ouvintes de {profile.name} no {profile.audience.source}, de {formatDay(profile.audience.from)} a {formatDay(profile.audience.through)}.</p>
            <ul className="host-recommendation-list">{coListening.slice(0, shortListSize).map(({ artist, rates }) => (
              <li key={artist.slug}>{artistButton(artist)}<span>{percentage.format(rates.fromArtist)}</span></li>
            ))}</ul>
          </> : <p>Amostra insuficiente para mostrar coescuta.</p>}
        </section>
      </>}
      {categories.length > 0 && <section aria-label="Categorias e rankings">
        <h3>Categorias</h3>
        <div className="host-recommendation-categories">{categories.map(({ goal, score }) => (
          <button type="button" key={goal} aria-pressed={ranking === goal} onClick={() => toggleRanking(goal)}>
            {contexts[goal]}{score >= 0 && <>{' '}<span>{scoreFormat.format(score)}/3</span></>}
          </button>
        ))}</div>
      </section>}
    </aside>}
  </>);
}
