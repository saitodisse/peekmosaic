import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { AddonInstance, AddonTabResult } from '@addons-poc/protocol';
import { useAddonTab } from './useAddonTab';
import { AddonControlPanel } from './AddonControlPanel';

/** Renders the add-on's declared settings groups. */
export function AddonSettingsPanel({ addon, onResourcesChanged }: { addon: AddonInstance; onResourcesChanged?: () => void }) {
  const [notification, setNotification] = useState<{ result: AddonTabResult; title: string } | null>(null);
  const controller = useAddonTab(addon, { onResponse: (result, actionId) => {
    if (result.status !== 'info' && !addon.ui?.actions?.some((action) => action.id === actionId && action.live)) {
      const isFileImport = addon.ui?.fields?.some((field) => field.fileAction === actionId);
      const title = isFileImport
        ? (result.status === 'error' ? 'Houve falha na importação' : 'Importação concluída')
        : (result.status === 'error' ? 'Houve falha na operação' : 'Operação concluída');
      setNotification({ result, title });
    }
    onResourcesChanged?.();
  } });
  const groups = addon.ui?.settingsGroups ?? ['Settings'];
  const settings = { ...controller, sections: controller.sections.filter((section) => section.title !== null && groups.includes(section.title)) };
  return <div className="host-addon-settings" style={{ marginTop: 12 }}>
    {controller.ready ? <AddonControlPanel addon={addon} controller={settings} title={`Settings for ${addon.manifest.name}`} /> : <p role="status">Loading settings…</p>}
    {controller.response && <pre
      role={notification ? undefined : controller.response.status === 'error' ? 'alert' : 'status'}
      style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 12 }}
    >{formatResult(controller.response)}</pre>}
    {notification && createPortal(
      <div className={`host-settings-toast is-${notification.result.status}`}>
        <div role={notification.result.status === 'error' ? 'alert' : 'status'}>
          <strong><span aria-hidden="true">{notification.result.status === 'error' ? '⚠ ' : '✓ '}</span>{notification.title}</strong>
          <p>{formatResult(notification.result)}</p>
        </div>
        <button type="button" aria-label="Fechar notificação" onClick={() => setNotification(null)}>×</button>
      </div>,
      document.body,
    )}
  </div>;
}

function formatResult(result: AddonTabResult) {
  return result.body + (result.items?.map((item) => `\n${item.label}: ${item.value}`).join('') ?? '');
}
