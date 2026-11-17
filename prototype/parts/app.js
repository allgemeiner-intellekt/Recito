(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const ic = (n, s = 18) => `<svg class="ic" width="${s}" height="${s}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const root = document.documentElement;
  const q = new URLSearchParams(location.search);
  const pick = (k, allowed, d) => (allowed.includes(q.get(k)) ? q.get(k) : d);

  // ---------------------------------------------------------------- mock data
  const PROV = {
    openai: { name: 'OpenAI', blurb: 'Six built-in voices, speed control', speed: true, voices: ['Alloy', 'Echo', 'Fable', 'Onyx', 'Nova', 'Shimmer'].map((n) => ({ n })) },
    mimo: { name: 'Xiaomi MiMo', blurb: 'Chinese and English voices', speed: false, voices: [['冰糖 Bingtang', '中文'], ['茉莉 Moli', '中文'], ['苏打 Suda', '中文'], ['白桦 Baihua', '中文'], ['Mia', 'English'], ['Chloe', 'English'], ['Milo', 'English'], ['Dean', 'English']].map(([n, l]) => ({ n, l })) },
    custom: { name: 'Custom endpoint', blurb: 'Any OpenAI-compatible speech API', speed: true, voices: [{ n: 'default' }] },
  };
  const freshKeys = () => [
    { id: 1, prov: 'openai', name: 'Personal', mask: 'sk-…5678', health: 'ready' },
    { id: 2, prov: 'openai', name: 'Work', mask: 'sk-…4321', health: 'ready' },
    { id: 3, prov: 'mimo', name: 'MiMo', mask: '…cdef', health: 'ready' },
  ];
  let keys = freshKeys();
  const PAGE = { title: 'The Voice in the Margin', host: 'meridianreview.example' };

  const S = {
    view: pick('view', ['read', 'popup', 'settings', 'setup'], 'read'),
    layout: pick('player', ['rail', 'dock'], 'rail'),
    scenario: pick('scenario', ['normal', 'slow', 'ratelimit', 'badkey', 'offline', 'noprovider'], 'normal'),
    themePref: pick('theme', ['light', 'dark', 'system'], 'light'),
    page: pick('page', ['light', 'dark'], 'light'),
    side: 'right', pos: 'center', railTop: null, ink: 'blue', hl: 'marker', tuck: true, auto: true,
    speed: 1, vol: 90, prov: 'openai', voice: 'Nova', click: 'popup', sec: 'voice',
  };
  const P = { status: 'idle', si: 0, wi: 0, read: 0, open: false, note: null, shown: false, tripped: false };
  const spd = () => (PROV[S.prov].speed ? S.speed : 1);
  const fmtSpeed = (s) => `${+s.toFixed(2)}×`;
  const clock = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const fmtLeft = (ms) => (ms < 55000 ? '<1 min' : `${Math.round(ms / 60000)} min`);

  // ---------------------------------------------------------------- text map (stands in for buildTextNodeMap + chunker)
  const art = $('#art'), page = $('#page'), bwView = $('#bwView');
  const blocks = $$('h2, p:not(.dek), blockquote', art);
  const sents = [];
  let T = 0;
  const mkRange = (nodes, s, e) => {
    const r = document.createRange();
    const a = nodes.find((x) => s < x.e) || nodes.at(-1), b = nodes.find((x) => e <= x.e) || nodes.at(-1);
    r.setStart(a.n, s - a.s); r.setEnd(b.n, e - b.s); return r;
  };
  for (const el of blocks) {
    const nodes = []; let o = 0, n;
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while ((n = w.nextNode())) { nodes.push({ n, s: o, e: o + n.data.length }); o += n.data.length; }
    el._nodes = nodes;
    const text = el.textContent;
    for (const m of text.matchAll(/[^.!?]+[.!?]+[”"’)]*\s*|[^.!?]+$/g)) {
      const start = m.index, end = start + m[0].trimEnd().length;
      if (end <= start) continue;
      const words = [];
      for (const wm of m[0].matchAll(/\S+/g)) {
        const ws = start + wm.index, we = ws + wm[0].length;
        let d = (60000 / 178) * clamp(wm[0].length / 5.2, 0.55, 2.1);
        if (/[,;:—]$/.test(wm[0])) d += 130;
        words.push({ s: ws, e: we, d, t: 0 });
      }
      if (!words.length) continue;
      words.at(-1).d += 340;
      for (const x of words) { x.t = T; T += x.d; }
      sents.push({ el, nodes, start, end: start + m[0].length, words, range: mkRange(nodes, start, end) });
    }
  }
  const curMs = () => sents[P.si].words[P.wi].t;

  // Reading scope: the whole page, or just the text that was selected when reading was requested.
  const R = { a: 0, b: sents.length - 1, sel: false };
  const span = () => { const t0 = sents[R.a].words[0].t, w = sents[R.b].words.at(-1); return { t0, tt: w.t + w.d - t0 }; };
  const scopeWords = () => sents.slice(R.a, R.b + 1).reduce((n, s) => n + s.words.length, 0);
  const excerpt = (i, j = i) => {
    let t = '';
    for (let k = i; k <= j && t.length < 130; k++) { const s = sents[k]; t += (t ? ' ' : '') + s.el.textContent.slice(s.start, s.end).trim(); }
    return `“${t.length > 130 ? t.slice(0, 128).trimEnd() + '…' : t}”`;
  };
  function setScope(a, b, sel) { Object.assign(R, { a, b, sel }); }
  function refreshScope() {
    if (P.status !== 'idle') return;
    const sel = getSelection(), hit = [];
    if (sel.rangeCount && !sel.isCollapsed && art.contains(sel.anchorNode)) {
      const r = sel.getRangeAt(0);
      sents.forEach((s, i) => { if (r.compareBoundaryPoints(Range.END_TO_START, s.range) < 0 && r.compareBoundaryPoints(Range.START_TO_END, s.range) > 0) hit.push(i); });
    }
    if (hit.length) setScope(hit[0], hit.at(-1), true); else setScope(0, sents.length - 1, false);
  }

  const HL = window.Highlight && CSS.highlights ? { word: new Highlight(), sent: new Highlight(), hover: new Highlight() } : null;
  if (HL) { HL.word.priority = 2; HL.hover.priority = 1; CSS.highlights.set('rc-sent', HL.sent); CSS.highlights.set('rc-word', HL.word); CSS.highlights.set('rc-hover', HL.hover); }
  function paint() {
    if (!HL) return;
    HL.word.clear(); HL.sent.clear();
    if (P.status === 'idle' && !P.shown) return;
    if (P.status === 'idle') return;
    const s = sents[P.si];
    HL.sent.add(s.range);
    if (P.status === 'playing' || P.status === 'paused') { const w = s.words[P.wi]; HL.word.add(mkRange(s.nodes, w.s, w.e)); }
  }

  // ---------------------------------------------------------------- player DOM
  const player = document.createElement('div');
  player.className = 'rp';
  player.setAttribute('role', 'toolbar');
  player.setAttribute('aria-label', 'Recito player');
  player.innerHTML = `
    <div class="rp-bar">
      <button class="rp-play" data-act="toggle"><i></i></button>
      <span class="rp-time" data-left></span>
      <div class="rp-extra"><div>
        <button class="rp-btn rp-back" data-act="back" aria-label="Previous sentence" title="Previous sentence">${ic('back')}</button>
        <button class="rp-btn rp-fwd" data-act="fwd" aria-label="Next sentence" title="Next sentence">${ic('fwd')}</button>
        <span class="rp-sep"></span>
        <button class="rp-btn rp-speed" data-act="cycle"></button>
        <button class="rp-btn rp-more" data-act="panel" aria-label="Reading controls" title="Reading controls" aria-expanded="false">${ic('chev')}</button>
        <button class="rp-btn rp-close" data-act="stop" aria-label="Stop and close" title="Stop and close">${ic('close', 16)}</button>
      </div></div>
    </div>
    <div class="rp-fly">
      <div class="rp-card rp-note" hidden></div>
      <div class="rp-card rp-panel" role="group" aria-label="Reading controls" hidden>
        <div class="rp-title" data-scopelabel></div>
        <div class="rp-sub" data-scopemeta></div>
        <div class="rp-seek"><input type="range" min="0" max="1000" value="0" data-seek aria-label="Position in article"></div>
        <div class="rp-times"><span data-elapsed>0:00</span><span data-remain></span></div>
        <div class="rp-row"><span>Speed</span><span class="stepper" data-speed></span></div>
        <div data-speedextra></div>
        <div class="rp-row"><label for="rpVoice">Voice</label><select class="sel" id="rpVoice" data-voice></select></div>
        <div class="rp-row"><label for="rpVol">Volume</label><input id="rpVol" type="range" min="0" max="100" data-vol></div>
        <div class="rp-row" style="border-bottom:0"><label for="rpAuto">Follow along</label><input type="checkbox" class="sw" id="rpAuto" data-auto></div>
        <div class="rp-foot"><span data-provline></span><button class="link" data-goto="settings">Settings</button></div>
      </div>
    </div>`;
  const returnBtn = $('#returnBtn'), ppLive = $('#ppLive'), extBtn = $('#extBtn');
  $('#playerMount').replaceWith(player);
  const bar = $('.rp-bar', player), fly = $('.rp-fly', player), noteEl = $('.rp-note', player), panel = $('.rp-panel', player), seekInput = $('[data-seek]', player);
  const liveScopes = [player, ppLive];
  const setLive = (sel, txt) => liveScopes.forEach((sc) => $$(sel, sc).forEach((e) => (e.textContent = txt)));

  // ---------------------------------------------------------------- engine (simulated; the extension gets this from the background)
  let timer = null, slowT = null, noteT = null, tuckT = null, seeking = false, last = {};
  function progress(force) {
    if (force) last = {};
    const { t0, tt } = span(), T = tt;
    const ms = clamp(curMs() - t0, 0, tt), p = tt ? ms / tt : 0, sp = spd();
    const idle = P.status === 'idle', exKey = idle ? `${R.a}-${R.b}` : P.si; // idle: opening words of the scope; active: the sentence being spoken
    if (exKey !== last.si) { last.si = exKey; setLive('[data-excerpt]', idle ? excerpt(R.a, R.b) : excerpt(P.si)); }
    const pv = p.toFixed(3);
    if (pv !== last.p) { last.p = pv; for (const sc of liveScopes) for (const el of sc.querySelectorAll('.rp-play, .bar')) el.style.setProperty('--p', pv); }
    const el = clock(ms / sp), left = P.status === 'idle' ? fmtLeft(T / sp) : fmtLeft((T - ms) / sp);
    if (el !== last.el) { last.el = el; setLive('[data-elapsed]', el); setLive('[data-remain]', '−' + clock((T - ms) / sp)); if (!seeking) seekInput.value = Math.round(p * 1000); }
    if (left !== last.left) { last.left = left; setLive('[data-left]', left); }
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(advance, sents[P.si].words[P.wi].d / spd()); }
  function advance() {
    const s = sents[P.si];
    let moved = false;
    if (P.wi < s.words.length - 1) P.wi++;
    else {
      if (P.si >= R.b) return finish();
      P.si++; P.wi = 0; moved = true;
    }
    P.read++;
    if (trip()) { paint(); progress(); return; }
    if (moved) follow();
    paint(); progress(); schedule();
  }
  function trip() {
    if (P.tripped || P.read < 16) return false;
    if (S.scenario === 'badkey') {
      P.tripped = true; keys[0].health = 'failed'; keys[0].why = 'Error 401. OpenAI rejected this key.'; keys[1].health = 'cooldown'; keys[1].until = Date.now() + 40000;
      fail({ title: 'No working OpenAI key left', body: '“Personal” was refused (401) and “Work” is rate-limited for 40 seconds. Reading stopped here and your place is saved.', acts: [['Fix keys', 'fixkey', 1], ['Try again', 'retry']] });
      return true;
    }
    if (S.scenario === 'ratelimit') {
      P.tripped = true; keys[0].health = 'cooldown'; keys[0].until = Date.now() + 60000;
      note({ title: 'Switched to your backup key', body: '“Personal” hit a rate limit and rests for 60 seconds. Now reading with “Work”.', ttl: 7000 });
      renderKeys();
    }
    return false;
  }
  function fail(n) { clearTimeout(timer); clearTimeout(slowT); P.status = 'error'; P.open = false; note({ ...n, bad: true }); renderKeys(); sync(); }
  function start(from) {
    P.shown = true;
    if (S.scenario === 'noprovider') {
      P.status = 'idle';
      note({ bad: true, title: 'Add a voice provider to start listening', body: 'Recito reads with your own OpenAI, MiMo or compatible API key. Setup takes about a minute.', acts: [['Set up Recito', 'setup', 1]] });
      return sync();
    }
    if (from != null) { P.si = from; P.wi = 0; }
    else if (P.status !== 'error') { P.si = R.a; P.wi = 0; }
    if (R.sel) getSelection().removeAllRanges();
    P.read = 0; P.status = 'loading'; if (P.note) note(null);
    sync(); paint(); follow(true);
    clearTimeout(timer); clearTimeout(slowT);
    if (S.scenario === 'slow') slowT = setTimeout(() => P.status === 'loading' && note({ title: 'Still preparing the voice', body: 'OpenAI is taking longer than usual. You can keep reading; playback starts as soon as audio arrives.', slow: true }), 2500);
    timer = setTimeout(() => {
      if (S.scenario === 'offline' && !P.tripped) { P.tripped = true; return fail({ title: 'Can’t reach OpenAI', body: 'Check your connection. Your place is saved, so you can pick up from this sentence.', acts: [['Try again', 'retry', 1]] }); }
      if (P.note?.slow) note(null);
      P.status = 'playing'; sync(); paint(); schedule();
    }, S.scenario === 'slow' ? 5200 : 1100);
  }
  function toggle() {
    if (P.status === 'playing') { clearTimeout(timer); P.status = 'paused'; sync(); }
    else if (P.status === 'paused') { P.status = 'playing'; sync(); schedule(); }
    else if (P.status !== 'loading') start();
  }
  function jump(si) {
    si = clamp(si, 0, sents.length - 1);
    if (si < R.a || si > R.b) setScope(0, sents.length - 1, false); // jumping outside a selection widens to the page
    if (P.status === 'idle' || P.status === 'error') return start(si);
    if (P.status === 'loading') return;
    P.si = clamp(si, 0, sents.length - 1); P.wi = 0; P.status = 'playing';
    sync(); paint(); follow(true); schedule();
  }
  function stop() {
    clearTimeout(timer); clearTimeout(slowT);
    Object.assign(P, { status: 'idle', si: 0, wi: 0, open: false, shown: false }); setScope(0, sents.length - 1, false); note(null);
    paint(); sync();
  }
  function finish() {
    const was = R.sel ? 'the selected text' : 'the page';
    clearTimeout(timer); Object.assign(P, { status: 'idle', si: 0, wi: 0 }); setScope(0, sents.length - 1, false);
    paint(); sync(); note({ title: 'Finished', body: `Reached the end of ${was}.`, ttl: 5000 });
  }
  function setSpeed(v) { if (!PROV[S.prov].speed) return; S.speed = clamp(Math.round(v * 20) / 20, 0.5, 2); syncControls(); progress(true); saved(); }

  // ---------------------------------------------------------------- follow-along + return chip
  let userScrollUntil = 0, rafScroll = 0;
  const sentBox = () => { const r = sents[P.si].range.getBoundingClientRect(), v = page.getBoundingClientRect(); return { top: r.top - v.top, bottom: r.bottom - v.top, h: v.height }; };
  function follow(force) {
    if (S.view !== 'read') return;
    const b = sentBox();
    if (force || (S.auto && Date.now() >= userScrollUntil && (b.top < b.h * 0.12 || b.bottom > b.h * 0.72))) page.scrollTo({ top: page.scrollTop + b.top - b.h * 0.34, behavior: 'smooth' });
    checkReturn();
  }
  function checkReturn() {
    const active = P.status === 'playing' || P.status === 'paused';
    if (!active || S.view !== 'read') { returnBtn.hidden = true; return; }
    const b = sentBox(), off = b.bottom < 0 || b.top > b.h;
    returnBtn.hidden = !off;
    if (off) returnBtn.innerHTML = `<span style="display:inline-block;transform:rotate(${b.top > b.h ? 0 : 180}deg)">${ic('down', 14)}</span>Back to the sentence being read`;
  }
  const userScrolled = () => { userScrollUntil = Date.now() + 5000; };
  page.addEventListener('wheel', userScrolled, { passive: true });
  page.addEventListener('touchmove', userScrolled, { passive: true });
  page.addEventListener('scroll', () => { if (!rafScroll) rafScroll = requestAnimationFrame(() => { rafScroll = 0; checkReturn(); }); }, { passive: true });
  returnBtn.addEventListener('click', () => { userScrollUntil = 0; follow(true); });

  // ---------------------------------------------------------------- click a sentence to jump (text scrubber)
  function sentAt(e) {
    const el = e.target.closest?.('h2, p, blockquote');
    if (!el || !el._nodes || e.target.closest('a')) return -1;
    const r = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : (() => { const c = document.caretPositionFromPoint?.(e.clientX, e.clientY); if (!c) return null; const x = document.createRange(); x.setStart(c.offsetNode, c.offset); return x; })();
    if (!r) return -1;
    const nd = el._nodes.find((x) => x.n === r.startContainer);
    if (!nd) return -1;
    const off = nd.s + r.startOffset;
    return sents.findIndex((s) => s.el === el && off >= s.start && off <= s.end);
  }
  let rafHover = 0, hoverEv = null;
  art.addEventListener('mousemove', (e) => {
    if (!HL || !art.classList.contains('scrub')) return;
    hoverEv = e;
    if (!rafHover) rafHover = requestAnimationFrame(() => { rafHover = 0; HL.hover.clear(); const i = sentAt(hoverEv); if (i >= 0 && i !== P.si) HL.hover.add(sents[i].range); });
  });
  art.addEventListener('mouseleave', () => HL?.hover.clear());
  art.addEventListener('click', (e) => {
    if (!art.classList.contains('scrub') || !getSelection().isCollapsed) return;
    const i = sentAt(e); if (i >= 0) { HL?.hover.clear(); jump(i); }
  });

  // ---------------------------------------------------------------- notices
  function note(n) {
    P.note = n; clearTimeout(noteT);
    if (n?.ttl) noteT = setTimeout(() => note(null), n.ttl);
    noteEl.hidden = !n;
    if (n) {
      noteEl.className = `rp-card rp-note${n.bad ? ' bad' : ''}`;
      noteEl.setAttribute('role', n.bad ? 'alert' : 'status');
      noteEl.innerHTML = `${ic(n.bad ? 'alert' : 'info')}<div style="flex:1;min-width:0"><b>${n.title}</b><p>${n.body}</p>${n.acts ? `<div class="acts">${n.acts.map(([l, a, pr]) => `<button class="btn sm${pr ? ' primary' : ''}" data-act="${a}">${l}</button>`).join('')}</div>` : ''}</div>${n.bad ? '' : `<button class="icon-btn x" data-act="dismiss" aria-label="Dismiss">${ic('close', 14)}</button>`}`;
    }
    placeFly(); armTuck();
    if (!ppLive.hidden) renderLivePopup(true);
  }
  function placeFly() {
    fly.style.top = '';
    if (S.layout !== 'rail' || (noteEl.hidden && panel.hidden)) return;
    const r = fly.getBoundingClientRect(), v = bwView.getBoundingClientRect();
    if (r.bottom > v.bottom - 8) fly.style.top = `${Math.max(v.top + 8 - r.top, v.bottom - 8 - r.bottom)}px`;
  }

  // ---------------------------------------------------------------- tuck away while playing
  const setTucked = (v) => player.setAttribute('data-tucked', v);
  function armTuck() {
    clearTimeout(tuckT); setTucked(false);
    if (!(S.tuck && S.layout === 'rail' && P.status === 'playing' && !P.open && !P.note)) return;
    tuckT = setTimeout(() => (player.matches(':hover') || player.querySelector(':focus-visible') ? armTuck() : setTucked(true)), 2600);
  }
  player.addEventListener('pointerenter', () => { clearTimeout(tuckT); setTucked(false); });
  player.addEventListener('pointerleave', armTuck);
  player.addEventListener('focusin', () => { clearTimeout(tuckT); setTucked(false); });
  player.addEventListener('focusout', armTuck);

  // ---------------------------------------------------------------- drag with snapping
  let drag = null;
  bar.addEventListener('pointerdown', (e) => {
    if (e.button || e.target.closest('button, input, select')) return;
    const r = player.getBoundingClientRect(), v = bwView.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, v, w: r.width, h: bar.getBoundingClientRect().height, x0: e.clientX, y0: e.clientY, moved: false };
    bar.setPointerCapture(e.pointerId);
  });
  bar.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 4) return;
    drag.moved = true; player.classList.add('dragging');
    drag.x = clamp(e.clientX - drag.dx - drag.v.left, 4, drag.v.width - drag.w - 4);
    drag.y = clamp(e.clientY - drag.dy - drag.v.top, 4, drag.v.height - drag.h - 4);
    Object.assign(player.style, { left: `${drag.x}px`, top: `${drag.y}px`, right: 'auto', bottom: 'auto', transform: 'none' });
  });
  const endDrag = () => {
    if (!drag) return;
    if (drag.moved) {
      const cx = drag.x + drag.w / 2;
      if (S.layout === 'rail') { S.side = cx < drag.v.width / 2 ? 'left' : 'right'; S.railTop = drag.y; }
      else S.pos = cx < drag.v.width / 3 ? 'left' : cx > (drag.v.width * 2) / 3 ? 'right' : 'center';
      saved();
    }
    drag = null; player.classList.remove('dragging'); sync(); syncSettings();
  };
  bar.addEventListener('pointerup', endDrag);
  bar.addEventListener('pointercancel', endDrag);

  // ---------------------------------------------------------------- popup
  const provLine = () => {
    const mine = keys.filter((k) => k.prov === S.prov), ok = mine.filter((k) => k.health === 'ready').length;
    const cls = ok === mine.length ? '' : ok ? ' wait' : ' bad';
    const txt = !mine.length ? 'no key' : mine.length === 1 ? (ok ? 'key ready' : 'key unavailable') : ok === mine.length ? `${ok} keys ready` : `${ok} of ${mine.length} keys ready`;
    return `<span class="dot${cls}"></span>${PROV[S.prov].name} · ${txt}`;
  };
  function popupHTML(m) {
    const head = `<div class="pp-head"><span class="wm">Recito</span><button class="icon-btn" data-goto="settings" aria-label="Settings" title="Settings">${ic('sliders')}</button></div>`;
    const foot = `<div class="pp-foot"><span data-provline></span><span><kbd>Alt</kbd> <kbd>Shift</kbd> <kbd>Space</kbd></span></div>`;
    if (m.k === 'setup') return `${head}<div class="pp-empty"><h3>Connect a voice to start</h3><p>Recito reads pages aloud with your own OpenAI, MiMo or compatible API key. Setup takes about a minute.</p><button class="btn primary lg block" data-goto="setup">Set up Recito</button></div>`;
    if (m.k === 'unreadable') return `${head}<div class="pp-empty"><h3>Nothing to read on this page</h3><p>Chrome keeps extensions out of its own pages and the Web Store. Open an article, or select some text on a page and try again.</p></div>${foot}`;
    const active = m.k === 'playing' || m.k === 'paused';
    // What will be read (or is being read): scope + the actual words, not the page title.
    const isSel = m.id ? !!m.sel : R.sel;
    const card = `<div class="pp-page"><div class="pp-scope"><span class="pp-chip">${isSel ? 'Selected text' : 'Whole page'}</span><span class="pp-meta"${m.meta ? '' : ' data-scopemeta'}>${m.meta || ''}</span></div><p class="pp-excerpt"${m.excerpt ? '' : ' data-excerpt'}>${m.excerpt || ''}</p>${active ? '<div class="bar"></div><div class="pp-times"><span data-elapsed></span><span data-remain></span></div>' : ''}</div>`;
    let main = '';
    if (m.k === 'idle') main = isSel ? `<button class="btn primary lg block" data-act="toggle">${ic('play')}Listen to selection</button><div class="pp-sub"><button class="link" data-act="wholepage">Read the whole page instead</button></div>` : `<button class="btn primary lg block" data-act="toggle">${ic('play')}Listen</button>`;
    if (m.k === 'resume') main = `<button class="btn primary lg block" data-act="toggle">${ic('play')}Resume · 2 min left</button><div class="pp-sub">You stopped here yesterday. <button class="link">Start from the top</button></div>`;
    if (m.k === 'loading') main = `<button class="btn lg block" disabled><span class="spin"></span>Preparing the voice…</button>`;
    if (active) main = `<div class="pp-transport"><button class="icon-btn pp-side" data-act="back" aria-label="Previous sentence">${ic('back', 20)}</button><button class="pp-big" data-act="toggle" aria-label="${m.k === 'playing' ? 'Pause' : 'Play'}">${ic(m.k === 'playing' ? 'pause' : 'play', 24)}</button><button class="icon-btn pp-side" data-act="fwd" aria-label="Next sentence">${ic('fwd', 20)}</button></div><div class="pp-sub">${m.k === 'paused' ? 'Paused · ' : ''}<button class="link" data-act="stop">Stop</button></div>`;
    if (m.k === 'elsewhere') main = `<div class="callout wait" style="margin:0 0 10px">${ic('info')}<div><b>Reading in another tab</b><p>“How Glaciers Remember” · 6 min left</p><div class="acts"><button class="btn sm">Go to that tab</button></div></div></div><button class="btn lg block" data-act="toggle">${ic('play')}Read this page instead</button>`;
    const err = m.k === 'error' ? `<div class="callout bad" role="alert">${ic('alert')}<div><b>${m.note.title}</b><p>${m.note.body}</p>${m.note.acts ? `<div class="acts">${m.note.acts.map(([l, a, pr]) => `<button class="btn sm${pr ? ' primary' : ''}" data-act="${a}">${l}</button>`).join('')}</div>` : ''}</div></div>` : '';
    const rows = `<div class="pp-rows"><div class="pp-row"><label for="ppv${m.id || ''}">Voice</label><select class="sel" id="ppv${m.id || ''}" data-voice></select></div><div class="pp-row" style="border-bottom:0"><span>Speed</span><span class="stepper" data-speed></span></div></div>`;
    return `${head}${card}${main ? `<div class="pp-main">${main}</div>` : '<div style="height:12px"></div>'}${err}${rows}${foot}`;
  }
  const liveModel = () => (S.scenario === 'noprovider' ? { k: 'setup' } : P.status === 'error' ? { k: 'error', note: P.note || { title: 'Playback stopped', body: '' } } : { k: P.status });
  let liveKind = '';
  function renderLivePopup(force) {
    const m = liveModel();
    if (!force && m.k + R.sel === liveKind) return;
    liveKind = m.k + R.sel; ppLive.innerHTML = popupHTML(m); syncControls(); progress(true);
  }
  function togglePopup(open = ppLive.hidden) {
    ppLive.hidden = !open; extBtn.setAttribute('aria-expanded', open);
    if (open) { renderLivePopup(true); (ppLive.querySelector('.pp-main button:not(:disabled), .pp-empty button') || ppLive.querySelector('button'))?.focus({ preventScroll: true }); }
  }
  extBtn.addEventListener('click', () => { refreshScope(); S.click === 'read' && S.scenario !== 'noprovider' ? toggle() : togglePopup(); });
  document.addEventListener('pointerdown', (e) => { if (!ppLive.hidden && !e.target.closest('#ppLive, #extBtn')) togglePopup(false); });

  const GALLERY = [
    ['Ready', 'Shows the opening words that will be read, not the page title.', { k: 'idle' }],
    ['Selected text', 'Text was selected when the popup opened: one reply in a chat, or a paragraph.', { k: 'idle', sel: true, meta: '84 words · under 1 min', excerpt: '“Sure. The short version is that a cache trades memory for time, and the hard part is deciding when an entry has gone stale…”' }],
    ['Resume', 'Saved position within 7 days.', { k: 'resume' }],
    ['Preparing', 'First audio takes 1 to 3 s. The button says what is happening.', { k: 'loading' }],
    ['Playing', 'Transport replaces the Listen button. Same progress as the player.', { k: 'playing' }],
    ['Key problem', 'Same message and actions as the in-page player.', { k: 'error', note: { title: 'No working OpenAI key left', body: '“Personal” was refused (401) and “Work” is rate-limited for 40 seconds.', acts: [['Fix keys', 'fixkey', 1], ['Try again', 'retry']] } }],
    ['Reading elsewhere', 'Only one tab plays at a time.', { k: 'elsewhere', meta: '2,310 words · about 13 min', excerpt: '“Lichens are slow in a way that is hard to picture. A patch the size of a coin may be older than the wall it grows on…”' }],
    ['Not set up', 'First run, or all keys removed.', { k: 'setup' }],
    ['Unreadable page', 'chrome:// pages, the Web Store, empty tabs.', { k: 'unreadable' }],
  ];
  $('#gallery').innerHTML = GALLERY.map(([t, d, m], i) => `<figure><figcaption><b>${t}</b>${d}</figcaption><div class="pp" inert>${popupHTML({ meta: m.k === 'playing' || m.k === 'loading' ? '567 words' : '567 words · about 3 min', excerpt: m.k === 'playing' ? '“A voice sets a pace, and a pace is a kind of attention.”' : '“In the late fourth century, a young teacher of rhetoric visited the bishop of Milan and found him doing something odd…”', ...m, id: 'g' + i })}</div></figure>`).join('');
  $$('#gallery .bar').forEach((e) => e.style.setProperty('--p', '.42'));
  $$('#gallery [data-elapsed]').forEach((e) => (e.textContent = '2:24'));
  $$('#gallery [data-remain]').forEach((e) => (e.textContent = '−3:18'));

  // ---------------------------------------------------------------- settings
  const cd = (k) => clock(Math.max(0, k.until - Date.now()));
  function chip(k) {
    if (k.health === 'ready') return `<span class="status ok">${ic('check', 14)}Ready</span>`;
    if (k.health === 'cooldown') return `<span class="status wait">${ic('info', 14)}Resting <span class="num" data-cd="${k.id}">${cd(k)}</span></span>`;
    if (k.health === 'testing') return `<span class="status wait"><span class="spin" style="width:12px;height:12px"></span>Testing</span>`;
    return `<span class="status bad">${ic('alert', 14)}Refused</span>`;
  }
  function renderKeys(flashId) {
    const groups = [...new Set(keys.map((k) => k.prov))];
    $('#keysList').innerHTML = groups.length ? groups.map((g) => {
      const mine = keys.filter((k) => k.prov === g);
      return `<div class="card"><div class="grp-head"><span><b>${PROV[g].name}</b><small>${mine.length} ${mine.length > 1 ? 'keys, used in this order' : 'key'}</small></span>${S.prov === g ? '<span class="tag">In use</span>' : `<button class="btn sm" data-use="${g}">Use ${PROV[g].name}</button>`}</div>${mine.map((k) => `
        <div class="row key${k.id === flashId ? ' flash' : ''}" data-key="${k.id}"><div class="t"><b>${k.name}</b><span class="mask">${k.mask}</span>${k.health === 'failed' ? `<span class="why">${k.why || 'The provider rejected this key.'}</span>` : k.health === 'cooldown' ? '<small>Rate-limited. Recito retries it automatically.</small>' : ''}</div>
        <div class="ctl">${k.confirm ? `<span style="font-size:13px">Remove this key?</span><button class="btn sm danger" data-rm="${k.id}">Remove</button><button class="btn sm" data-keep="${k.id}">Keep</button>` : `${chip(k)}${k.health === 'failed' ? `<button class="btn sm" data-retest="${k.id}">Test again</button>` : ''}<button class="btn sm quiet" data-edit="${k.id}">Edit</button><button class="btn sm quiet" data-ask="${k.id}">Remove</button>`}</div></div>`).join('')}</div>`;
    }).join('') : `<div class="card"><div class="row"><div class="t"><b>No keys yet</b><small>Add a key from OpenAI, Xiaomi MiMo, or any OpenAI-compatible speech service.</small></div></div></div>`;
    syncControls();
    tickCooldowns();
  }
  let cdTimer = null;
  function tickCooldowns() {
    clearInterval(cdTimer);
    if (S.view !== 'settings' || !keys.some((k) => k.health === 'cooldown')) return;
    cdTimer = setInterval(() => {
      let done = false;
      for (const k of keys) if (k.health === 'cooldown') { if (Date.now() >= k.until) { k.health = 'ready'; done = true; } else { const e = $(`[data-cd="${k.id}"]`); if (e) e.textContent = cd(k); } }
      if (done) renderKeys();
    }, 1000);
  }
  function renderVoices(host, name) {
    host.innerHTML = PROV[S.prov].voices.map((v) => `<label class="voice"><input type="radio" name="${name}" value="${v.n}" ${v.n === S.voice ? 'checked' : ''}><span class="t"><b>${v.n}</b>${v.l ? `<small>${v.l}</small>` : ''}</span><button type="button" class="icon-btn" data-preview aria-label="Preview ${v.n}" title="Play a sample">${ic('play', 14)}</button></label>`).join('');
  }
  function syncSettings() {
    const have = [...new Set(keys.map((k) => k.prov))];
    if (have.length && !have.includes(S.prov)) { S.prov = have[0]; S.voice = PROV[S.prov].voices[0].n; }
    $('#provSeg').innerHTML = have.map((g) => `<button data-use="${g}" aria-pressed="${S.prov === g}">${PROV[g].name}</button>`).join('');
    $('#provNote').textContent = PROV[S.prov].speed ? 'Speed adjustable from 0.5× to 2×' : 'MiMo has no speed control. Pages are read at 1×.';
    $('#spNote').textContent = PROV[S.prov].speed ? 'Applies to OpenAI and custom endpoints' : 'Not available with Xiaomi MiMo, which is in use now';
    renderVoices($('#voiceList'), 'voice');
    renderKeys();
    $$('.st-nav [data-sec]').forEach((b) => (b.dataset.sec === S.sec ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
    $$('[data-pane]').forEach((p) => (p.hidden = p.dataset.pane !== S.sec));
    const press = (sel, attr, val) => $$(sel).forEach((b) => b.setAttribute('aria-pressed', b.dataset[attr] === val));
    press('#hlSeg button', 'hl', S.hl); press('#themeSeg button', 'th', S.themePref); press('#clickSeg button', 'click', S.click);
    press('#posSeg button', 'pos', S.layout === 'dock' ? 'dock' : `rail-${S.side}`);
    $$('#inkSw input').forEach((i) => (i.checked = i.value === S.ink));
    $('#tuckSw').checked = S.tuck;
  }
  let savedT = null;
  function saved() { const e = $('#savedMsg'); e.textContent = 'Saved'; clearTimeout(savedT); savedT = setTimeout(() => (e.textContent = 'Changes save as you make them'), 1600); }

  // shared provider form: used by the settings sheet and by first-run setup
  let pfN = 0;
  function providerForm(host, { cta, onDone }) {
    const uid = `pf${++pfN}`;
    host.innerHTML = `
      <div class="tiles" role="radiogroup" aria-label="Provider">${Object.entries(PROV).map(([id, p], i) => `<label class="tile"><input type="radio" name="${uid}" value="${id}" ${i ? '' : 'checked'}><b>${p.name}</b><small>${p.blurb}</small></label>`).join('')}</div>
      <div data-extra></div>
      <label class="field"><span>API key</span><span class="inp-wrap" style="display:block"><input class="inp" type="password" data-k autocomplete="off" spellcheck="false"><button type="button" class="icon-btn" data-eye aria-label="Show key" aria-pressed="false">${ic('eye')}</button></span><small data-help></small></label>
      <div class="pf-result" data-result aria-live="polite"></div>
      <div class="pf-actions"><button class="btn primary" data-test>${cta}</button><span class="pf-privacy">Stored only in this browser.<br>Sent only to <span data-dest></span>.</span></div>
      <p class="proto-hint">Prototype: any key connects. Put “bad” in the key to see the failure state.</p>`;
    const k = $('[data-k]', host), res = $('[data-result]', host), btn = $('[data-test]', host);
    const cur = () => $(`input[name="${uid}"]:checked`, host).value;
    const paintProv = () => {
      const id = cur();
      $('[data-extra]', host).innerHTML = id === 'custom' ? `<label class="field"><span>Base URL</span><input class="inp" type="url" placeholder="https://api.example.com/v1"></label><label class="field"><span>Model</span><input class="inp" placeholder="tts-1"></label>` : '';
      $('[data-help]', host).innerHTML = id === 'openai' ? `Create one at <a class="link" href="#" onclick="return false">platform.openai.com/api-keys</a>. It starts with <code>sk-</code>.` : id === 'mimo' ? 'From your Xiaomi MiMo developer account. The v2.5 model is selected for you.' : 'The key your endpoint expects in the Authorization header.';
      $('[data-dest]', host).textContent = id === 'custom' ? 'your endpoint' : PROV[id].name;
      k.placeholder = id === 'openai' ? 'sk-…' : 'Paste key';
      res.innerHTML = '';
    };
    host.addEventListener('change', (e) => e.target.name === uid && paintProv());
    $('[data-eye]', host).addEventListener('click', (e) => { const on = k.type === 'password'; k.type = on ? 'text' : 'password'; e.currentTarget.setAttribute('aria-pressed', on); e.currentTarget.setAttribute('aria-label', on ? 'Hide key' : 'Show key'); });
    const done = () => onDone({ prov: cur(), mask: `${k.value.slice(0, 3)}…${k.value.slice(-4)}` });
    btn.addEventListener('click', () => {
      const id = cur(), name = PROV[id].name;
      if (!k.value.trim()) { res.innerHTML = `<div class="callout bad">${ic('alert')}<div><b>Paste a key first</b></div></div>`; k.focus(); return; }
      btn.disabled = true; btn.innerHTML = `<span class="spin"></span>Testing with ${name}…`; res.innerHTML = '';
      setTimeout(() => {
        btn.disabled = false; btn.textContent = cta;
        if (/bad/i.test(k.value)) {
          res.innerHTML = `<div class="callout bad" role="alert">${ic('alert')}<div><b>${name} refused this key</b><p>Error 401. Check that the whole key was copied and that it is still active in your ${name} account.</p><div class="acts"><button class="btn sm" data-anyway>Save anyway</button></div></div></div>`;
          $('[data-anyway]', res).addEventListener('click', done);
        } else {
          res.innerHTML = `<div class="callout ok">${ic('check')}<div><b>Connected</b><p>${PROV[id].voices.length} voice${PROV[id].voices.length > 1 ? 's' : ''} available.</p></div></div>`;
          btn.disabled = true; setTimeout(done, 800);
        }
      }, 1100);
    });
    paintProv();
  }
  const sheet = $('#keySheet');
  $('#addKey').addEventListener('click', () => {
    providerForm($('#keySheetBody'), { cta: 'Test and save', onDone: ({ prov, mask }) => { const id = Date.now(); keys.push({ id, prov, name: keys.some((k) => k.prov === prov) ? `Key ${keys.filter((k) => k.prov === prov).length + 1}` : PROV[prov].name, mask, health: 'ready' }); sheet.close(); syncSettings(); renderKeys(id); saved(); } });
    sheet.showModal();
  });
  sheet.addEventListener('click', (e) => { if (e.target === sheet || e.target.closest('[data-close]')) sheet.close(); });

  // ---------------------------------------------------------------- first-run setup
  const setup = { step: 1, timer: null };
  const SAMPLE = 'A voice sets a pace, and a pace is a kind of attention. When a sentence is spoken you cannot slide past it the way the eye slides past a familiar paragraph.';
  function renderSetup() {
    clearTimeout(setup.timer);
    $$('#steps li').forEach((li, i) => { li.className = i + 1 < setup.step ? 'done' : ''; li.toggleAttribute('aria-current', false); if (i + 1 === setup.step) li.setAttribute('aria-current', 'step'); });
    const body = $('#setupBody');
    if (setup.step === 1) {
      body.innerHTML = `<h1>Connect a voice</h1><p class="lede">Recito reads pages aloud using a speech provider you already have an account with. Pick one and paste its key.</p><div id="setupForm"></div><div class="setup-foot"><button class="link" data-goto="read" style="color:var(--ink-2)">Skip for now</button></div>`;
      providerForm($('#setupForm'), { cta: 'Test and continue', onDone: ({ prov, mask }) => { if (!keys.some((k) => k.prov === prov)) keys.push({ id: Date.now(), prov, name: PROV[prov].name, mask, health: 'ready' }); S.prov = prov; S.voice = PROV[prov].voices[0].n; setup.step = 2; renderSetup(); syncControls(); } });
    } else if (setup.step === 2) {
      body.innerHTML = `<h1>Pick a voice</h1><p class="lede">Play a sample of each. You can switch voices later from the player without leaving the page.</p><div class="card"><div class="voices" id="setupVoices" role="radiogroup" aria-label="Voice"></div></div><div class="setup-foot"><button class="btn primary lg" data-step="3">Continue with <span data-voicename style="margin-left:4px">${S.voice}</span></button><button class="btn quiet lg" data-step="1">Back</button></div>`;
      renderVoices($('#setupVoices'), 'svoice');
    } else {
      body.innerHTML = `<h1>Try it</h1><p class="lede">Press play. This is what Recito does on any article, email or chat.</p><div class="sample" id="sample">${SAMPLE.split(' ').map((w) => `<span>${w}</span>`).join(' ')}</div><div class="setup-foot"><button class="btn primary lg" id="samplePlay">${ic('play')}Play the sample</button><button class="btn lg" data-goto="read">Open a demo article</button></div><ul class="tips"><li><span>Start reading on any page</span><span><kbd>Alt</kbd> <kbd>Shift</kbd> <kbd>Space</kbd></span></li><li><span>Jump around while it reads</span><span>Click any sentence</span></li><li><span>Keep Recito one click away</span><span>Pin it from the puzzle-piece menu</span></li></ul>`;
      const words = $$('#sample span'); let i = -1;
      const tick = () => { words[i]?.classList.remove('on'); i++; if (i >= words.length) { $('#sample').classList.remove('live'); $('#samplePlay').innerHTML = `${ic('retry')}Play again`; i = -1; return; } words[i].classList.add('on'); setup.timer = setTimeout(tick, 150 + words[i].textContent.length * 38); };
      $('#samplePlay').addEventListener('click', () => { clearTimeout(setup.timer); words.forEach((w) => w.classList.remove('on')); i = -1; $('#sample').classList.add('live'); $('#samplePlay').innerHTML = `<span class="spin"></span>Preparing…`; setup.timer = setTimeout(() => { $('#samplePlay').innerHTML = `${ic('pause')}Playing`; tick(); }, 900); });
    }
  }

  // ---------------------------------------------------------------- sync
  function syncControls() {
    const can = PROV[S.prov].speed, sp = spd();
    $$('[data-speed]').forEach((el) => {
      if (!el.firstChild) el.innerHTML = `<button data-sp="-1" aria-label="Slower">−</button><output></output><button data-sp="1" aria-label="Faster">+</button>`;
      el.children[1].textContent = fmtSpeed(sp); el.children[0].disabled = !can || sp <= 0.5; el.children[2].disabled = !can || sp >= 2;
      el.title = can ? '' : 'Xiaomi MiMo has no speed control';
    });
    $('[data-speedextra]', player).innerHTML = can ? `<div class="rp-presets" role="group" aria-label="Speed presets">${[0.75, 1, 1.25, 1.5, 1.75, 2].map((v) => `<button data-preset="${v}" aria-pressed="${v === S.speed}">${fmtSpeed(v)}</button>`).join('')}</div>` : `<div class="rp-hint">Xiaomi MiMo reads at one speed. Switch to OpenAI or a custom endpoint to change it.</div>`;
    $$('[data-voice]').forEach((el) => { el.innerHTML = PROV[S.prov].voices.map((v) => `<option${v.n === S.voice ? ' selected' : ''}>${v.n}</option>`).join(''); });
    $$('[data-vol]').forEach((el) => (el.value = S.vol));
    $$('[data-auto]').forEach((el) => (el.checked = S.auto));
    $$('[data-provline]').forEach((el) => (el.innerHTML = provLine()));
    const sw = scopeWords(), stt = span().tt / sp;
    $$('[data-scopemeta]').forEach((el) => (el.textContent = `${sw.toLocaleString()} words · ${stt < 55000 ? 'under 1 min' : `about ${fmtLeft(stt)}`}`));
    $$('[data-scopelabel]').forEach((el) => (el.textContent = R.sel ? 'Reading selected text' : 'Reading the whole page'));
    $$('[data-voicename]').forEach((el) => (el.textContent = S.voice));
    const chipEl = $('.rp-speed', player);
    chipEl.textContent = fmtSpeed(sp); chipEl.disabled = !can;
    chipEl.setAttribute('aria-label', can ? `Speed ${fmtSpeed(sp)}. Click to change.` : 'Speed fixed at 1× for Xiaomi MiMo');
    chipEl.title = can ? 'Speed (click to step through presets)' : 'Xiaomi MiMo has no speed control';
  }
  function sync() {
    const playing = P.status === 'playing', v = bwView.getBoundingClientRect();
    player.hidden = !P.shown;
    player.dataset.status = P.status; player.dataset.layout = S.layout; player.dataset.side = S.side; player.dataset.pos = S.pos;
    player.setAttribute('aria-orientation', S.layout === 'rail' ? 'vertical' : 'horizontal');
    Object.assign(player.style, { left: '', right: '', bottom: '', transform: '', top: '' });
    if (S.layout === 'rail' && v.height) { if (S.railTop == null) S.railTop = Math.max(8, v.height * 0.5 - 120); player.style.top = `${clamp(S.railTop, 8, Math.max(8, v.height - 250))}px`; }
    const pb = $('.rp-play', player), label = P.status === 'loading' ? 'Preparing the voice' : playing ? 'Pause' : P.status === 'error' ? 'Try again' : 'Play';
    pb.setAttribute('aria-label', label); pb.title = label; pb.setAttribute('aria-busy', P.status === 'loading');
    $('i', pb).innerHTML = ic(playing ? 'pause' : P.status === 'error' ? 'retry' : 'play', 18);
    $('.rp-more', player).setAttribute('aria-expanded', P.open);
    panel.hidden = !P.open;
    extBtn.dataset.live = playing;
    art.classList.toggle('scrub', P.status === 'playing' || P.status === 'paused');
    if (!ppLive.hidden) renderLivePopup();
    syncControls(); progress(true); placeFly(); armTuck(); checkReturn();
  }
  function applyGlobal() {
    const theme = S.themePref === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : S.themePref;
    root.dataset.theme = theme; root.dataset.ink = S.ink;
    root.classList.toggle('hl-underline', S.hl === 'underline'); root.classList.toggle('hl-sentence', S.hl === 'sentence');
    root.classList.toggle('page-dark', S.page === 'dark'); page.classList.toggle('dark', S.page === 'dark');
    $$('.view').forEach((el) => (el.hidden = el.id !== `v-${S.view}`));
    const press = (sel, attr, val) => $$(sel).forEach((b) => b.setAttribute('aria-pressed', b.dataset[attr] === val));
    press('#g-view button', 'view', S.view); press('#g-layout button', 'layout', S.layout); press('#g-theme button', 'themeSet', theme); press('#g-page button', 'pageSet', S.page);
    $('#scenario').value = S.scenario;
    const u = new URLSearchParams({ view: S.view, player: S.layout, scenario: S.scenario, theme: S.themePref, page: S.page });
    try { history.replaceState(null, '', `?${u}`); } catch { /* sandboxed preview */ }
    if (S.view === 'setup') renderSetup();
    syncSettings(); sync();
  }
  function setView(v, sec) { S.view = v; if (sec) S.sec = sec; if (v !== 'read') togglePopup(false); applyGlobal(); $(`#v-${v}`).scrollTop = 0; }

  // ---------------------------------------------------------------- events
  const ACT = {
    toggle, stop, back: () => P.status !== 'idle' && jump(Math.max(R.a, P.si - 1)), fwd: () => P.status !== 'idle' && jump(Math.min(R.b, P.si + 1)),
    wholepage: () => { setScope(0, sents.length - 1, false); renderLivePopup(true); },
    panel: () => { P.open = !P.open; sync(); },
    cycle: () => { const ps = [1, 1.25, 1.5, 1.75, 2, 0.75]; setSpeed(ps[(ps.indexOf(S.speed) + 1) % ps.length] ?? 1); },
    dismiss: () => note(null),
    retry: () => { if (S.scenario === 'badkey') keys.forEach((k) => (k.health = 'ready')); renderKeys(); start(P.si); },
    fixkey: () => { setView('settings', 'voice'); const bad = keys.find((k) => k.health === 'failed'); if (bad) renderKeys(bad.id); },
    setup: () => { setup.step = 1; setView('setup'); },
  };
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act],[data-sp],[data-preset],[data-goto],[data-view],[data-layout],[data-theme-set],[data-page-set],[data-sec],[data-use],[data-hl],[data-th],[data-pos],[data-click],[data-ask],[data-keep],[data-rm],[data-retest],[data-edit],[data-preview],[data-step]');
    if (!t) return;
    const d = t.dataset;
    if (d.act) return ACT[d.act]?.();
    if (d.sp) return setSpeed(S.speed + 0.1 * +d.sp);
    if (d.preset) return setSpeed(+d.preset);
    if (d.goto) { if (d.goto === 'setup') setup.step = 1; return setView(d.goto); }
    if (d.view) return setView(d.view);
    if (d.layout) { S.layout = d.layout; P.open = false; return applyGlobal(); }
    if (d.themeSet) { S.themePref = d.themeSet; return applyGlobal(); }
    if (d.pageSet) { S.page = d.pageSet; return applyGlobal(); }
    if (d.sec) { S.sec = d.sec; syncSettings(); return; }
    if (d.use) { S.prov = d.use; S.voice = PROV[S.prov].voices[0].n; saved(); syncSettings(); return sync(); }
    if (d.hl) { S.hl = d.hl; saved(); return applyGlobal(); }
    if (d.th) { S.themePref = d.th; saved(); return applyGlobal(); }
    if (d.pos) { if (d.pos === 'dock') S.layout = 'dock'; else { S.layout = 'rail'; S.side = d.pos.slice(5); } saved(); return applyGlobal(); }
    if (d.click) { S.click = d.click; saved(); return syncSettings(); }
    if (d.ask || d.keep) { const k = keys.find((x) => x.id === +(d.ask || d.keep)); k.confirm = !!d.ask; renderKeys(); $(`[data-key="${k.id}"] button`)?.focus(); return; }
    if (d.rm) { keys = keys.filter((x) => x.id !== +d.rm); saved(); syncSettings(); return sync(); }
    if (d.retest) { const k = keys.find((x) => x.id === +d.retest); k.health = 'testing'; renderKeys(); setTimeout(() => { k.health = 'ready'; renderKeys(k.id); sync(); }, 1100); return; }
    if (d.edit) { $('#addKey').click(); $('#keySheetTitle').textContent = 'Edit key'; return; }
    if (d.preview !== undefined) { e.preventDefault(); t.innerHTML = `<span class="spin" style="width:12px;height:12px"></span>`; setTimeout(() => { t.innerHTML = ic('pause', 14); setTimeout(() => (t.innerHTML = ic('play', 14)), 1500); }, 500); return; }
    if (d.step) { setup.step = +d.step; return renderSetup(); }
  });
  $('#addKey').addEventListener('click', () => ($('#keySheetTitle').textContent = 'Add a key'), true);
  $('#demoSel').addEventListener('click', () => {
    if (S.view !== 'read') setView('read');
    if (P.status !== 'idle' || P.shown) stop();
    const el = blocks.find((b) => b.textContent.startsWith('Something was traded away'));
    const r = document.createRange(); r.selectNodeContents(el);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    const v = page.getBoundingClientRect(), b = el.getBoundingClientRect();
    page.scrollTo({ top: page.scrollTop + b.top - v.top - v.height * 0.3 });
  });
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.matches('[data-vol]')) { S.vol = +t.value; $$('[data-vol]').forEach((x) => x !== t && (x.value = S.vol)); }
    if (t.matches('[data-seek]')) { const { t0, tt } = span(), ms = t0 + (t.value / 1000) * tt; let i = sents.findIndex((s) => s.words.at(-1).t + s.words.at(-1).d > ms); if (i < 0 || i > R.b) i = R.b; if (i !== P.si) jump(i); }
  });
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-voice]')) { S.voice = t.value; saved(); syncControls(); if ($('#voiceList')) renderVoices($('#voiceList'), 'voice'); }
    if (t.matches('[data-auto]')) { S.auto = t.checked; saved(); syncControls(); }
    if (t.matches('input[name="voice"], input[name="svoice"]')) { S.voice = t.value; saved(); syncControls(); }
    if (t.name === 'ink') { S.ink = t.value; saved(); applyGlobal(); }
    if (t.id === 'tuckSw') { S.tuck = t.checked; saved(); armTuck(); }
    if (t.id === 'scenario') { S.scenario = t.value; P.tripped = false; keys = freshKeys(); stop(); applyGlobal(); if (S.scenario === 'noprovider' && S.view === 'read') start(); }
  });
  seekInput.addEventListener('pointerdown', () => (seeking = true));
  seekInput.addEventListener('pointerup', () => (seeking = false));
  $('#resetBtn').addEventListener('click', () => {
    const c = $('#resetCtl');
    c.innerHTML = `<span style="font-size:13px">Reset all preferences?</span><button class="btn sm danger" id="resetYes">Reset</button><button class="btn sm" id="resetNo">Keep</button>`;
    const back = () => { c.innerHTML = `<button class="btn danger" id="resetBtn2">Reset…</button>`; };
    $('#resetYes').onclick = () => { Object.assign(S, { ink: 'blue', hl: 'marker', tuck: true, auto: true, speed: 1, vol: 90, click: 'popup' }); back(); saved(); applyGlobal(); };
    $('#resetNo').onclick = back;
    $('#resetYes').focus();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (!ppLive.hidden) { togglePopup(false); extBtn.focus(); } else if (P.open) { P.open = false; sync(); $('.rp-more', player).focus(); } return; }
    if (!(e.altKey && e.shiftKey) || S.view !== 'read') return;
    if (e.code === 'Space') { e.preventDefault(); refreshScope(); toggle(); }
    if (e.code === 'ArrowRight') { e.preventDefault(); ACT.fwd(); }
    if (e.code === 'ArrowLeft') { e.preventDefault(); ACT.back(); }
  });
  addEventListener('resize', () => sync());
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => S.themePref === 'system' && applyGlobal());

  // Standalone: fill the window. Embedded in a frame: keep the fixed stage height from CSS.
  const fit = () => { if (window.top === window) $('.stage').style.height = `${Math.max(480, innerHeight - $('.proto').offsetHeight)}px`; };
  let framed = false; try { framed = window.top !== window; } catch { framed = true; }
  if (!framed) { fit(); addEventListener('resize', fit); }
  applyGlobal();
  if (S.scenario === 'noprovider' && S.view === 'read') start();
  window.__recito = { S, P, start, toggle, jump, setView }; // for prototype screenshots only
})();
