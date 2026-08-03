/* build.js — يدمج التطبيق في ملف واحد (بوردنق-تطبيق-واحد.html)
   الاستخدام: node build.js  [مسار إخراج نسخة الأرتِفاكت اختياري] */
const fs = require('fs');
const rd = (p) => fs.readFileSync(p, 'utf8');

const css = rd('css/styles.css');
let icons = rd('js/icons.js'), countries = rd('js/countries.js'),
    airports = rd('js/airports.js'),
    store = rd('js/store.js'), settle = rd('js/settle.js'),
    syncMod = rd('js/sync.js'), app = rd('js/app.js');

const collect = (src) => {
  const names = [];
  src.replace(/export\s+(?:async\s+)?function\s+(\w+)/g, (_, n) => (names.push(n), _));
  src.replace(/export\s+const\s+(\w+)/g, (_, n) => (names.push(n), _));
  return names;
};
const storeExports = collect(store);
const syncExports = collect(syncMod);

const strip = (s) => s.replace(/^\s*export\s+/gm, '');
icons = strip(icons); countries = strip(countries); airports = strip(airports);
settle = strip(settle); store = strip(store); syncMod = strip(syncMod);
app = app.replace(/^import[^\n]*\n/gm, '').replace(/if \('serviceWorker'[\s\S]*$/m, '');

const combined = [
  '/* icons */', icons,
  '/* countries */', countries,
  '/* airports */', airports,
  '/* store */', store, `\nconst db = { ${storeExports.join(', ')} };\n`,
  '/* settle */', settle,
  '/* sync */', syncMod, `\nconst sync = { ${syncExports.join(', ')} };\n`,
  '/* app */', app,
].join('\n');

const bodyMarkup = `
  <header class="app-header" id="appHeader">
    <div class="container header-inner">
      <button class="brand" id="brandBtn" aria-label="الرئيسية">
        <span class="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 3 2 10.5l7 2.5m13-10-9 18-4-8m13-10-9 8"></path></svg>
        </span><span class="brand-name">بوردنق</span>
      </button>
      <div class="header-actions" id="headerActions"></div>
    </div>
  </header>
  <main class="container app-main" id="view"></main>
  <div class="modal-root" id="modalRoot" aria-hidden="true"></div>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>`;

const head = `<title>بوردنق — مصاريف السفر والقطّات</title>
<meta name="theme-color" content="#0e4d54">
<style>
${css}
</style>`;

const artifact = `${head}
${bodyMarkup}
<script>
${combined}
</` + `script>`;

const standalone = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
${head}
</head>
<body>
${bodyMarkup}
<script>
${combined}
</` + `script>
</body>
</html>`;

fs.writeFileSync('بوردنق-تطبيق-واحد.html', standalone);
if (process.argv[2]) fs.writeFileSync(process.argv[2], artifact);
console.log('built ✓  store:', storeExports.length, 'sync:', syncExports.length);
