/* ============================================================================
   NDIS 2026 Amendments — Legislation Comparison Tool
   Engine: loads the structured JSON, renders the three documents, and wires the
   interactions (tab switching, hover-link jump + scroll-sync, yellow highlight,
   plain-English bubbles, theme toggle).

   The engine is fixed; bill text, the amendment->section mapping and the
   plain-English translations are all data. Partial data renders gracefully.
   All DOM is built with createElement/textContent — never innerHTML — so text
   from the data files can never be interpreted as markup.
   ========================================================================== */
(function () {
  'use strict';

  /* ---- elements -------------------------------------------------------- */
  var loadingEl     = document.getElementById('app-loading');
  var billBody      = document.getElementById('bill-body');
  var actBody       = document.getElementById('act-body');
  var panelOriginal = document.getElementById('panel-original');
  var panelProposed = document.getElementById('panel-proposed');
  var tabOriginal   = document.getElementById('tab-original');
  var tabProposed   = document.getElementById('tab-proposed');
  var actMeta       = document.getElementById('act-meta');
  var themeToggle   = document.getElementById('theme-toggle');
  var bubble        = document.getElementById('pe-bubble');
  var bubbleText    = document.getElementById('pe-text');

  /* ---- state ----------------------------------------------------------- */
  var PE = {};                              // plain-English translations by block id
  var billMap = {};                         // item id -> item node
  var state = {
    activeTab: 'original',
    scroll: { original: 0, proposed: 0 },
    meta: { original: '', proposed: '' },
    highlightSection: null
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

  /* ---- render: bill (left panel) --------------------------------------- */
  function renderBill(bill) {
    var frag = document.createDocumentFragment();
    var m = bill.meta;
    frag.appendChild(el('div', 'doc-title', m.title || ''));
    if (m.no)        frag.appendChild(el('div', 'doc-sub', m.no));
    if (m.longTitle) frag.appendChild(el('div', 'doc-sub', m.longTitle));
    if (m.assent)    frag.appendChild(el('div', 'doc-sub', 'Assented to ' + m.assent));
    frag.appendChild(el('div', 'doc-rule'));

    bill.nodes.forEach(function (n) {
      if (n.type === 'bill-section') {
        var sec = el('div', 'bill-section');
        var head = el('div', 'bs-head');
        head.appendChild(el('span', 'num', n.num));
        head.appendChild(txt(n.heading));
        sec.appendChild(head);
        n.content.forEach(function (b) { sec.appendChild(el('p', null, b.text)); });
        frag.appendChild(sec);
      } else if (n.type === 'schedule') {
        var sh = el('div', 'schedule-head');
        sh.appendChild(el('span', 'num', 'Schedule ' + n.num));
        sh.appendChild(txt(' — ' + n.title));
        frag.appendChild(sh);
      } else if (n.type === 'part') {
        frag.appendChild(el('div', 'part-head', 'Part ' + n.num + ' — ' + n.title));
      } else if (n.type === 'division') {
        frag.appendChild(el('div', 'division-head', 'Division ' + n.num + ' — ' + n.title));
      } else if (n.type === 'act-ref') {
        frag.appendChild(el('div', 'act-ref', n.text));
      } else if (n.type === 'item') {
        frag.appendChild(renderItem(n));
      }
    });
    return frag;
  }

  function renderItem(n) {
    var t = n.target || {}, kind = t.kind || 'amend';
    var item = el('div', 'item');
    item.id = n.id;
    item.setAttribute('data-kind', kind);

    var head = el('div', 'item-head');
    head.appendChild(el('span', 'item-num', n.num));
    head.appendChild(el('span', 'item-descriptor', n.descriptor));
    item.appendChild(head);

    var content = el('div', 'item-content');
    n.content.forEach(function (b) {
      var p;
      if (b.kind === 'Item')                  p = el('p', 'instruction', b.text);
      else if (b.kind === 'head-section')     p = el('p', 'inserted-head section', b.text);
      else if (b.kind === 'head-division')    p = el('p', 'inserted-head division', b.text);
      else if (b.kind === 'head-subdivision') p = el('p', 'inserted-head subdivision', b.text);
      else                                    p = el('p', null, b.text);
      content.appendChild(p);
    });
    item.appendChild(content);
    item.appendChild(renderItemLink(n));
    return item;
  }

  function renderItemLink(n) {
    var t = n.target || {}, link = el('div', 'item-link'), jumps = [];

    function jb(section, version, label) {
      var btn = el('button', 'item-jump');
      btn.setAttribute('data-item', n.id);
      btn.setAttribute('data-section', section);
      btn.setAttribute('data-version', version);
      btn.appendChild(el('span', 'arrow', '→'));
      btn.appendChild(txt(' ' + label));
      return btn;
    }
    if (t.section) jumps.push(jb(t.section, 'original', 's' + t.section + ' in Original'));
    (t.newSections || []).forEach(function (ns) {
      jumps.push(jb(ns, 'proposed', 'new s' + ns + ' in Proposed'));
    });
    if (!t.section && !(t.newSections || []).length && t.relatedSection) {
      jumps.push(jb(t.relatedSection, 'original', 's' + t.relatedSection + ' (related)'));
    }

    if (jumps.length) {
      jumps.forEach(function (j) { link.appendChild(j); });
    } else {
      link.appendChild(el('span', 'no-target',
        'Structural amendment — affects the Act’s framework, not a single section'));
    }
    link.appendChild(el('span', 'spacer'));
    var ext = el('a', 'item-external', 'Official source ↗');
    ext.href = 'https://www.legislation.gov.au/C2026A00041/latest';
    ext.target = '_blank';
    ext.rel = 'noopener';
    link.appendChild(ext);
    return link;
  }

  /* ---- render: NDIS Act (right panel tabs) ----------------------------- */
  function renderAct(act, version, originalSet) {
    var prefix = version === 'original' ? 'orig' : 'prop';
    var frag = document.createDocumentFragment();

    act.nodes.forEach(function (n) {
      if (n.type === 'chapter') {
        var c = el('div', 'chapter-head');
        c.appendChild(el('span', 'head-num', 'Chapter ' + n.num));
        c.appendChild(txt('— ' + n.title));
        frag.appendChild(c);
      } else if (n.type === 'part') {
        var p = el('div', 'act-part-head');
        p.appendChild(el('span', 'head-num', 'Part ' + n.num));
        p.appendChild(txt('— ' + n.title));
        frag.appendChild(p);
      } else if (n.type === 'division') {
        frag.appendChild(el('div', 'act-division-head', 'Division ' + n.num + ' — ' + n.title));
      } else if (n.type === 'subdivision') {
        frag.appendChild(el('div', 'act-subdivision-head', 'Subdivision ' + n.num + ' — ' + n.title));
      } else if (n.type === 'section') {
        var isNew = version === 'proposed' && originalSet && !originalSet.has(n.num);
        var sec = el('div', 'section' + (isNew ? ' is-new' : ''));
        sec.id = prefix + '-s' + n.num;
        sec.setAttribute('data-section', n.num);

        var sh = el('div', 'section-head');
        sh.appendChild(el('span', 'section-num', n.num));
        sh.appendChild(el('span', 'section-heading', n.heading));
        sec.appendChild(sh);

        n.blocks.forEach(function (b) {
          var cls = 'blk blk--' + b.kind + (PE[b.id] ? ' has-pe' : '');
          var bp = el('p', cls, b.text);
          bp.setAttribute('data-pe-id', b.id);
          sec.appendChild(bp);
        });
        frag.appendChild(sec);
      }
    });
    return frag;
  }

  /* ---- tabs ------------------------------------------------------------ */
  function switchTab(version) {
    if (version === state.activeTab) return;
    state.scroll[state.activeTab] = actBody.scrollTop;
    state.activeTab = version;
    var isOrig = version === 'original';

    tabOriginal.classList.toggle('is-active', isOrig);
    tabProposed.classList.toggle('is-active', !isOrig);
    tabOriginal.setAttribute('aria-selected', String(isOrig));
    tabProposed.setAttribute('aria-selected', String(!isOrig));

    panelOriginal.classList.toggle('is-active', isOrig);
    panelProposed.classList.toggle('is-active', !isOrig);
    panelOriginal.hidden = !isOrig;
    panelProposed.hidden = isOrig;

    actMeta.textContent = isOrig ? state.meta.original : state.meta.proposed;
    hideBubble();
    actBody.scrollTop = state.scroll[version] || 0;
  }

  /* ---- theme ----------------------------------------------------------- */
  function toggleTheme() {
    var next = document.documentElement.getAttribute('data-theme') === 'dark'
      ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('ndis-theme', next); } catch (e) {}
  }

  /* ---- jump + yellow highlight ----------------------------------------- */
  function clearHighlights() {
    if (!state.highlightSection) return;
    state.highlightSection.querySelectorAll('.blk, .section-heading').forEach(function (blk) {
      if (blk.querySelector('mark.match')) blk.textContent = blk.textContent;
    });
    state.highlightSection = null;
  }

  function applyHighlights(sectionEl, quotes) {
    if (!quotes || !quotes.length) return;
    var qs = quotes.slice().sort(function (a, b) { return b.length - a.length; });

    // search the section heading too — some items amend only the heading
    sectionEl.querySelectorAll('.blk, .section-heading').forEach(function (blk) {
      var text = blk.textContent, ranges = [];
      qs.forEach(function (q) {
        var idx = text.indexOf(q);
        while (idx !== -1) {
          ranges.push([idx, idx + q.length]);
          idx = text.indexOf(q, idx + q.length);
        }
      });
      if (!ranges.length) return;

      ranges.sort(function (a, b) { return a[0] - b[0]; });
      var merged = [];
      ranges.forEach(function (r) {
        var last = merged[merged.length - 1];
        if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
        else merged.push(r.slice());
      });

      var frag = document.createDocumentFragment(), cursor = 0;
      merged.forEach(function (r) {
        if (r[0] > cursor) frag.appendChild(txt(text.slice(cursor, r[0])));
        frag.appendChild(el('mark', 'match', text.slice(r[0], r[1])));
        cursor = r[1];
      });
      if (cursor < text.length) frag.appendChild(txt(text.slice(cursor)));

      blk.textContent = '';
      blk.appendChild(frag);
    });
  }

  function jumpToSection(sectionNum, version, quotes, sourceItemId) {
    switchTab(version);
    clearHighlights();
    document.querySelectorAll('.section.is-target').forEach(function (s) {
      s.classList.remove('is-target', 'pulse');
    });
    document.querySelectorAll('.item.is-active').forEach(function (i) {
      i.classList.remove('is-active');
    });
    if (sourceItemId) {
      var src = document.getElementById(sourceItemId);
      if (src) src.classList.add('is-active');
    }

    var prefix = version === 'original' ? 'orig' : 'prop';
    var elx = document.getElementById(prefix + '-s' + sectionNum);
    if (!elx) return;

    elx.classList.add('is-target', 'pulse');
    setTimeout(function () { elx.classList.remove('pulse'); }, 1700);
    elx.scrollIntoView({ behavior: 'smooth', block: 'start' });
    applyHighlights(elx, quotes);
    state.highlightSection = elx;
  }

  /* ---- plain-English bubble -------------------------------------------- */
  function showBubble(targetEl, text) {
    bubbleText.textContent = text;
    bubble.classList.remove('below');
    bubble.setAttribute('aria-hidden', 'false');
    bubble.classList.add('is-visible');           // visible so we can measure it

    var r  = targetEl.getBoundingClientRect();
    var bw = bubble.offsetWidth, bh = bubble.offsetHeight;
    var cx = r.left + r.width / 2;
    var left = Math.max(10, Math.min(cx - bw / 2, window.innerWidth - bw - 10));
    var top  = r.top - bh - 11;
    if (top < 72) { top = r.bottom + 11; bubble.classList.add('below'); }

    bubble.style.left = left + 'px';
    bubble.style.top  = top + 'px';
    bubble.style.setProperty('--arrow-x', (cx - left) + 'px');
  }

  function hideBubble() {
    bubble.classList.remove('is-visible');
    bubble.setAttribute('aria-hidden', 'true');
  }

  /* ---- events ---------------------------------------------------------- */
  function wireEvents() {
    themeToggle.addEventListener('click', toggleTheme);

    tabOriginal.addEventListener('click', function () { switchTab('original'); });
    tabProposed.addEventListener('click', function () { switchTab('proposed'); });
    document.querySelector('.tabs').addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        switchTab(state.activeTab === 'original' ? 'proposed' : 'original');
        (state.activeTab === 'original' ? tabOriginal : tabProposed).focus();
      }
    });

    // bill panel: hover-link jump
    billBody.addEventListener('click', function (e) {
      var btn = e.target.closest('.item-jump');
      if (!btn) return;
      var item = billMap[btn.getAttribute('data-item')];
      jumpToSection(
        btn.getAttribute('data-section'),
        btn.getAttribute('data-version'),
        item && item.target ? item.target.quotes : [],
        btn.getAttribute('data-item')
      );
    });

    // act panel: plain-English bubble on paragraph hover
    actBody.addEventListener('mouseover', function (e) {
      var blk = e.target.closest('.blk.has-pe');
      if (!blk || !actBody.contains(blk)) return;
      var t = PE[blk.getAttribute('data-pe-id')];
      if (t) showBubble(blk, t);
    });
    actBody.addEventListener('mouseout', function (e) {
      var blk = e.target.closest('.blk.has-pe');
      if (blk && !blk.contains(e.relatedTarget)) hideBubble();
    });
    actBody.addEventListener('scroll', function () {
      state.scroll[state.activeTab] = actBody.scrollTop;
      hideBubble();
    });
    window.addEventListener('resize', hideBubble);
  }

  /* ---- init ------------------------------------------------------------ */
  function init() {
    Promise.all([
      fetchJson('data/bill.json'),
      fetchJson('data/act-original.json'),
      fetchJson('data/act-proposed.json'),
      fetchJson('data/plain-english.json').catch(function () { return {}; })
    ]).then(function (res) {
      var bill = res[0], actO = res[1], actP = res[2];
      PE = res[3] || {};

      state.meta.original = 'Compilation ' + actO.meta.compilation +
        (actO.meta.no ? ' · ' + actO.meta.no : '');
      state.meta.proposed = 'Compilation ' + actP.meta.compilation +
        (actP.meta.no ? ' · ' + actP.meta.no : '');

      var originalSet = new Set(Object.keys(actO.sectionIndex));

      billBody.appendChild(renderBill(bill));
      panelOriginal.appendChild(renderAct(actO, 'original', null));
      panelProposed.appendChild(renderAct(actP, 'proposed', originalSet));

      bill.nodes.forEach(function (n) { if (n.type === 'item') billMap[n.id] = n; });
      actMeta.textContent = state.meta.original;

      wireEvents();
      loadingEl.classList.add('is-hidden');
      requestAnimationFrame(function () { document.body.classList.add('theme-ready'); });
    }).catch(function (err) {
      loadingEl.textContent = 'Could not load legislation data — ' + err.message +
        '. Serve the folder over HTTP (e.g. python3 -m http.server).';
      console.error(err);
    });
  }

  init();
})();
