/* Assemble static pages from templates/head.html + templates/foot.html + pages/*.html.
   Run locally with `node build.js` and commit the generated <slug>/index.html files;
   Vercel serves them as plain static files, no build step needed on their end. */

const fs = require('fs');
const path = require('path');

const root = __dirname;
const head = fs.readFileSync(path.join(root, 'templates/head.html'), 'utf8');
const foot = fs.readFileSync(path.join(root, 'templates/foot.html'), 'utf8');
const pagesDir = path.join(root, 'pages');

for (const file of fs.readdirSync(pagesDir)) {
  if (!file.endsWith('.html')) continue;
  const raw = fs.readFileSync(path.join(pagesDir, file), 'utf8');

  const titleMatch = raw.match(/^TITLE:\s*(.+)$/m);
  const descMatch = raw.match(/^DESCRIPTION:\s*(.+)$/m);
  if (!titleMatch || !descMatch) {
    throw new Error(file + ' is missing a TITLE: or DESCRIPTION: header line');
  }
  const content = raw.slice(raw.indexOf('\n\n') + 2);

  const slug = file.replace(/\.html$/, '');
  const outDir = path.join(root, slug);
  const outPath = path.join(outDir, 'index.html');

  const page = head
    .replaceAll('{{TITLE}}', titleMatch[1])
    .replaceAll('{{DESCRIPTION}}', descMatch[1])
    .replaceAll('{{PATH}}', '/' + slug + '/') +
    content +
    foot;

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, page);
  console.log('built', slug + '/index.html');
}
