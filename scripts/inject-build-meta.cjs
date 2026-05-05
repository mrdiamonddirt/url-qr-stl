// This script injects a build timestamp and commit SHA into dist/index.html after Vite build.
// Use as scripts/inject-build-meta.cjs for CommonJS compatibility with "type": "module" in package.json.

const fs = require('fs');
const path = require('path');

const distIndex = path.join(__dirname, '../dist/index.html');
const dist404 = path.join(__dirname, '../dist/404.html');

const sha = process.env.GITHUB_SHA || '';
const date = new Date().toISOString();

function injectMeta(file) {
  if (!fs.existsSync(file)) return;
  let html = fs.readFileSync(file, 'utf8');
  html = html.replace(
    /<head>/i,
    `<head>\n    <!-- Build: ${date} SHA: ${sha} -->\n    <meta name="build-timestamp" content="${date}">\n    <meta name="build-sha" content="${sha}">`
  );
  fs.writeFileSync(file, html, 'utf8');
  console.log(`Injected build meta into ${file}`);
}

injectMeta(distIndex);
injectMeta(dist404);
