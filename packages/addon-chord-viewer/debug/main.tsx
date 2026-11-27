import { useDeferredValue, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { DEFAULT_SETTINGS, NUMERIC_LIMITS, type ViewerSettings } from '../src/settings';
import { readDebugReport, replayChart } from './replay';
import './styles.css';

const EXAMPLE = '[Intro]\nC   G/B  Am7\n\n[Verso]\nC       G/B\nUma frase para testar\n';
const STAGES = [
  ['input', 'Entrada do parser'],
  ['parsed', 'Análise e tokens'],
  ['transposed', 'Transposição'],
  ['paired', 'Pareamento de acordes e letra'],
  ['prepared', 'Segmentos preparados'],
  ['text', 'Texto no tom atual'],
  ['html', 'HTML gerado'],
  ['capturedText', 'Texto capturado'],
  ['capturedHtml', 'HTML capturado'],
] as const;

type Stage = typeof STAGES[number][0];

function DebugPage() {
  const [chartSource, setChartSource] = useState(EXAMPLE);
  const [bar, setBar] = useState({ chords: 'C       G/B', lyrics: 'Uma frase para testar' });
  const [mode, setMode] = useState<'chart' | 'bar'>('chart');
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [key, setKey] = useState('');
  const [report, setReport] = useState<ReturnType<typeof readDebugReport>>();
  const [pastedJson, setPastedJson] = useState('');
  const [importError, setImportError] = useState('');
  const [stage, setStage] = useState<Stage>('parsed');

  const source = useDeferredValue(mode === 'chart' ? chartSource : [bar.chords, bar.lyrics].filter(Boolean).join('\n'));
  const render = useMemo(() => replayChart(source, settings, key), [source, settings, key]);
  const comparing = report && mode === 'chart';
  const selectableStages = STAGES.filter(([id]) => {
    if (id === 'capturedText') return comparing && report.capturedText !== undefined;
    if (id === 'capturedHtml') return comparing && report.capturedHtml !== undefined;
    return true;
  });
  const selectedStage = selectableStages.some(([id]) => id === stage) ? stage : 'parsed';
  const stageData = {
    input: render.steps.parserInput,
    parsed: render.steps.parsed,
    transposed: render.steps.transposed,
    paired: render.steps.paired,
    prepared: render.steps.prepared,
    text: render.text,
    html: render.html,
    capturedText: report?.capturedText,
    capturedHtml: report?.capturedHtml,
  }[selectedStage];

  function changeSetting<K extends keyof ViewerSettings>(name: K, value: ViewerSettings[K]) {
    setSettings((current) => ({ ...current, [name]: value }));
  }

  function importJson(json: string) {
    try {
      const next = readDebugReport(json);
      setReport(next);
      setChartSource(next.source);
      setSettings(next.settings);
      setKey(next.key);
      setMode('chart');
      setPastedJson('');
      setImportError('');
    } catch (error) {
      setImportError(error instanceof SyntaxError ? 'O conteúdo precisa ser um JSON válido.' : (error as Error).message);
    }
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    try {
      importJson(await file.text());
    } catch {
      setImportError('Não foi possível ler o arquivo.');
    }
  }

  function importPasted(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    importJson(pastedJson);
  }

  return (
    <main className="debug-page">
      <header className="page-header">
        <h1>Depuração do Tab Renderer</h1>
        <label className="file-button">
          <span>Importar diagnóstico (.json)</span>
          <input type="file" accept=".json,application/json" onChange={(event) => void importFile(event)} />
        </label>
      </header>
      <details className="paste">
        <summary>Colar diagnóstico JSON</summary>
        <form onSubmit={importPasted}>
          <textarea aria-label="Diagnóstico JSON" value={pastedJson} onChange={(event) => setPastedJson(event.target.value)} spellCheck={false} />
          <button type="submit" disabled={!pastedJson.trim()}>Carregar diagnóstico</button>
        </form>
      </details>
      {importError && <p role="alert" className="error">{importError}</p>}
      {report && (
        <div className="capture" role="status">
          <span><strong>{report.title || 'Diagnóstico importado'}</strong>{report.capturedHtml !== undefined && comparing && (
            <span className="comparison">{report.capturedHtml === render.html ? 'HTML igual ao capturado' : 'HTML diferente da captura'}</span>
          )}</span>
          <div className="source-actions">
            <button type="button" onClick={() => { setChartSource(report.original); setMode('chart'); }}>Usar cifra original</button>
            <button type="button" onClick={() => { setChartSource(report.source); setMode('chart'); }}>Restaurar entrada capturada</button>
          </div>
        </div>
      )}

      <div className="workspace">
        <section aria-labelledby="source-title" className="surface">
          <div className="section-heading">
            <h2 id="source-title">Entrada</h2>
            <label>Escopo
              <select value={mode} onChange={(event) => setMode(event.target.value === 'bar' ? 'bar' : 'chart')}>
                <option value="chart">Cifra completa</option>
                <option value="bar">Um compasso</option>
              </select>
            </label>
          </div>
          {mode === 'chart'
            ? <label className="editor">Texto da cifra
                <textarea rows={14} wrap="off" spellCheck={false} value={chartSource} onChange={(event) => setChartSource(event.target.value)} />
              </label>
            : <div className="bar-fields">
                <label className="editor">Linha de acordes
                  <input type="text" spellCheck={false} value={bar.chords} onChange={(event) => setBar({ ...bar, chords: event.target.value })} />
                </label>
                <label className="editor">Linha da letra
                  <input type="text" spellCheck={false} value={bar.lyrics} onChange={(event) => setBar({ ...bar, lyrics: event.target.value })} />
                </label>
              </div>}
          <fieldset>
            <legend>Renderização</legend>
            <div className="settings">
              <label>Tom de origem
                <input type="text" placeholder="Automático" value={key} onChange={(event) => setKey(event.target.value)} />
              </label>
              <label>Transposição (semitons)
                <input type="number" {...NUMERIC_LIMITS.transposeNumber} value={settings.transposeNumber} onChange={(event) => changeSetting('transposeNumber', Number(event.target.value))} />
              </label>
              <label>Layout
                <select value={settings.viewMode} onChange={(event) => changeSetting('viewMode', event.target.value as ViewerSettings['viewMode'])}>
                  <option value="e">Intercalado</option>
                  <option value="o">Em linhas</option>
                </select>
              </label>
              <label>Exibir
                <select value={settings.displayMode} onChange={(event) => changeSetting('displayMode', event.target.value as ViewerSettings['displayMode'])}>
                  <option value="both">Acordes e letra</option>
                  <option value="chords">Acordes</option>
                  <option value="lyrics">Letra</option>
                </select>
              </label>
              <label className="check"><input type="checkbox" checked={settings.hideTablature} onChange={(event) => changeSetting('hideTablature', event.target.checked)} /> Ocultar tablatura</label>
              <label className="check"><input type="checkbox" checked={settings.simplifyChords} onChange={(event) => changeSetting('simplifyChords', event.target.checked)} /> Simplificar acordes</label>
            </div>
          </fieldset>
        </section>

        <section aria-labelledby="preview-title" className="surface">
          <div className="section-heading">
            <h2 id="preview-title">Prévia ao vivo</h2>
            <output>{render.steps.keys.original ?? '—'} → {render.steps.keys.current ?? '—'}</output>
          </div>
          <div className="preview" dangerouslySetInnerHTML={{ __html: render.html }} />
        </section>
      </div>

      <section aria-labelledby="pipeline-title" className="surface pipeline">
        <div className="section-heading">
          <h2 id="pipeline-title">Etapas do renderer</h2>
          <span>Parser {render.steps.summary.parserVersion} · {render.steps.summary.diagnostics} diagnóstico(s)</span>
        </div>
        <label>Etapa
          <select value={selectedStage} onChange={(event) => setStage(event.target.value as Stage)}>
            {selectableStages.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
        <pre className="stage-output" tabIndex={0}>{typeof stageData === 'string' ? stageData : JSON.stringify(stageData, null, 2)}</pre>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<DebugPage />);
