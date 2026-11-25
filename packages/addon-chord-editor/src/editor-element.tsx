import { useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { EditableChart } from './catalog';
import type { DraftService } from './drafts';

interface RenderedPreview {
  html: string;
  playedChords?: string[];
  diagnostics?: number;
  sections?: number;
}

export interface ViewerRenderer {
  render(request: { text: string; settings?: object; key?: string }): RenderedPreview | Promise<RenderedPreview>;
}

export interface EditorSession {
  chart: EditableChart;
  drafts: DraftService;
  viewer: ViewerRenderer;
  monacoBase: string;
  initialText: string;
  staleDraft: boolean;
}

interface EditorElementConstructor extends CustomElementConstructor {
  sessions: Map<string, EditorSession>;
  nextSession: number;
}

function editorElement(): EditorElementConstructor {
  registerEditorElement();
  return customElements.get('addons-chord-editor') as EditorElementConstructor;
}

const STYLE = `
addons-chord-editor { display:block; min-width:0; }
.chord-editor { display:grid; gap:18px; color:#e2e8f0; }
.chord-editor__notice { margin:0; padding:12px 14px; border:1px solid #cbd5e1; border-radius:8px; background:#1e293b; line-height:1.5; }
.chord-editor__notice[data-stale="true"] { border-color:#fbbf24; color:#fef3c7; }
.chord-editor__grid { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:18px; }
.chord-editor__pane { display:grid; grid-template-columns:minmax(0,1fr); grid-template-rows:auto minmax(440px,1fr); min-width:0; overflow:hidden; border:1px solid #475569; border-radius:10px; background:#0f172a; }
.chord-editor__pane-header { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px 16px; padding:10px 14px; }
.chord-editor__pane-header h2 { margin:0; font-size:15px; color:#e2e8f0; }
.chord-editor__preview-controls { display:flex; align-items:center; flex-wrap:wrap; gap:4px 16px; }
.chord-editor__range { display:flex; align-items:center; gap:8px; font-size:13px; }
.chord-editor__range input { width:clamp(72px,12vw,112px); min-height:24px; margin:0; }
.chord-editor__range span { min-width:4ch; font-variant-numeric:tabular-nums; }
.chord-editor__monaco { contain:size; }
.chord-editor__textarea { box-sizing:border-box; width:100%; min-height:440px; padding:16px; resize:vertical; border:0; background:#111827; color:#f8fafc; font-family:ui-monospace,monospace; line-height:1.5; }
.chord-editor__preview { min-height:440px; max-height:65vh; overflow:auto; padding:18px; background:#fff; color:#111827; }
.chord-editor__actions { display:flex; align-items:center; flex-wrap:wrap; gap:12px; }
.chord-editor__actions button { min-height:40px; padding:0 14px; border:1px solid #a5b4fc; border-radius:8px; background:#4338ca; color:#fff; font:inherit; font-weight:650; cursor:pointer; }
.chord-editor__actions button:disabled { opacity:.5; cursor:not-allowed; }
.chord-editor__actions .is-secondary { background:transparent; }
.chord-editor__status { margin:0; color:#cbd5e1; }
@media (max-width:850px) { .chord-editor__grid { grid-template-columns:1fr; } .chord-editor__preview { max-height:none; } }
`;

type MonacoEditor = typeof import('@monaco-editor/react')['default'];

const normalizeText = (text: string) => text.replace(/\r\n?/g, '\n').replace(/^\u200b+/gm, '');

function FontSizeControl({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="chord-editor__range">
      Font size
      <input
        type="range"
        min={10}
        max={40}
        value={value}
        aria-label={label}
        aria-valuetext={`${value} px`}
        onChange={(event) => onChange(event.currentTarget.valueAsNumber)}
      />
      <span aria-hidden="true">{value} px</span>
    </label>
  );
}

function EditorSurface({ session }: { session: EditorSession }) {
  const { chart, drafts, viewer } = session;
  const [value, setValue] = useState(() => normalizeText(session.initialText));
  const [savedText, setSavedText] = useState(() => normalizeText(session.initialText));
  const [stale, setStale] = useState(session.staleDraft);
  const [preview, setPreview] = useState<RenderedPreview | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [status, setStatus] = useState(session.staleDraft ? 'The published chart changed since this draft was saved. Review it before saving again.' : 'Your changes are kept in this browser when you save.');
  const [busy, setBusy] = useState(false);
  const [Monaco, setMonaco] = useState<MonacoEditor | null>(null);
  const [monacoFailed, setMonacoFailed] = useState(false);
  const [editorFontSize, setEditorFontSize] = useState(12);
  const [previewFontSize, setPreviewFontSize] = useState(14);
  const [transposeNumber, setTransposeNumber] = useState(0);
  const transposeOffset = transposeNumber > 0 ? `+${transposeNumber}` : String(transposeNumber);

  useEffect(() => {
    let active = true;
    void import('@monaco-editor/react').then(async ({ default: Editor, loader }) => {
      loader.config({ paths: { vs: session.monacoBase } });
      await loader.init();
      if (active) setMonaco(() => Editor);
    }).catch(() => { if (active) setMonacoFailed(true); });
    return () => { active = false; };
  }, [session.monacoBase]);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      void Promise.resolve(viewer.render({
        text: value,
        settings: { fontSize: previewFontSize, transposeNumber },
        ...(chart.key ? { key: chart.key } : {}),
      }))
        .then((next) => { if (active) { setPreview(next); setPreviewError(''); } })
        .catch((reason) => { if (active) setPreviewError(reason instanceof Error ? reason.message : String(reason)); });
    }, 160);
    return () => { active = false; clearTimeout(timer); };
  }, [chart.key, previewFontSize, transposeNumber, value, viewer]);

  async function save(): Promise<void> {
    setBusy(true);
    try {
      await drafts.save({ sourceUrl: chart.sourceUrl, baseChecksum: chart.sourceChecksum, text: value });
      setSavedText(value);
      setStale(false);
      setStatus('Draft saved in this browser. Return to reading to see it in the viewer.');
    } catch (reason) {
      setStatus(`Could not save the draft: ${reason instanceof Error ? reason.message : String(reason)}`);
    } finally {
      setBusy(false);
    }
  }

  async function discard(): Promise<void> {
    setBusy(true);
    try {
      await drafts.remove({ sourceUrl: chart.sourceUrl });
      setValue(normalizeText(chart.originalText));
      setSavedText(normalizeText(chart.originalText));
      setStale(false);
      setStatus('Local draft removed. The published chart is shown again.');
    } catch (reason) {
      setStatus(`Could not discard the draft: ${reason instanceof Error ? reason.message : String(reason)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="chord-editor" aria-label={`Edit ${chart.title}`}>
      <p className="chord-editor__notice" data-stale={stale}>
        {stale ? 'Source changed: this draft was based on an older version. Compare it with the published chart before saving.' : 'Local draft: editing here does not change the published catalogue.'}
      </p>
      <div className="chord-editor__grid">
        <section className="chord-editor__pane" aria-label="Chart text editor">
          <header className="chord-editor__pane-header">
            <h2>Chart text</h2>
            <FontSizeControl label="Chart text font size" value={editorFontSize} onChange={setEditorFontSize} />
          </header>
          {Monaco ? (
            <Monaco
              value={value}
              language="plaintext"
              theme="vs-dark"
              path={`${encodeURIComponent(chart.id)}.txt`}
              wrapperProps={{ className: 'chord-editor__monaco' }}
              options={{ minimap: { enabled: false }, wordWrap: 'off', fontSize: editorFontSize, lineNumbers: 'on', scrollBeyondLastLine: false }}
              onChange={(next) => setValue(normalizeText(next ?? ''))}
              keepCurrentModel={false}
            />
          ) : monacoFailed ? (
            <textarea className="chord-editor__textarea" aria-label="Chart text" style={{ fontSize: editorFontSize }} spellCheck={false} value={value} onChange={(event) => setValue(normalizeText(event.currentTarget.value))} />
          ) : (
            <p role="status" className="chord-editor__notice">Loading Monaco editor…</p>
          )}
          {monacoFailed && <p className="chord-editor__notice">Monaco could not load. The plain text editor is available.</p>}
        </section>
        <section className="chord-editor__pane" aria-label="Live chart preview">
          <header className="chord-editor__pane-header">
            <h2>Live preview{preview ? ` · ${preview.sections ?? 0} sections · ${preview.diagnostics ?? 0} diagnostics` : ''}</h2>
            <div className="chord-editor__preview-controls">
              <label className="chord-editor__range">
                Transpose
                <input
                  type="range"
                  min={-11}
                  max={11}
                  value={transposeNumber}
                  aria-label="Live preview transpose"
                  aria-valuetext={transposeNumber === 0 ? 'Original key' : `${transposeOffset} semitone${Math.abs(transposeNumber) === 1 ? '' : 's'}`}
                  onChange={(event) => setTransposeNumber(event.currentTarget.valueAsNumber)}
                />
                <span aria-hidden="true">{transposeNumber === 0 ? 'Original' : transposeOffset}</span>
              </label>
              <FontSizeControl label="Live preview font size" value={previewFontSize} onChange={setPreviewFontSize} />
            </div>
          </header>
          <div className="chord-editor__preview">
            {previewError ? <p role="alert">{previewError}</p> : preview ? <div dangerouslySetInnerHTML={{ __html: preview.html }} /> : <p role="status">Rendering chart…</p>}
          </div>
        </section>
      </div>
      <div className="chord-editor__actions">
        <button type="button" onClick={() => void save()} disabled={busy || (!stale && value === savedText)}>Save local draft</button>
        <button type="button" className="is-secondary" onClick={() => void discard()} disabled={busy}>Discard draft</button>
        <p className="chord-editor__status" role="status">{value !== savedText ? 'Unsaved changes. ' : ''}{status}</p>
      </div>
    </section>
  );
}

export function registerEditorElement(): void {
  if (typeof customElements === 'undefined' || customElements.get('addons-chord-editor')) return;
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.append(style);

  customElements.define('addons-chord-editor', class extends HTMLElement {
    static sessions = new Map<string, EditorSession>();
    static nextSession = 0;
    private root?: Root;

    connectedCallback(): void {
      const session = editorElement().sessions.get(this.dataset.session ?? '');
      if (!session) return;
      this.root = createRoot(this);
      this.root.render(<EditorSurface session={session} />);
    }

    disconnectedCallback(): void {
      const root = this.root;
      this.root = undefined;
      editorElement().sessions.delete(this.dataset.session ?? '');
      if (root) queueMicrotask(() => root.unmount());
    }
  });
}

export function editorMarkup(session: EditorSession): string {
  const element = editorElement();
  const id = `chart-editor-${++element.nextSession}`;
  element.sessions.set(id, session);
  return `<addons-chord-editor data-session="${id}"></addons-chord-editor>`;
}
