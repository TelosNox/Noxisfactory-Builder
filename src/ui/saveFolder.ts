// Save games from a picked folder (<input webkitdirectory>, all browsers):
// the player picks FactoryGame or a folder below it, the page lists the saves
// below Saved/SaveGames/<id>/. The File System Access API could remember the
// folder, but Chrome refuses every folder under AppData\Local (system files),
// where the game keeps its saves.

export interface SaveEntry {
  /** Save name without the autosave suffix, e.g. "1.1 Spass". */
  session: string;
  file: File;
}

/** "1.1 Spass_autosave_2.sav" -> "1.1 Spass". */
export function sessionOf(fileName: string): string {
  return fileName.replace(/\.sav$/i, '').replace(/_autosave_\d+$/i, '');
}

/** Saves among the files of a picked folder, newest first (no server manager, no blueprints). */
export function listSaves(files: Iterable<File>): SaveEntry[] {
  return [...files]
    .filter((f) => /\.sav$/i.test(f.name) && !/^ServerManager/i.test(f.name))
    .filter((f) => !/(^|\/)blueprints\//i.test(f.webkitRelativePath))
    .map((file) => ({ session: sessionOf(file.name), file }))
    .sort((a, b) => b.file.lastModified - a.file.lastModified);
}
