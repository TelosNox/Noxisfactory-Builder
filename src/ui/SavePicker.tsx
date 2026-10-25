// Picks a save game: from the game folder (picked once, saveFolder.ts) or,
// in browsers without folder access, as a single file.

import { useEffect, useState } from 'preact/hooks';
import { folderSupported, listSaves, loadFolder, permitted, pickFolder, saveFolder, type DirHandle, type SaveEntry } from './saveFolder';

const when = (ms: number) =>
  new Date(ms).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function SavePicker({ onFile }: { onFile: (file: File) => void }) {
  const [folder, setFolder] = useState<DirHandle>();
  const [saves, setSaves] = useState<SaveEntry[]>();
  const [chosen, setChosen] = useState(0);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string>();

  const open = async (dir: DirHandle, ask: boolean) => {
    setError(undefined);
    if (!(await permitted(dir, ask))) {
      setLocked(true);
      return;
    }
    setLocked(false);
    try {
      const found = await listSaves(dir);
      setSaves(found);
      setChosen(0);
      if (found.length === 0) setError(`Keine Spielstände in „${dir.name}“ gefunden. Den Ordner FactoryGame wählen (unter %LOCALAPPDATA%).`);
    } catch (e) {
      setError(`Ordner nicht lesbar: ${(e as Error).message}`);
    }
  };

  // A folder picked on an earlier visit: list it if the browser still allows it.
  useEffect(() => {
    if (!folderSupported()) return;
    loadFolder().then((dir) => {
      if (!dir) return;
      setFolder(dir);
      open(dir, false);
    });
  }, []);

  const pick = async () => {
    try {
      const dir = await pickFolder();
      setFolder(dir);
      await saveFolder(dir);
      await open(dir, true);
    } catch (e) {
      // Closing the dialog is no error.
      if ((e as Error).name !== 'AbortError') setError(`Ordner nicht wählbar: ${(e as Error).message}`);
    }
  };

  const fileInput = (
    <label>
      {folderSupported() ? 'oder einzelne Datei: ' : 'Spielstand-Datei (.sav): '}
      <input type="file" accept=".sav" onChange={(e) => e.currentTarget.files?.[0] && onFile(e.currentTarget.files[0])} />
    </label>
  );

  if (!folderSupported()) {
    return (
      <p>
        Aus Spielstand übernehmen (liest Stufen und Alternativrezepte; bleibt im Browser). {fileInput}
        <br />
        <span class="hint">Spielstände liegen unter %LOCALAPPDATA%\FactoryGame\Saved\SaveGames\. Den Spielordner direkt lesen können nur Chrome und Edge.</span>
      </p>
    );
  }

  return (
    <div class="saves">
      <p>
        Aus Spielstand übernehmen (liest Stufen und Alternativrezepte; bleibt im Browser).{' '}
        <button type="button" class="small" onClick={pick}>
          {folder ? `Spielordner: ${folder.name} (ändern)` : 'Spielordner wählen'}
        </button>
        {folder && !locked && (
          <button type="button" class="small" onClick={() => open(folder, true)}>
            neu einlesen
          </button>
        )}
        {locked && folder && (
          <button type="button" class="small" onClick={() => open(folder, true)}>
            Zugriff auf {folder.name} erlauben
          </button>
        )}
      </p>
      {!folder && <p class="hint">Einmal den Ordner FactoryGame unter %LOCALAPPDATA% wählen; die Seite merkt ihn sich und sucht die Spielstände selbst.</p>}
      {saves && saves.length > 0 && (
        <p>
          <select value={chosen} onChange={(e) => setChosen(+e.currentTarget.value)}>
            {saves.map((s, i) => (
              <option value={i}>
                {s.session} – {when(s.file.lastModified)} ({s.file.name})
              </option>
            ))}
          </select>{' '}
          <button type="button" class="primary" onClick={() => onFile(saves[chosen].file)}>
            übernehmen
          </button>
        </p>
      )}
      {error && <p class="error">{error}</p>}
      <p class="hint">{fileInput}</p>
    </div>
  );
}
