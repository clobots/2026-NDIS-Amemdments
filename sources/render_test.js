/* Headless smoke test for the live-iframe shell.
   Loads index.html into jsdom, runs the real js/app.js, and asserts the shell
   structure and interactions (tab switch, lazy-load, theme toggle) work.
   It does NOT load the cross-origin iframe content — that only happens in a
   real browser — it checks the wiring around the frames.

   Run:  node sources/render_test.js      (needs: npm install --no-save jsdom)
   Exit: 0 = pass, 1 = fail.
*/
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let failures = 0;
function check(label, cond, detail) {
  if (cond) { console.log('  ok   ' + label); }
  else { failures++; console.log('  FAIL ' + label + (detail ? '  — ' + detail : '')); }
}

(async function () {
  const dom = new JSDOM(read('index.html'), {
    url: 'http://localhost/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    resources: undefined,            // do NOT fetch the iframe sources
  });
  const { window } = dom;
  const { document } = window;
  if (!window.matchMedia) window.matchMedia = () => ({ matches: false });

  const script = document.createElement('script');
  script.textContent = read('js/app.js');
  document.body.appendChild(script);
  await new Promise((r) => setTimeout(r, 100));

  console.log('\nstructure:');
  const billFrame = document.getElementById('bill-frame');
  const origFrame = document.getElementById('orig-frame');
  const propFrame = document.getElementById('prop-frame');

  check('left pane embeds the Bill from parlinfo.aph.gov.au',
    !!billFrame && /parlinfo\.aph\.gov\.au/.test(billFrame.getAttribute('src')));
  check('Original tab embeds the 2024-10-03 NDIS Act compilation',
    !!origFrame && /legislation\.gov\.au\/C2013A00020\/2024-10-03/.test(origFrame.getAttribute('src')));
  check('Proposed iframe holds its URL in data-src (lazy), src not yet set',
    !!propFrame && !propFrame.getAttribute('src') &&
    /legislation\.gov\.au\/C2013A00020\/2026-05-06/.test(propFrame.getAttribute('data-src')));
  check('both tabs present', !!document.getElementById('tab-original') &&
    !!document.getElementById('tab-proposed'));
  check('each frame has a loading overlay',
    !!document.getElementById('bill-loading') &&
    !!document.getElementById('orig-loading') &&
    !!document.getElementById('prop-loading'));

  console.log('\ninteractions:');
  // tab switch -> proposed
  document.getElementById('tab-proposed').dispatchEvent(
    new window.MouseEvent('click', { bubbles: true }));
  check('switching to Proposed activates its panel',
    document.getElementById('panel-proposed').classList.contains('is-active') &&
    !document.getElementById('panel-original').classList.contains('is-active'));
  check('switching to Proposed lazy-loads its iframe src',
    propFrame.getAttribute('src') === propFrame.getAttribute('data-src'));
  check('"open on Federal Register" link follows the active tab',
    /2026-05-06/.test(document.getElementById('act-pop').getAttribute('href')));

  // tab switch back -> original
  document.getElementById('tab-original').dispatchEvent(
    new window.MouseEvent('click', { bubbles: true }));
  check('switching back activates the Original panel',
    document.getElementById('panel-original').classList.contains('is-active'));

  // theme toggle
  const before = document.documentElement.getAttribute('data-theme');
  document.getElementById('theme-toggle').dispatchEvent(
    new window.MouseEvent('click', { bubbles: true }));
  check('theme toggle flips data-theme',
    document.documentElement.getAttribute('data-theme') !== before);

  console.log('\n' + (failures ? failures + ' FAILURE(S)' : 'all shell tests passed'));
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('test crashed:', e); process.exit(1); });
