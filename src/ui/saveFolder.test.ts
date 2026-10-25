import { describe, expect, it } from 'vitest';
import { listSaves, sessionOf, type DirHandle, type FileHandle } from './saveFolder';

type Tree = { [name: string]: Tree | number };

/** In-memory folder; numbers are file modification times. */
function dir(name: string, tree: Tree): DirHandle {
  const entries = () =>
    Object.entries(tree).map(([n, v]): DirHandle | FileHandle =>
      typeof v === 'number' ? { kind: 'file', name: n, getFile: async () => new File([], n, { lastModified: v }) } : dir(n, v),
    );
  return {
    kind: 'directory',
    name,
    async *values() {
      yield* entries();
    },
    async getDirectoryHandle(n: string) {
      const v = tree[n];
      if (v === undefined || typeof v === 'number') throw new Error('NotFoundError');
      return dir(n, v);
    },
  };
}

const factoryGame = {
  Saved: {
    Config: { 'Game.ini': 1 },
    SaveGames: {
      'ServerManager_V2.sav': 9,
      blueprints: { 'Spass': { 'X.sav': 9 } },
      '7656': { '1.1 Spass_autosave_0.sav': 3, '1.1 Spass_autosave_1.sav': 5, 'Alt.sav': 1, 'notes.txt': 7 },
    },
  },
};

describe('save folder', () => {
  it('names the session without the autosave suffix', () => {
    expect(sessionOf('1.1 Spass_autosave_2.sav')).toBe('1.1 Spass');
    expect(sessionOf('Alt.sav')).toBe('Alt');
  });

  it('finds the saves below FactoryGame, newest first', async () => {
    const saves = await listSaves(dir('FactoryGame', factoryGame));
    expect(saves.map((s) => s.file.name)).toEqual(['1.1 Spass_autosave_1.sav', '1.1 Spass_autosave_0.sav', 'Alt.sav']);
    expect(saves[0].session).toBe('1.1 Spass');
  });

  it('accepts Saved, SaveGames or the player folder as well', async () => {
    const names = async (d: DirHandle) => (await listSaves(d)).length;
    expect(await names(dir('Saved', factoryGame.Saved))).toBe(3);
    expect(await names(dir('SaveGames', factoryGame.Saved.SaveGames))).toBe(3);
    expect(await names(dir('7656', factoryGame.Saved.SaveGames['7656']))).toBe(3);
  });
});
