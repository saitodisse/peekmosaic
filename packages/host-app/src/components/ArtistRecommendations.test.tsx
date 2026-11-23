// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { ArtistRanking, ArtistRecommendationsProvider, Profile } from '../artist-recommendations';
import { ArtistRecommendations } from './ArtistRecommendations';

it('keeps related artists visible while ranking the full directory and filters co-listening by sample size', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div');
  const root = createRoot(container);
  const profile: Profile = {
    slug: 'legiao-urbana', name: 'Legião Urbana', listeners: 100, ratings: { jev: { festa: 1, karaoke: 3 } },
    audience: { source: 'ListenBrainz', from: '2026-11-15', through: '2026-11-22',
      totalListeners: 500, minArtistListeners: 30, minSharedListeners: 5 },
    related: [
      { slug: 'zeca', name: 'Zeca Baleiro', discovery: { jev: 'ba', microsoft: 'ab' } },
      { slug: 'titas', name: 'Titãs', listeners: 50, sharedListeners: 20, discovery: { jev: 'ab', microsoft: 'both' } },
      { slug: 'paralamas', name: 'Os Paralamas do Sucesso', listeners: 60, sharedListeners: 4, discovery: { jev: 'ab' } },
    ],
  };
  const provider: ArtistRecommendationsProvider = {
    directory: async () => [
      profile,
      { slug: 'titas', name: 'Titãs', ratings: { jev: { festa: 3 }, microsoft: { festa: 1 } } },
      { slug: 'ivete', name: 'Ivete Sangalo', ratings: { jev: { festa: 3, casamento: 3 }, microsoft: { festa: 3 } } },
      { slug: 'unknown', name: 'Sem avaliação' },
      ...Array.from({ length: 12 }, (_, index) => ({
        slug: `artista-${index}`, name: `Artista ${index}`, ratings: { jev: { festa: 0 } },
      })),
    ],
    profile: vi.fn(async () => profile),
  };
  const openArtist = vi.fn();
  function TestView({ query = '' }: { query?: string }) {
    const [ranking, setRanking] = useState<ArtistRanking | null>(null);
    return <ArtistRecommendations name="Legiao Urbana" provider={provider} revision={0} onArtistSearch={openArtist}
      ranking={ranking} query={query} onRankingChange={setRanking} />;
  }
  try {
    await act(async () => root.render(<TestView />));
    expect(provider.profile).toHaveBeenCalledWith('legiao-urbana');
    const related = container.querySelector('[aria-label="Artistas mais relacionados"]')!;
    const audience = container.querySelector('[aria-label="Coescuta"]')!;
    expect(related.querySelector('li')?.textContent).toContain('Titãs');
    expect(audience.textContent).toContain('20%');
    expect(audience.textContent).not.toContain('Paralamas');

    const categoryButtons = [...container.querySelectorAll<HTMLButtonElement>('.host-recommendation-categories button')];
    expect(categoryButtons.map((button) => button.textContent)).toEqual(['Karaokê 3/3', 'Festa animada 1/3', 'Casamento']);
    const category = categoryButtons[1];
    await act(async () => category.click());
    expect(category.getAttribute('aria-pressed')).toBe('true');
    const ranks = [...container.querySelectorAll<HTMLLIElement>('#artist-ranking li')];
    expect(ranks).toHaveLength(15);
    expect(ranks.slice(0, 3).map((row) => row.textContent)).toEqual(['Ivete Sangalo3/3', 'Titãs2/3', 'Legião Urbana1/3']);
    expect(ranks.slice(3, 6).map((row) => [row.value, row.textContent])).toEqual([[4, 'Artista 00/3'], [4, 'Artista 10/3'], [4, 'Artista 20/3']]);
    expect(related.querySelector('li')?.textContent).toContain('Titãs');
    await act(async () => ranks[0]?.querySelector('button')?.click());
    expect(openArtist).toHaveBeenCalledWith('Ivete Sangalo');
    await act(async () => root.render(<TestView query="Titas" />));
    const filtered = container.querySelectorAll<HTMLLIElement>('#artist-ranking li');
    expect(filtered).toHaveLength(1);
    expect(filtered[0].value).toBe(2);
    expect(filtered[0].textContent).toBe('Titãs2/3');
    await act(async () => root.render(<TestView />));
    await act(async () => related.querySelector<HTMLButtonElement>('h3 button')?.click());
    expect(container.querySelector('#artist-ranking h2')?.textContent).toContain('Legião Urbana');
    const relatedRanks = [...container.querySelectorAll<HTMLLIElement>('#artist-ranking li')];
    expect(relatedRanks.map((row) => [row.value, row.textContent])).toEqual([
      [1, 'Titãs2 de 2 modelos'], [2, 'Zeca Baleiro1 de 2 modelos'], [2, 'Os Paralamas do Sucesso1 de 2 modelos'],
    ]);
    await act(async () => audience.querySelector<HTMLButtonElement>('h3 button')?.click());
    expect(container.querySelector('#artist-ranking li')?.textContent).toBe('Titãs20%');
    await act(async () => container.querySelector<HTMLButtonElement>('#artist-ranking .host-ranking-toggle')?.click());
    expect(container.querySelector('#artist-ranking')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
