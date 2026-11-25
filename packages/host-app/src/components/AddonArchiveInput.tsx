import { useId, useRef, useState } from 'react';
import type { AddonTabField } from '@addons-poc/protocol';
import type { AddonTabController } from './useAddonTab';

type SelectedFile = { file: File; path?: string };

async function readEntry(entry: FileSystemEntry, files: SelectedFile[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
    files.push({ file, path: entry.fullPath.slice(1) });
  } else if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    for (;;) {
      const children = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
      if (children.length === 0) break;
      for (const child of children) await readEntry(child, files);
    }
  }
}

async function readDrop(transfer: DataTransfer, directories: boolean): Promise<SelectedFile[]> {
  const files = Array.from(transfer.files, (file) => ({ file }));
  if (!directories || !transfer.items?.length) return files;
  // Capture entries and fallback files while the drop event can access them.
  const items = Array.from(transfer.items)
    .filter((item) => item.kind === 'file')
    .map((item) => ({ entry: item.webkitGetAsEntry?.(), file: item.getAsFile() }));
  if (!items.length) return files;
  const selected: SelectedFile[] = [];
  for (const { entry, file } of items) {
    if (entry?.isDirectory) await readEntry(entry, selected);
    else if (file) selected.push({ file });
    else if (entry) await readEntry(entry, selected);
  }
  return selected;
}

export function AddonArchiveInput({ field, controller }: { field: AddonTabField; controller: AddonTabController }) {
  const helpId = useId();
  const busy = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const directories = field.fileDirectories === true && field.fileMultiple !== false;
  const disabled = controller.runningAction !== null || reading;

  async function submit(read: () => SelectedFile[] | Promise<SelectedFile[]>) {
    if (!field.fileAction || disabled || busy.current) return;
    busy.current = true;
    const selection: Array<{ name: string; url: string; path?: string }> = [];
    setError('');
    setReading(true);
    try {
      const files = await read();
      if (files.length === 0) {
        setError('No files found in the selection.');
        return;
      }
      if (field.fileMultiple === false && files.length > 1) {
        setError('Choose one file at a time.');
        return;
      }
      for (const { file, path } of files) {
        selection.push({ name: file.name, url: URL.createObjectURL(file), ...(path && { path }) });
      }
      await controller.run(field.fileAction, { [field.id]: JSON.stringify(selection) });
    } catch {
      setError('Could not open the selected files. Try selecting them again.');
    } finally {
      for (const { url } of selection) URL.revokeObjectURL(url);
      busy.current = false;
      setReading(false);
    }
  }

  function selectFiles(input: HTMLInputElement) {
    const files = Array.from(input.files ?? [], (file) => ({ file, path: file.webkitRelativePath }));
    input.value = '';
    if (files.length) void submit(() => files);
  }

  return (
    <div
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
        void submit(() => readDrop(event.dataTransfer, directories));
      }}
    >
      <label htmlFor={`${helpId}-files`}>{field.label}</label>
      <input
        id={`${helpId}-files`}
        type="file"
        multiple={field.fileMultiple !== false}
        accept={field.accept}
        disabled={disabled}
        aria-describedby={helpId}
        className="host-tab-control"
        onChange={(event) => selectFiles(event.currentTarget)}
      />
      {directories && <label className="host-tab-panel-field">
        Choose a folder
        <input
          type="file"
          ref={(input) => { if (input) input.webkitdirectory = true; }}
          disabled={disabled}
          aria-describedby={helpId}
          className="host-tab-control"
          onChange={(event) => selectFiles(event.currentTarget)}
        />
      </label>}
      <span id={helpId} className="host-tab-field-help">{directories
        ? 'Choose or drop files or folders here to start importing.'
        : field.fileMultiple === false
        ? 'Choose or drop one file here to start importing.'
        : 'Choose or drop files here to start importing.'}</span>
      {reading && <span role="status">Importing selected files…</span>}
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
