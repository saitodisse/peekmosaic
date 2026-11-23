import { useId, useState } from 'react';
import type { AddonTabField } from '@addons-poc/protocol';
import type { AddonTabController } from './useAddonTab';

export function AddonArchiveInput({ field, controller }: { field: AddonTabField; controller: AddonTabController }) {
  const helpId = useId();
  const [dragging, setDragging] = useState(false);
  const [count, setCount] = useState(0);
  const [error, setError] = useState('');
  const disabled = controller.runningAction !== null || count > 0;

  async function submit(files: File[]) {
    if (!field.fileAction || disabled || files.length === 0) return;
    if (field.fileMultiple === false && files.length > 1) {
      setError('Choose one file at a time.');
      return;
    }
    const archives: Array<{ name: string; url: string }> = [];
    setError('');
    setCount(files.length);
    try {
      for (const file of files) archives.push({ name: file.name, url: URL.createObjectURL(file) });
      await controller.run(field.fileAction, { [field.id]: JSON.stringify(archives) });
    } catch {
      setError('Could not open the selected files. Try selecting them again.');
    } finally {
      for (const { url } of archives) URL.revokeObjectURL(url);
      setCount(0);
    }
  }

  return (
    <label
      className={`host-tab-panel-field host-archive-input${dragging ? ' is-dragging' : ''}`}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = disabled ? 'none' : 'copy';
        setDragging(!disabled);
      }}
      onDragLeave={(event) => {
        if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) setDragging(false);
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        setDragging(false);
        void submit(Array.from(event.dataTransfer.files));
      }}
    >
      {field.label}
      <input
        type="file"
        multiple={field.fileMultiple !== false}
        accept={field.accept}
        disabled={disabled}
        aria-describedby={helpId}
        className="host-tab-control"
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = '';
          void submit(files);
        }}
      />
      <span id={helpId} className="host-tab-field-help">{field.fileMultiple === false
        ? 'Choose or drop one file here to start importing.'
        : 'Choose or drop files here to start importing.'}</span>
      {count > 0 && <span role="status">Importing {count} {count === 1 ? 'file' : 'files'}, one at a time…</span>}
      {error && <span role="alert">{error}</span>}
    </label>
  );
}
