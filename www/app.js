(() => {
'use strict';

/* ============ ثوابت وإعدادات ============ */
const KEY = 'wird.v1';
const ACCENTS = [
  { id: 'emerald', name: 'زمردي',  c: '#0f8a63' },
  { id: 'ocean',   name: 'أزرق',   c: '#2563eb' },
  { id: 'gold',    name: 'ذهبي',   c: '#b7791f' },
  { id: 'violet',  name: 'بنفسجي', c: '#7c3aed' },
  { id: 'rose',    name: 'وردي',   c: '#db2777' },
  { id: 'teal',    name: 'فيروزي', c: '#0e7490' },
  { id: 'slate',   name: 'رمادي',  c: '#475569' }
];
const WIDGET_DEFS = {
  ring:   { name: 'نسبة الختمة',        styles: { ring: 'دائرة', semi: 'نصف دائرة', bar: 'شريط' } },
  surah:  { name: 'نسبة سورة',          styles: { ring: 'دائرة', semi: 'نصف دائرة', bar: 'شريط' }, pickSurah: true },
  stats:  { name: 'إحصائيات سريعة' },
  daily:  { name: 'القراءة اليومية',    styles: { bars: 'أعمدة', line: 'خط', area: 'مساحة' }, ranges: [7, 14, 30], rangeUnit: 'يوم' },
  surahs: { name: 'السور قيد القراءة',  styles: { bars: 'أشرطة', rings: 'دوائر' } },
  map:    { name: 'خريطة السور' },
  heat:   { name: 'التقويم الحراري',    ranges: [12, 26, 52], rangeUnit: 'أسبوع' },
  recent: { name: 'آخر التسجيلات' }
};
const defaultWidgets = () => [
  { id: 'ring',   on: true, size: 2, style: 'ring' },
  { id: 'stats',  on: true, size: 2 },
  { id: 'surah',  on: true, size: 2, style: 'ring', surah: 'auto' },
  { id: 'daily',  on: true, size: 2, style: 'bars', range: 7 },
  { id: 'surahs', on: true, size: 2, style: 'bars' },
  { id: 'map',    on: true, size: 2 },
  { id: 'heat',   on: true, size: 2, range: 26 },
  { id: 'recent', on: true, size: 2 }
];
const MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const DAYS_L = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
const DAYS_S = ['أحد','اثنين','ثلاثاء','أربعاء','خميس','جمعة','سبت'];
const TAB_TITLES = { home: 'لوحتي', log: 'تسجيل قراءة', index: 'فهرس السور', history: 'سجل القراءة', settings: 'الإعدادات' };

/* ============ الحالة ============ */
const defaults = () => ({
  v: 1,
  entries: [],
  khatmas: { read: 1, hifz: 1, review: 1, tadabbur: 1 },
  settings: { accent: 'emerald', mode: 'auto', indic: false, name: '', goal: 0,
              filterType: 'read', filterReader: 'all', widgets: defaultWidgets() }
});
function migrate(o) {
  const d = defaults();
  const s = Object.assign({}, d.settings, (o && o.settings) || {});
  if (!Array.isArray(s.widgets)) s.widgets = defaultWidgets();
  s.widgets = s.widgets.filter(w => WIDGET_DEFS[w.id]);
  const have = new Set(s.widgets.map(w => w.id));
  d.settings.widgets.forEach(w => { if (!have.has(w.id)) s.widgets.push(w); });
  return {
    v: 1,
    entries: Array.isArray(o && o.entries) ? o.entries : [],
    khatmas: Object.assign({}, d.khatmas, (o && o.khatmas) || {}),
    settings: s
  };
}
function load() {
  try { const raw = localStorage.getItem(KEY); return raw ? migrate(JSON.parse(raw)) : defaults(); }
  catch (e) { return defaults(); }
}
let S = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
const F = () => S.settings;

let tab = 'home', mapSel = null, idxQuery = '', editId = null, logPrefill = null;
let hist = { type: 'all', reader: 'all', limit: 60 };
let sheetMode = null, sheetResolve = null, P = null;

/* ============ أدوات ============ */
const $ = (s, r = document) => r.querySelector(s);
const pad = n => String(n).padStart(2, '0');
const dstr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => dstr(new Date());
const parseD = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return dstr(d); };
const daysBetween = (a, b) => Math.round((parseD(b) - parseD(a)) / 86400000);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = n => Number(n).toLocaleString('en-US');
const typeName = id => (KHATMA_TYPES.find(t => t.id === id) || {}).name || id;
const typeShort = id => (KHATMA_TYPES.find(t => t.id === id) || {}).short || id;
const norm = s => String(s).replace(/[ً-ْٰ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').trim();
const fmtPct = x => {
  if (x >= 100) return '100';
  const f = Math.floor(x * 10) / 10;
  return f % 1 === 0 ? String(f) : f.toFixed(1);
};
function relDate(s) {
  const t = today();
  if (s === t) return 'اليوم';
  if (s === addDays(t, -1)) return 'أمس';
  const d = parseD(s);
  return `${DAYS_L[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
function hijri() {
  try { return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()); }
  catch (e) { return ''; }
}
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  if (S.settings.indic) indicize(t);
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2600);
}
const IND = '٠١٢٣٤٥٦٧٨٩';
function indicize(root) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: n => (/[0-9%]/.test(n.nodeValue) && !['TEXTAREA', 'SCRIPT', 'STYLE'].includes(n.parentNode.nodeName))
      ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
  });
  const nodes = [];
  while (w.nextNode()) nodes.push(w.currentNode);
  nodes.forEach(n => { n.nodeValue = n.nodeValue.replace(/[0-9]/g, d => IND[d]).replace(/%/g, '٪'); });
}

/* ============ حساب التغطية والنسب ============ */
function coverage(entries) {
  const cov = SURAHS.map(s => new Uint8Array(s[1] + 1));
  entries.forEach(e => {
    const a = cov[e.surah - 1];
    if (!a) return;
    for (let i = Math.max(1, e.from); i <= Math.min(e.to, a.length - 1); i++) a[i] = 1;
  });
  return cov;
}
function counts(cov) {
  const per = cov.map(a => { let c = 0; for (let i = 1; i < a.length; i++) c += a[i]; return c; });
  return { per, total: per.reduce((a, b) => a + b, 0) };
}
function ranges(arr) {
  const r = []; let s = 0;
  for (let i = 1; i < arr.length; i++) {
    if (arr[i]) { if (!s) s = i; } else if (s) { r.push([s, i - 1]); s = 0; }
  }
  if (s) r.push([s, arr.length - 1]);
  return r;
}
const byReader = (e, reader) => reader === 'all' || e.reader === reader;
const filtered = () => S.entries.filter(e => e.type === F().filterType && byReader(e, F().filterReader));
const khatmaEntries = (type, reader) => S.entries.filter(e => e.type === type && e.khatma === S.khatmas[type] && byReader(e, reader));
function progress() {
  const es = khatmaEntries(F().filterType, F().filterReader);
  const cov = coverage(es);
  const { per, total } = counts(cov);
  return { es, cov, per, total, pct: total / TOTAL_AYAHS * 100 };
}
const lastOf = es => es.reduce((m, e) => (!m || e.date > m.date || (e.date === m.date && (e.ts || 0) >= (m.ts || 0))) ? e : m, null);
const readers = () => [...new Set(S.entries.map(e => e.reader).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar'));
const ayahsOf = e => e.to - e.from + 1;
function dayMap(es) { const m = {}; es.forEach(e => { m[e.date] = (m[e.date] || 0) + ayahsOf(e); }); return m; }

function calcStats() {
  const es = filtered();
  const days = new Set(es.map(e => e.date));
  const t = today();
  let streak = 0, d = days.has(t) ? t : addDays(t, -1);
  while (days.has(d)) { streak++; d = addDays(d, -1); }
  let avg = 0;
  if (es.length) {
    const first = es.reduce((m, e) => e.date < m ? e.date : m, es[0].date);
    const span = Math.max(1, Math.min(14, daysBetween(first, t) + 1));
    const sum = es.filter(e => e.date > addDays(t, -14)).reduce((a, e) => a + ayahsOf(e), 0);
    avg = sum / span;
  }
  const remaining = TOTAL_AYAHS - P.total;
  const eta = remaining <= 0 ? 0 : (avg > 0 ? Math.ceil(remaining / avg) : null);
  const todayN = (dayMap(es)[t]) || 0;
  return { streak, days: days.size, avg, remaining, eta, todayN, completed: S.khatmas[F().filterType] - 1 };
}

/* ============ رسوم SVG ============ */
function ringSVG(pct, size, stroke, big, small) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, off = c * (1 - Math.min(pct, 100) / 100), h = size / 2;
  return `<svg class="ring" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${big}">
    <circle cx="${h}" cy="${h}" r="${r}" fill="none" stroke="var(--track)" stroke-width="${stroke}"/>
    <circle class="ring-fg" cx="${h}" cy="${h}" r="${r}" fill="none" stroke="var(--accent)" stroke-width="${stroke}" stroke-linecap="round"
      stroke-dasharray="${c}" style="--c:${c};--off:${off}" ${pct <= 0 ? 'opacity="0"' : ''} transform="rotate(-90 ${h} ${h})"/>
    <text x="50%" y="${small ? '45%' : '50%'}" text-anchor="middle" dominant-baseline="central" class="ring-big" style="font-size:${size * (small ? .2 : .22)}px">${big}</text>
    ${small ? `<text x="50%" y="63%" text-anchor="middle" dominant-baseline="central" class="ring-small" style="font-size:${size * .09}px">${small}</text>` : ''}
  </svg>`;
}
function semiSVG(pct, w, st, big) {
  const r = (w - st) / 2, cy = r + st / 2, len = Math.PI * r, off = len * (1 - Math.min(pct, 100) / 100), hgt = cy + st / 2 + 4;
  const d = `M ${w - st / 2} ${cy} A ${r} ${r} 0 0 0 ${st / 2} ${cy}`;
  return `<svg class="semi" viewBox="0 0 ${w} ${hgt}" width="${w}" role="img" aria-label="${big}">
    <path d="${d}" fill="none" stroke="var(--track)" stroke-width="${st}" stroke-linecap="round"/>
    <path class="ring-fg" d="${d}" fill="none" stroke="var(--accent)" stroke-width="${st}" stroke-linecap="round"
      stroke-dasharray="${len}" style="--c:${len};--off:${off}" ${pct <= 0 ? 'opacity="0"' : ''}/>
    <text x="${w / 2}" y="${cy - r * .1}" text-anchor="middle" class="ring-big" style="font-size:${w * .2}px">${big}</text>
  </svg>`;
}
const barHTML = (pct, h = 10) => `<div class="bar" style="height:${h}px"><i style="width:${Math.min(100, pct)}%"></i></div>`;
function stripHTML(arr) {
  const n = arr.length - 1;
  return `<div class="strip">${ranges(arr).map(([a, b]) => `<i style="inset-inline-start:${(a - 1) / n * 100}%;width:${(b - a + 1) / n * 100}%"></i>`).join('')}</div>`;
}
const visual = (style, pct, sizeCol) => {
  const big = fmtPct(pct) + '%';
  if (style === 'bar') return `<div class="bigpct">${big}</div>${barHTML(pct, 14)}`;
  if (style === 'semi') return semiSVG(pct, sizeCol ? 190 : 210, 16, big);
  return ringSVG(pct, sizeCol ? 130 : 150, 14, big);
};

/* ============ الودجات ============ */
function card(w, title, extra, body, cls = '') {
  return `<section class="card w-${w.size === 1 ? 1 : 2} ${cls}"><header><h3>${title}</h3>${extra || ''}</header>${body}</section>`;
}
function wRing(w) {
  const col = w.size === 1, k = S.khatmas[F().filterType];
  const done = P.per.filter((c, i) => c === SURAHS[i][1]).length;
  const st = calcStats();
  const goal = +F().goal || 0;
  const info = `
    <div class="kv"><b>${nf(P.total)}</b><span>من ${nf(TOTAL_AYAHS)} آية</span></div>
    <div class="kv"><b>${nf(st.remaining)}</b><span>آية متبقية</span></div>
    <div class="kv"><b>${done}</b><span>من 114 سورة مكتملة</span></div>
    ${goal ? `<div class="kv"><b>${st.todayN}/${goal}</b><span>هدف اليوم</span></div>` : ''}`;
  const bar = w.style === 'bar';
  return card(w, `${typeName(F().filterType)}`, `<span class="pill">رقم ${k}</span>`,
    `<div class="hero ${col ? 'col' : ''} ${bar ? 'bar-style' : ''}"><div class="hero-vis">${visual(w.style, P.pct, col)}</div><div class="hero-info">${info}</div></div>`);
}
function surahIndexFor(w) {
  if (w.surah && w.surah !== 'auto') return +w.surah;
  const l = lastOf(P.es);
  return l ? l.surah : 1;
}
function wSurah(w) {
  const n = surahIndexFor(w), [name, cnt] = SURAHS[n - 1], got = P.per[n - 1], pct = got / cnt * 100;
  const col = w.size === 1;
  const rs = ranges(P.cov[n - 1]);
  const rtxt = rs.length && rs.length <= 3 ? `المقروء: ${rs.map(([a, b]) => a === b ? a : `${a}–${b}`).join('، ')}` : '';
  const body = `<div class="hero ${col ? 'col' : ''} ${w.style === 'bar' ? 'bar-style' : ''}">
      <div class="hero-vis">${visual(w.style, pct, col)}</div>
      <div class="hero-info"><div class="kv"><b>${got}</b><span>من ${cnt} آية</span></div>${rtxt ? `<div class="small muted">${rtxt}</div>` : ''}</div></div>
    ${stripHTML(P.cov[n - 1])}
    <div class="info"><span></span><button class="btn sm" data-act="logsurah" data-s="${n}">سجّل في هذه السورة</button></div>`;
  return card(w, `سورة ${name}`, `<span class="pill">${n}</span>`, body);
}
function wStats(w) {
  const s = calcStats();
  const eta = s.eta === 0 ? 'مكتملة' : (s.eta == null ? '—' : `≈ ${nf(s.eta)} يوم`);
  const tiles = [
    [nf(s.remaining), 'آية متبقية'],
    [eta, 'الإتمام المتوقع'],
    [`${s.streak} يوم`, 'أيام متتالية'],
    [nf(s.days), 'أيام القراءة'],
    [(Math.round(s.avg * 10) / 10).toString(), 'آية يوميًا (14 يوم)'],
    [nf(s.completed), 'ختمات مكتملة']
  ];
  return card(w, 'إحصائيات سريعة', `<span class="pill">${typeShort(F().filterType)}</span>`,
    `<div class="tiles">${tiles.map(t => `<div class="tile"><b>${t[0]}</b><span>${t[1]}</span></div>`).join('')}</div>`);
}
function wDaily(w) {
  const R = w.range || 7, t = today(), m = dayMap(filtered());
  const days = [];
  for (let i = R - 1; i >= 0; i--) { const d = addDays(t, -i); days.push({ d, v: m[d] || 0 }); }
  const total = days.reduce((a, x) => a + x.v, 0), avg = Math.round(total / R * 10) / 10, goal = +F().goal || 0;
  const W = 320, H = 156, padX = 6, top = 20, bot = 22, cw = W - padX * 2, ch = H - top - bot;
  const max = Math.max(5, goal, ...days.map(x => x.v)), step = cw / R;
  const xc = i => W - padX - (i + .5) * step, y = v => top + ch * (1 - v / max);
  let g = '';
  if (goal) g += `<line class="goal" x1="${padX}" x2="${W - padX}" y1="${y(goal)}" y2="${y(goal)}"/>`;
  if (w.style === 'line' || w.style === 'area') {
    const pts = days.map((x, i) => [xc(i), y(x.v)]);
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
    if (w.style === 'area') g += `<path d="${line} L${pts[pts.length - 1][0].toFixed(1)} ${top + ch} L${pts[0][0].toFixed(1)} ${top + ch} Z" fill="rgba(var(--accent-rgb),.16)"/>`;
    g += `<path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
    if (R <= 14) pts.forEach((p, i) => { g += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.2" fill="var(--card)" stroke="var(--accent)" stroke-width="2"/>`; });
  } else {
    const bw = Math.min(30, step * .64);
    days.forEach((x, i) => {
      const h = x.v > 0 ? Math.max(3, ch * x.v / max) : 2;
      g += `<rect x="${(xc(i) - bw / 2).toFixed(1)}" y="${(top + ch - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="${Math.min(5, bw / 2)}" fill="${x.v > 0 ? 'var(--accent)' : 'var(--track)'}"/>`;
    });
  }
  days.forEach((x, i) => {
    const age = R - 1 - i;
    if (R <= 14 && x.v > 0) g += `<text class="axv" x="${xc(i).toFixed(1)}" y="${(y(x.v) - 6).toFixed(1)}" text-anchor="middle">${x.v}</text>`;
    let lab = '';
    if (R <= 7) lab = DAYS_S[parseD(x.d).getDay()];
    else if (R <= 14) lab = parseD(x.d).getDate();
    else if (age % 5 === 0) lab = parseD(x.d).getDate();
    if (lab !== '') g += `<text class="ax" x="${xc(i).toFixed(1)}" y="${H - 6}" text-anchor="middle">${lab}</text>`;
  });
  const svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="القراءة اليومية">${g}</svg>`;
  return card(w, 'القراءة اليومية', `<span class="pill">آخر ${R} يوم</span>`,
    svg + `<div class="info"><span>المجموع: <b>${nf(total)}</b> آية</span><span>المتوسط: <b>${avg}</b> يوميًا</span></div>`);
}
function wSurahs(w) {
  const lastTouch = {};
  P.es.forEach(e => { const k = e.date + (e.ts || 0); if (!lastTouch[e.surah] || k > lastTouch[e.surah]) lastTouch[e.surah] = k; });
  const list = SURAHS.map((s, i) => ({ n: i + 1, name: s[0], cnt: s[1], got: P.per[i] }))
    .filter(x => x.got > 0 && x.got < x.cnt)
    .sort((a, b) => String(lastTouch[b.n]).localeCompare(String(lastTouch[a.n])));
  const shown = list.slice(0, 6);
  let body;
  if (!shown.length) body = `<div class="empty">لا توجد سور قيد القراءة حاليًا</div>`;
  else if (w.style === 'rings') {
    body = `<div class="rings">${shown.map(x => `<div>${ringSVG(x.got / x.cnt * 100, 72, 8, fmtPct(x.got / x.cnt * 100) + '%')}<div class="nm">${x.name}</div></div>`).join('')}</div>`;
  } else {
    body = shown.map(x => `<div class="prow"><div class="l"><b>${x.name}</b><span>${x.got}/${x.cnt} • ${fmtPct(x.got / x.cnt * 100)}%</span></div>${barHTML(x.got / x.cnt * 100, 9)}</div>`).join('');
  }
  if (list.length > 6) body += `<div class="info"><span>و${list.length - 6} سور أخرى</span><button class="btn sm" data-act="tab" data-t="index">الفهرس</button></div>`;
  return card(w, 'السور قيد القراءة', `<span class="pill">${list.length}</span>`, body);
}
function wMap(w) {
  const done = P.per.filter((c, i) => c === SURAHS[i][1]).length;
  const cells = SURAHS.map((s, i) => {
    const f = P.per[i] / s[1];
    const style = f > 0 ? `background:rgba(var(--accent-rgb),${(.2 + .8 * f).toFixed(2)});color:${f > .5 ? '#fff' : 'var(--text)'}` : '';
    return `<button class="mcell ${mapSel === i + 1 ? 'sel' : ''}" style="${style}" data-act="mapsel" data-s="${i + 1}" aria-label="${s[0]}">${i + 1}</button>`;
  }).join('');
  return card(w, 'خريطة السور', `<span class="pill">${done}/114 مكتملة</span>`,
    `<div class="map">${cells}</div><div class="info" id="mapinfo">${mapInfoHTML()}</div>`);
}
function mapInfoHTML() {
  if (!mapSel) return `<span>اضغط على سورة لعرض نسبتها</span>`;
  const [name, cnt] = SURAHS[mapSel - 1], got = P.per[mapSel - 1];
  return `<span><b>${mapSel}. ${name}</b> — ${fmtPct(got / cnt * 100)}% (${got}/${cnt})</span><button class="btn sm" data-act="logsurah" data-s="${mapSel}">سجّل</button>`;
}
function wHeat(w) {
  const R = w.range || 26, t = today(), m = dayMap(filtered());
  const wd = (parseD(t).getDay() + 1) % 7; // السبت = 0
  const start = addDays(t, -wd - (R - 1) * 7);
  const W = 320, padX = 4, top = 18, cell = (W - padX * 2) / R, gap = Math.min(2, cell * .18), sz = cell - gap, H = top + 7 * cell + 2;
  let max = 0, active = 0;
  for (let c = 0; c < R; c++) for (let r = 0; r < 7; r++) { const d = addDays(start, c * 7 + r); if (d > t) continue; const v = m[d] || 0; if (v > max) max = v; if (v > 0) active++; }
  let g = '', prevM = -1, lastX = 1e9;
  for (let c = 0; c < R; c++) {
    const xr = W - padX - (c + 1) * cell;
    const mo = parseD(addDays(start, c * 7)).getMonth();
    if (mo !== prevM) {
      prevM = mo;
      const cx = xr + cell / 2;
      if (Math.abs(lastX - cx) >= 34) { g += `<text class="ax" x="${cx.toFixed(1)}" y="11" text-anchor="middle">${MONTHS[mo]}</text>`; lastX = cx; }
    }
    for (let r = 0; r < 7; r++) {
      const d = addDays(start, c * 7 + r);
      if (d > t) continue;
      const v = m[d] || 0, lvl = v === 0 ? 0 : Math.min(4, Math.ceil(v / max * 4));
      g += `<rect class="hc l${lvl}" data-act="heatsel" data-date="${d}" data-v="${v}" x="${(xr + gap / 2).toFixed(1)}" y="${(top + r * cell).toFixed(1)}" width="${sz.toFixed(1)}" height="${sz.toFixed(1)}" rx="${(sz * .25).toFixed(1)}"/>`;
    }
  }
  return card(w, 'التقويم الحراري', `<span class="pill">${active} يوم قراءة</span>`,
    `<svg class="chart" viewBox="0 0 ${W} ${H.toFixed(0)}" role="img" aria-label="التقويم الحراري">${g}</svg>
     <div class="legend">أقل <i class="l0"></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i> أكثر</div>
     <div class="info" id="heatinfo"><span>اضغط على مربع لعرض اليوم</span></div>`);
}
function wRecent(w) {
  const list = filtered().slice().sort((a, b) => (b.date + (b.ts || 0)).localeCompare(a.date + (a.ts || 0))).slice(0, 5);
  const body = list.length
    ? list.map(e => `<div class="eitem"><div class="t"><b>${SURAHS[e.surah - 1][0]}</b><span class="small muted">${relDate(e.date)}</span></div>
        <div class="m"><span class="tag">من ${e.from} إلى ${e.to}</span><span class="tag">${ayahsOf(e)} آية</span><span class="tag">${esc(e.reader)}</span></div></div>`).join('')
      + `<button class="btn ghost wide" data-act="tab" data-t="history">عرض كل السجل</button>`
    : `<div class="empty">لا توجد تسجيلات بعد</div>`;
  return card(w, 'آخر التسجيلات', '', body);
}
const WIDGET_RENDER = { ring: wRing, surah: wSurah, stats: wStats, daily: wDaily, surahs: wSurahs, map: wMap, heat: wHeat, recent: wRecent };

/* ============ الشاشات ============ */
function filterBar(showNew = true) {
  const rs = readers();
  const chips = KHATMA_TYPES.map(t => `<button class="chip ${F().filterType === t.id ? 'on' : ''}" data-act="ftype" data-v="${t.id}">${t.name}</button>`).join('');
  const row = `<div class="frow">
      <select data-chg="freader" aria-label="القارئ"><option value="all">الجميع</option>${rs.map(r => `<option value="${esc(r)}" ${F().filterReader === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select>
      ${showNew ? `<button class="btn sm" data-act="newkhatma" data-v="${F().filterType}">ختمة جديدة</button>` : ''}</div>`;
  return `<div class="fbar"><div class="chips">${chips}</div>${row}</div>`;
}
function viewHome() {
  P = progress();
  const hello = S.entries.length === 0
    ? `<div class="hello"><b>مرحبًا بك في وِرد</b><span class="muted">سجّل ما قرأته اليوم لتبدأ لوحتك بالامتلاء.</span><div style="margin-top:12px"><button class="btn primary" data-act="tab" data-t="log">تسجيل أول قراءة</button></div></div>`
    : '';
  const ws = F().widgets.filter(w => w.on);
  return hello + filterBar() +
    (ws.length ? `<div class="grid">${ws.map(w => WIDGET_RENDER[w.id](w)).join('')}</div>` : `<div class="card empty">كل الودجات مخفية. افتح التخصيص لإظهارها.</div>`) +
    `<div style="height:12px"></div><button class="btn wide" data-act="customize">تخصيص اللوحة</button>`;
}

function surahOptions(sel) {
  return SURAHS.map((s, i) => `<option value="${i + 1}" ${sel === i + 1 ? 'selected' : ''}>${i + 1}. ${s[0]} (${s[1]} آية)</option>`).join('');
}
function viewLog() {
  const e = editId ? S.entries.find(x => x.id === editId) : null;
  if (editId && !e) editId = null;
  return `<form id="logForm" class="card" autocomplete="off" novalidate>
    <h2>${e ? 'تعديل التسجيل' : 'تسجيل قراءة'}</h2>
    <div class="row2">
      <label>التاريخ<input type="date" name="date" max="${today()}"></label>
      <label>نوع الختمة<select name="type">${KHATMA_TYPES.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}</select></label>
    </div>
    <label>الاسم<input type="text" name="reader" list="readerList" placeholder="اسم القارئ"></label>
    <datalist id="readerList">${readers().map(r => `<option value="${esc(r)}">`).join('')}</datalist>
    <label>السورة<select name="surah">${surahOptions(0)}</select></label>
    <div class="row2">
      <label>من آية<input type="number" name="from" inputmode="numeric" min="1" placeholder="1"></label>
      <label>إلى آية<input type="number" name="to" inputmode="numeric" min="1" placeholder="الأخيرة"></label>
    </div>
    <div class="quick">
      <button type="button" class="btn" data-act="fullsurah">السورة كاملة</button>
      <button type="button" class="btn" data-act="continue">تابع من آخر موضع</button>
    </div>
    <div class="hint" id="logHint"></div>
    <label>ملاحظة (اختياري)<input type="text" name="note" placeholder="مثال: ورد الفجر"></label>
    <div class="btns">
      <button type="submit" class="btn primary">${e ? 'حفظ التعديل' : 'حفظ'}</button>
      ${e ? `<button type="button" class="btn ghost" data-act="cancelEdit">إلغاء</button>` : `<button type="button" class="btn" data-act="submit2">حفظ وإضافة أخرى</button>`}
    </div></form>`;
}
function initLogForm() {
  const f = $('#logForm'); if (!f) return;
  const el = f.elements, e = editId ? S.entries.find(x => x.id === editId) : null, pre = logPrefill || {};
  logPrefill = null;
  el.date.value = e ? e.date : (pre.date || today());
  el.type.value = e ? e.type : (pre.type || F().filterType);
  el.reader.value = e ? e.reader : (pre.reader || F().name || '');
  el.surah.value = e ? e.surah : (pre.surah || 1);
  el.from.value = e ? e.from : (pre.from || '');
  el.to.value = e ? e.to : '';
  el.note.value = e ? (e.note || '') : '';
  updateHint();
}
function updateHint() {
  const f = $('#logForm'); if (!f) return;
  const el = f.elements, s = +el.surah.value, a = parseInt(el.from.value, 10), b = parseInt(el.to.value, 10);
  const [name, cnt] = SURAHS[s - 1];
  el.from.max = cnt; el.to.max = cnt;
  let msg = `سورة ${name}: ${cnt} آية`;
  if (a >= 1 && b >= a && b <= cnt) {
    const orig = editId ? S.entries.find(x => x.id === editId) : null;
    const type = el.type.value, k = (orig && orig.type === type) ? orig.khatma : S.khatmas[type];
    const seen = new Uint8Array(cnt + 1);
    S.entries.forEach(x => { if (x.type === type && x.khatma === k && x.surah === s && x.id !== editId) for (let i = x.from; i <= x.to; i++) seen[i] = 1; });
    let fresh = 0; for (let i = a; i <= b; i++) if (!seen[i]) fresh++;
    msg += ` • قراءتك: ${b - a + 1} آية، الجديد في هذه الختمة: ${fresh}`;
  }
  $('#logHint').textContent = msg;
  if (S.settings.indic) indicize($('#logHint'));
}
function nextPosition(type) {
  const l = S.entries.filter(e => e.type === type && e.khatma === S.khatmas[type]).reduce((m, e) => (!m || (e.ts || 0) >= (m.ts || 0)) ? e : m, null);
  if (!l) return { surah: 1, from: 1 };
  const cnt = SURAHS[l.surah - 1][1];
  if (l.to < cnt) return { surah: l.surah, from: l.to + 1 };
  return l.surah < 114 ? { surah: l.surah + 1, from: 1 } : { surah: 1, from: 1 };
}
async function submitLog(another) {
  const el = $('#logForm').elements;
  const date = el.date.value, type = el.type.value, reader = el.reader.value.trim(), surah = +el.surah.value,
        from = parseInt(el.from.value, 10), to = parseInt(el.to.value, 10), note = el.note.value.trim();
  const [name, cnt] = SURAHS[surah - 1];
  if (!date) return toast('اختر التاريخ');
  if (date > today()) return toast('لا يمكن اختيار تاريخ في المستقبل');
  if (!reader) return toast('اكتب اسمك');
  if (!(from >= 1) || !(to >= 1)) return toast('أدخل رقم الآية: من / إلى');
  if (from > to) return toast('بداية الآيات يجب ألا تتجاوز النهاية');
  if (to > cnt) return toast(`سورة ${name} فيها ${cnt} آية فقط`);

  let fresh = 0, e = editId ? S.entries.find(x => x.id === editId) : null;
  const k = (e && e.type === type) ? e.khatma : S.khatmas[type];
  const seen = new Uint8Array(cnt + 1);
  S.entries.forEach(x => { if (x.type === type && x.khatma === k && x.surah === surah && x !== e) for (let i = x.from; i <= x.to; i++) seen[i] = 1; });
  for (let i = from; i <= to; i++) if (!seen[i]) fresh++;

  if (e) Object.assign(e, { date, type, reader, surah, from, to, note, khatma: k });
  else S.entries.push({ id: uid(), date, type, reader, surah, from, to, note, khatma: k, ts: Date.now() });
  F().name = reader;
  const wasEdit = !!e;
  editId = null;
  save();

  const total = counts(coverage(S.entries.filter(x => x.type === type && x.khatma === S.khatmas[type]))).total;
  toast(wasEdit ? 'تم حفظ التعديل ✓' : `تم الحفظ ✓  +${fresh} آية جديدة`);

  if (wasEdit) { tab = 'history'; render(); }
  else if (another) {
    const nx = to < cnt ? { surah, from: to + 1 } : (surah < 114 ? { surah: surah + 1, from: 1 } : { surah: 1, from: 1 });
    logPrefill = { date, type, reader, surah: nx.surah, from: nx.from };
    render();
  } else {
    F().filterType = type;
    if (F().filterReader !== 'all' && F().filterReader !== reader) F().filterReader = 'all';
    save(); tab = 'home'; render();
  }
  if (total >= TOTAL_AYAHS) {
    const ok = await ask('ما شاء الله، اكتملت الختمة 🎉', `أتممت ${typeName(type)} رقم ${S.khatmas[type]}. هل تريد بدء ختمة جديدة الآن؟`, 'بدء ختمة جديدة', false, 'لاحقًا');
    if (ok) { S.khatmas[type]++; save(); toast('بدأت ختمة جديدة'); render(); }
  }
}

function viewIndex() {
  P = progress();
  const done = P.per.filter((c, i) => c === SURAHS[i][1]).length;
  return `${filterBar(false)}
    <div class="card" style="padding:10px 12px"><input type="text" data-inp="idxq" placeholder="ابحث باسم السورة أو رقمها" value="${esc(idxQuery)}"></div>
    <div class="small muted" style="margin:0 4px 8px">${typeName(F().filterType)} • ${done} من 114 سورة مكتملة • اضغط على سورة لتسجيل قراءتها</div>
    <div id="idxList">${idxListHTML()}</div>`;
}
function idxListHTML() {
  const q = norm(idxQuery);
  const rows = SURAHS.map((s, i) => ({ n: i + 1, name: s[0], cnt: s[1], got: P.per[i] }))
    .filter(x => !q || norm(x.name).includes(q) || String(x.n) === q);
  if (!rows.length) return `<div class="empty">لا توجد نتائج</div>`;
  return rows.map(x => {
    const pct = x.got / x.cnt * 100;
    return `<button class="srow ${x.got === x.cnt ? 'done' : ''}" data-act="logsurah" data-s="${x.n}">
      <span class="snum">${x.got === x.cnt ? '✓' : x.n}</span>
      <span class="sinfo"><b>${x.name}</b><small>${x.n} • ${x.cnt} آية</small></span>
      <span class="sbar">${barHTML(pct, 7)}</span><span class="spct">${fmtPct(pct)}%</span></button>`;
  }).join('');
}

const ICON_EDIT = `<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>`;
const ICON_DEL = `<svg viewBox="0 0 24 24"><path d="M5 7h14M10 11v6M14 11v6M8 7l1-3h6l1 3M7 7l1 13h8l1-13"/></svg>`;
function viewHistory() {
  const rs = readers();
  if (hist.reader !== 'all' && !rs.includes(hist.reader)) hist.reader = 'all';
  const chips = [{ id: 'all', name: 'الكل' }, ...KHATMA_TYPES].map(t => `<button class="chip ${hist.type === t.id ? 'on' : ''}" data-act="histType" data-v="${t.id}">${t.name}</button>`).join('');
  const list = S.entries.filter(e => (hist.type === 'all' || e.type === hist.type) && byReader(e, hist.reader))
    .sort((a, b) => (b.date + String(b.ts || 0).padStart(15, '0')).localeCompare(a.date + String(a.ts || 0).padStart(15, '0')));
  const shown = list.slice(0, hist.limit);
  let html = `<div class="fbar"><div class="chips">${chips}</div>
    <div class="frow"><select data-chg="hreader"><option value="all">الجميع</option>${rs.map(r => `<option value="${esc(r)}" ${hist.reader === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select></div></div>`;
  if (!shown.length) return html + `<div class="card empty">لا توجد تسجيلات</div>`;
  let last = '';
  shown.forEach(e => {
    if (e.date !== last) { last = e.date; html += `<div class="dayh">${relDate(e.date)}</div>`; }
    html += `<div class="eitem"><div class="t"><b>${SURAHS[e.surah - 1][0]}</b>
        <div class="ac"><button class="ibtn" data-act="editEntry" data-id="${e.id}" aria-label="تعديل">${ICON_EDIT}</button>
        <button class="ibtn" data-act="delEntry" data-id="${e.id}" aria-label="حذف">${ICON_DEL}</button></div></div>
      <div class="m"><span class="tag">من ${e.from} إلى ${e.to}</span><span class="tag">${ayahsOf(e)} آية</span><span class="tag">${esc(e.reader)}</span>
      <span class="tag">${typeShort(e.type)} #${e.khatma}</span>${e.note ? `<span class="tag">${esc(e.note)}</span>` : ''}</div></div>`;
  });
  if (list.length > shown.length) html += `<button class="btn wide" data-act="histMore">عرض المزيد (${list.length - shown.length})</button>`;
  return html;
}

function seg(items, cur, attrs) {
  return `<div class="seg">${items.map(([v, l]) => `<button class="${String(cur) === String(v) ? 'on' : ''}" ${attrs} data-v="${v}">${l}</button>`).join('')}</div>`;
}
function viewSettings() {
  const s = F();
  return `
  <div class="card"><h2>المظهر</h2>
    <div class="set-row" style="display:block"><span>الوضع</span><div style="margin-top:8px">${seg([['auto', 'تلقائي'], ['light', 'فاتح'], ['dark', 'داكن']], s.mode, 'data-act="mode"')}</div></div>
    <div class="set-row" style="display:block"><span>اللون</span><div class="swatches" style="margin-top:10px">${ACCENTS.map(a => `<button class="sw ${s.accent === a.id ? 'on' : ''}" style="background:${a.c}" data-act="accent" data-v="${a.id}" aria-label="${a.name}"></button>`).join('')}</div></div>
    <div class="set-row"><span>الأرقام العربية (٠١٢٣)</span><button class="switch ${s.indic ? 'on' : ''}" data-act="indic" aria-label="الأرقام العربية"></button></div>
    <div style="margin-top:12px"><button class="btn wide" data-act="customize">تخصيص اللوحة الرئيسية</button></div>
  </div>
  <div class="card"><h2>بياناتي</h2>
    <label>الاسم الافتراضي<input type="text" data-chg="name" value="${esc(s.name)}" placeholder="اسمك"></label>
    <label>الهدف اليومي (عدد الآيات، 0 = بدون هدف)<input type="number" inputmode="numeric" min="0" data-chg="goal" value="${+s.goal || 0}"></label>
  </div>
  <div class="card"><h2>الختمات</h2>
    ${KHATMA_TYPES.map(t => `<div class="set-row"><span>${t.name}<br><small class="muted">الحالية: رقم ${S.khatmas[t.id]}</small></span><button class="btn sm" data-act="newkhatma" data-v="${t.id}">بدء ختمة جديدة</button></div>`).join('')}
  </div>
  <div class="card"><h2>النسخ الاحتياطي</h2>
    <p class="muted small" style="margin-top:0">بياناتك محفوظة على جهازك فقط. انسخ نسخة احتياطية قبل حذف التطبيق أو تغيير الجهاز.</p>
    <div class="btns"><button class="btn" data-act="export">تصدير (نسخ)</button><button class="btn" data-act="import">استيراد</button></div>
    <div style="margin-top:10px"><button class="btn danger wide" data-act="clearAll">حذف كل البيانات</button></div>
  </div>
  <p class="empty small">وِرد • الإصدار 1.0 • ${nf(S.entries.length)} تسجيل</p>`;
}

/* ============ النوافذ ============ */
function openSheet(html) {
  $('#sheetBody').innerHTML = html;
  $('#sheet').classList.remove('hidden');
  document.body.classList.add('noscroll');
  if (S.settings.indic) indicize($('#sheetBody'));
}
function closeSheet(val) {
  $('#sheet').classList.add('hidden');
  document.body.classList.remove('noscroll');
  sheetMode = null;
  if (sheetResolve) { const r = sheetResolve; sheetResolve = null; r(val); }
}
function ask(title, msg, okLabel = 'تأكيد', danger = false, cancelLabel = 'إلغاء') {
  return new Promise(res => {
    if (sheetResolve) closeSheet(false);
    sheetResolve = res;
    openSheet(`<h3 class="sh-title">${title}</h3><p class="sh-msg">${msg}</p>
      <div class="sh-actions"><button class="btn ${danger ? 'danger' : 'primary'}" data-act="sheetOk">${okLabel}</button><button class="btn ghost" data-act="closeSheet">${cancelLabel}</button></div>`);
  });
}
function customizeHTML() {
  const ws = F().widgets;
  return `<h3 class="sh-title">تخصيص اللوحة</h3><p class="sh-msg">اختر الودجات وترتيبها وشكل عرضها.</p>` +
    ws.map((w, i) => {
      const d = WIDGET_DEFS[w.id];
      let opts = '';
      if (d.styles) opts += `<div><div class="lbl">الشكل</div>${seg(Object.entries(d.styles), w.style, `data-act="wset" data-id="${w.id}" data-k="style"`)}</div>`;
      if (d.ranges) opts += `<div><div class="lbl">الفترة</div>${seg(d.ranges.map(r => [r, `${r} ${d.rangeUnit}`]), w.range, `data-act="wset" data-id="${w.id}" data-k="range"`)}</div>`;
      if (d.pickSurah) opts += `<div><div class="lbl">السورة المعروضة</div><select data-chg="wsurah" data-id="${w.id}"><option value="auto" ${w.surah === 'auto' ? 'selected' : ''}>تلقائي (آخر ما قرأت)</option>${surahOptions(+w.surah || 0)}</select></div>`;
      opts += `<div><div class="lbl">العرض</div>${seg([[1, 'نصف'], [2, 'كامل']], w.size, `data-act="wset" data-id="${w.id}" data-k="size"`)}</div>`;
      return `<div class="wrow ${w.on ? '' : 'off'}"><div class="h"><b>${d.name}</b>
        <button class="ibtn" data-act="wup" data-id="${w.id}" ${i === 0 ? 'disabled style="opacity:.3"' : ''} aria-label="أعلى"><svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg></button>
        <button class="ibtn" data-act="wdown" data-id="${w.id}" ${i === ws.length - 1 ? 'disabled style="opacity:.3"' : ''} aria-label="أسفل"><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button>
        <button class="switch ${w.on ? 'on' : ''}" data-act="wtoggle" data-id="${w.id}" aria-label="إظهار"></button></div>
        ${w.on ? `<div class="opts">${opts}</div>` : ''}</div>`;
    }).join('') +
    `<div class="sh-actions" style="margin-top:8px"><button class="btn primary" data-act="closeSheet">تم</button><button class="btn ghost" data-act="wreset">إعادة الضبط الافتراضي</button></div>`;
}
function openCustomize() { sheetMode = 'customize'; openSheet(customizeHTML()); }
function refreshCustomize() {
  const sh = $('.sheet'), y = sh.scrollTop;
  $('#sheetBody').innerHTML = customizeHTML();
  if (S.settings.indic) indicize($('#sheetBody'));
  sh.scrollTop = y;
  render();
}

/* ============ العرض العام ============ */
function applyTheme() {
  const s = F(), a = ACCENTS.find(x => x.id === s.accent) || ACCENTS[0];
  const dark = s.mode === 'dark' || (s.mode === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  const root = document.documentElement;
  root.dataset.theme = dark ? 'dark' : 'light';
  let [r, g, b] = [1, 3, 5].map(i => parseInt(a.c.slice(i, i + 2), 16));
  if (dark) { r = Math.round(r + (255 - r) * .22); g = Math.round(g + (255 - g) * .22); b = Math.round(b + (255 - b) * .22); }
  root.style.setProperty('--accent', `rgb(${r},${g},${b})`);
  root.style.setProperty('--accent-rgb', `${r},${g},${b}`);
  const m = document.querySelector('meta[name=theme-color]');
  if (m) m.content = dark ? '#0d1311' : '#f4f3ee';
}
function sanitizeFilter() {
  if (!KHATMA_TYPES.some(t => t.id === F().filterType)) F().filterType = 'read';
  if (F().filterReader !== 'all' && !readers().includes(F().filterReader)) F().filterReader = 'all';
}
function render() {
  sanitizeFilter();
  applyTheme();
  const views = { home: viewHome, log: viewLog, index: viewIndex, history: viewHistory, settings: viewSettings };
  $('#view').innerHTML = views[tab]();
  $('#title').textContent = tab === 'log' && editId ? 'تعديل التسجيل' : TAB_TITLES[tab];
  $('#subtitle').textContent = tab === 'home' ? [F().name ? `السلام عليكم ${F().name}` : 'السلام عليكم', hijri()].filter(Boolean).join(' • ') : hijri();
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.t === tab));
  if (tab === 'log') initLogForm();
  if (S.settings.indic) indicize($('#app'));
}
function go(t) { tab = t; if (t !== 'log') editId = null; render(); window.scrollTo(0, 0); }

/* ============ النسخ الاحتياطي ============ */
function cleanEntry(e) {
  if (!e || typeof e !== 'object') return null;
  const surah = parseInt(e.surah, 10), from = parseInt(e.from, 10), to = parseInt(e.to, 10);
  if (!(surah >= 1 && surah <= 114)) return null;
  const cnt = SURAHS[surah - 1][1];
  if (!(from >= 1 && to >= from && to <= cnt)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(e.date))) return null;
  if (!KHATMA_TYPES.some(t => t.id === e.type)) return null;
  return { id: String(e.id || uid()), date: e.date, type: e.type, reader: String(e.reader || '—').slice(0, 60), surah, from, to,
           note: String(e.note || '').slice(0, 200), khatma: Math.max(1, parseInt(e.khatma, 10) || 1), ts: +e.ts || Date.now() };
}
function doImport(mode) {
  let o;
  try { o = JSON.parse($('#impText').value); } catch (err) { return toast('النص غير صالح'); }
  if (!o || !Array.isArray(o.entries)) return toast('لا توجد بيانات صالحة في النص');
  const es = o.entries.map(cleanEntry).filter(Boolean);
  if (mode === 'replace') {
    S = migrate(o); S.entries = es;
  } else {
    const ids = new Set(S.entries.map(e => e.id));
    es.forEach(e => { if (!ids.has(e.id)) S.entries.push(e); });
    Object.keys(S.khatmas).forEach(k => { S.khatmas[k] = Math.max(S.khatmas[k], +(o.khatmas && o.khatmas[k]) || 1); });
  }
  save(); closeSheet(); toast(`تم استيراد ${es.length} تسجيل`); render();
}
async function copyText(txt) {
  try { await navigator.clipboard.writeText(txt); return true; } catch (e) {}
  try { const t = $('#expText'); t.select(); return document.execCommand('copy'); } catch (e) { return false; }
}

/* ============ الأحداث ============ */
const H = {
  tab: t => go(t.dataset.t),
  closeSheet: () => closeSheet(false),
  sheetOk: () => closeSheet(true),
  ftype: t => { F().filterType = t.dataset.v; save(); render(); },
  histType: t => { hist.type = t.dataset.v; hist.limit = 60; render(); },
  histMore: () => { hist.limit += 60; render(); },
  async newkhatma(t) {
    const type = t.dataset.v;
    const ok = await ask(`بدء ${typeName(type)} جديدة؟`, `ستبدأ النسب من صفر، وتبقى الختمة الحالية (رقم ${S.khatmas[type]}) محفوظة في السجل.`, 'بدء ختمة جديدة');
    if (ok) { S.khatmas[type]++; save(); toast('بدأت ختمة جديدة'); render(); }
  },
  customize: () => openCustomize(),
  wtoggle: t => { const w = F().widgets.find(x => x.id === t.dataset.id); w.on = !w.on; save(); refreshCustomize(); },
  wup: t => moveW(t.dataset.id, -1),
  wdown: t => moveW(t.dataset.id, 1),
  wset: t => {
    const w = F().widgets.find(x => x.id === t.dataset.id), v = t.dataset.v;
    w[t.dataset.k] = /^\d+$/.test(v) ? Number(v) : v;
    save(); refreshCustomize();
  },
  async wreset() {
    const ok = await ask('إعادة الضبط', 'سيُعاد ترتيب الودجات وأشكالها إلى الوضع الافتراضي.', 'إعادة الضبط');
    if (ok) { F().widgets = defaultWidgets(); save(); render(); openCustomize(); }
  },
  logsurah: t => { logPrefill = { surah: +t.dataset.s, type: F().filterType }; if (sheetMode) closeSheet(); go('log'); },
  mapsel: t => {
    mapSel = +t.dataset.s;
    document.querySelectorAll('.mcell').forEach(c => c.classList.toggle('sel', +c.dataset.s === mapSel));
    const i = $('#mapinfo'); i.innerHTML = mapInfoHTML(); if (S.settings.indic) indicize(i);
  },
  heatsel: t => {
    const i = $('#heatinfo'); i.innerHTML = `<span><b>${relDate(t.dataset.date)}</b> — ${t.dataset.v} آية</span>`;
    if (S.settings.indic) indicize(i);
  },
  fullsurah: () => { const el = $('#logForm').elements, c = SURAHS[+el.surah.value - 1][1]; el.from.value = 1; el.to.value = c; updateHint(); },
  continue: () => {
    const el = $('#logForm').elements, p = nextPosition(el.type.value);
    el.surah.value = p.surah; el.from.value = p.from; el.to.value = ''; updateHint(); el.to.focus();
  },
  submit2: () => submitLog(true),
  cancelEdit: () => go('history'),
  editEntry: t => { editId = t.dataset.id; tab = 'log'; render(); window.scrollTo(0, 0); },
  async delEntry(t) {
    const e = S.entries.find(x => x.id === t.dataset.id); if (!e) return;
    const ok = await ask('حذف التسجيل؟', `سورة ${SURAHS[e.surah - 1][0]} من الآية ${e.from} إلى ${e.to} (${relDate(e.date)}).`, 'حذف', true);
    if (ok) { S.entries = S.entries.filter(x => x.id !== e.id); save(); toast('تم الحذف'); render(); }
  },
  mode: t => { F().mode = t.dataset.v; save(); render(); },
  accent: t => { F().accent = t.dataset.v; save(); render(); },
  indic: () => { F().indic = !F().indic; save(); render(); },
  export: () => {
    openSheet(`<h3 class="sh-title">نسخة احتياطية</h3><p class="sh-msg">انسخ النص واحفظه في مكان آمن (ملاحظات، بريد…). يمكنك لصقه لاحقًا في «استيراد».</p>
      <textarea id="expText" readonly></textarea>
      <div class="sh-actions" style="margin-top:12px"><button class="btn primary" data-act="copyExp">نسخ النص</button><button class="btn ghost" data-act="closeSheet">إغلاق</button></div>`);
    $('#expText').value = JSON.stringify({ app: 'wird', exported: new Date().toISOString(), entries: S.entries, khatmas: S.khatmas }, null, 1);
  },
  async copyExp() { toast(await copyText($('#expText').value) ? 'تم النسخ ✓' : 'حدّد النص وانسخه يدويًا'); },
  import: () => openSheet(`<h3 class="sh-title">استيراد نسخة احتياطية</h3><p class="sh-msg">الصق النص الذي نسخته سابقًا.</p>
      <textarea id="impText" placeholder="{ ... }"></textarea>
      <div class="sh-actions" style="margin-top:12px"><button class="btn primary" data-act="impMerge">دمج مع بياناتي الحالية</button>
      <button class="btn" data-act="impReplace">استبدال بياناتي الحالية</button><button class="btn ghost" data-act="closeSheet">إلغاء</button></div>`),
  impMerge: () => doImport('merge'),
  impReplace: () => doImport('replace'),
  async clearAll() {
    const ok = await ask('حذف كل البيانات؟', 'سيتم حذف جميع التسجيلات والإعدادات نهائيًا ولا يمكن التراجع. يُنصح بأخذ نسخة احتياطية أولًا.', 'حذف الكل', true);
    if (ok) { S = defaults(); save(); toast('تم حذف البيانات'); go('home'); }
  }
};
function moveW(id, dir) {
  const ws = F().widgets, i = ws.findIndex(w => w.id === id), j = i + dir;
  if (j < 0 || j >= ws.length) return;
  [ws[i], ws[j]] = [ws[j], ws[i]];
  save(); refreshCustomize();
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]');
  if (!t || t.disabled) return;
  const fn = H[t.dataset.act];
  if (fn) fn(t, e);
});
document.addEventListener('change', e => {
  const t = e.target, c = t.dataset && t.dataset.chg;
  if (c === 'freader') { F().filterReader = t.value; save(); render(); }
  else if (c === 'hreader') { hist.reader = t.value; hist.limit = 60; render(); }
  else if (c === 'wsurah') { F().widgets.find(w => w.id === t.dataset.id).surah = t.value; save(); refreshCustomize(); }
  else if (c === 'name') { F().name = t.value.trim(); save(); }
  else if (c === 'goal') { F().goal = Math.max(0, parseInt(t.value, 10) || 0); save(); toast('تم الحفظ ✓'); }
  else if (t.closest && t.closest('#logForm')) {
    if (t.name === 'surah') { const el = $('#logForm').elements; el.from.value = ''; el.to.value = ''; }
    updateHint();
  }
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset && t.dataset.inp === 'idxq') {
    idxQuery = t.value;
    const l = $('#idxList'); l.innerHTML = idxListHTML();
    if (S.settings.indic) indicize(l);
  } else if (t.closest && t.closest('#logForm')) updateHint();
});
document.addEventListener('submit', e => { e.preventDefault(); if (e.target.id === 'logForm') submitLog(false); });
if (window.matchMedia) {
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (F().mode === 'auto') render(); }); } catch (e) {}
}

render();
})();
