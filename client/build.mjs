import { build } from 'esbuild';
import { readdir, cp, mkdir, rm } from 'node:fs/promises';
// Only public assets are copied; nested admin/bot projects and SQL stay private.
await rm('dist', {recursive:true, force:true});
await mkdir('dist/js', {recursive:true});
for (const entry of await readdir('.', {withFileTypes:true})) {
  if ((entry.isDirectory() && ['js','css','images','assets'].includes(entry.name)) ||
      (entry.isFile() && /\.(html|png|jpg|svg|ico|glb|xml|txt|json)$/i.test(entry.name) && !['package.json','package-lock.json','vercel.json'].includes(entry.name))) {
    await cp(entry.name, `dist/${entry.name}`, {recursive:true});
  }
}
await build({entryPoints:['react/cabinet.jsx'], outfile:'dist/js/cabinet-app.js', bundle:true, minify:true, format:'esm', target:['es2020'], define:{'process.env.NODE_ENV':'"production"'}});
