# Project notes

Planner and blueprint layout generator for Satisfactory. Read `docs/concept.md` before designing or changing the planner or generator.

- Line endings: LF everywhere.
- No code copied from other Satisfactory projects unless their license allows it. Use unlicensed projects only as references for game mechanics and write our own implementation.
- Game rules (sizes, rates, clearances, port positions) are documented with their source. Values marked *(prüfen)* in the docs are unverified; verify before relying on them.
- Blueprint file export is optional. The generator's output must be buildable by hand.
- Tech stack: static website on GitHub Pages, TypeScript + Vite, everything runs in the browser (no server). Deployed by a GitHub Actions workflow on push to `main`. Tests with Vitest. Planner and generator are plain TypeScript without UI dependencies; UI framework (small, e.g. Svelte or Preact) is chosen when the UI starts.
- Libraries: LP solver in the browser (`highs-js` or `javascript-lp-solver`, check license first); blueprint files via `@etothepii/satisfactory-file-parser` (MIT).
- Game data ships as JSON in the repo, generated offline by the Python scripts in `tools/` from `Docs.json` and FModel exports. Publish only facts the planner needs (recipes, rates, dimensions), no game texts, icons or assets.
