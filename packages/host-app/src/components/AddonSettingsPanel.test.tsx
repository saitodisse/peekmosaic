// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { AddonInstance, AddonTabResult } from '@addons-poc/protocol';
import { AddonSettingsPanel } from './AddonSettingsPanel';

it('shows a dismissible toast for completed file imports, even after a library refresh', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('URL', Object.assign(class extends URL {}, {
    createObjectURL: () => 'blob:archive',
    revokeObjectURL: vi.fn(),
  }));
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  let refresh: (() => void) | undefined;
  const action = {
    id: 'import', label: 'Import', description: 'Import files.', receives: ['archive'],
    returns: { description: 'Result.', schema: { type: 'object', description: 'Result.', classification: 'public' } },
  };
  const run = vi.fn<() => Promise<AddonTabResult>>()
    .mockResolvedValueOnce({ status: 'success', body: 'charts.zip: 2 charts imported' })
    .mockResolvedValueOnce({ status: 'error', body: 'bad.zip: failed\ncharts.zip: 2 charts imported' });

  const addon = {
    ui: {
      title: 'Catalogue', settingsGroups: ['Local archives'],
      fields: [{ id: 'archive', label: 'Archives', group: 'Local archives', type: 'file', fileAction: 'import' }],
      actions: [action], run,
      getSnapshot: async () => ({ status: 'info', body: 'Library summary' }),
      subscribe(listener: () => void) { refresh = listener; return () => {}; },
    },
    manifest: { name: 'Catalogue', contract: { ui: {
      fields: [{ id: 'archive', label: 'Archives', required: true, schema: { type: 'string', description: 'Files.', classification: 'personal' } }],
      actions: [action],
    } } },
  } as unknown as AddonInstance;

  try {
    await act(async () => root.render(<AddonSettingsPanel addon={addon} onResourcesChanged={() => refresh?.()} />));
    const input = container.querySelector('input[type="file"]')!;
    expect(document.querySelector('.host-settings-toast')).toBeNull();

    for (const [names, role, title] of [
      [['charts.zip'], 'status', 'Importação concluída'],
      [['bad.zip', 'charts.zip'], 'alert', 'Houve falha na importação'],
    ] as const) {
      Object.defineProperty(input, 'files', { configurable: true, value: names.map((name) => new File(['archive'], name)) });
      await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
      const toast = document.querySelector('.host-settings-toast');
      const message = toast?.querySelector(`[role="${role}"]`);
      expect(message?.textContent).toContain(title);
      for (const name of names) expect(message?.textContent).toContain(name);
      await act(async () => toast?.querySelector('button')?.click());
      expect(document.querySelector('.host-settings-toast')).toBeNull();
    }
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
