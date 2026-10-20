import { readFile, writeFile, mkdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const packageRoot = new URL('node_modules/@supabase/supabase-js/', root);
const appPackage = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const sdkPackage = JSON.parse(await readFile(new URL('package.json', packageRoot), 'utf8'));
const pinned = appPackage.dependencies?.['@supabase/supabase-js'];
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(pinned || '') || sdkPackage.version !== pinned) {
  throw new Error('Instale a versão exata de @supabase/supabase-js fixada em package.json com npm ci.');
}
const source = await readFile(new URL('dist/umd/supabase.js', packageRoot), 'utf8');
if (!/^var supabase\s*=/.test(source)) throw new Error('Formato inesperado do bundle Supabase; revise a integração.');
const bridge = '\n// Trespasser: expose the pinned browser bundle when imported as an ES module.\nglobalThis.supabase = supabase;\n';
const destination = new URL('dist/vendor/', root);
await mkdir(destination, { recursive: true });
await writeFile(new URL('supabase.js', destination), source.trimEnd() + bridge);
await writeFile(new URL('supabase-LICENSE.txt', destination), await readFile(new URL('LICENSE', packageRoot)));
console.log(`Supabase ${pinned} copiado para dist/vendor com licença e bridge ES module.`);
