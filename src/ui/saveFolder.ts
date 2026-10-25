// Save games from the game folder (File System Access API, Chrome and Edge):
// the player picks the FactoryGame folder once, the page keeps the handle in
// IndexedDB and lists the saves below Saved/SaveGames/<id>/ on request.
// Other browsers keep the single file input (ConfigPanel).

/** The parts of the File System Access API used here (not in every DOM typing). */
export interface DirHandle {
  kind: 'directory';
  name: string;
  values(): AsyncIterable<DirHandle | FileHandle>;
  getDirectoryHandle(name: string): Promise<DirHandle>;
  queryPermission?(options: { mode: 'read' }): Promise<PermissionState>;
  requestPermission?(options: { mode: 'read' }): Promise<PermissionState>;
}

export interface FileHandle {
  kind: 'file';
  name: string;
  getFile(): Promise<File>;
}

export interface SaveEntry {
  /** Save name without the autosave suffix, e.g. "1.1 Spass". */
  session: string;
  file: File;
}

type Picker = (options: { id: string; mode: 'read' }) => Promise<DirHandle>;
const picker = () => (globalThis as { showDirectoryPicker?: Picker }).showDirectoryPicker;

export const folderSupported = () => typeof picker() === 'function';

export function pickFolder(): Promise<DirHandle> {
  return picker()!({ id: 'satisfactory', mode: 'read' });
}

/** "1.1 Spass_autosave_2.sav" -> "1.1 Spass". */
export function sessionOf(fileName: string): string {
  return fileName.replace(/\.sav$/i, '').replace(/_autosave_\d+$/i, '');
}

async function child(dir: DirHandle, name: string): Promise<DirHandle | undefined> {
  try {
    return await dir.getDirectoryHandle(name);
  } catch {
    return undefined;
  }
}

async function savesIn(dir: DirHandle): Promise<SaveEntry[]> {
  const saves: SaveEntry[] = [];
  for await (const entry of dir.values()) {
    if (entry.kind === 'file' && /\.sav$/i.test(entry.name) && !/^ServerManager/i.test(entry.name)) {
      saves.push({ session: sessionOf(entry.name), file: await entry.getFile() });
    }
  }
  return saves;
}

/**
 * All saves below the picked folder, newest first. Accepts FactoryGame, Saved,
 * SaveGames or a player folder (SaveGames/<id>) itself.
 */
export async function listSaves(picked: DirHandle): Promise<SaveEntry[]> {
  let games: DirHandle | undefined = picked;
  if (picked.name !== 'SaveGames') {
    const saved = picked.name === 'Saved' ? picked : await child(picked, 'Saved');
    games = (saved && (await child(saved, 'SaveGames'))) ?? (await child(picked, 'SaveGames'));
  }
  const saves = await savesIn(games ?? picked);
  if (games) {
    for await (const entry of games.values()) {
      if (entry.kind === 'directory' && entry.name !== 'blueprints') saves.push(...(await savesIn(entry)));
    }
  }
  return saves.sort((a, b) => b.file.lastModified - a.file.lastModified);
}

/** Read permission for a stored handle; asks only with `ask` (needs a click). */
export async function permitted(dir: DirHandle, ask: boolean): Promise<boolean> {
  if (!dir.queryPermission) return true;
  if ((await dir.queryPermission({ mode: 'read' })) === 'granted') return true;
  return ask && (await dir.requestPermission?.({ mode: 'read' })) === 'granted';
}

// The handle survives reloads in IndexedDB (handles are structured-cloneable).
const DB = 'noxisfactory';
const STORE = 'handles';

function store<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
  return new Promise((resolve) => {
    try {
      const open = indexedDB.open(DB, 1);
      open.onupgradeneeded = () => open.result.createObjectStore(STORE);
      open.onerror = () => resolve(undefined);
      open.onsuccess = () => {
        const request = run(open.result.transaction(STORE, mode).objectStore(STORE));
        request.onsuccess = () => resolve(request.result as T);
        request.onerror = () => resolve(undefined);
      };
    } catch {
      // No IndexedDB (private window): the folder lasts for this visit.
      resolve(undefined);
    }
  });
}

export const loadFolder = () => store<DirHandle>('readonly', (s) => s.get('saveFolder'));
export const saveFolder = (dir: DirHandle) => store('readwrite', (s) => s.put(dir, 'saveFolder'));
