// Picks a save game: from a picked folder (saveFolder.ts) or as a single file.

import { useState } from 'preact/hooks';
import { listSaves, type SaveEntry } from './saveFolder';

const when = (ms: number) =>
  new Date(ms).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function SavePicker({ onFile }: { onFile: (file: File) => void }) {
  const [saves, setSaves] = useState<SaveEntry[]>();
  const [chosen, setChosen] = useState(0);

  const pickFolder = (files: FileList | null) => {
    if (!files) return;
    setSaves(listSaves(files));
    setChosen(0);
  };

  return (
    <div class="saves">
      <p>
        Aus Spielstand übernehmen (liest Stufen und Alternativrezepte; bleibt im Browser).{' '}
        <label>
          Ordner SaveGames wählen:{' '}
          <input type="file" {...{ webkitdirectory: true }} onChange={(e) => pickFolder(e.currentTarget.files)} />
        </label>
      </p>
      <p class="hint">
        Liegt unter %LOCALAPPDATA%\FactoryGame\Saved\SaveGames (Pfad in die Adresszeile des Dialogs kopieren). Der Browser fragt, ob er die Dateien „hochladen“ darf: Sie werden nur hier gelesen, nichts verlässt den Rechner. Der Ordner muss bei jedem Besuch neu gewählt werden.
      </p>
      {saves && saves.length === 0 && <p class="error">Keine Spielstände in diesem Ordner gefunden.</p>}
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
      <p class="hint">
        <label>
          oder einzelne Datei: <input type="file" accept=".sav" onChange={(e) => e.currentTarget.files?.[0] && onFile(e.currentTarget.files[0])} />
        </label>
      </p>
    </div>
  );
}
