import { useEffect, useMemo, useState } from 'react';
import { audienceRates, contexts, contextScore, formatDay, goals, isDiscoveryCandidate, models, normalize, percentage } from '../artist-recommendations';
import type { Context, Discovery, Profile, Ratings, Related } from '../artist-recommendations';

const decisions: Record<Discovery, string> = {
  both: 'Nos dois sentidos',
  ab: 'Recomenda o artista comparado',
  ba: 'Recomenda o artista da cifra para o público do artista comparado',
  neither: 'Afinidade baixa',
  unknown: 'Evidência insuficiente',
};
const factLabels: Record<string, string> = {
  gravacao_estudio: 'Gravação em estúdio',
  convite: 'Participação como convidado',
  apresentacao: 'Apresentação conjunta',
  mesmo_evento: 'Mesmo evento, apresentações distintas',
  mesma_banda: 'Integrantes da mesma banda',
  composicao: 'Composição em parceria',
  producao_arranjo: 'Produção ou arranjo',
  influencia: 'Influência declarada',
  alias_historico: 'Nome artístico anterior',
};
const count = new Intl.NumberFormat('pt-BR');
const modelLabel = { jev: 'Jev', microsoft: 'Microsoft' };

function safeLink(value: string | undefined) {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
}

function Audience({ profile, other }: { profile: Profile; other: Related }) {
  const { audience, listeners: listenersA } = profile;
  const { listeners: listenersB, sharedListeners } = other;
  if (!audience || listenersA === undefined || listenersB === undefined || sharedListeners === undefined) return null;
  const rates = audienceRates(profile, other);
  const number = (value: number) => count.format(value);
  return (
    <section aria-label="Audiência em comum">
      <h3>Audiência em comum</h3>
      <p>{audience.source}, de {formatDay(audience.from)} a {formatDay(audience.through)}.</p>
      <p>{profile.name}: {number(listenersA)} · {other.name}: {number(listenersB)} · Em comum: {number(sharedListeners)}.</p>
      {rates
        ? <p>{profile.name} → {other.name}: {percentage.format(rates.fromArtist)} · {other.name} → {profile.name}: {percentage.format(rates.fromOther)} · {number(rates.lift)}× a taxa de base.</p>
        : <p>Amostra insuficiente. A taxa requer {number(audience.minArtistListeners)} ouvintes de cada artista e {number(audience.minSharedListeners)} em comum.</p>}
    </section>
  );
}

function Comparison({ profile, other, onArtistSearch }: { profile: Profile; other: Related; onArtistSearch?: (name: string) => void }) {
  const start = [profile.careerStart, other.careerStart];
  const bothStyles = profile.style && other.style;
  return (
    <div className="host-artist-comparison">
      <h3>{profile.name} e {other.name}</h3>
      <p>{[profile.style, other.style].filter(Boolean).join(' · ')}
        {start.every((year) => year !== undefined) && <> · Início das carreiras: {start.join(' e ')}</>}</p>
      {bothStyles && <p>{profile.style === other.style ? 'Mesmo estilo no catálogo.' : 'Estilos diferentes no catálogo.'}</p>}
      <dl className="host-artist-discovery">
        {models.map((model) => (
          <div key={model}><dt>{modelLabel[model]}</dt><dd>{decisions[other.discovery?.[model] ?? 'unknown']}</dd></div>
        ))}
      </dl>
      <Audience profile={profile} other={other} />
      <h3>Vínculos com fonte</h3>
      {other.evidence?.length ? (
        <ul>{other.evidence.map((item, index) => {
          const url = safeLink(item.url);
          return url && <li key={index}><a href={url} target="_blank" rel="noreferrer">
            {factLabels[item.kind] ?? 'Fonte'}</a>{item.detail && <> · {item.detail}</>}</li>;
        })}</ul>
      ) : <p>Evidência documental insuficiente.</p>}
      {onArtistSearch && <button type="button" className="host-article-original-link" onClick={() => onArtistSearch(other.name)}>
        Ver cifras de {other.name}
      </button>}
    </div>
  );
}

function ProfileContents({ profile, onArtistSearch }: { profile: Profile; onArtistSearch?: (name: string) => void }) {
  const [name, setName] = useState('');
  const [goal, setGoal] = useState<Context | ''>('');
  const [selected, setSelected] = useState('');
  const [limit, setLimit] = useState(12);
  const candidates = useMemo(() => {
    const query = normalize(name.trim());
    return profile.related
      .filter((artist) => normalize(artist.name).includes(query))
      .sort((a, b) => {
        const byGoal = goal ? contextScore(b, goal) - contextScore(a, goal) : 0;
        return byGoal || models.filter((model) => isDiscoveryCandidate(b, model)).length
          - models.filter((model) => isDiscoveryCandidate(a, model)).length
          || (b.sharedListeners ?? 0) - (a.sharedListeners ?? 0)
          || a.name.localeCompare(b.name, 'pt-BR');
      });
  }, [goal, name, profile]);
  const other = candidates.find((artist) => artist.slug === selected);
  const biography = safeLink(profile.biographyUrl);
  return <>
    <p>{profile.name}{profile.style && <> · {profile.style}</>} · {count.format(profile.related.length)} artistas comparados.</p>
    {(biography || profile.musicBrainzId) && <p>
      {biography && <a href={biography} target="_blank" rel="noreferrer">Biografia</a>}
      {biography && profile.musicBrainzId && <> · </>}
      {profile.musicBrainzId && <a href={`https://musicbrainz.org/artist/${encodeURIComponent(profile.musicBrainzId)}`} target="_blank" rel="noreferrer">MusicBrainz</a>}
    </p>}
    {profile.ratings && <ContextRatings ratings={profile.ratings} />}
    {Boolean(profile.songs?.length) && <details className="host-artist-track-ratings">
      <summary>Notas por faixa avaliada</summary>
      {profile.songs!.map((song, index) => {
        const link = safeLink(song.url);
        return <section key={index}>
          <h3>{link ? <a href={link} target="_blank" rel="noreferrer">{song.title}</a> : song.title}</h3>
          {song.ratings && <ContextRatings ratings={song.ratings} />}
        </section>;
      })}
    </details>}
    {profile.related.length > 0 && <div className="host-artist-filters">
      <label>Buscar artista relacionado<input type="search" value={name} onChange={(event) => {
        setName(event.target.value); setLimit(12);
      }} /></label>
      <label>Ordenar por<select value={goal} onChange={(event) => {
        setGoal(event.target.value as Context | ''); setLimit(12);
      }}>
        <option value="">Descoberta musical</option>
        {goals.map((key) => <option key={key} value={key}>{contexts[key]}</option>)}
      </select></label>
    </div>}
    {other && <Comparison profile={profile} other={other} onArtistSearch={onArtistSearch} />}
    {candidates.length ? (
      <ul className="host-artist-candidates">{candidates.slice(0, limit).map((artist) => (
        <li key={artist.slug}>
          <button type="button" aria-pressed={artist.slug === selected} onClick={() => setSelected(artist.slug)}>
            <strong>{artist.name}</strong><span>{artist.style}</span>
          </button>
        </li>
      ))}</ul>
    ) : <p>{profile.related.length ? 'Nenhum artista atende à busca.' : 'Este perfil foi importado sem pares.'}</p>}
    {limit < candidates.length && <button type="button" className="host-article-original-link" onClick={() => setLimit(limit + 24)}>Mostrar mais artistas</button>}
  </>;
}

function ContextRatings({ ratings }: { ratings: Ratings }) {
  return <table className="host-artist-ratings">
    <caption>Notas editoriais · de 0 a 3</caption>
    <thead><tr><th scope="col">Contexto</th>{models.map((model) => <th key={model} scope="col">{modelLabel[model]}</th>)}</tr></thead>
    <tbody>{goals.map((key) => (
      <tr key={key}><th scope="row">{contexts[key]}</th>{models.map((model) => (
        <td key={model}>{ratings[model]?.[key] ?? '—'}</td>
      ))}</tr>
    ))}</tbody>
  </table>;
}

export function ArtistRelations({ url, fetchResource, onArtistSearch }: {
  url: string; fetchResource: typeof fetch; onArtistSearch?: (name: string) => void;
}) {
  const [profile, setProfile] = useState<Profile>();
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!open || profile) return;
    let active = true;
    void fetchResource(url).then(async (response) => {
      if (!response.ok) throw new Error('Artist profile unavailable');
      const value = await response.json();
      if (!value || typeof value.name !== 'string' || !Array.isArray(value.related)
        || !value.related.every((artist: unknown) => artist && typeof artist === 'object'
          && 'slug' in artist && typeof artist.slug === 'string' && 'name' in artist && typeof artist.name === 'string')) {
        throw new Error('Invalid artist profile');
      }
      if (active) setProfile(value);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [attempt, fetchResource, open, profile, url]);
  return (
    <details className="host-artist-relations" onToggle={(event) => {
      setOpen(event.currentTarget.open);
      if (event.currentTarget.open) setFailed(false);
    }}>
      <summary>Relações do artista</summary>
      {open && (profile ? <ProfileContents profile={profile} onArtistSearch={onArtistSearch} />
        : failed ? <p role="alert">Não foi possível abrir o perfil. <button type="button" onClick={() => {
          setFailed(false); setAttempt((value) => value + 1);
        }}>Tentar novamente</button></p>
          : <p role="status">Carregando relações do artista…</p>)}
    </details>
  );
}
