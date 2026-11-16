(() => {
'use strict';
const VERSION = '1.0.0';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const app = $('#app');

/* ---------- küçük yardımcılar ---------- */
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'data') for (const d in v) el.dataset[d] = v[d];
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}
const ICONS = {
  back: '<path d="M15 5l-7 7 7 7"/>', search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  mark: '<path d="M6 3h12v18l-6-4-6 4z"/>', aa: '<path d="M3 19l5-13 5 13M5 14h6M15 19l3.5-9 3.5 9M16.2 16h4.6"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>', gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2"/>',
  share: '<path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"/>', note: '<path d="M4 20l4-1 11-11a2.1 2.1 0 00-3-3L5 16z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>', book: '<path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zM4 19V5"/><path d="M9 7h6"/>',
  saved: '<path d="M6 3h12v18l-6-4-6 4z"/><path d="M9 8h6"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>'
};
const ico = (n) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.innerHTML = ICONS[n]; return s; };
const ib = (n, label, fn, cls) => h('button', { class: 'ib ' + (cls || ''), 'aria-label': label, onclick: fn }, ico(n));
function toast(t) { const e = $('#toast'); e.textContent = t; e.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('on'), 2200); }
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const pct = (n) => Math.round(n * 100);

/* ---------- kullanıcı verisi (yalnızca bu telefonda) ---------- */
const DKEY = 'msy.v1';
const DEF = { set: { theme: 'auto', fs: 19, afs: 26, lh: 1.8, font: 'serif', align: 'left' }, pos: {}, read: {}, last: null, bm: [], hl: [] };
function loadData() { try { const d = JSON.parse(localStorage.getItem(DKEY) || '{}'); return Object.assign({}, DEF, d, { set: Object.assign({}, DEF.set, d.set || {}) }); } catch (e) { return JSON.parse(JSON.stringify(DEF)); } }
const S = { lib: null, raw: null, key: null, books: {}, data: loadData(), navs: 0 };
let saveT;
function save() { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(DKEY, JSON.stringify(S.data)); } catch (e) {} }, 150); }
function saveNow() { clearTimeout(saveT); try { localStorage.setItem(DKEY, JSON.stringify(S.data)); } catch (e) {} }
addEventListener('pagehide', saveNow);

function applySettings() {
  const s = S.data.set, r = document.documentElement;
  let th = s.theme;
  if (th === 'auto') th = matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'day';
  r.dataset.theme = th; r.dataset.font = s.font; r.dataset.align = s.align;
  r.style.setProperty('--fs', s.fs + 'px'); r.style.setProperty('--afs', s.afs + 'px'); r.style.setProperty('--lh', s.lh);
  const m = $('meta[name=theme-color]'); if (m) m.content = getComputedStyle(r).getPropertyValue('--bg').trim() || '#fbf7ee';
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applySettings);

/* ---------- şifre çözme ---------- */
const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function deriveKey(pw, salt, iter) {
  const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
}
async function dec(key, o) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(o.iv) }, key, b64(o.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}
function idb(mode, fn) {
  return new Promise((res, rej) => {
    const q = indexedDB.open('msy', 1);
    q.onupgradeneeded = () => q.result.createObjectStore('k');
    q.onerror = () => rej(q.error);
    q.onsuccess = () => { const tx = q.result.transaction('k', mode); const r = fn(tx.objectStore('k')); tx.oncomplete = () => res(r.result); tx.onerror = () => rej(tx.error); };
  });
}
const keyGet = () => idb('readonly', (s) => s.get('key')).catch(() => null);
const keySet = (k) => idb('readwrite', (s) => s.put(k, 'key')).catch(() => {});
const keyDel = () => idb('readwrite', (s) => s.delete('key')).catch(() => {});

async function fetchJson(path) {
  const r = await fetch(path, { cache: 'no-store' });
  if (!r.ok) { const e = new Error('http ' + r.status); e.status = r.status; throw e; }
  return r.json();
}
async function loadLibrary() {
  S.raw = await fetchJson('data/library.enc');
  if (!S.key) S.key = await keyGet();
  if (!S.key) { const e = new Error('locked'); e.locked = true; throw e; }
  try { S.lib = await dec(S.key, S.raw); } catch (e) { S.key = null; await keyDel(); const x = new Error('locked'); x.locked = true; throw x; }
  S.lib.books.sort((a, b) => (a.order || 9) - (b.order || 9));
  const prev = localStorage.getItem('msy.rev');
  if (prev && prev !== String(S.lib.rev)) setTimeout(() => toast('Kitaplar güncellendi'), 600);
  try { localStorage.setItem('msy.rev', String(S.lib.rev)); } catch (e) {}
}
async function unlock(pw) {
  const key = await deriveKey(pw, b64(S.raw.salt), S.raw.iter);
  S.lib = await dec(key, S.raw); // yanlış parolada hata fırlatır
  S.lib.books.sort((a, b) => (a.order || 9) - (b.order || 9));
  S.key = key; await keySet(key);
}
async function loadBook(id) {
  if (S.books[id]) return S.books[id];
  const meta = S.lib.books.find((b) => b.id === id);
  if (!meta) throw new Error('kitap yok');
  const b = await dec(S.key, await fetchJson(meta.file));
  b.byId = {}; b.chapters.forEach((c, i) => { c.i = i; b.byId[c.id] = c; });
  return (S.books[id] = b);
}

/* ---------- arama için metin düzleştirme ---------- */
const FOLD = { 'ı': 'i', 'İ': 'i', 'ş': 's', 'Ş': 's', 'ğ': 'g', 'Ğ': 'g', 'ü': 'u', 'Ü': 'u', 'ö': 'o', 'Ö': 'o', 'ç': 'c', 'Ç': 'c', 'â': 'a', 'Â': 'a', 'î': 'i', 'Î': 'i', 'û': 'u', 'Û': 'u', 'ô': 'o', 'ê': 'e' };
const ARF = { 'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ى': 'ي', 'ی': 'ي', 'ئ': 'ي', 'ؤ': 'و', 'ة': 'ه', 'ک': 'ك' };
function nc(c) {
  const f = FOLD[c]; if (f) return f;
  const k = c.charCodeAt(0);
  if ((k >= 0x64b && k <= 0x65f) || k === 0x670 || k === 0x640 || (k >= 0x6d6 && k <= 0x6ed) || (k >= 0x300 && k <= 0x36f)) return '';
  if (ARF[c]) return ARF[c];
  if (c === '’' || c === "'" || c === '‘' || c === '`' || c === '"' || c === '“' || c === '”' || c === 'ʼ') return '';
  return c.toLowerCase();
}
function norm(s, withMap) {
  let out = '', map = withMap ? [] : null;
  for (let i = 0; i < s.length; i++) { const r = nc(s[i]); out += r; if (map) for (let j = 0; j < r.length; j++) map.push(i); }
  return withMap ? { out, map } : out;
}
function qwords(q) {
  q = q.trim(); if (!q) return [];
  if (/^".+"$/.test(q)) return [norm(q.slice(1, -1)).replace(/\s+/g, ' ').trim()];
  return norm(q).split(/\s+/).filter(Boolean);
}
function findRanges(text, words) {
  const { out, map } = norm(text, true); const rg = [];
  for (const w of words) { let i = 0; while ((i = out.indexOf(w, i)) >= 0) { rg.push([map[i], map[i + w.length - 1] + 1]); i += w.length; } }
  rg.sort((a, b) => a[0] - b[0]);
  const m = []; for (const r of rg) { const l = m[m.length - 1]; if (l && r[0] <= l[1]) l[1] = Math.max(l[1], r[1]); else m.push(r.slice()); }
  return m;
}
function bookIndex(book) {
  if (!book.nb) { book.nb = book.chapters.map((c) => c.b.map((b) => norm(b.x))); }
  return book.nb;
}

/* ---------- metni DOM'a dök (Arapça ayrımı + vurgular) ---------- */
const ARR = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿][؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿ً-ٰٟ\s]*/g;
function plain(t) {
  const f = document.createDocumentFragment(); let last = 0, m; ARR.lastIndex = 0;
  while ((m = ARR.exec(t))) {
    let run = m[0], trail = run.length - run.trimEnd().length; if (trail) run = run.slice(0, -trail);
    if (m.index > last) f.append(t.slice(last, m.index));
    f.append(h('span', { class: 'ar', lang: 'ar', dir: 'rtl' }, run));
    last = m.index + run.length; ARR.lastIndex = last;
  }
  if (last < t.length) f.append(t.slice(last));
  return f;
}
function inline(text, hls, finds) {
  const items = [];
  (hls || []).forEach((x) => items.push({ s: x.s, e: x.e, hl: x }));
  (finds || []).forEach((r) => items.push({ s: r[0], e: r[1], find: true }));
  if (!items.length) return plain(text);
  const pts = new Set([0, text.length]); items.forEach((i) => { pts.add(Math.max(0, i.s)); pts.add(Math.min(text.length, i.e)); });
  const p = [...pts].sort((a, b) => a - b), f = document.createDocumentFragment();
  for (let k = 0; k < p.length - 1; k++) {
    const a = p[k], b = p[k + 1]; if (b <= a) continue;
    const cov = items.filter((i) => i.s <= a && i.e >= b);
    const hl = cov.find((i) => i.hl), fd = cov.some((i) => i.find);
    const node = plain(text.slice(a, b));
    if (hl) { const cl = 'hl ' + (hl.hl.color === 'y' ? '' : hl.hl.color) + (hl.hl.note && hl.hl.s === a ? ' n' : ''); const mk = h('mark', { class: cl.trim(), data: { id: hl.hl.id } }); mk.append(node); if (fd) { const m2 = h('mark', { class: 'find' }); m2.append(mk); f.append(m2); } else f.append(mk); }
    else if (fd) { const mk = h('mark', { class: 'find' }); mk.append(node); f.append(mk); }
    else f.append(node);
  }
  return f;
}

/* ---------- yönlendirme ---------- */
function parse() {
  const hs = location.hash.slice(1) || '/'; const [path, qs] = hs.split('?');
  return { p: path.split('/').filter(Boolean).map(decodeURIComponent), q: new URLSearchParams(qs || '') };
}
const go = (path) => { S.navs++; location.hash = path; };
const rep = (path) => location.replace('#' + path);
function back(fallback) { if (S.navs > 0) { S.navs--; history.back(); } else rep(fallback); }
const enc = encodeURIComponent;
let R = null; // açık okuma durumu

function mount(...kids) { cleanupReader(); app.replaceChildren(...kids); window.scrollTo(0, 0); }
function spin(t) { mount(h('div', { class: 'spin' }, t || 'Yükleniyor…')); }
async function route() {
  if (!S.lib) return;
  hideSel(); closeSheet();
  const { p, q } = parse();
  try {
    if (!p.length) return viewHome();
    if (p[0] === 'b') return await viewToc(p[1]);
    if (p[0] === 'r') return await viewReader(p[1], p[2], q);
    if (p[0] === 's') return await viewSearch(p[1], q);
    if (p[0] === 'k') return viewSaved(q.get('t') || 'bm');
    viewHome();
  } catch (e) { console.error(e); mount(h('div', { class: 'empty' }, 'Bir sorun oluştu: ' + (e.message || e), h('br'), h('br'), h('button', { class: 'btn alt', onclick: () => rep('/') }, 'Ana sayfa'))); }
}
addEventListener('hashchange', route);

/* ---------- ortak parçalar ---------- */
function topbar(title, left, right, tap) {
  return h('div', { class: 'top' }, h('div', { class: 'top-in' }, left || h('span', { style: 'width:44px' }), h('h1', { class: tap ? 'tap' : '', onclick: tap }, title), right || h('span', { style: 'width:44px' })));
}
const palette = ['#1f5b46', '#7a3b2e', '#2f4a6b', '#5b4a1f', '#4a2f6b', '#2f5b5b', '#6b2f4a'];
function cover(b, i) { return h('div', { class: 'cover', style: 'background:' + palette[i % palette.length] }, b.title); }
function bookProgress(id) {
  const meta = S.lib.books.find((b) => b.id === id); const r = S.data.read[id] || {};
  const n = Object.keys(r).length; return meta && meta.n ? Math.min(1, n / meta.n) : 0;
}
function mailto(subject, body) {
  const to = (S.lib && S.lib.email) || '';
  if (!to) return toast('E-posta adresi bulunamadı');
  location.href = 'mailto:' + to + '?subject=' + enc(subject) + '&body=' + enc(body);
}
function feedback(ctx) {
  const lines = [];
  if (ctx && ctx.book) lines.push('Kitap: ' + ctx.book);
  if (ctx && ctx.ch) lines.push('Bölüm: ' + ctx.ch);
  if (ctx && ctx.pos != null) lines.push('Paragraf no: ' + (ctx.pos + 1));
  if (ctx && ctx.text) lines.push('', 'İlgili metin:', '"' + ctx.text.slice(0, 600) + '"');
  lines.push('', 'Eksik / hata / önerim:', '', '', '—', 'Kitaplık sürüm ' + VERSION);
  mailto('Kitaplık geri bildirimi' + (ctx && ctx.book ? ' – ' + ctx.book : ''), lines.join('\n'));
}

/* ---------- kilit ekranı ---------- */
function viewLock(msg) {
  const inp = h('input', { type: 'password', placeholder: 'Parola', autocomplete: 'current-password', autocapitalize: 'off', autocorrect: 'off', 'aria-label': 'Parola' });
  const err = h('div', { class: 'err' }, msg || '');
  const btn = h('button', { class: 'btn' }, 'Aç');
  async function ok() {
    if (!inp.value) return;
    btn.disabled = true; btn.textContent = 'Doğrulanıyor…'; err.textContent = '';
    try { await unlock(inp.value); app.replaceChildren(); route(); }
    catch (e) { btn.disabled = false; btn.textContent = 'Aç'; err.textContent = 'Parola yanlış. Lütfen tekrar deneyin.'; inp.select(); }
  }
  btn.onclick = ok; inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
  app.replaceChildren(h('div', { class: 'lock' }, h('div', { class: 'mark' }, ico('book')), h('h1', null, 'Mehmet Sait Yaz Kitaplığı'),
    h('p', null, 'Bu kitaplık özeldir. Size verilen parolayı bir kez girin; bu telefonda hatırlanır ve kitaplar internetsiz de açılır.'), inp, err, btn));
  setTimeout(() => inp.focus(), 100);
}

/* ---------- ana sayfa ---------- */
function viewHome() {
  const last = S.data.last, lb = last && S.lib.books.find((b) => b.id === last.book);
  const kids = [h('div', { class: 'hero' }, h('div', { class: 'mark' }, ico('book')), h('h1', null, 'Mehmet Sait Yaz Kitaplığı'), h('p', null, 'Kur’an’a göre düşünce ve yazılar'))];
  kids.push(h('div', { class: 'quick' },
    h('button', { onclick: () => go('/s') }, ico('search'), 'Ara'),
    h('button', { onclick: () => go('/k') }, ico('saved'), 'Kayıtlarım'),
    h('button', { onclick: () => settingsSheet() }, ico('gear'), 'Ayarlar')));
  if (lb) {
    kids.push(h('div', { class: 'sec' }, 'Kaldığın yerden devam'));
    kids.push(h('button', { class: 'cont', onclick: () => go(`/r/${enc(last.book)}/${enc(last.ch)}`) }, h('small', null, lb.title), h('b', null, last.ct || ''), h('span', null, '%' + pct(last.f || 0) + ' okundu')));
  }
  kids.push(h('div', { class: 'sec' }, 'Kitaplar'));
  const list = h('div', { class: 'books' });
  S.lib.books.forEach((b, i) => {
    const p = bookProgress(b.id);
    list.append(h('button', { class: 'bk', onclick: () => go('/b/' + enc(b.id)) }, cover(b, i),
      h('div', { class: 'meta' }, h('h3', null, b.title), h('p', null, b.subtitle || ''), h('div', { class: 'prog' }, h('i', { style: 'width:' + pct(p) + '%' })), h('small', null, b.n + ' bölüm · %' + pct(p) + ' okundu'))));
  });
  kids.push(list);
  kids.push(h('div', { class: 'foot' }, h('button', { onclick: () => feedback() }, 'Eksik veya hata bildir'), h('p', null, 'Sürüm ' + VERSION)));
  const wrap = h('div', { class: 'view' }, h('div', { class: 'wrap' }, kids));
  mount(wrap);
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent), standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  if (ios && !standalone && !localStorage.getItem('msy.hint')) {
    const b = h('div', { class: 'banner bot' }, h('span', null, 'Ana ekrana eklemek için Safari’de Paylaş düğmesine, ardından “Ana Ekrana Ekle”ye dokunun.'), h('button', { class: 'x', onclick: () => { try { localStorage.setItem('msy.hint', '1'); } catch (e) {} b.remove(); } }, ico('x')));
    b.querySelector('svg').style.cssText = 'width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:2'; wrap.append(b);
  }
}

/* ---------- içindekiler ---------- */
async function viewToc(id) {
  spin(); const book = await loadBook(id); const meta = S.lib.books.find((b) => b.id === id);
  const read = S.data.read[id] || {}, last = S.data.last && S.data.last.book === id ? S.data.last : null;
  const bms = new Set(S.data.bm.filter((x) => x.book === id).map((x) => x.ch));
  const input = h('input', { class: 'filter', type: 'search', placeholder: 'Bölümlerde ara…', 'aria-label': 'Bölümlerde ara' });
  const box = h('div');
  function draw() {
    const q = norm(input.value.trim()); box.replaceChildren();
    let grp = null, ul = null, n = 0;
    book.chapters.forEach((c) => {
      if (q && !norm(c.t + ' ' + (c.s || '')).includes(q)) return;
      n++;
      if (c.g && c.g !== grp) { grp = c.g; box.append(h('div', { class: 'grp' }, c.g)); ul = h('ul', { class: 'toc' }); box.append(ul); }
      if (!ul) { ul = h('ul', { class: 'toc' }); box.append(ul); }
      const st = bms.has(c.id) ? '★' : read[c.id] ? '✓' : '';
      ul.append(h('li', null, h('button', { class: last && last.ch === c.id ? 'cur' : '', onclick: () => go(`/r/${enc(id)}/${enc(c.id)}`) },
        h('div', { class: 't' }, h('b', null, c.t), c.s ? h('span', { class: c.sar ? 'arx' : '' }, c.s) : null), h('div', { class: 'st' }, st))));
    });
    if (!n) box.append(h('div', { class: 'empty' }, 'Sonuç bulunamadı.'));
  }
  input.addEventListener('input', draw); draw();
  const kids = [h('div', { class: 'bkhead' }, h('h2', null, book.title), h('p', null, book.subtitle || '')), h('div', { style: 'height:12px' })];
  if (last) kids.push(h('button', { class: 'cont', onclick: () => go(`/r/${enc(id)}/${enc(last.ch)}`) }, h('small', null, 'Kaldığın yerden devam'), h('b', null, last.ct), h('span', null, '%' + pct(last.f || 0))));
  kids.push(input, box);
  mount(topbar(book.title, ib('back', 'Geri', () => back('/')), ib('search', 'Bu kitapta ara', () => go('/s/' + enc(id)))), h('div', { class: 'view' }, h('div', { class: 'wrap' }, kids)));
}

/* ---------- okuyucu ---------- */
let scrollH = null, selT = null, SEL = null;
function cleanupReader() { if (scrollH) { removeEventListener('scroll', scrollH); scrollH = null; } R = null; hideSel(); }
async function viewReader(id, chId, q) {
  spin(); const book = await loadBook(id); const ch = book.byId[chId];
  if (!ch) return rep('/b/' + enc(id));
  const i = ch.i, prev = book.chapters[i - 1], next = book.chapters[i + 1];
  const words = qwords(q.get('q') || '');
  R = { id, book, ch, words, bt: book.title };
  const key = id + '/' + chId, savedPos = S.data.pos[key];
  const root = h('div', { class: 'reader', id: 'reader' });
  root.append(h('div', { class: 'chhead' }, h('small', null, book.title), h('h2', null, ch.t), ch.s && !ch.sar ? h('p', null, ch.s) : null));
  ch.b.forEach((b, bi) => {
    const tag = { h: 'h3', l: 'h4' }[b.k] || 'p';
    const cls = { ar: 'ar-block', q: 'q', v: 'verse', sg: 'sig' }[b.k] || '';
    const el = h(tag, { class: 'blk ' + cls, data: { i: bi } });
    if (b.k === 'ar') { el.setAttribute('dir', 'rtl'); el.setAttribute('lang', 'ar'); }
    root.append(el); paint(el, bi);
  });
  const pn = h('div', { class: 'pn' },
    h('button', { disabled: !prev, onclick: () => prev && rep(`/r/${enc(id)}/${enc(prev.id)}`) }, '‹ Önceki', prev ? h('small', null, prev.t) : null),
    h('button', { disabled: !next, onclick: () => next && rep(`/r/${enc(id)}/${enc(next.id)}`) }, 'Sonraki ›', next ? h('small', null, next.t) : null));
  root.append(pn, h('div', { class: 'end' }, h('button', { onclick: () => feedback({ book: book.title, ch: ch.t }) }, 'Bu bölümde eksik / hata bildir')));
  const bar = h('i'); const pbar = h('div', { class: 'pbar' }, bar);
  const bmBtn = ib('mark', 'Yer imi', toggleBm, 'bm');
  const refreshBm = () => bmBtn.classList.toggle('on', S.data.bm.some((x) => x.book === id && x.ch === chId));
  R.refreshBm = refreshBm; refreshBm();
  const top = topbar(ch.t, ib('back', 'İçindekiler', () => back('/b/' + enc(id))), h('div', { style: 'display:flex' }, bmBtn, ib('search', 'Ara', () => go('/s/' + enc(id))), ib('aa', 'Görünüm', () => settingsSheet(true))), () => rep('/b/' + enc(id)));
  top.append(pbar);
  const keep = R; mount(top, root); R = keep;
  // konum
  requestAnimationFrame(() => {
    const target = q.get('b') != null ? +q.get('b') : (savedPos && savedPos.f < 0.9 ? savedPos.b : null);
    if (target != null) { const el = $(`.blk[data-i="${target}"]`, root); if (el) { window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 80); if (q.get('b') != null) { el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 2000); } } }
    onScroll();
  });
  let tick = false;
  function topBlock() {
    const els = $$('.blk', root); let cur = 0;
    for (let k = 0; k < els.length; k++) { if (els[k].getBoundingClientRect().bottom > 70) { cur = k; break; } cur = k; }
    return cur;
  }
  R.topBlock = topBlock;
  function onScroll() {
    if (tick) return; tick = true;
    requestAnimationFrame(() => {
      tick = false; if (!R) return;
      const max = document.documentElement.scrollHeight - innerHeight, f = max <= 0 ? 1 : Math.min(1, Math.max(0, scrollY / max));
      bar.style.width = pct(f) + '%';
      clearTimeout(onScroll.t);
      onScroll.t = setTimeout(() => {
        if (!R) return;
        S.data.pos[key] = { b: topBlock(), f };
        S.data.last = { book: id, ch: chId, ct: ch.t, f, ts: Date.now() };
        if (f >= 0.9) { (S.data.read[id] = S.data.read[id] || {})[chId] = 1; }
        save();
      }, 350);
    });
  }
  scrollH = onScroll; addEventListener('scroll', scrollH, { passive: true });
  function toggleBm() {
    const ex = S.data.bm.filter((x) => x.book === id && x.ch === chId);
    if (ex.length) { S.data.bm = S.data.bm.filter((x) => !(x.book === id && x.ch === chId)); toast('Yer imi kaldırıldı'); }
    else { S.data.bm.push({ id: uid(), book: id, ch: chId, blk: topBlock(), bt: book.title, ct: ch.t, ts: Date.now() }); toast('Yer imi eklendi'); }
    save(); refreshBm();
  }
  root.addEventListener('click', (e) => {
    const m = e.target.closest && e.target.closest('mark.hl'); if (!m) return;
    const s = getSelection(); if (s && !s.isCollapsed) return;
    const hl = S.data.hl.find((x) => x.id === m.dataset.id); if (hl) hlSheet(hl);
  });
}
function hlsFor(bi) {
  const b = R.ch.b[bi], out = [];
  S.data.hl.forEach((x) => {
    if (x.book !== R.id || x.ch !== R.ch.id || x.blk !== bi) return;
    if (b.x.slice(x.s, x.e) !== x.text) { const k = b.x.indexOf(x.text); if (k < 0) return; x.s = k; x.e = k + x.text.length; }
    out.push(x);
  });
  return out;
}
function paint(el, bi) {
  const b = R.ch.b[bi];
  el.replaceChildren(inline(b.x, hlsFor(bi), R.words.length ? findRanges(b.x, R.words) : null));
}
const repaint = (bi) => { const el = $(`#reader .blk[data-i="${bi}"]`); if (el) paint(el, bi); };

/* ---------- seçim çubuğu ---------- */
const selbar = h('div', { id: 'selbar', class: 'hidden' });
document.body.append(selbar);
const COL = { y: '#fbe48a', g: '#9fd6a2', p: '#f2a9c0', b: '#9cc7ee' };
function buildSel() {
  selbar.replaceChildren();
  ['y', 'g', 'p', 'b'].forEach((c) => selbar.append(h('button', { 'aria-label': 'Vurgula', onclick: () => addHl(c) }, h('span', { class: 'dot', style: 'background:' + COL[c] }), '')));
  selbar.append(h('span', { class: 'sep' }),
    h('button', { onclick: noteNew }, ico('note'), 'Not'),
    h('button', { onclick: () => copyText(selRef()) }, ico('copy'), 'Kopyala'),
    h('button', { onclick: () => shareText(selRef()) }, ico('share'), 'Paylaş'),
    h('button', { onclick: reportSel }, ico('mail'), 'Bildir'));
  $$('button', selbar).forEach((b) => { b.addEventListener('pointerdown', (e) => e.preventDefault()); b.addEventListener('mousedown', (e) => e.preventDefault()); });
}
buildSel();
function offIn(el, node, off) { const r = document.createRange(); r.selectNodeContents(el); r.setEnd(node, off); return r.toString().length; }
function updateSel() {
  const sel = getSelection(); const root = $('#reader');
  if (!R || !root || !sel || sel.isCollapsed || !sel.rangeCount) return hideSel();
  const r = sel.getRangeAt(0);
  if (!root.contains(r.commonAncestorContainer)) return hideSel();
  const parts = [];
  $$('.blk', root).forEach((el) => {
    if (!r.intersectsNode(el)) return;
    const text = R.ch.b[+el.dataset.i].x;
    let s = el.contains(r.startContainer) ? offIn(el, r.startContainer, r.startOffset) : 0;
    let e = el.contains(r.endContainer) ? offIn(el, r.endContainer, r.endOffset) : text.length;
    while (s < e && /\s/.test(text[s])) s++; while (e > s && /\s/.test(text[e - 1])) e--;
    if (e > s) parts.push({ i: +el.dataset.i, s, e, text: text.slice(s, e) });
  });
  if (!parts.length) return hideSel();
  SEL = { parts, text: parts.map((p) => p.text).join('\n') };
  selbar.classList.remove('hidden');
}
function hideSel() { SEL = null; selbar.classList.add('hidden'); }
document.addEventListener('selectionchange', () => { clearTimeout(selT); selT = setTimeout(updateSel, 140); });
const selRef = () => SEL ? `“${SEL.text}”\n— Mehmet Sait Yaz, ${R.bt}, ${R.ch.t}` : '';
function clearSel() { const s = getSelection(); s && s.removeAllRanges(); hideSel(); }
function addHl(color, note) {
  if (!SEL) return;
  const parts = SEL.parts;
  parts.forEach((p, k) => S.data.hl.push({ id: uid(), book: R.id, ch: R.ch.id, blk: p.i, s: p.s, e: p.e, text: p.text, color, note: k === 0 && note ? note : '', bt: R.bt, ct: R.ch.t, ts: Date.now() }));
  save(); parts.forEach((p) => repaint(p.i)); clearSel(); toast(note ? 'Not kaydedildi' : 'Vurgulandı');
}
function noteNew() {
  if (!SEL) return; const saved = SEL;
  const ta = h('textarea', { placeholder: 'Notunuzu yazın…' });
  sheet(h('h3', null, 'Not ekle'), h('div', { class: 'quote' }, saved.text), ta, h('button', { class: 'btn', onclick: () => { SEL = saved; addHl('y', ta.value.trim()); closeSheet(); } }, 'Kaydet'));
  setTimeout(() => ta.focus(), 250);
}
function hlSheet(hl) {
  const ta = h('textarea', { placeholder: 'Not ekleyin…' }); ta.value = hl.note || '';
  const cols = h('div', { class: 'colors' });
  ['y', 'g', 'p', 'b'].forEach((c) => cols.append(h('button', { class: hl.color === c ? 'on' : '', style: 'background:' + COL[c], 'aria-label': 'Renk', onclick: () => { hl.color = c; $$('button', cols).forEach((b) => b.classList.remove('on')); cols.children[['y', 'g', 'p', 'b'].indexOf(c)].classList.add('on'); } })));
  sheet(h('h3', null, 'Vurgu'), h('div', { class: 'quote' }, hl.text), cols, ta,
    h('button', { class: 'btn', onclick: () => { hl.note = ta.value.trim(); save(); repaint(hl.blk); closeSheet(); } }, 'Kaydet'),
    h('button', { class: 'btn alt', onclick: () => { copyText(`“${hl.text}”\n— Mehmet Sait Yaz, ${hl.bt}, ${hl.ct}`); } }, 'Kopyala'),
    h('button', { class: 'btn danger', onclick: () => { S.data.hl = S.data.hl.filter((x) => x.id !== hl.id); save(); repaint(hl.blk); closeSheet(); toast('Vurgu silindi'); } }, 'Vurguyu sil'));
}
function reportSel() { if (!SEL) return; feedback({ book: R.bt, ch: R.ch.t, pos: SEL.parts[0].i, text: SEL.text }); }
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); }
  catch (e) { const ta = h('textarea', { style: 'position:fixed;opacity:0' }); ta.value = t; document.body.append(ta); ta.select(); try { document.execCommand('copy'); } catch (x) {} ta.remove(); }
  toast('Kopyalandı'); if (SEL) clearSel();
}
async function shareText(t) {
  if (navigator.share) { try { await navigator.share({ text: t }); if (SEL) clearSel(); return; } catch (e) { if (e.name === 'AbortError') return; } }
  copyText(t);
}

/* ---------- alt sayfalar ---------- */
let scrim = null, sh = null;
function sheet(...kids) {
  closeSheet();
  scrim = h('div', { class: 'scrim', onclick: closeSheet }); sh = h('div', { class: 'sheet', role: 'dialog' }, h('div', { class: 'grab' }), kids);
  document.body.append(scrim, sh);
}
function closeSheet() { scrim && scrim.remove(); sh && sh.remove(); scrim = sh = null; }
function settingsSheet(fromReader) {
  const st = S.data.set;
  const seg = (key, opts) => { const d = h('div', { class: 'seg' }); opts.forEach(([v, l]) => d.append(h('button', { class: st[key] === v ? 'on' : '', onclick: () => { st[key] = v; save(); applySettings(); $$('button', d).forEach((b) => b.classList.toggle('on', b.dataset.v === String(v))); } , data: { v } }, l))); return d; };
  const rng = (key, min, max, step, fmt) => { const val = h('span', { class: 'val' }, fmt(st[key])); const i = h('input', { type: 'range', min, max, step, value: st[key], 'aria-label': key, oninput: () => { st[key] = +i.value; val.textContent = fmt(st[key]); save(); applySettings(); } }); return [i, val]; };
  const rows = [h('h3', null, 'Görünüm'),
    h('div', { class: 'row' }, h('label', null, 'Tema'), seg('theme', [['auto', 'Otomatik'], ['day', 'Gündüz'], ['sepia', 'Sepya'], ['night', 'Gece']])),
    h('div', { class: 'row' }, h('label', null, 'Yazı tipi'), seg('font', [['serif', 'Klasik'], ['sans', 'Sade']])),
    h('div', { class: 'row' }, h('label', null, 'Hizalama'), seg('align', [['left', 'Sola'], ['justify', 'İki yana']])),
    h('div', { class: 'row' }, h('label', null, 'Yazı boyutu'), ...rng('fs', 15, 30, 1, (v) => v)),
    h('div', { class: 'row' }, h('label', null, 'Arapça boyut'), ...rng('afs', 20, 52, 1, (v) => v)),
    h('div', { class: 'row' }, h('label', null, 'Satır aralığı'), ...rng('lh', 1.4, 2.4, 0.1, (v) => v.toFixed(1)))];
  if (!fromReader) rows.push(h('div', { style: 'height:12px' }),
    h('button', { class: 'btn alt', onclick: backupSheet }, 'Notlarımı yedekle / geri yükle'),
    h('button', { class: 'btn alt', onclick: () => feedback() }, 'Eksik veya hata bildir'),
    h('button', { class: 'btn danger', onclick: lockApp }, 'Kilitle (parolayı bu telefondan sil)'),
    h('p', { style: 'text-align:center;color:var(--muted);font-size:12px;margin:14px 0 0' }, 'Sürüm ' + VERSION));
  sheet(...rows);
}
async function lockApp() {
  if (!confirm('Bu telefondaki parola silinecek; kitapları açmak için parolayı tekrar girmeniz gerekir. Notlarınız silinmez.')) return;
  await keyDel(); S.key = null; S.lib = null; S.books = {}; location.hash = ''; location.reload();
}
function backupSheet() {
  const ta = h('textarea', { placeholder: 'Yedeği geri yüklemek için buraya yapıştırın…' });
  sheet(h('h3', null, 'Notlarım ve yer imlerim'), h('p', { style: 'color:var(--muted);font-size:14px;line-height:1.5;margin-top:0' }, 'Telefonu değiştirirseniz veya uygulamayı silerseniz notlarınız kaybolur. Yedeği kendinize gönderip saklayın.'),
    h('button', { class: 'btn', onclick: () => { const j = JSON.stringify({ hl: S.data.hl, bm: S.data.bm, read: S.data.read, pos: S.data.pos }); shareText(j); } }, 'Yedeği paylaş / kopyala'),
    h('div', { style: 'height:14px' }), ta,
    h('button', { class: 'btn alt', onclick: () => { try { const d = JSON.parse(ta.value); if (!Array.isArray(d.hl) || !Array.isArray(d.bm)) throw 0; S.data.hl = d.hl; S.data.bm = d.bm; S.data.read = d.read || {}; S.data.pos = d.pos || {}; saveNow(); closeSheet(); toast('Yedek geri yüklendi'); route(); } catch (e) { toast('Yedek okunamadı'); } } }, 'Geri yükle'));
}

/* ---------- arama ---------- */
let lastQ = '';
async function viewSearch(bookId, q0) {
  const scopeBook = bookId && S.lib.books.find((b) => b.id === bookId) ? bookId : null;
  let scope = scopeBook ? 'one' : 'all';
  const input = h('input', { type: 'search', placeholder: 'Kelime veya cümle ara…', autocapitalize: 'off', autocorrect: 'off', enterkeyhint: 'search', 'aria-label': 'Ara' });
  input.value = q0.get('q') || lastQ;
  const out = h('div', { class: 'wrap' });
  const scopeBar = h('div', { class: 'scope' });
  function drawScope() { scopeBar.replaceChildren(); if (!scopeBook) return; const t = S.lib.books.find((b) => b.id === scopeBook).title; scopeBar.append(h('button', { class: scope === 'one' ? 'on' : '', onclick: () => { scope = 'one'; drawScope(); run(); } }, t), h('button', { class: scope === 'all' ? 'on' : '', onclick: () => { scope = 'all'; drawScope(); run(); } }, 'Tüm kitaplar')); }
  drawScope();
  let timer, token = 0;
  async function run() {
    const my = ++token; lastQ = input.value; const words = qwords(input.value);
    out.replaceChildren();
    if (!words.length) return out.append(h('div', { class: 'empty' }, 'Aramak istediğiniz kelimeyi yazın.', h('br'), 'Arapça aramada harekeler ve yazım farkları dikkate alınmaz. Türkçede ş, ğ, ı gibi harfleri yazmasanız da bulunur.'));
    out.append(h('div', { class: 'spin' }, 'Aranıyor…'));
    const ids = scope === 'one' ? [scopeBook] : S.lib.books.map((b) => b.id);
    const hits = []; let more = false;
    for (const id of ids) {
      const book = await loadBook(id); if (my !== token) return;
      const nb = bookIndex(book);
      for (let ci = 0; ci < book.chapters.length && !more; ci++) {
        const arr = nb[ci];
        for (let bi = 0; bi < arr.length; bi++) {
          const t = arr[bi]; let ok = true;
          for (const w of words) if (!t.includes(w)) { ok = false; break; }
          if (ok) { hits.push({ book, ci, bi }); if (hits.length >= 250) { more = true; break; } }
        }
      }
    }
    if (my !== token) return;
    out.replaceChildren();
    if (!hits.length) return out.append(h('div', { class: 'empty' }, 'Sonuç bulunamadı.'));
    out.append(h('div', { class: 'sec' }, hits.length + (more ? '+' : '') + ' sonuç'));
    const ul = h('ul', { class: 'res' });
    for (const x of hits) {
      const ch = x.book.chapters[x.ci], b = ch.b[x.bi], rg = findRanges(b.x, words); const s0 = rg.length ? rg[0][0] : 0;
      const a = Math.max(0, s0 - 70), z = Math.min(b.x.length, s0 + 150);
      const frag = document.createDocumentFragment(); if (a > 0) frag.append('… ');
      let pos = a;
      for (const r of rg) { if (r[1] <= a || r[0] >= z) continue; const rs = Math.max(r[0], a), re = Math.min(r[1], z); if (rs > pos) frag.append(plain(b.x.slice(pos, rs))); frag.append(h('mark', null, plain(b.x.slice(rs, re)))); pos = re; }
      if (pos < z) frag.append(plain(b.x.slice(pos, z))); if (z < b.x.length) frag.append(' …');
      ul.append(h('li', null, h('button', { onclick: () => go(`/r/${enc(x.book.id)}/${enc(ch.id)}?b=${x.bi}&q=${enc(input.value)}`) }, h('div', { class: 'w' }, x.book.title + ' · ' + ch.t), h('div', { class: 's' }, frag))));
    }
    out.append(ul);
  }
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 280); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { input.blur(); clearTimeout(timer); run(); } });
  mount(topbar('Ara', ib('back', 'Geri', () => back('/'))), h('div', { class: 'view' }, h('div', { class: 'sbox' }, input), scopeBar, out));
  if (input.value) run(); else setTimeout(() => input.focus(), 150);
}

/* ---------- kayıtlarım ---------- */
function viewSaved(tab) {
  const tabs = [['bm', 'Yer imleri'], ['hl', 'Vurgular'], ['nt', 'Notlar']];
  const list = h('div');
  const dt = (ts) => new Date(ts).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
  function draw() {
    list.replaceChildren();
    let items;
    if (tab === 'bm') items = S.data.bm.slice().sort((a, b) => b.ts - a.ts);
    else if (tab === 'hl') items = S.data.hl.slice().sort((a, b) => b.ts - a.ts);
    else items = S.data.hl.filter((x) => x.note).sort((a, b) => b.ts - a.ts);
    if (!items.length) return list.append(h('div', { class: 'empty' }, tab === 'bm' ? 'Henüz yer imi yok. Okurken üstteki yer imi düğmesine dokunun.' : 'Henüz kayıt yok. Metni seçip renkli düğmelere ya da “Not”a dokunun.'));
    const ul = h('ul', { class: 'res' });
    items.forEach((x) => {
      const del = h('button', { class: 'del', 'aria-label': 'Sil', onclick: (e) => { e.stopPropagation(); if (tab === 'bm') S.data.bm = S.data.bm.filter((y) => y.id !== x.id); else S.data.hl = S.data.hl.filter((y) => y.id !== x.id); save(); draw(); } }, '×');
      const body = tab === 'bm' ? h('div', { class: 's' }, x.ct) : h('div', null, h('div', { class: 's' }, h('span', { class: 'sw', style: 'background:' + COL[x.color] }), x.text.length > 220 ? x.text.slice(0, 220) + '…' : x.text), x.note ? h('div', { class: 'note' }, x.note) : null);
      ul.append(h('li', null, h('button', { onclick: () => go(`/r/${enc(x.book)}/${enc(x.ch)}?b=${x.blk}`) }, del, h('div', { class: 'w' }, x.bt + (tab === 'bm' ? '' : ' · ' + x.ct) + ' · ' + dt(x.ts)), body)));
    });
    list.append(ul);
  }
  const tb = h('div', { class: 'tabs' });
  tabs.forEach(([k, l]) => tb.append(h('button', { class: tab === k ? 'on' : '', onclick: () => { tab = k; $$('button', tb).forEach((b, i) => b.classList.toggle('on', tabs[i][0] === k)); draw(); } }, l)));
  draw();
  mount(topbar('Kayıtlarım', ib('back', 'Geri', () => back('/'))), h('div', { class: 'view' }, h('div', { class: 'wrap' }, tb, list)));
}

/* ---------- güncelleme / çevrimdışı ---------- */
let updating = false;
function showUpdate(reg) {
  if ($('.banner.upd')) return;
  const b = h('div', { class: 'banner upd' }, h('span', null, 'Yeni sürüm hazır.'), h('button', { onclick: () => { updating = true; (reg.waiting || reg.installing)?.postMessage('skip'); setTimeout(() => location.reload(), 1500); } }, 'Güncelle'));
  document.body.append(b);
}
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg);
    reg.addEventListener('updatefound', () => { const nw = reg.installing; nw && nw.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) showUpdate(reg); }); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
  }).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (updating) location.reload(); });
}

/* ---------- başlangıç ---------- */
async function boot() {
  applySettings(); registerSW();
  spin();
  try { await loadLibrary(); route(); }
  catch (e) {
    if (e.locked) return viewLock();
    mount(h('div', { class: 'empty' }, e.status === 404 ? 'Kitap verileri bulunamadı. Lütfen yöneticiye (Mehmet Sait Yaz) haber verin.' : 'Kitaplar yüklenemedi. İlk açılışta internet gerekir; bağlantınızı kontrol edip tekrar deneyin.', h('br'), h('br'), h('button', { class: 'btn alt', onclick: () => location.reload() }, 'Tekrar dene')));
  }
}
boot();
})();
