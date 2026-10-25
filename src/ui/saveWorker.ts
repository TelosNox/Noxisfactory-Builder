/// <reference lib="webworker" />
// Parses a save file off the main thread. Only the unlocked recipe class names
// go back: the parsed save is large and not needed.

import { Parser, type SaveComponent, type SaveEntity } from '@etothepii/satisfactory-file-parser';
import { unlockedRecipes } from './saveRecipes';

self.onmessage = (e: MessageEvent<{ name: string; buffer: ArrayBuffer }>) => {
  let objects: (SaveEntity | SaveComponent)[];
  let sessionName: string | null = null;
  try {
    const save = Parser.ParseSave(e.data.name, e.data.buffer);
    objects = Object.values(save.levels).flatMap((level) => level.objects);
    sessionName = save.header.sessionName || null;
  } catch {
    self.postMessage({ error: 'Die Datei ist kein lesbarer Satisfactory-Spielstand.' });
    return;
  }
  const recipes = unlockedRecipes(objects);
  if (!recipes) self.postMessage({ error: 'Im Spielstand fehlt die Liste der freigeschalteten Rezepte.' });
  else self.postMessage({ sessionName, recipes });
};
