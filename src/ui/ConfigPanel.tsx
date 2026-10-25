// Game progress settings (config.ts): unlocked tiers, alternates, default supply.

import { useState } from 'preact/hooks';
import { gameData, type ItemId } from '../planner/gameData';
import { alternateRecipes, type Criterion } from '../planner/planner';
import { machinesPerPole } from '../generator/power';
import { DEFAULT_SUPPLIED, type GameConfig } from './config';
import { progressFromRecipes, readSave } from './savegame';

const itemName = (id: ItemId) => gameData.items[id]?.name ?? id;
const mainProduct = (recipe: string) => Object.keys(gameData.recipes[recipe].out)[0];

const ALTERNATES = alternateRecipes()
  .map((id) => ({ id, label: `${itemName(mainProduct(id))}: ${gameData.recipes[id].name}` }))
  .sort((a, b) => a.label.localeCompare(b.label));

/** Items that can be delivered: everything produced by a recipe, no raw resources. */
const SUPPLIABLE = [...new Set(Object.values(gameData.recipes).flatMap((r) => Object.keys(r.out)))]
  .filter((id) => gameData.items[id] && !gameData.items[id].resource)
  .sort((a, b) => itemName(a).localeCompare(itemName(b)));

export const CRITERIA: { value: Criterion; label: string }[] = [
  { value: 'scarcity', label: 'Knappe Rohstoffe schonen' },
  { value: 'resources', label: 'Wenig Rohstoffe' },
  { value: 'machines', label: 'Wenig Maschinen' },
  { value: 'power', label: 'Wenig Strom' },
];

export const STEP_PENALTIES = [
  { value: 0, label: 'aus' },
  { value: 0.01, label: 'leicht (1 % je Rezept)' },
  { value: 0.03, label: 'mittel (3 %)' },
  { value: 0.1, label: 'stark (10 %)' },
];

export function ConfigPanel({ config, onChange }: { config: GameConfig; onChange: (c: GameConfig) => void }) {
  const set = <K extends keyof GameConfig>(key: K, value: GameConfig[K]) => onChange({ ...config, [key]: value });
  const toggle = (list: string[], id: string, on: boolean) => (on ? [...list, id] : list.filter((x) => x !== id));
  const [altFilter, setAltFilter] = useState('');
  const [supFilter, setSupFilter] = useState('');
  const [saveStatus, setSaveStatus] = useState<{ text: string; error?: boolean }>();
  const alts = ALTERNATES.filter((a) => a.label.toLowerCase().includes(altFilter.toLowerCase()));
  const sups = SUPPLIABLE.filter((id) => itemName(id).toLowerCase().includes(supFilter.toLowerCase()));

  const importSave = async (file: File | undefined) => {
    if (!file) return;
    setSaveStatus({ text: `Lese ${file.name} …` });
    try {
      const unlocks = await readSave(file);
      const progress = progressFromRecipes(unlocks.recipes);
      onChange({ ...config, ...progress });
      setSaveStatus({
        text: `Übernommen aus „${unlocks.sessionName ?? file.name}“: Designer Mk${progress.designer - 3}, Band Mk${progress.beltTier}, Rohr Mk${progress.pipeTier}, Masten Mk${progress.poleTier}, ${progress.alternates.length} Alternativrezepte.`,
      });
    } catch (error) {
      setSaveStatus({ text: String((error as Error).message), error: true });
    }
  };

  return (
    <details class="config">
      <summary>
        Spielstand: Designer Mk{config.designer - 3}, Band Mk{config.beltTier}, Rohr Mk{config.pipeTier},{' '}
        {config.power === 'poles' ? `Masten Mk${config.poleTier}` : config.power === 'daisy' ? 'Daisy Chain' : 'ohne Strom'},{' '}
        {config.alternates.length} Alternativrezepte, {config.supplied.length} Zulieferungen
      </summary>
      <p>
        <label>
          Aus Spielstand übernehmen (.sav, liest Stufen und Alternativrezepte; bleibt im Browser){' '}
          <input type="file" accept=".sav" onChange={(e) => importSave(e.currentTarget.files?.[0])} />
        </label>
        <br />
        <span class="hint">Spielstände liegen unter %LOCALAPPDATA%\FactoryGame\Saved\SaveGames\.</span>
        {saveStatus && <span class={saveStatus.error ? 'error' : 'ok'}> {saveStatus.text}</span>}
      </p>
      <div class="inputs">
        <label>
          Größter Blueprint Designer
          <select value={config.designer} onChange={(e) => set('designer', +e.currentTarget.value)}>
            {[4, 5, 6].map((d) => (
              <option value={d}>Mk{d - 3} ({d}×{d} Foundations)</option>
            ))}
          </select>
        </label>
        <label>
          Höchste Bandstufe
          <select value={config.beltTier} onChange={(e) => set('beltTier', +e.currentTarget.value)}>
            {[1, 2, 3, 4, 5, 6].map((t) => (
              <option value={t}>Mk{t}</option>
            ))}
          </select>
        </label>
        <label>
          Höchste Rohrstufe
          <select value={config.pipeTier} onChange={(e) => set('pipeTier', +e.currentTarget.value)}>
            <option value={1}>Mk1 (300 m³/min)</option>
            <option value={2}>Mk2 (600 m³/min)</option>
          </select>
        </label>
        <label>
          Strom
          <select value={config.power} onChange={(e) => set('power', e.currentTarget.value as GameConfig['power'])}>
            <option value="poles">Strommasten</option>
            <option value="daisy">Daisy Chain</option>
            <option value="none">keiner</option>
          </select>
        </label>
        {config.power === 'poles' && (
          <label>
            Höchste Mast-Stufe
            <select value={config.poleTier} onChange={(e) => set('poleTier', +e.currentTarget.value)}>
              {[1, 2, 3].map((t) => (
                <option value={t}>Mk{t} ({machinesPerPole(t)} Maschinen je Mast)</option>
              ))}
            </select>
          </label>
        )}
        <label>
          Optimales Rezept heißt
          <select value={config.criterion} onChange={(e) => set('criterion', e.currentTarget.value as Criterion)}>
            {CRITERIA.map((c) => (
              <option value={c.value}>{c.label}</option>
            ))}
          </select>
        </label>
        <label>
          Kleine Nebenketten vermeiden
          <select value={config.stepPenalty} onChange={(e) => set('stepPenalty', +e.currentTarget.value)}>
            {STEP_PENALTIES.map((p) => (
              <option value={p.value}>{p.label}</option>
            ))}
          </select>
        </label>
        <label>
          Aufschlag je Maschine (Erz/min)
          <input type="number" min="0" step="any" value={config.machineCost} onInput={(e) => set('machineCost', Math.max(0, +e.currentTarget.value || 0))} />
        </label>
        <label>
          Aufschlag je MW (Erz/min)
          <input type="number" min="0" step="any" value={config.powerCost} onInput={(e) => set('powerCost', Math.max(0, +e.currentTarget.value || 0))} />
        </label>
      </div>

      <div class="lists">
        <fieldset>
          <legend>Freigeschaltete Alternativrezepte ({config.alternates.length})</legend>
          <input type="search" placeholder="Filter" value={altFilter} onInput={(e) => setAltFilter(e.currentTarget.value)} />
          <div class="checklist">
            {alts.map((a) => (
              <label class="inline">
                <input type="checkbox" checked={config.alternates.includes(a.id)} onChange={(e) => set('alternates', toggle(config.alternates, a.id, e.currentTarget.checked))} />
                {a.label}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Immer zugeliefert ({config.supplied.length})</legend>
          <input type="search" placeholder="Filter" value={supFilter} onInput={(e) => setSupFilter(e.currentTarget.value)} />
          <div class="checklist">
            {sups.map((id) => (
              <label class="inline">
                <input type="checkbox" checked={config.supplied.includes(id)} onChange={(e) => set('supplied', toggle(config.supplied, id, e.currentTarget.checked))} />
                {itemName(id)}
              </label>
            ))}
          </div>
          <button type="button" onClick={() => set('supplied', DEFAULT_SUPPLIED)}>
            Standard (Ingots)
          </button>
        </fieldset>
      </div>
    </details>
  );
}
