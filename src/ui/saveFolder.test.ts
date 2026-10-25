import { describe, expect, it } from 'vitest';
import { listSaves, sessionOf } from './saveFolder';

/** A file as a folder input delivers it: path relative to the picked folder. */
const file = (path: string, lastModified: number) => {
  const f = new File([], path.slice(path.lastIndexOf('/') + 1), { lastModified });
  Object.defineProperty(f, 'webkitRelativePath', { value: path });
  return f;
};

describe('save folder', () => {
  it('names the session without the autosave suffix', () => {
    expect(sessionOf('1.1 Spass_autosave_2.sav')).toBe('1.1 Spass');
    expect(sessionOf('Alt.sav')).toBe('Alt');
  });

  it('finds the saves of a picked folder, newest first', () => {
    const saves = listSaves([
      file('SaveGames/ServerManager_V2.sav', 9),
      file('SaveGames/blueprints/Spass/X.sav', 9),
      file('SaveGames/7656/1.1 Spass_autosave_0.sav', 3),
      file('SaveGames/7656/1.1 Spass_autosave_1.sav', 5),
      file('SaveGames/7656/Alt.sav', 1),
      file('SaveGames/7656/notes.txt', 7),
    ]);
    expect(saves.map((s) => s.file.name)).toEqual(['1.1 Spass_autosave_1.sav', '1.1 Spass_autosave_0.sav', 'Alt.sav']);
    expect(saves[0].session).toBe('1.1 Spass');
  });
});
