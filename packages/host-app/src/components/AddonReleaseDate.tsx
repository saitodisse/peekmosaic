import { publishedReleaseDate } from '../local-manifest-suggestions';

export function AddonReleaseDate({ manifestUrl }: { manifestUrl: string }) {
  const date = publishedReleaseDate(manifestUrl);
  if (!date) return null;
  const [year, month, day] = date.split('-');
  return (
    <time dateTime={date} title="Release date" style={{ color: '#94a3b8', fontSize: 12, whiteSpace: 'nowrap' }}>
      {day}/{month}/{year}
    </time>
  );
}
