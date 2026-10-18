"""Extract production recipes, items and machines from the game's Docs.json.

Writes data/recipes.json with only the facts the planner needs: amounts,
durations, machines and power. Names are derived from class names, no game
texts are copied.

Source: CommunityResources/Docs/en-US.json in the game installation.
Fluid amounts are stored by the game in liters; they are converted to m³.

Usage: python tools/extract_recipes.py [docs_json] [output_file]
"""

import json
import re
import sys
from pathlib import Path

DEFAULT_DOCS = Path(
    "C:/Program Files (x86)/Steam/steamapps/common/Satisfactory/CommunityResources/Docs/en-US.json"
)
DEFAULT_OUT = Path("data/recipes.json")

ITEM_GROUPS = {
    "FGItemDescriptor",
    "FGResourceDescriptor",
    "FGItemDescriptorBiomass",
    "FGItemDescriptorNuclearFuel",
    "FGItemDescriptorPowerBoosterFuel",
    "FGPowerShardDescriptor",
    "FGConsumableDescriptor",
    "FGAmmoTypeProjectile",
    "FGAmmoTypeSpreadshot",
    "FGAmmoTypeInstantHit",
    "FGEquipmentDescriptor",
}
MACHINE_GROUPS = {"FGBuildableManufacturer", "FGBuildableManufacturerVariablePower"}

AMOUNT = re.compile(r"\.(\w+_C)'\"?,Amount=(\d+)")
PRODUCED_IN = re.compile(r"\.(Build_\w+_C)\"")


def load(path):
    raw = path.read_bytes()
    for encoding in ("utf-16", "utf-8-sig"):
        try:
            return json.loads(raw.decode(encoding))
        except (UnicodeDecodeError, json.JSONDecodeError):
            continue
    raise ValueError(f"cannot decode {path}")


def readable(class_name):
    """Desc_IronPlateReinforced_C -> Iron Plate Reinforced."""
    core = re.sub(r"^(Desc|Build|Recipe|BP)_|_C$", "", class_name)
    core = core.replace("Alternate_", "").replace("_", " ")
    return re.sub(r"(?<=[a-z])(?=[A-Z0-9])", " ", core).strip()


def main():
    docs = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_DOCS
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_OUT
    groups = {}
    for group in load(docs):
        native = group["NativeClass"].split(".")[-1].rstrip("'")
        groups.setdefault(native, []).extend(group["Classes"])

    items = {}
    for native in ITEM_GROUPS:
        for c in groups.get(native, []):
            form = {"RF_SOLID": "solid", "RF_LIQUID": "liquid", "RF_GAS": "gas"}.get(c.get("mForm"), "other")
            items[c["ClassName"]] = {
                "name": readable(c["ClassName"]),
                "form": form,
                "resource": native == "FGResourceDescriptor",
            }

    machines = {}
    for native in MACHINE_GROUPS:
        for c in groups.get(native, []):
            machines[c["ClassName"]] = {
                "name": readable(c["ClassName"]),
                "powerMW": float(c["mPowerConsumption"]),
                "powerExponent": float(c["mPowerConsumptionExponent"]),
                "variablePower": native == "FGBuildableManufacturerVariablePower",
            }

    def amounts(text):
        result = {}
        for item, amount in AMOUNT.findall(text):
            if item not in items:
                return None  # not a production item (e.g. buildings, customization)
            value = int(amount)
            result[item] = value / 1000 if items[item]["form"] in ("liquid", "gas") else value
        return result

    recipes = {}
    for c in groups["FGRecipe"]:
        produced_in = [m for m in PRODUCED_IN.findall(c.get("mProducedIn", "")) if m in machines]
        if not produced_in:
            continue
        inputs, outputs = amounts(c["mIngredients"]), amounts(c["mProduct"])
        if inputs is None or outputs is None:
            continue
        recipe = {
            "name": readable(c["ClassName"]),
            "alternate": c["ClassName"].startswith("Recipe_Alternate_"),
            "machine": produced_in[0],
            "durationS": float(c["mManufactoringDuration"]),
            "in": inputs,
            "out": outputs,
        }
        if machines[produced_in[0]]["variablePower"]:
            constant = float(c["mVariablePowerConsumptionConstant"])
            factor = float(c["mVariablePowerConsumptionFactor"])
            recipe["powerMW"] = {"min": constant, "max": constant + factor}
        recipes[c["ClassName"]] = recipe

    used = {i for r in recipes.values() for side in ("in", "out") for i in r[side]}
    data = {
        "source": "Docs.json (CommunityResources), Spielversion 1.2.4.1",
        "items": {k: v for k, v in sorted(items.items()) if k in used},
        "machines": dict(sorted(machines.items())),
        "recipes": dict(sorted(recipes.items())),
    }
    out.write_text(json.dumps(data, indent=1) + "\n", encoding="utf-8", newline="\n")
    print(f"{len(data['items'])} items, {len(machines)} machines, {len(recipes)} recipes -> {out}")


if __name__ == "__main__":
    main()
