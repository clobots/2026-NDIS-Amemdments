/* ============================================================================
   NDIS 2026 Amendments — Legislation Comparison Tool
   Live-iframe shell: the left panel embeds the Bill from ParlInfo; the right
   panel embeds the NDIS Act 2013 from the Federal Register, tabbed between the
   pre-amendment (Original) and post-amendment (Proposed) compilations.

   This file handles only: tab switching, lazy-loading the Proposed iframe,
   per-frame loading overlays, and the light/dark theme toggle.

   NOTE: the panels are live cross-origin iframes, so the page cannot reach
   inside them — no DOM injection, highlighting or scroll-sync is possible
   here. The re-rendered "annotated" engine and its data (data/*.json, the
   1,276 plain-English translations) are retained in the repo for the separate
   interactions workstream; see NOTES.md.
   ========================================================================== */
(function () {
  'use strict';

  /* ---- elements -------------------------------------------------------- */
  var themeToggle   = document.getElementById('theme-toggle');
  var tabOriginal   = document.getElementById('tab-original');
  var tabProposed   = document.getElementById('tab-proposed');
  var panelOriginal = document.getElementById('panel-original');
  var panelProposed = document.getElementById('panel-proposed');
  var actPop        = document.getElementById('act-pop');
  var propFrame     = document.getElementById('prop-frame');

  var ACT_URL = {
    original: 'https://www.legislation.gov.au/C2013A00020/2024-10-03',
    proposed: 'https://www.legislation.gov.au/C2013A00020/2026-05-06'
  };

  /* ---- per-frame loading overlays -------------------------------------- */
  // each iframe clears its overlay on `load`; a long fallback covers the case
  // where a cross-origin frame never fires a load event we can see.
  [['bill-frame', 'bill-loading'],
   ['orig-frame', 'orig-loading'],
   ['prop-frame', 'prop-loading']].forEach(function (pair) {
    var frame = document.getElementById(pair[0]);
    var overlay = document.getElementById(pair[1]);
    if (!frame || !overlay) return;
    function clear() { overlay.classList.add('is-hidden'); }
    frame.addEventListener('load', clear);
    setTimeout(clear, 12000);
  });

  /* ---- tabs ------------------------------------------------------------ */
  var proposedLoaded = false;

  function switchTab(version) {
    var isOrig = version === 'original';

    tabOriginal.classList.toggle('is-active', isOrig);
    tabProposed.classList.toggle('is-active', !isOrig);
    tabOriginal.setAttribute('aria-selected', String(isOrig));
    tabProposed.setAttribute('aria-selected', String(!isOrig));

    panelOriginal.classList.toggle('is-active', isOrig);
    panelProposed.classList.toggle('is-active', !isOrig);
    panelOriginal.hidden = !isOrig;
    panelProposed.hidden = isOrig;

    // lazy-load the Proposed iframe the first time its tab is opened
    if (!isOrig && !proposedLoaded) {
      propFrame.src = propFrame.getAttribute('data-src');
      proposedLoaded = true;
    }

    // keep the "open on Federal Register" link pointed at the visible version
    actPop.href = ACT_URL[version];
  }

  tabOriginal.addEventListener('click', function () { switchTab('original'); });
  tabProposed.addEventListener('click', function () { switchTab('proposed'); });

  document.querySelector('.tabs').addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    var next = tabOriginal.classList.contains('is-active') ? 'proposed' : 'original';
    switchTab(next);
    (next === 'original' ? tabOriginal : tabProposed).focus();
  });

  /* ---- theme ----------------------------------------------------------- */
  themeToggle.addEventListener('click', function () {
    var next = document.documentElement.getAttribute('data-theme') === 'dark'
      ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('ndis-theme', next); } catch (e) {}
  });

  /* colour transitions only after first paint, to avoid a theme flash */
  requestAnimationFrame(function () { document.body.classList.add('theme-ready'); });
})();
