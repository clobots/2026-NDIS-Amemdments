/* Headless render + interaction smoke test for the comparison tool.
   Loads index.html into jsdom, stubs fetch with the local data files, runs the
   real js/app.js, then asserts the documents rendered and the core
   interactions (tab switch, hover-link jump, highlight, theme toggle) work.

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
  // runScripts:'dangerously' lets us execute app.js via an injected <script>;
  // the page's own <script src> tags are not fetched (no resources:'usable'),
  // so the engine only runs once, after our stubs are in place.
  const dom = new JSDOM(read('index.html'), {
    url: 'http://localhost/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,            // provides requestAnimationFrame
  });
  const { window } = dom;
  const { document } = window;

  // ---- stubs the engine expects from a real browser ----
  window.fetch = (url) => {
    const file = path.join(ROOT, url);
    const exists = fs.existsSync(file);
    return Promise.resolve({
      ok: exists,
      status: exists ? 200 : 404,
      json: () => Promise.resolve(JSON.parse(fs.readFileSync(file, 'utf8'))),
    });
  };
  window.Element.prototype.scrollIntoView = function () {};
  if (!window.matchMedia) window.matchMedia = () => ({ matches: false });

  // ---- run the real engine ----
  const script = document.createElement('script');
  script.textContent = read('js/app.js');
  document.body.appendChild(script);
  await new Promise((r) => setTimeout(r, 400));   // let the async init() settle

  console.log('\nrender:');
  const billBody = document.getElementById('bill-body');
  const pOrig = document.getElementById('panel-original');
  const pProp = document.getElementById('panel-proposed');

  check('loading overlay hidden after init',
    document.getElementById('app-loading').classList.contains('is-hidden'));
  check('bill panel rendered a doc title',
    !!billBody.querySelector('.doc-title'));

  const items = billBody.querySelectorAll('.item');
  check('bill rendered 116 items', items.length === 116, 'got ' + items.length);

  check('original tab rendered 324 sections',
    pOrig.querySelectorAll('.section').length === 324,
    'got ' + pOrig.querySelectorAll('.section').length);
  check('proposed tab rendered 338 sections',
    pProp.querySelectorAll('.section').length === 338,
    'got ' + pProp.querySelectorAll('.section').length);
  check('proposed tab marks new sections',
    pProp.querySelectorAll('.section.is-new').length > 5);
  check('every item carries a data-kind',
    [...items].every((i) => i.getAttribute('data-kind')));
  check('section 73B exists in both tabs',
    !!document.getElementById('orig-s73B') && !!document.getElementById('prop-s73B'));

  console.log('\ninteractions:');
  // hover-link jump: click item 33's jump button (targets s73B in original)
  const item33 = [...items].find(
    (i) => i.querySelector('.item-num').textContent === '33');
  const jump = item33 && item33.querySelector('.item-jump[data-section="73B"]');
  check('item 33 has a jump button to s73B', !!jump);
  if (jump) {
    jump.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    check('jump marked s73B as target',
      document.getElementById('orig-s73B').classList.contains('is-target'));
    check('jump marked item 33 active', item33.classList.contains('is-active'));
  }

  // tab switch
  document.getElementById('tab-proposed').dispatchEvent(
    new window.MouseEvent('click', { bubbles: true }));
  check('tab switch activates proposed panel',
    pProp.classList.contains('is-active') && !pOrig.classList.contains('is-active'));
  document.getElementById('tab-original').dispatchEvent(
    new window.MouseEvent('click', { bubbles: true }));

  // theme toggle
  const before = document.documentElement.getAttribute('data-theme');
  document.getElementById('theme-toggle').dispatchEvent(
    new window.MouseEvent('click', { bubbles: true }));
  check('theme toggle flips data-theme',
    document.documentElement.getAttribute('data-theme') !== before);

  // yellow highlight: pick a real item whose target section contains its quote
  const bill = JSON.parse(read('data/bill.json'));
  const itemWithQuote = bill.nodes.find((n) =>
    n.type === 'item' && n.target && n.target.section &&
    (n.target.quotes || []).length);
  if (itemWithQuote) {
    const node = document.getElementById(itemWithQuote.id);
    node.querySelector('.item-jump').dispatchEvent(
      new window.MouseEvent('click', { bubbles: true }));
    const sec = document.getElementById('orig-s' + itemWithQuote.target.section);
    const marks = sec ? sec.querySelectorAll('mark.match').length : 0;
    check('quote highlight applied in target section (item ' + itemWithQuote.num + ')',
      marks > 0, marks + ' marks');
  } else {
    console.log('  --   no item with quotes to test highlight (skipped)');
  }

  // plain-English bubble
  console.log('\nplain-English:');
  document.getElementById('tab-proposed').dispatchEvent(
    new window.MouseEvent('click', { bubbles: true }));
  const peBlocks = pProp.querySelectorAll('.blk.has-pe');
  check('proposed tab marks blocks that carry a translation',
    peBlocks.length > 0, peBlocks.length + ' has-pe blocks');
  if (peBlocks.length) {
    peBlocks[0].dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
    const bub = document.getElementById('pe-bubble');
    check('hovering a translated paragraph shows the plain-English bubble',
      bub.classList.contains('is-visible') &&
      document.getElementById('pe-text').textContent.length > 0);
  }

  console.log('\n' + (failures ? failures + ' FAILURE(S)' : 'all render tests passed'));
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('test crashed:', e); process.exit(1); });
