/**
 * Rendered view of one search result.
 *
 * The dedicated page of a result used to know only one shape: the structured
 * article payload. A result that belongs to another domain needs another
 * renderer, and the host must not learn that domain. So the host asks a service
 * declared by convention, exactly like it asks `state-store` for persistence:
 *
 *   id: `host.content-view`
 *   method: `render({ url, type, name })` -> `{ html, title? }`
 *
 * Any active add-on may provide it; the registry decides which one wins by
 * priority. A provider that does not understand the URL returns nothing, and the
 * page falls back to its own layout.
 */

export const CONTENT_VIEW_SERVICE = 'host.content-view';

export interface ContentViewRequest {
  /** Absolute content URL of the result, the same URL the page would open. */
  url: string;
  /** Declared type of the result, when the row has one. */
  type?: string;
  /** Displayed name of the result, used as a title fallback. */
  name?: string;
}

export interface ContentViewResult {
  html: string;
  title?: string;
  clipboard?: ContentViewClipboard;
}

export interface ContentViewClipboard {
  currentText(): string;
  diagnostics(): object;
}

export function readViewClipboard(value: unknown): ContentViewClipboard | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const clipboard = (value as { clipboard?: Partial<ContentViewClipboard> }).clipboard;
  return typeof clipboard?.currentText === 'function' && typeof clipboard.diagnostics === 'function'
    ? clipboard as ContentViewClipboard
    : undefined;
}

export interface ContentViewProvider {
  render(request: ContentViewRequest): Promise<Partial<ContentViewResult> | undefined | null>
    | Partial<ContentViewResult> | undefined | null;
}

/**
 * Asks the provider for a rendered view, tolerating any failure.
 *
 * A broken or slow provider must not break the result page, so every error
 * becomes "no view" and the page keeps its own layout.
 */
export async function requestContentView(
  provider: ContentViewProvider | undefined,
  request: ContentViewRequest,
): Promise<ContentViewResult | undefined> {
  if (!provider || typeof provider.render !== 'function' || !request.url) return undefined;
  try {
    const result = await provider.render(request);
    const html = typeof result?.html === 'string' ? result.html.trim() : '';
    if (!html) return undefined;
    const title = typeof result?.title === 'string' ? result.title.trim() : '';
    const clipboard = readViewClipboard(result);
    return { html, ...(title ? { title } : {}), ...(clipboard ? { clipboard } : {}) };
  } catch {
    return undefined;
  }
}
