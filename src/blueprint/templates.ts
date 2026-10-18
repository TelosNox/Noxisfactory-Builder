// Object templates for blueprint generation: one building with its
// components, taken from existing blueprints (see docs/blueprint.md).

import type { Blueprint, SaveComponent, SaveEntity } from '@etothepii/satisfactory-file-parser';

export type SaveObject = SaveEntity | SaveComponent;

export const LEVEL_PREFIX = 'Persistent_Level:PersistentLevel.';

/** Base game content only; anything else comes from a mod. */
export const isBaseGame = (typePath: string) => /^\/(Game\/FactoryGame|Script)\//.test(typePath);

interface Template {
  /** Instance name without level prefix, e.g. Build_ConstructorMk1_C_2146220034. */
  name: string;
  json: string;
  buildVersion: number;
}

export class TemplateLibrary {
  private templates = new Map<string, Template>();
  /** Header and config of the newest source blueprint, reused for generated ones. */
  newest?: Blueprint;

  /** Add all buildings of a blueprint. Blueprints with mod content are skipped. */
  add(blueprint: Blueprint): boolean {
    if (!blueprint.objects.every((o) => isBaseGame(o.typePath))) return false;
    const build = blueprint.header.buildVersion;
    if (!this.newest || build >= this.newest.header.buildVersion) this.newest = blueprint;
    for (const entity of blueprint.objects) {
      if (entity.type !== 'SaveEntity') continue;
      const cls = entity.typePath.split('.').pop()!;
      const known = this.templates.get(cls);
      if (known && known.buildVersion >= build) continue;
      const parts = blueprint.objects.filter(
        (o) => o === entity || (o.type === 'SaveComponent' && o.parentEntityName === entity.instanceName),
      );
      this.templates.set(cls, {
        name: entity.instanceName.slice(LEVEL_PREFIX.length),
        json: JSON.stringify(parts),
        buildVersion: build,
      });
    }
    return true;
  }

  has(cls: string): boolean {
    return this.templates.has(cls) || this.derived(cls) !== undefined;
  }

  /** Fresh copy of the template under a new instance name, connections removed. */
  instantiate(cls: string, id: number): SaveObject[] {
    const t = this.templates.get(cls) ?? this.derived(cls);
    if (!t) throw new Error(`no template for ${cls}`);
    const name = t.name.replace(/_\d+$/, `_${id}`);
    const objects: SaveObject[] = JSON.parse(t.json.split(t.name).join(name));
    for (const o of objects) delete (o.properties as Record<string, unknown>).mConnectedComponent;
    return objects;
  }

  /**
   * Belt and lift tiers differ only by name (docs/blueprint.md), so a missing
   * tier is derived from Mk5.
   */
  private derived(cls: string): Template | undefined {
    const m = /^Build_Conveyor(Belt|Lift)Mk(\d)_C$/.exec(cls);
    if (!m) return undefined;
    const base = this.templates.get(`Build_Conveyor${m[1]}Mk5_C`);
    if (!base) return undefined;
    const rename = (s: string) => s.split(`Conveyor${m[1]}Mk5`).join(`Conveyor${m[1]}Mk${m[2]}`);
    return { name: rename(base.name), json: rename(base.json), buildVersion: base.buildVersion };
  }
}
