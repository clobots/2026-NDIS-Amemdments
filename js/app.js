/* ============================================================================
   NDIS 2026 Amendments — Legislation Comparison Tool
   Left = an interactive side-rail (all 96 bill items, from data/bill.json,
   grouped by Schedule / Part / Division). Right = the live NDIS Act 2013
   embedded from legislation.gov.au's epub document HTML (anchored), tabbed
   between the pre-amendment (Original) and post-amendment (Proposed)
   compilations.

   Click a rail item -> the visible Act tab navigates to that item's target
   section via a #_Toc<id> deep-link (mapping in data/anchors.json). Items
   that insert a NEW section auto-switch to the Proposed tab.

   The iframes are cross-origin and cannot be reached into. The side-rail
   drives them by re-setting iframe.src to <epub-html>#<anchor>, which the
   browser handles as a same-document navigation (a brief flash; cached after
   first load).
   ========================================================================== */
(function () {
  'use strict';

  /* ---- constants ------------------------------------------------------- */
  var ACT_BASE = {
    original: 'https://www.legislation.gov.au/C2013A00020/2024-10-03/2024-10-03/text/original/epub/OEBPS/document_1/document_1.html',
    proposed: 'https://www.legislation.gov.au/C2013A00020/2026-05-06/2026-05-06/text/original/epub/OEBPS/document_1/document_1.html'
  };
  var ACT_LANDING = {
    original: 'https://www.legislation.gov.au/C2013A00020/2024-10-03',
    proposed: 'https://www.legislation.gov.au/C2013A00020/2026-05-06'
  };
  var ACT_META = {
    original: 'compilation 3 Oct 2024 (pre-amendment)',
    proposed: 'compilation 6 May 2026 (amendments in force)'
  };

  /* ---- elements -------------------------------------------------------- */
  var railBody     = document.getElementById('rail-body');
  var railFoot     = document.getElementById('rail-foot');
  var railLabel    = document.getElementById('rail-active-label');
  var origFrame    = document.getElementById('orig-frame');
  var propFrame    = document.getElementById('prop-frame');
  var origLoading  = document.getElementById('orig-loading');
  var propLoading  = document.getElementById('prop-loading');
  var tabOriginal  = document.getElementById('tab-original');
  var tabProposed  = document.getElementById('tab-proposed');
  var panelOrig    = document.getElementById('panel-original');
  var panelProp    = document.getElementById('panel-proposed');
  var actMeta      = document.getElementById('act-meta');
  var actPop       = document.getElementById('act-pop');
  var themeToggle  = document.getElementById('theme-toggle');

  /* ---- state ----------------------------------------------------------- */
  var anchors = { original: {}, proposed: {} };
  var billItems = {};                                 // id -> item node
  var state = {
    activeTab: 'original',
    pendingSection: { original: null, proposed: null },
    currentSection: { original: null, proposed: null },
    activeItemId: null
  };

  /* ---- DOM helpers ----------------------------------------------------- */
  function el(tag, className, text) {
    var e = document.createElement(tag);
    if (className) e.className = className;
    if (text != null) e.textContent = text;
    return e;
  }
  function txt(s) { return document.createTextNode(s); }

  function fetchJson(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error(url + ' (' + r.status + ')');
      return r.json();
    });
  }

  /* ---- per-frame loading overlay --------------------------------------- */
  function setLoading(tab, on) {
    var overlay = tab === 'original' ? origLoading : propLoading;
    if (!overlay) return;
    if (on) overlay.classList.remove('is-hidden');
    else overlay.classList.add('is-hidden');
  }
  [['orig-frame', 'orig-loading'],
   ['prop-frame', 'prop-loading']].forEach(function (pair) {
    var f = document.getElementById(pair[0]), o = document.getElementById(pair[1]);
    if (!f || !o) return;
    f.addEventListener('load', function () { o.classList.add('is-hidden'); });
    // safety: never leave the overlay stuck
    setTimeout(function () { o.classList.add('is-hidden'); }, 15000);
  });

  /* ---- side-rail render ------------------------------------------------ */
  function renderRail(bill) {
    var frag = document.createDocumentFragment();
    bill.nodes.forEach(function (n) {
      if (n.type === 'schedule') {
        var h = el('div', 'rail-schedule');
        h.appendChild(el('span', 'rail-schedule-num', 'Schedule ' + n.num));
        h.appendChild(txt(' — ' + n.title));
        frag.appendChild(h);
      } else if (n.type === 'part') {
        frag.appendChild(el('div', 'rail-part', 'Part ' + n.num + ' — ' + n.title));
      } else if (n.type === 'division') {
        frag.appendChild(el('div', 'rail-division', 'Division ' + n.num + ' — ' + n.title));
      } else if (n.type === 'bill-section') {
        // the bill's own ss 1-3 (Short title / Commencement / Schedules)
        var bs = el('div', 'rail-bill-section');
        bs.appendChild(el('span', 'rail-bill-section-num', n.num));
        bs.appendChild(el('span', 'rail-bill-section-head', n.heading));
        frag.appendChild(bs);
      } else if (n.type === 'item') {
        frag.appendChild(renderRailItem(n));
      }
    });
    return frag;
  }

  function renderRailItem(n) {
    var t = n.target || {};
    var btn = el('button', 'rail-item');
    btn.type = 'button';
    btn.setAttribute('data-item', n.id);

    var kind = t.kind || 'amend';
    var legendKind = ({ 'insert-section': 'insert' })[kind] || kind;
    btn.setAttribute('data-kind', legendKind);

    var isInsert = kind === 'insert-section' && t.newSections && t.newSections.length;
    var isRelated = !t.section && !isInsert && t.relatedSection;
    if (isInsert) btn.setAttribute('data-new', '1');
    if (isRelated) btn.setAttribute('data-related', '1');

    btn.appendChild(el('span', 'rail-item-dot'));
    btn.appendChild(el('span', 'rail-item-num', n.num));
    btn.appendChild(el('span', 'rail-item-desc', n.descriptor));

    var arrow = el('span', 'rail-item-arrow');
    if (isInsert)              arrow.textContent = '→ new s' + t.newSections[0];
    else if (t.section)        arrow.textContent = '→ s' + t.section;
    else if (t.relatedSection) arrow.textContent = '→ s' + t.relatedSection + ' ~';
    else                       arrow.textContent = '· structural';
    btn.appendChild(arrow);

    return btn;
  }

  /* ---- navigation ------------------------------------------------------ */
  function applyPending(tab) {
    var p = state.pendingSection[tab];
    var c = state.currentSection[tab];
    var frame = tab === 'original' ? origFrame : propFrame;
    var anchor = p ? (anchors[tab] && anchors[tab][p]) : null;
    var url = ACT_BASE[tab] + (anchor ? '#' + anchor : '');
    if (frame.getAttribute('src') === url) return;
    if (p === c && c !== null && frame.getAttribute('src')) return;
    frame.src = url;
    state.currentSection[tab] = p;
    setLoading(tab, true);
  }

  function gotoSection(tab, sectionNum) {
    state.pendingSection[tab] = sectionNum;
    if (tab === state.activeTab) applyPending(tab);
  }

  function onRailItemClick(btn) {
    var item = billItems[btn.getAttribute('data-item')];
    if (!item) return;
    var t = item.target || {};

    // highlight active
    if (state.activeItemId) {
      var prev = document.querySelector('.rail-item.is-active');
      if (prev) prev.classList.remove('is-active');
    }
    btn.classList.add('is-active');
    state.activeItemId = item.id;
    railFoot.hidden = false;

    // Items that INSERT a new section: jump to the new section in Proposed.
    // (If the item also touches an existing section, set Original's pending
    // anchor too — switching tabs then lands on that.)
    var isInsert = t.kind === 'insert-section' && t.newSections && t.newSections.length;
    if (isInsert && anchors.proposed[t.newSections[0]]) {
      if (t.section && anchors.original[t.section]) gotoSection('original', t.section);
      if (state.activeTab !== 'proposed') switchTab('proposed');
      gotoSection('proposed', t.newSections[0]);
      labelFoot('Item ' + item.num, '→ new s' + t.newSections[0] + ' (Proposed)');
    } else if (t.section &&
               (anchors.original[t.section] || anchors.proposed[t.section])) {
      if (anchors.original[t.section]) gotoSection('original', t.section);
      if (anchors.proposed[t.section]) gotoSection('proposed', t.section);
      labelFoot('Item ' + item.num, '→ s' + t.section);
    } else if (t.relatedSection &&
               (anchors.original[t.relatedSection] || anchors.proposed[t.relatedSection])) {
      if (anchors.original[t.relatedSection]) gotoSection('original', t.relatedSection);
      if (anchors.proposed[t.relatedSection]) gotoSection('proposed', t.relatedSection);
      labelFoot('Item ' + item.num, '→ s' + t.relatedSection + ' (related)');
    } else {
      labelFoot('Item ' + item.num, '· structural — no specific section');
    }
  }

  function labelFoot(prefix, suffix) {
    while (railLabel.firstChild) railLabel.removeChild(railLabel.firstChild);
    var a = el('strong', null, prefix);
    railLabel.appendChild(a);
    railLabel.appendChild(txt(' ' + suffix));
  }

  /* ---- tabs ------------------------------------------------------------ */
  function switchTab(version) {
    if (version === state.activeTab) {
      applyPending(version);
      return;
    }
    state.activeTab = version;
    var isOrig = version === 'original';

    tabOriginal.classList.toggle('is-active', isOrig);
    tabProposed.classList.toggle('is-active', !isOrig);
    tabOriginal.setAttribute('aria-selected', String(isOrig));
    tabProposed.setAttribute('aria-selected', String(!isOrig));

    panelOrig.classList.toggle('is-active', isOrig);
    panelProp.classList.toggle('is-active', !isOrig);
    panelOrig.hidden = !isOrig;
    panelProp.hidden = isOrig;

    actMeta.textContent = ACT_META[version];
    actPop.href = ACT_LANDING[version];

    // ensure lazy-loaded frame has a src (will pick up pending anchor too)
    if (version === 'proposed' && !propFrame.getAttribute('src')) {
      propFrame.src = ACT_BASE.proposed;
    }
    applyPending(version);
  }

  /* ---- events ---------------------------------------------------------- */
  function wireEvents() {
    themeToggle.addEventListener('click', function () {
      var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('ndis-theme', next); } catch (e) {}
    });

    tabOriginal.addEventListener('click', function () { switchTab('original'); });
    tabProposed.addEventListener('click', function () { switchTab('proposed'); });
    document.querySelector('.tabs').addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      var next = state.activeTab === 'original' ? 'proposed' : 'original';
      switchTab(next);
      (next === 'original' ? tabOriginal : tabProposed).focus();
    });

    railBody.addEventListener('click', function (e) {
      var btn = e.target.closest('.rail-item');
      if (btn) onRailItemClick(btn);
    });
  }

  /* ---- init ------------------------------------------------------------ */
  Promise.all([
    fetchJson('data/bill.json'),
    fetchJson('data/anchors.json')
  ]).then(function (res) {
    var bill = res[0], anc = res[1];
    anchors.original = anc.original || {};
    anchors.proposed = anc.proposed || {};
    bill.nodes.forEach(function (n) { if (n.type === 'item') billItems[n.id] = n; });

    while (railBody.firstChild) railBody.removeChild(railBody.firstChild);
    railBody.appendChild(renderRail(bill));

    wireEvents();
    requestAnimationFrame(function () { document.body.classList.add('theme-ready'); });
  }).catch(function (err) {
    while (railBody.firstChild) railBody.removeChild(railBody.firstChild);
    railBody.appendChild(el('div', 'rail-error',
      'Could not load the bill index — ' + err.message +
      '. Serve the folder over HTTP (python3 -m http.server).'));
    console.error(err);
  });
})();
