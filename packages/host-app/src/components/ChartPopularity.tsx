const viewCount = new Intl.NumberFormat('pt-BR');
const percentage = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 2 });

function isViewCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function comparisonLabel(ratio: number): string {
  if (ratio > 0 && ratio < 0.0001) return '<0,01%';
  if (ratio > 0.9999 && ratio < 1) return '>99,99%';
  return percentage.format(ratio);
}

export function ChartPopularity({ statistics }: { statistics: unknown }) {
  if (!statistics || typeof statistics !== 'object' || !('allTimeViews' in statistics)) return null;
  const views = statistics.allTimeViews;
  if (!isViewCount(views)) return null;
  const max = 'catalogueMaxViews' in statistics ? statistics.catalogueMaxViews : undefined;
  const ratio = isViewCount(max) && max > 0 && views <= max ? views / max : undefined;
  const comparison = ratio === undefined ? undefined : comparisonLabel(ratio);

  return (
    <div className="host-chart-popularity" lang="pt-BR">
      <div className="host-chart-popularity-label">
        <span><strong>{viewCount.format(views)}</strong> {views === 1 ? 'visualização' : 'visualizações'}</span>
        {comparison && <span><strong>{comparison}</strong> da mais vista</span>}
      </div>
      {ratio !== undefined && (
        <meter
          min={0}
          max={100}
          value={ratio * 100}
          aria-label="Visualizações em relação à música mais vista do catálogo"
          aria-valuetext={comparison}
        />
      )}
    </div>
  );
}
