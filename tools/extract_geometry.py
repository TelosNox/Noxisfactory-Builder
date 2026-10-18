"""Extract building geometry from FModel property exports.

Reads every Build_*.json below the export root and writes clearance boxes
and connection ports in meters, relative to the building origin.

Source: FModel "Save Properties (.json)" of the game's Build_*_C classes.
Unreal units are cm; axes are kept as in Unreal (X, Y horizontal, Z up).

Usage: python tools/extract_geometry.py [export_root] [output_file]
"""

import json
import math
import sys
from pathlib import Path

DEFAULT_ROOT = Path("data/raw/fmodel/Output/Exports")
DEFAULT_OUT = Path("data/geometry.json")

CONNECTION_TYPES = {
    "FGFactoryConnectionComponent": "belt",
    "FGPipeConnectionComponent": "pipe",
    "FGPipeConnectionFactory": "pipe",
    "FGPowerConnectionComponent": "power",
}


def m(cm):
    return round(cm / 100.0, 3)


def vec(v):
    return [m(v["X"]), m(v["Y"]), m(v["Z"])]


def rotate(q, p):
    """Rotate point p by quaternion q (x, y, z, w)."""
    x, y, z, w = q
    px, py, pz = p
    # t = 2 * cross(q.xyz, p)
    tx = 2 * (y * pz - z * py)
    ty = 2 * (z * px - x * pz)
    tz = 2 * (x * py - y * px)
    return (
        px + w * tx + (y * tz - z * ty),
        py + w * ty + (z * tx - x * tz),
        pz + w * tz + (x * ty - y * tx),
    )


def clearance_box(entry):
    """Axis-aligned box in building space (cm) of a rotated, translated box."""
    box = entry["ClearanceBox"]
    tf = entry["RelativeTransform"]
    r = tf["Rotation"]
    q = (r["X"], r["Y"], r["Z"], r["W"])
    t = tf["Translation"]
    s = tf.get("Scale3D", {"X": 1, "Y": 1, "Z": 1})
    lo, hi = box["Min"], box["Max"]
    corners = []
    for cx in (lo["X"], hi["X"]):
        for cy in (lo["Y"], hi["Y"]):
            for cz in (lo["Z"], hi["Z"]):
                p = rotate(q, (cx * s["X"], cy * s["Y"], cz * s["Z"]))
                corners.append((p[0] + t["X"], p[1] + t["Y"], p[2] + t["Z"]))
    rotated = abs(abs(r["W"]) - 1) > 1e-6
    return {
        "type": entry["Type"].split("::")[-1],
        "min": [m(min(c[i] for c in corners)) for i in range(3)],
        "max": [m(max(c[i] for c in corners)) for i in range(3)],
        "rotated": rotated,
        "excludeForSnapping": bool(entry.get("ExcludeForSnapping", False)),
    }


def connection(obj):
    p = obj.get("Properties") or {}
    loc = p.get("RelativeLocation", {"X": 0, "Y": 0, "Z": 0})
    rot = p.get("RelativeRotation", {"Pitch": 0, "Yaw": 0, "Roll": 0})
    direction = p.get("mDirection") or p.get("mPipeConnectionType")
    return {
        "name": obj["Name"].removesuffix("_GEN_VARIABLE"),
        "kind": CONNECTION_TYPES[obj["Type"]],
        # Missing direction means the class default (not verified in game).
        "direction": direction.split("::")[-1] if direction else None,
        "position": vec(loc),
        "yaw": round(rot["Yaw"]) % 360,
        "pitch": round(rot["Pitch"]),
    }


def extract(path):
    objects = json.loads(path.read_text(encoding="utf-8"))
    building = {"source": path.as_posix(), "clearance": [], "connections": []}
    for obj in objects:
        name = obj.get("Name", "")
        if name.startswith("Default__"):
            building["class"] = name.removeprefix("Default__")
            props = obj.get("Properties") or {}
            building["clearance"] = [clearance_box(c) for c in props.get("mClearanceData", [])]
        elif obj.get("Type") in CONNECTION_TYPES:
            building["connections"].append(connection(obj))
    building["connections"].sort(key=lambda c: (c["kind"], c["name"]))
    if not building["clearance"]:
        building["warning"] = "no mClearanceData (maybe inherited from a parent class)"
    return building


def main():
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_ROOT
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_OUT
    buildings = {}
    for path in sorted(root.rglob("Build_*.json")):
        b = extract(path)
        rel = path.relative_to(root).as_posix()
        b["source"] = rel
        buildings[b.get("class", path.stem)] = b
        print(f"{path.stem}: {len(b['clearance'])} boxes, {len(b['connections'])} connections"
              + (f"  WARNING: {b['warning']}" if "warning" in b else ""))
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(buildings, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
