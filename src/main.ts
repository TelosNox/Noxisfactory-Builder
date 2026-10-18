import { Parser } from '@etothepii/satisfactory-file-parser';

// Placeholder page: proves the blueprint parser bundles and runs in the browser.
const app = document.querySelector<HTMLElement>('#app')!;
app.innerHTML = `
  <h1>Noxisfactory Builder</h1>
  <p>Blueprint-Test: .sbp und .sbpcfg auswählen.</p>
  <input type="file" id="files" multiple accept=".sbp,.sbpcfg" />
  <pre id="out"></pre>
`;

const out = app.querySelector<HTMLPreElement>('#out')!;
app.querySelector<HTMLInputElement>('#files')!.addEventListener('change', async (event) => {
  const files = [...((event.target as HTMLInputElement).files ?? [])];
  const sbp = files.find((f) => f.name.endsWith('.sbp'));
  const cfg = files.find((f) => f.name.endsWith('.sbpcfg'));
  if (!sbp || !cfg) {
    out.textContent = 'Bitte beide Dateien wählen.';
    return;
  }
  try {
    const name = sbp.name.replace(/\.sbp$/, '');
    const blueprint = Parser.ParseBlueprintFiles(name, await sbp.arrayBuffer(), await cfg.arrayBuffer());
    const classes = blueprint.objects.map((o) => o.typePath.split('.').pop());
    out.textContent = `${blueprint.objects.length} Objekte\n` + [...new Set(classes)].join('\n');
  } catch (error) {
    out.textContent = String(error);
  }
});
