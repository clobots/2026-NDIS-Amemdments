/* Headless smoke test for the side-rail + live-iframe shell.

   Loads index.html into jsdom with a stubbed fetch that serves the local
   data/*.json files, runs the real js/app.js, and asserts:
     - the rail renders every bill item
     - clicking an item with target.section sets the Original iframe's src
       to the epub-HTML URL with the right #_Toc anchor
     - clicking an item that inserts a new section switches to Proposed and
       loads the new-section anchor
     - tab switching, lazy-load and theme toggle work

   It does NOT actually load the cross-origin iframe content — that only
   happens in a real browser. It exercises the wiring around the frames.

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
  });
  const { window } = dom;
  const { document } = window;
  if (!window.matchMedia) window.matchMedia = () => ({ matches: false });

  // stub fetch to serve local data files
  window.fetch = (url) => {
    const file = path.join(ROOT, url.replace(/^https?:\/\/[^/]+\//, ''));
    const exists = fs.existsSync(file);
    return Promise.resolve({
      ok: exists,
      status: exists ? 200 : 404,
      json: () => Promise.resolve(JSON.parse(fs.readFileSync(file, 'utf8'))),
    });
  };

  // run the app
  const script = document.createElement('script');
  script.textContent = read('js/app.js');
  document.body.appendChild(script);
  await new Promise((r) => setTimeout(r, 200));

  console.log('\nrender:');
  const railItems = document.querySelectorAll('.rail-item');
  check('rail rendered 116 bill items', railItems.length === 116, 'got ' + railItems.length);

  // schedule / part headings present
  check('rail shows Schedule headings',
    document.querySelectorAll('.rail-schedule').length === 3);
  check('rail shows Part headings (10)',
    document.querySelectorAll('.rail-part').length === 10);

  // iframes
  const origFrame = document.getElementById('orig-frame');
  const propFrame = document.getElementById('prop-frame');
  check('Original iframe points at the epub HTML', !!origFrame &&
    /legislation\.gov\.au\/C2013A00020\/2024-10-03\/.+document_1\.html$/.test(origFrame.getAttribute('src') || ''));
  check('Proposed iframe is lazy (no src yet)',
    !!propFrame && !propFrame.getAttribute('src'));

  // load anchors map for assertions
  const anchors = JSON.parse(read('data/anchors.json'));

  console.log('\nclick on item that amends an existing section (item 33 -> s73B):');
  const findItem = (num) => Array.from(railItems).find(
    (b) => b.querySelector('.rail-item-num').textContent === num);
  const i33 = findItem('33');
  check('item 33 found in rail', !!i33);
  if (i33) {
    i33.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    const want = '#' + anchors.original['73B'];
    check('Original iframe src updated to s73B anchor',
      (origFrame.getAttribute('src') || '').endsWith(want),
      'src=' + (origFrame.getAttribute('src') || '').slice(-40));
    check('item 33 marked active', i33.classList.contains('is-active'));
  }

  console.log('\nclick on item that inserts a new section (Sch 2 item 2 -> new s29A):');
  // find Sch 2 item 2 (the one that inserts s29A)
  const bill = JSON.parse(read('data/bill.json'));
  const s2items = bill.nodes.filter((n) =>
    n.type === 'item' && n.target && n.target.newSections &&
    n.target.newSections.indexOf('29A') !== -1);
  check('found bill item inserting s29A', s2items.length > 0,
    s2items.length + ' candidates');
  if (s2items.length) {
    const node = s2items[0];
    const btn = document.querySelector('.rail-item[data-item="' + node.id + '"]');
    check('rail button for that item exists', !!btn);
    if (btn) {
      btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      const want = '#' + anchors.proposed['29A'];
      check('tab switched to Proposed',
        document.getElementById('panel-proposed').classList.contains('is-active'));
      check('Proposed iframe src loaded with s29A anchor',
        (propFrame.getAttribute('src') || '').endsWith(want),
        'src tail=' + (propFrame.getAttribute('src') || '').slice(-40));
    }
  }

  console.log('\nback to Original tab keeps its remembered section:');
  document.getElementById('tab-original').dispatchEvent(
    new window.MouseEvent('click', { bubbles: true }));
  check('Original panel active again',
    document.getElementById('panel-original').classList.contains('is-active'));

  console.log('\ntheme toggle:');
  const before = document.documentElement.getAttribute('data-theme');
  document.getElementById('theme-toggle').dispatchEvent(
    new window.MouseEvent('click', { bubbles: true }));
  check('theme toggle flips data-theme',
    document.documentElement.getAttribute('data-theme') !== before);

  console.log('\n' + (failures ? failures + ' FAILURE(S)' : 'all shell tests passed'));
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('test crashed:', e); process.exit(1); });
