import { useEffect, useState } from 'react';
import { listFavorites, type FavoriteChart } from '../favorites-store';
import { Link, resultRoute } from '../router';

export function FavoritesPage() {
  const [favorites, setFavorites] = useState<FavoriteChart[]>();
  const [readFailed, setReadFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void listFavorites().then((saved) => {
      if (active) setFavorites(saved);
    }, () => {
      if (active) setReadFailed(true);
    });
    return () => { active = false; };
  }, []);

  return (
    <section className="host-search-results host-favorites-page" aria-labelledby="favorites-heading">
      <h1 id="favorites-heading">Favoritas</h1>
      {readFailed ? <p role="alert">Não foi possível carregar as cifras favoritas.</p>
        : !favorites ? <p role="status">Carregando cifras favoritas…</p>
        : favorites.length === 0 ? <p>Você ainda não marcou nenhuma cifra como favorita.</p>
        : (
          <ul>
            {favorites.map(({ title, url }) => (
              <li key={url}><Link to={resultRoute(url, true)}>{title}</Link></li>
            ))}
          </ul>
        )}
    </section>
  );
}
