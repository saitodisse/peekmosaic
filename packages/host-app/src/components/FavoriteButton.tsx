import { useEffect, useState } from 'react';
import { isFavorite, setFavorite } from '../favorites-store';

export function FavoriteButton({ url, title }: { url: string; title: string }) {
  const [favorite, setSaved] = useState<boolean>();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    void isFavorite(url).then((saved) => {
      if (active) setSaved(saved);
    }, () => {
      if (active) setError('Não foi possível ler os favoritos.');
    }).finally(() => {
      if (active) setBusy(false);
    });
    return () => { active = false; };
  }, [url]);

  async function toggleFavorite() {
    setBusy(true);
    setError(undefined);
    try {
      const next = !(favorite ?? await isFavorite(url));
      await setFavorite(url, title, next);
      setSaved(next);
    } catch {
      setError('Não foi possível atualizar o favorito.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="host-reading-favorite"
        aria-label="Favorito"
        aria-pressed={favorite ?? false}
        title={favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
        disabled={busy}
        onClick={() => void toggleFavorite()}
      >
        <span aria-hidden="true">{favorite ? '★' : '☆'}</span>
      </button>
      {error && <span className="host-reading-favorite-error" role="alert">{error}</span>}
    </>
  );
}
