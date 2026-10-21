'use strict';
/* ================= Хранилище ================= */
const LS = 'zal_v2';
const DEFAULT_START = '2026-10-26';
const blank = () => ({v:2,start:DEFAULT_START,bw:80,surgeonOk:false,log:{},morning:{},tests:{},rsi:{},bodyw:[],variant:{},notes:''});
let st = (() => { try { return Object.assign(blank(), JSON.parse(localStorage.getItem(LS) || '{}')); } catch (e) { return blank(); } })();
let saveTimer = null;
function save(){ clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { localStorage.setItem(LS, JSON.stringify(st)); } catch (e) { toast('Не удалось сохранить: память браузера заполнена'); } }, 120); }
function saveNow(){ clearTimeout(saveTimer); try { localStorage.setItem(LS, JSON.stringify(st)); } catch (e) {} }

/* ================= Утилиты ================= */
const $ = (s, r=document) => r.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fw = w => { const x = Math.round(w*100)/100; return String(x).replace('.', ','); };
const roundTo = (x, s) => Math.round(x / s) * s;
const floorTo = (x, s) => Math.floor(x / s + 1e-9) * s;
const pd = s => { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); };
const iso = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
const addD = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const todayD = () => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()); };
const ddiff = (a, b) => Math.round((b - a) / 864e5);
const wdIdx = d => (d.getDay() + 6) % 7;
const MONTHS = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
const WD = ['пн','вт','ср','чт','пт','сб','вс'];
const WDF = ['Понедельник','Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье'];
const fmtD = d => d.getDate() + ' ' + MONTHS[d.getMonth()];
const OP_DATE = new Date(2025, 11, 9);
const startD = () => pd(st.start || DEFAULT_START);
const weekOf = d => { const n = ddiff(startD(), d); return n < 0 ? -1 : Math.floor(n / 7); };
const clampW = w => Math.max(0, Math.min(12, w));
const drillWeek = w => (!st.surgeonOk && w >= 4) ? 3 : w;
const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return (m === 1 && h !== 11) ? a : (m >= 2 && m <= 4 && (h < 10 || h >= 20)) ? b : c; };

const VID = () => (typeof VIDEOS !== 'undefined' ? VIDEOS : {});
/* ================= Сессии ================= */
const skey = (date, type) => date + '|' + type;
function getSess(key, create){
 if (!st.log[key] && create){ const [date, day] = key.split('|'); st.log[key] = {date, day, ex:{}, checks:{}, note:''}; }
 return st.log[key];
}
function sessList(){ return Object.entries(st.log).map(([k, s]) => ({k, ...s})).sort((a, b) => a.date === b.date ? a.k.localeCompare(b.k) : a.date.localeCompare(b.date)); }
function hasWork(s){ return s && (Object.values(s.ex || {}).some(e => e.sets && e.sets.length) || Object.values(s.checks || {}).some(Boolean)); }
function exHist(id, beforeKey){
 const out = [];
 for (const s of sessList()){
  if (beforeKey && s.k === beforeKey) continue;
  if (beforeKey && s.date > beforeKey.split('|')[0]) continue;
  const e = s.ex && s.ex[id];
  if (e && e.sets && e.sets.length) out.push({k: s.k, date: s.date, sets: e.sets, note: e.note});
 }
 return out;
}
const kindOf = id => (EX[id] && EX[id].kind) || 'w';
function e1(id, w, r){ const k = kindOf(id); if (k === 'reps') return r; const load = k === 'bw' ? (Number(st.bw) || 80) + w : w; return load > 0 ? load * (1 + r / 30) : r; }
function bestOf(id, sets){ let b = 0; for (const s of sets) if (!s.d) b = Math.max(b, e1(id, s.w, s.r)); return b; }
function setText(id, s){ const k = kindOf(id); if (k === 'reps' || (k === 'w' && !s.w)) return String(s.r); if (k === 'bw') return s.w ? '+' + fw(s.w) + '×' + s.r : 'без веса ×' + s.r; return fw(s.w) + '×' + s.r; }
function setsText(id, sets){ const parts = []; sets.forEach(s => { if (s.d && parts.length) parts[parts.length-1] += ' и тут же ' + setText(id, s); else parts.push(setText(id, s)); }); return parts.join(', '); }

/* ================= Подсказки по весу ================= */
function workingWeight(id, sets){
 const work = sets.filter(s => !s.d);
 if (!work.length) return null;
 if (kindOf(id) === 'reps') return 0;
 const max = Math.max(...work.map(s => s.w));
 const cand = work.filter(s => s.w >= max * 0.85);
 const cnt = {}; cand.forEach(s => { cnt[s.w] = (cnt[s.w] || 0) + 1; });
 let best = null, bc = -1;
 Object.keys(cnt).map(Number).sort((a, b) => b - a).forEach(w => { if (cnt[w] > bc){ bc = cnt[w]; best = w; } });
 return best;
}
const LEG_CATS = ['Ноги'];
function planFor(item, key){
 const id = item.ex, def = EX[id] || {}, kind = def.kind || 'w', inc = def.inc || 2.5;
 const lo = item.lo, hi = item.hi, n = item.sets;
 const hist = exHist(id, key);
 const last = hist[hist.length - 1];
 const light = morningLight(st.morning[key.split('|')[0]]);
 const kneeHold = LEG_CATS.includes(def.c) && (light === 'yellow' || light === 'red');
 let W = null, R = lo, why = '', next = '';
 const mk = (w, r) => Array.from({length: n}, () => ({w, r}));
 if (kind === 'reps'){
  if (!last){ R = lo; why = 'Первый раз: найди технику, ' + lo + '–' + hi + ' повторов.'; }
  else {
   const reps = last.sets.filter(s => !s.d).map(s => s.r);
   const mn = Math.min(...reps);
   if (mn >= hi){ R = hi; why = 'Прошлый раз дошёл до ' + hi + ' во всех подходах. Усложни: медленнее вниз или труднее вариант.'; }
   else { R = Math.min(hi, Math.max(lo, mn + 1)); why = 'Прошлый раз: ' + reps.join(', ') + '. Цель — ' + R + ' в каждом подходе.'; }
  }
  return {warm: [], sets: mk(0, R), why, short: 'Цель — ' + R + ' в каждом подходе.', next: 'Когда сделаешь ' + n + ' × ' + hi + ' — усложняй.', last};
 }
 if (!last){
  let guess = null;
  if (def.startFrom){ const h = exHist(def.startFrom.id, key); const l = h[h.length-1]; if (l){ const ww = workingWeight(def.startFrom.id, l.sets); if (ww) guess = floorTo(ww * def.startFrom.k, inc); } }
  W = guess;
  why = guess != null ? 'Первый раз. Ориентир — ' + fw(guess) + ' кг; если идёт легко, прибавь в следующем подходе. Нужен запас 2–3 повтора.' : 'Первый раз: подбери вес так, чтобы оставалось 2–3 повтора в запасе. Записывай — дальше приложение посчитает само.';
  return {warm: [], sets: mk(W, lo), why, short: guess != null ? 'Первый раз: начни с ' + fw(guess) + ' кг.' : 'Первый раз: подбери вес с запасом 2–3 повтора.', next: '', last: null, pick: W == null};
 }
 const work = last.sets.filter(s => !s.d);
 const lw = workingWeight(id, last.sets);
 const atW = work.filter(s => s.w === lw).map(s => s.r);
 const mn = Math.min(...atW), mx = Math.max(...atW);
 const lastTxt = setsText(id, last.sets);
 let short = '';
 if (atW.length >= n && atW.slice(0, n).every(r => r >= hi) || (mx > hi + 2 && atW.length >= Math.min(n, 2))){
  if (kneeHold){ W = lw; R = hi; why = 'Пора прибавлять, но колено утром не в норме — сегодня тот же вес.'; short = 'Тот же вес: колено утром не в норме.'; }
  else if (mx > hi + 2){ const best = bestOf(id, last.sets); const base = kind === 'bw' ? (Number(st.bw)||80) : 0; W = Math.max(lw + inc, floorTo(best / (1 + ((lo + hi) / 2) / 30) - base, inc)); R = lo; why = 'Прошлый раз повторов было больше нужного (' + atW.join(', ') + '). Новый диапазон — ' + lo + '–' + hi + ', поэтому вес выше.'; short = 'Вес выше: теперь подходы по ' + lo + '–' + hi + ' повторов.'; }
  else { W = lw + inc; R = lo; why = 'Прошлый раз все подходы с ' + fw(lw) + ' кг дошли до ' + hi + '. Прибавляем ' + fw(inc) + ' кг.'; short = '+' + fw(inc) + ' кг: в прошлый раз все подходы дошли до ' + hi + '.'; }
 } else if (mn >= lo){
  W = lw; R = Math.min(hi, mn + 1);
  why = 'Прошлый раз с ' + fw(lw) + ' кг: ' + atW.join(', ') + '. Цель — ровно по ' + R + '.';
  short = 'Тот же вес, цель — по ' + R + ' (было ' + atW.join(', ') + ').';
 } else if (atW[0] >= lo && mn >= lo - 2){
  W = lw; R = lo; why = 'Подходы проседали (' + atW.join(', ') + '). Вес тот же, цель — ровные подходы по ' + lo + '. Оставляй 1–2 повтора в запасе в первом подходе.'; short = 'Тот же вес, цель — ровно по ' + lo + '. Первый подход не до отказа.';
 } else {
  W = Math.max(0, lw - inc); R = lo; why = 'Прошлый раз с ' + fw(lw) + ' кг вышло ' + atW.join(', ') + ' — меньше нужного. Снижаем на ' + fw(inc) + ' кг, чтобы все подходы были ровными.'; short = 'Вес на ' + fw(inc) + ' кг ниже, чтобы подходы были ровными.';
 }
 next = 'Дальше: когда сделаешь ' + n + ' × ' + hi + (kind === 'bw' ? ' с +' : ' с ') + fw(W) + ' кг — прибавим ' + fw(inc) + ' кг.';
 const warm = [];
 if (item.warm === 'big' && W > 30){ warm.push({w: 20, r: 10}); warm.push({w: roundTo(W * 0.5, 2.5), r: 8}); warm.push({w: roundTo(W * 0.75, 2.5), r: 4}); }
 else if (item.warm === 'one' && kind === 'bw') warm.push({w: 0, r: 5});
 else if (item.warm === 'one' && W > 0) warm.push({w: roundTo(W * 0.6, inc), r: 6});
 return {warm, sets: mk(W, R), why, short, next, last, lastTxt};
}

/* ================= Утро и светофор ================= */
function morningLight(m){
 if (!m || (!m.ok && !m.sw && m.pain == null && !m.flag && !m.cyst)) return null;
 if (m.flag || m.sw === 'есть' || (m.pain || 0) >= 5) return 'red';
 if (m.cyst || m.sw === 'след+' || (m.pain || 0) >= 3) return 'yellow';
 return 'green';
}
const SWELL = [['нет','Нет'],['след','Едва'],['след+','Больше'],['есть','Отёк']];
const LIGHT = {
 green: ['Колено в норме', 'Тренируйся по плану.'],
 yellow: ['Облегчённый день', 'Объём прыжков и бега −30–50%, вес в ногах не прибавляй. Если завтра так же — как при красном.'],
 red: ['Без ударной нагрузки', 'Прыжки, бег и повороты сегодня отменяются. 3–5 дней только зал без прыжков. Повторяется, было подкашивание или заклинивание — к хирургу.'],
};

/* ================= Рендер: общее ================= */
const app = document.getElementById('app');
const ui = {tab: 'today', day: null, open: null, planWeek: null, cp: null, progSeg: 'str', exSheet: null, draft: {}};
const ICON = {
 play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>',
 info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 11v6M12 7.5v.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
 lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
 timer: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 9v4l2.5 2M9 2h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/></svg>',
 chev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
 check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
 star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z" fill="currentColor"/></svg>',
 copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
};
function render(){
 document.querySelectorAll('.tabbar button').forEach(b => b.setAttribute('aria-current', b.dataset.tab === ui.tab ? 'page' : 'false'));
 ({today: renderToday, plan: renderPlan, prog: renderProgress, log: renderJournal, more: renderMore})[ui.tab]();
}
function toast(msg, action){
 const t = $('#toast');
 t.innerHTML = '<span>' + esc(msg) + '</span>' + (action ? '<button class="tbtn" data-act="toast-act">' + esc(action.label) + '</button>' : '');
 t.classList.add('on'); toast.fn = action && action.fn;
 clearTimeout(toast.tm); toast.tm = setTimeout(() => t.classList.remove('on'), action ? 5000 : 2600);
 t.classList.toggle('gold', /★/.test(msg));
}
function phasePill(w){ const p = PHASES[phaseOf(w)]; return '<span class="pill ' + p.color + '">' + esc(p.name) + ' · ' + esc(p.title) + '</span>'; }
function vidThumb(id){
 const v = VID()[id];
 if (!v) return '<p class="novid">Для этого пункта видео нет — всё описано по шагам ниже.</p>';
 const url = 'https://www.youtube.com/watch?v=' + v[0];
 return '<a class="vid" href="' + url + '" target="_blank" rel="noopener" data-act="play" data-v="' + v[0] + '" aria-label="Смотреть видео"><img alt="" src="https://i.ytimg.com/vi/' + v[0] + '/hqdefault.jpg"><span class="vplay">' + ICON.play + '</span><span class="vch">Видео: ' + esc(v[1]) + '</span></a><p class="vlink"><a href="' + url + '" target="_blank" rel="noopener">Открыть на YouTube</a></p>';
}
const canEmbed = () => /^https?:$/.test(location.protocol);

/* ================= Сегодня ================= */
function chooseDay(date){
 const w = clampW(Math.max(0, weekOf(date)));
 const wd = wdIdx(date);
 for (const t of DAY_ORDER) if (DAYS[t].wd === wd) return t;
 const ws = addD(startD(), w * 7);
 for (const t of DAY_ORDER){ const d = addD(ws, DAYS[t].wd); if (d >= date && !hasWork(st.log[skey(iso(d), t)])) return t; }
 return 'A';
}
function renderToday(){
 const d = todayD(), di = iso(d);
 const rawW = weekOf(d), pre = rawW < 0, w = clampW(Math.max(0, rawW));
 const type = ui.day || chooseDay(d);
 const key = skey(di, type);
 const planned = DAY_ORDER.find(t => DAYS[t].wd === wdIdx(d));
 const sess = buildSession(w, type, drillWeek(w));
 if (pre){ sess.blocks = sess.blocks.filter(b => !/^Тесты/.test(b.t)); sess.note = ''; }
 const m = st.morning[di] || {};
 const L = morningLight(m);
 let h = '<header class="top"><div><h1>' + WDF[wdIdx(d)] + ', ' + fmtD(d) + '</h1><p class="sub">' + (pre ? 'План стартует ' + fmtD(startD()) + '. До этого — обычные тренировки.' : (w === 0 ? 'Стартовая неделя' : 'Неделя ' + w + ' из 12')) + '</p>' + (pre ? '' : '<p class="sub">' + phasePill(w) + '</p>') + '</div></header>';
 // утренняя проверка
 const mDone = !!(m.ok || m.sw || m.flag || m.cyst || m.pain != null);
 h += '<section class="morning' + (L && !ui.morningEdit ? ' l-' + L : '') + '" aria-label="Утренняя проверка колена">';
 if (mDone && !ui.morningEdit){
  h += '<button class="mrow" data-act="m-edit"><span class="dot ' + L + '"></span><span class="mtxt"><b>' + LIGHT[L][0] + '</b><span>' + LIGHT[L][1] + '</span></span><span class="link">Изменить</span></button>';
 } else if (!ui.morningEdit){
  h += '<p class="mq"><b>Колено утром — как обычно?</b></p><p class="muted small">Как обычно — это нет отёка, боль не больше 2 из 10 и ничего не подкашивалось.</p><div class="mbtns"><button class="btn primary" data-act="m-ok">Всё как обычно</button><button class="btn sec" data-act="m-edit">Есть что-то</button></div>';
 } else {
  h += '<div class="mhead"><b>Колено утром</b><button class="link" data-ex="t_stroke">Как проверить отёк</button></div>';
  h += '<label class="tgl"><input type="checkbox" data-m="flag"' + (m.flag ? ' checked' : '') + '><span>Подкашивалось, «выскакивало» или заклинивало</span></label>';
  h += '<p class="mlab">Отёк</p><div class="seg" role="group" aria-label="Отёк">' + SWELL.map(([v, l]) => '<button data-m="sw" data-v="' + v + '" aria-pressed="' + (m.sw === v) + '">' + l + '</button>').join('') + '</div><p class="muted small">Едва — еле заметная волна. Больше — заметнее, чем обычно.</p>';
  h += '<label class="tgl"><input type="checkbox" data-m="cyst"' + (m.cyst ? ' checked' : '') + '><span>Под коленом набухло</span></label>';
  h += '<label class="pain">Боль после вчерашнего: <output>' + (m.pain == null ? '—' : m.pain) + '</output> из 10<input type="range" min="0" max="10" value="' + (m.pain || 0) + '" data-m="pain" aria-label="Боль от 0 до 10"></label>';
  if (L) h += '<div class="lightbox ' + L + '"><b>' + LIGHT[L][0] + '.</b> ' + LIGHT[L][1] + '</div>';
  h += '<button class="btn sec wide" data-act="m-close">Готово</button>';
 }
 h += '</section>';
 // выбор тренировки
 const ws = pre ? null : addD(startD(), w * 7);
 h += '<nav class="daypick" aria-label="Тренировка">' + DAY_ORDER.map(t => {
  const dd = ws ? addD(ws, DAYS[t].wd) : null;
  const k2 = dd ? skey(iso(dd), t) : null;
  const stt = sessStatus(w, t, k2 && hasWork(st.log[k2]) ? k2 : skey(di, t));
  return '<button data-day="' + t + '" aria-pressed="' + (t === type) + '"><span>' + DAYS[t].short + '</span><small>' + WD[DAYS[t].wd] + (stt === 'done' ? ' · готово' : stt === 'started' ? ' · начато' : '') + '</small></button>';
 }).join('') + '</nav>';
 if (!planned && !ui.day && !pre) h += '<p class="hint">Сегодня по плану отдых или лёгкий велосипед. Если тренируешься — ниже ближайшая тренировка недели.</p>';
 h += '<div class="sesshead"><h2>' + DAYS[type].name + '</h2><span class="muted">' + DAYS[type].dur + (DAYS[type].optional ? ' · по возможности' : '') + '</span></div>';
 if (!st.surgeonOk && w >= 1 && (drillWeek(w) !== w || sess.blocks.some(b => b.items.some(it => it.type === 'c' && EX[it.ex] && EX[it.ex].gate)))) {
  h += '<div class="gatebox">' + ICON.lock + '<div><b>Часть упражнений закрыта до осмотра хирурга.</b> Сначала хирург должен проверить стабильность колена руками. Сила и бег по прямой — можно.' + (drillWeek(w) !== w ? ' Прыжки и бег пока как на неделе 3, сила ног — по плану.' : '') + '<br><button class="link inl" data-act="surg">Хирург разрешил</button></div></div>';
 }
 if (sess.note) h += '<p class="hint">' + esc(sess.note) + '</p>';
 h += sessionHTML(sess, key, w, type);
 app.innerHTML = h;
}
function finishHTML(key){
 const s = st.log[key]; const out = [];
 Object.entries(s.ex || {}).forEach(([id, e]) => {
  const prev = exHist(id, key); if (!prev.length || !e.sets.length) return;
  const was = bestOf(id, prev[prev.length - 1].sets), now = bestOf(id, e.sets);
  if (now > was + 0.4) out.push(esc(EX[id].n) + ' — лучше, чем ' + fmtD(pd(prev[prev.length - 1].date)));
 });
 return '<section class="finish"><p class="ftitle">Тренировка готова</p>' + (out.length ? '<ul class="plain">' + out.slice(0, 5).map(x => '<li>' + x + '</li>').join('') + '</ul>' : '<p>Все подходы сделаны. Утром — проверка колена.</p>') + '</section>';
}
function sessStatus(w, t, key){
 const s = st.log[key]; if (!hasWork(s)) return '';
 const sess = buildSession(w, t, drillWeek(w));
 let planned = 0, checks = 0;
 sess.blocks.forEach(b => b.items.forEach(it => { if (it.type === 'g') planned += it.sets; else checks++; }));
 const done = Object.values(s.ex || {}).reduce((a, e) => a + (e.sets ? e.sets.filter(x => !x.d).length : 0), 0);
 const ck = Object.values(s.checks || {}).filter(Boolean).length;
 if (planned ? done >= planned : ck >= Math.ceil(checks / 2)) return 'done';
 return 'started';
}
function sessionHTML(sess, key, w, type){
 const s = st.log[key];
 let h = '', gi = 0, allG = [];
 sess.blocks.forEach((b, bi) => {
  h += '<section class="blk"><h3>' + esc(b.t) + '</h3><ul class="items">';
  b.items.forEach((it, ii) => {
   if (it.type === 'g'){ allG.push(it); h += gymItem(it, key, gi++, w); }
   else h += checkItem(it, key, bi + '-' + ii);
  });
  h += '</ul></section>';
 });
 // итог
 const done = s ? Object.values(s.ex || {}).reduce((a, e) => a + (e.sets ? e.sets.filter(x => !x.d).length : 0), 0) : 0;
 const planned = allG.reduce((a, g) => a + g.sets, 0);
 const prs = s ? countPR(key) : 0;
 if (planned && done >= planned) h += finishHTML(key);
 if (planned){
  h += '<section class="summary"><div class="sumrow"><span>Подходов</span><b>' + done + ' из ' + planned + '</b></div>' + (prs ? '<div class="sumrow gold">' + ICON.star + '<span>Рекордов</span><b>' + prs + '</b></div>' : '') + '<div class="meter"><i style="width:' + Math.min(100, done / planned * 100) + '%"></i></div>' + (s && done ? '<button class="btn sec" data-act="copy-sess" data-k="' + key + '">' + ICON.copy + ' Скопировать текстом</button>' : '') + '</section>';
 }
 h += '<label class="notefield">Заметка к тренировке<textarea data-act="sess-note" data-k="' + key + '" rows="2" placeholder="Как прошло, что заменил">' + esc(s ? s.note : '') + '</textarea></label>';
 return h;
}
function currentVariant(id){ const g = EX[id].group; if (!g) return id; return st.variant[g] || id; }
function variantsOf(id){ const g = EX[id].group; if (!g) return []; return Object.keys(EX).filter(k => EX[k].group === g); }
function gymItem(it, key, idx, w){
 const id = currentVariant(it.ex);
 const item = {...it, ex: id};
 const def = EX[id];
 const s = st.log[key];
 const sets = (s && s.ex[id] && s.ex[id].sets) || [];
 const workDone = sets.filter(x => !x.d).length;
 const plan = planFor(item, key);
 const tgt = plan.sets[0];
 const tgtTxt = def.kind === 'reps' ? item.sets + ' × ' + tgt.r : tgt.w == null ? item.sets + ' × ' + tgt.r + ' · вес подбери' : item.sets + ' × ' + (def.kind === 'bw' ? '+' : '') + fw(tgt.w) + ' кг × ' + tgt.r;
 const openK = key + '#' + idx;
 const open = ui.open === openK;
 const complete = workDone >= item.sets;
 let h = '<li class="gym' + (open ? ' open' : '') + (complete ? ' complete' : '') + '" id="g-' + idx + '">';
 h += '<button class="grow" data-act="open" data-o="' + openK + '" aria-expanded="' + open + '"><span class="gname">' + esc(def.n) + '<small>' + tgtTxt + (def.uni ? ' · на каждую' : '') + (def.group ? ' · ' + esc(def.vname) : '') + ' · отдых ' + restTxt(item.rest) + '</small></span><span class="gcount' + (complete ? ' ok' : '') + '">' + (complete ? ICON.check : '') + workDone + '/' + item.sets + '</span></button>';
 if (open){
  h += '<div class="gbody">';
  const vars = variantsOf(it.ex);
  h += '<details class="why"><summary>' + esc(plan.short || plan.why) + '<span class="more">Почему</span></summary><p>' + esc(plan.why) + '</p>' + (plan.lastTxt ? '<p class="muted">' + fmtD(pd(plan.last.date)) + ': ' + esc(plan.lastTxt) + '</p>' : '') + (plan.next ? '<p class="muted">' + esc(plan.next) + '</p>' : '') + '</details>';
  // таблица
  const rows = [];
  plan.warm.forEach(x => rows.push({kind: 'warm', tgt: x}));
  plan.sets.forEach(x => rows.push({kind: 'work', tgt: x}));
  let wi = 0;
  const work = sets.filter(x => !x.d);
  const prSet = prIndexes(id, key);
  h += '<table class="sets"><thead><tr><th>№</th><th>Цель</th><th>Сделано</th></tr></thead><tbody>';
  if (plan.warm.length) h += '<tr class="warmrow"><td colspan="3">Разминка: ' + plan.warm.map(x => '<span class="chip">' + setText(id, x) + '</span>').join(' ') + '</td></tr>';
  plan.sets.forEach((x, i) => {
   const done = work[i];
   const realIdx = done ? sets.indexOf(done) : -1;
   const drops = [];
   if (realIdx >= 0){ for (let j = realIdx + 1; j < sets.length && sets[j].d; j++) drops.push(setText(id, sets[j])); }
   h += '<tr' + (done ? ' class="done" title="Исправить" data-act="edit-set" data-k="' + key + '" data-id="' + id + '" data-i="' + realIdx + '"' : '') + '><td>' + (i + 1) + '</td><td>' + (x.w == null ? '? × ' + x.r : setText(id, x)) + '</td><td>' + (done ? (prSet.has(realIdx) ? '<span class="pr">' + ICON.star + '</span>' : '') + '<b>' + setText(id, done) + '</b>' + (drops.length ? ' <span class="muted">+ ' + drops.join(', ') + '</span>' : '') + '<span class="pen" aria-hidden="true">✎</span>' : '—') + '</td></tr>';
  });
  work.slice(plan.sets.length).forEach((x, i) => { const ri = sets.indexOf(x); h += '<tr class="done extra" data-act="edit-set" data-k="' + key + '" data-id="' + id + '" data-i="' + ri + '"><td>+' + (i + 1) + '</td><td class="muted">сверх плана</td><td>' + (prSet.has(ri) ? '<span class="pr">' + ICON.star + '</span>' : '') + '<b>' + setText(id, x) + '</b></td></tr>'; });
  h += '</tbody></table>';
  // ввод
  const nxt = plan.sets[Math.min(work.length, plan.sets.length - 1)] || plan.sets[0];
  const lastSet = work[work.length - 1];
  const dk = key + '|' + id;
  const dr = ui.draft[dk] || {w: lastSet ? lastSet.w : (nxt.w == null ? '' : nxt.w), r: nxt.r};
  if (def.kind !== 'reps'){
   h += '<div class="inputs"><div class="stepper"><span class="lbl">' + (def.kind === 'bw' ? 'Доп. вес, кг' : 'Вес, кг') + '</span><button data-act="step" data-f="w" data-d="-' + (def.inc || 2.5) + '" data-dk="' + dk + '" aria-label="Меньше веса">−</button><input inputmode="decimal" data-act="draft" data-f="w" data-dk="' + dk + '" value="' + (dr.w === '' ? '' : fw(dr.w)) + '" aria-label="Вес"><button data-act="step" data-f="w" data-d="' + (def.inc || 2.5) + '" data-dk="' + dk + '" aria-label="Больше веса">+</button></div>';
  } else h += '<div class="inputs">';
  h += '<div class="stepper"><span class="lbl">Повторы</span><button data-act="step" data-f="r" data-d="-1" data-dk="' + dk + '" aria-label="Меньше повторов">−</button><input inputmode="numeric" data-act="draft" data-f="r" data-dk="' + dk + '" value="' + dr.r + '" aria-label="Повторы"><button data-act="step" data-f="r" data-d="1" data-dk="' + dk + '" aria-label="Больше повторов">+</button></div></div>';
  h += '<div class="actions"><button class="btn primary" data-act="log" data-k="' + key + '" data-id="' + id + '" data-rest="' + item.rest + '" data-dk="' + dk + '" data-n="' + item.sets + '" data-idx="' + idx + '">Записать ' + (work.length + 1) + '-й</button>' + (work.length ? '<button class="btn sec" data-act="drop" data-k="' + key + '" data-id="' + id + '" data-dk="' + dk + '">Без отдыха</button>' : '') + '</div>';
  if (work.length && !st.seenDrop) h += '<p class="muted small">«Без отдыха» — когда сразу после подхода добиваешь ещё несколько повторов с меньшим весом. Таймер после этого не запускается.</p>';
  h += '<div class="gfoot"><button class="link" data-ex="' + id + '">' + (VID()[id] ? ICON.play + ' Техника и видео' : ICON.info + ' Техника') + '</button>' + (vars.length > 1 ? '<button class="link" data-act="variant" data-g="' + EX[id].group + '" data-v="' + vars[(vars.indexOf(id) + 1) % vars.length] + '">Вместо: ' + esc(EX[vars[(vars.indexOf(id) + 1) % vars.length]].vname) + '</button>' : '') + (complete ? '<button class="link" data-act="next" data-idx="' + idx + '">Дальше ' + ICON.chev + '</button>' : '') + '</div>';
  h += '</div>';
 }
 h += '</li>';
 return h;
}
const restTxt = s => s >= 60 ? (s % 60 ? Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') : (s / 60) + ' мин') : s + ' с';
function checkItem(it, key, idx){
 const def = EX[it.ex] || {n: it.ex};
 const ck = it.ex + '#' + idx;
 const s = st.log[key];
 const on = !!(s && s.checks && s.checks[ck]);
 const locked = def.gate === 'surgeon' && !st.surgeonOk;
 const tm = it.timer || def.timer || '';
 return '<li class="chk' + (on ? ' on' : '') + (locked ? ' locked' : '') + '"><button class="cbox" data-act="check" data-k="' + key + '" data-c="' + ck + '"' + (locked ? ' disabled aria-label="Закрыто до осмотра хирурга"' : ' aria-pressed="' + on + '" aria-label="Отметить: ' + esc(def.n) + '"') + '>' + (locked ? ICON.lock : ICON.check) + '</button><button class="cmain" data-ex="' + it.ex + '"><span class="cname">' + esc(def.n) + '</span>' + (it.dose ? '<span class="dose">' + esc(it.dose) + '</span>' : '') + (it.note ? '<span class="cnote">' + esc(it.note) + '</span>' : '') + (locked ? '<span class="cnote">после осмотра хирурга</span>' : '') + (VID()[it.ex] && !locked ? '<span class="vmark">' + ICON.play + 'видео</span>' : '') + '</button>' + (tm && !locked ? '<button class="ibtn" data-act="timer" data-t="' + tm + '" aria-label="Таймер">' + ICON.timer + '</button>' : '') + '</li>';
}
function prIndexes(id, key){
 const out = new Set();
 const s = st.log[key]; if (!s || !s.ex[id]) return out;
 const hist = exHist(id, key);
 if (!hist.length) return out;
 let best = Math.max(...hist.map(h => bestOf(id, h.sets)));
 s.ex[id].sets.forEach((x, i) => { if (x.d) return; const v = e1(id, x.w, x.r); if (v > best + 1e-6){ out.add(i); best = v; } });
 return out;
}
function countPR(key){ const s = st.log[key]; if (!s) return 0; return Object.keys(s.ex || {}).reduce((a, id) => a + prIndexes(id, key).size, 0); }

/* ================= Таймер отдыха ================= */
const rest = {end: 0, total: 0, label: '', iv: null};
function startRest(sec, label){
 rest.total = sec; rest.end = Date.now() + sec * 1000; rest.label = label; rest.fired = false;
 $('#rest').classList.add('on'); $('#rest').classList.remove('go'); document.body.classList.add('resting');
 clearInterval(rest.iv); rest.iv = setInterval(tickRest, 250); tickRest();
 wakeOn();
}
function tickRest(){
 const left = Math.ceil((rest.end - Date.now()) / 1000);
 const el = $('#rest');
 if (left <= 0){
  if (!rest.fired){ rest.fired = true; beep(880, 300); setTimeout(() => beep(1180, 300), 380); setTimeout(() => beep(1480, 500), 760); if (navigator.vibrate) navigator.vibrate([200, 100, 200]); }
  el.classList.add('go');
  el.querySelector('.rtime').textContent = 'Пора';
  el.querySelector('.rlbl').textContent = rest.label.replace('Дальше: ', 'Пора: ');
  el.querySelector('.rbar i').style.transform = 'scaleX(1)';
  if (left < -90) stopRest();
  return;
 }
 el.querySelector('.rtime').textContent = Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
 el.querySelector('.rlbl').textContent = rest.label;
 el.querySelector('.rbar i').style.transform = 'scaleX(' + (1 - left / rest.total) + ')';
}
function stopRest(){ clearInterval(rest.iv); $('#rest').classList.remove('on', 'go'); document.body.classList.remove('resting'); wakeOff(); }
let audio = null, wake = null;
function unlockAudio(){ try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume(); const b = audio.createBuffer(1, 1, 22050), src = audio.createBufferSource(); src.buffer = b; src.connect(audio.destination); src.start(0); } catch (e) {} }
function beep(f, ms){ try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); const o = audio.createOscillator(), g = audio.createGain(); o.frequency.value = f; o.connect(g); g.connect(audio.destination); g.gain.setValueAtTime(.3, audio.currentTime); g.gain.exponentialRampToValueAtTime(.001, audio.currentTime + ms / 1000); o.start(); o.stop(audio.currentTime + ms / 1000); } catch (e) {} }
async function wakeOn(){ try { if (!wake) wake = await navigator.wakeLock.request('screen'); } catch (e) {} }
function wakeOff(){ try { wake && wake.release(); } catch (e) {} wake = null; }

/* ================= Полноэкранные таймеры ================= */
let fsRun = null;
function runIntervals(name, steps, rounds){
 unlockAudio();
 const seq = [['Приготовься', 5]]; for (let i = 0; i < rounds; i++) steps.forEach(x => seq.push([x[0], x[1], i + 1]));
 const sc = $('#screen'); sc.classList.add('on'); wakeOn(); beep(660, 120);
 let idx = 0, end = Date.now() + seq[0][1] * 1000, last = -1, paused = 0;
 const draw = () => {
  if (paused) return;
  const left = Math.max(0, Math.ceil((end - Date.now()) / 1000)); const x = seq[idx];
  sc.innerHTML = '<p class="slbl">' + esc(name) + (x[2] ? ' · ' + x[2] + ' из ' + rounds : '') + '</p><p class="sbig">' + esc(x[0]) + '</p><p class="scnt">' + Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0') + '</p><div class="sbtns"><button class="btn sec" data-act="fs-pause">Пауза</button><button class="btn sec" data-act="fs-skip">Дальше</button><button class="btn sec" data-act="fs-stop">Стоп</button></div>';
  if (left <= 3 && left > 0 && left !== last) beep(880, 80); last = left;
  if (Date.now() >= end){ idx++; if (idx >= seq.length){ beep(520, 600); sc.innerHTML = '<p class="sbig">Готово</p><div class="sbtns"><button class="btn sec" data-act="fs-stop">Закрыть</button></div>'; clearInterval(fsRun.iv); wakeOff(); return; }
   end = Date.now() + seq[idx][1] * 1000; beep(/Бег|Быстро|Тяжело|Работа/.test(seq[idx][0]) ? 990 : 440, 400); if (navigator.vibrate) navigator.vibrate(200); }
 };
 fsRun = {iv: setInterval(draw, 200),
  pause: () => { if (!paused){ paused = Math.max(1, end - Date.now()); const b = $('[data-act="fs-pause"]'); if (b) b.textContent = 'Продолжить'; } else { end = Date.now() + paused; paused = 0; draw(); } },
  skip: () => { paused = 0; end = Date.now(); draw(); }};
 draw();
}
function runReact(cfg){
 unlockAudio();
 const r = Object.assign({work: 20, rest: 40, sets: 4, min: 1.5, max: 3, mode: '4'}, st.react || {}, cfg || {});
 const dirs = r.mode === 'lr' ? ['←', '→'] : ['←', '→', '↑', '↓'];
 const opp = {'←': '→', '→': '←', '↑': '↓', '↓': '↑'};
 const sc = $('#screen'); sc.classList.add('on'); wakeOn();
 let set = 0;
 const show = html => { sc.innerHTML = html + '<button class="btn sec sstop" data-act="fs-stop">Стоп</button>'; };
 const cd = (label, sec, next) => { let t = sec; const tick = () => { if (!fsRun) return; show('<p class="slbl">' + esc(label) + '</p><p class="scnt">' + t + '</p>'); if (t <= 3 && t > 0) beep(880, 80); if (t <= 0){ next(); return; } t--; fsRun.to = setTimeout(tick, 1000); }; tick(); };
 const work = () => { set++; const endT = Date.now() + r.work * 1000; beep(990, 300);
  const cue = () => { if (!fsRun) return;
   if (Date.now() >= endT){ if (set >= r.sets){ beep(520, 600); show('<p class="sbig">Готово</p>'); wakeOff(); return; } cd('Отдых · подход ' + set + ' из ' + r.sets, r.rest, work); return; }
   let d = dirs[Math.floor(Math.random() * dirs.length)];
   show('<p class="slbl">Подход ' + set + ' из ' + r.sets + '</p><p class="arrow">' + d + '</p>'); beep({'←': 600, '→': 800, '↑': 1000, '↓': 450}[d], 140);
   const gap = () => Math.max(300, (r.min + Math.random() * (r.max - r.min)) * 1000 - 700);
   if (r.mode === 'feint' && Math.random() < .35){ fsRun.to = setTimeout(() => { if (!fsRun) return; d = opp[d]; show('<p class="slbl">Финт!</p><p class="arrow feint">' + d + '</p>'); beep(1200, 140); fsRun.to = setTimeout(() => { show('<p class="slbl">Подход ' + set + ' из ' + r.sets + '</p><p class="arrow dim">•</p>'); fsRun.to = setTimeout(cue, gap()); }, 600); }, 450); return; }
   fsRun.to = setTimeout(() => { if (!fsRun) return; show('<p class="slbl">Подход ' + set + ' из ' + r.sets + '</p><p class="arrow dim">•</p>'); fsRun.to = setTimeout(cue, gap()); }, 700);
  };
  cue(); };
 fsRun = {to: null, iv: null};
 cd('Приготовься', 5, work);
}
function stopFs(){ if (fsRun){ clearInterval(fsRun.iv); clearTimeout(fsRun.to); fsRun = null; } $('#screen').classList.remove('on'); wakeOff(); }

/* ================= План ================= */
function renderPlan(){
 const cw = weekOf(todayD());
 if (ui.planWeek == null) ui.planWeek = cw < 0 ? 0 : Math.min(cw, 13);
 const w = ui.planWeek;
 let h = '<header class="top"><div><h1>План</h1><p class="sub">Стартовая неделя, 12 недель в четырёх фазах, затем первый матч. Переход дальше — по тестам, а не по датам.</p></div></header>';
 h += '<nav class="weeks" aria-label="Недели">' + Array.from({length: 14}, (_, i) => '<button data-week="' + i + '" aria-pressed="' + (i === w) + '" class="wk ' + (i === 13 ? 'p4' : PHASES[phaseOf(i)].color) + (i === cw ? ' cur' : '') + '">' + (i === 13 ? 'Матч' : i === 0 ? 'Старт' : i) + (TEST_WEEKS.includes(i) ? '<small>тест</small>' : i === cw ? '<small>сейчас</small>' : '<small>&nbsp;</small>') + '</button>').join('') + '</nav><p class="legend">Цвет — фаза. «Тест» — неделя проверки: по её итогам решаем, идти ли дальше.</p>';
 if (w === 13){ h += matchHTML(); app.innerHTML = h; return; }
 const p = PHASES[phaseOf(w)];
 const ws = addD(startD(), w * 7);
 h += '<section class="phase ' + p.color + '"><p class="ptag">' + esc(p.name) + ' · неделя ' + w + ' · ' + fmtD(ws) + ' — ' + fmtD(addD(ws, 6)) + '</p><h2>' + esc(p.title) + '</h2><p>' + esc(p.goal) + '</p><p class="gate"><b>Дальше, когда:</b> ' + esc(p.exit) + '</p></section>';
 if (drillWeek(w) !== w) h += '<div class="gatebox">' + ICON.lock + '<div>Пока хирург не проверил колено, прыжки и бег здесь — как на неделе 3. Сила ног идёт по фазе.</div></div>';
 if (w === 0 || w === 1) h += '<p class="hint">Неделя: вт — ноги и колено, чт — верх A и короткий блок ног, сб — верх B и беговая дорожка, вс — поле. Пн, ср, пт — отдых или лёгкий велосипед.</p>';
 DAY_ORDER.forEach(t => {
  const sess = buildSession(w, t, drillWeek(w));
  const dd = addD(ws, DAYS[t].wd);
  h += '<details class="pday"' + (w === cw && wdIdx(todayD()) === DAYS[t].wd ? ' open' : '') + '><summary><span class="pwd">' + WD[DAYS[t].wd] + '<small>' + dd.getDate() + '</small></span><span class="pname">' + DAYS[t].name + '<small>' + DAYS[t].dur + (DAYS[t].optional ? ' · по возможности' : '') + '</small></span>' + ICON.chev + '</summary><div class="pbody">';
  sess.blocks.forEach(b => {
   h += '<h3 class="ph">' + esc(b.t) + '</h3><ul>' + b.items.map(it => {
    const def = EX[it.ex] || {n: it.ex};
    const dose = it.type === 'g' ? it.sets + ' × ' + it.lo + (it.hi !== it.lo ? '–' + it.hi : '') + ' · отдых ' + restTxt(it.rest) : it.dose;
    const locked = def.gate === 'surgeon' && !st.surgeonOk;
    return '<li' + (locked ? ' class="locked"' : '') + '><button class="link" data-ex="' + it.ex + '">' + esc(def.n) + '</button> <span class="muted">' + esc(dose) + '</span></li>';
   }).join('') + '</ul>';
  });
  if (sess.note) h += '<p class="hint">' + esc(sess.note) + '</p>';
  h += '</div></details>';
 });
 app.innerHTML = h;
}
function matchHTML(){
 const items = [['m1','Тесты недели 9 пройдены'],['m2','2–3 недели полных тренировок с командой без отёка, боли и подкашиваний'],['m3','Хирург дал добро'],['m4','Перед каждой тренировкой — разминка FIFA 11+'],['m5','Опросник уверенности 72 и выше, тебе спокойно и хочется играть']];
 st.match = st.match || {};
 const done = items.filter(i => st.match[i[0]]).length;
 return '<section class="phase p4"><h2>Первый матч</h2><p>Ориентир — конец января или февраль 2027. Дата не важна, важны условия.</p><ul class="items">' + items.map(([k, t]) => '<li class="chk' + (st.match[k] ? ' on' : '') + '"><button class="cbox" data-act="match" data-m="' + k + '" aria-pressed="' + !!st.match[k] + '">' + ICON.check + '</button><span class="cmain"><span class="cname">' + esc(t) + '</span></span></li>').join('') + '</ul><div class="meter"><i style="width:' + done / items.length * 100 + '%"></i></div></section>' +
  '<section class="card"><h2 class="bt">Минуты в первых матчах</h2><table class="sets"><tr><th>Матч</th><th>Минут</th></tr><tr><td>1</td><td>20–30</td></tr><tr><td>2</td><td>45</td></tr><tr><td>3</td><td>60–70</td></tr><tr><td>4</td><td>полный</td></tr></table><p class="muted small">Следующая ступень — только если утром после матча нет отёка, боль не выше 2 из 10 и не было подкашиваний.</p></section>' +
  '<section class="card"><h2 class="bt">Весь первый сезон</h2><ul class="plain"><li>FIFA 11+ перед каждой игрой.</li><li>Ноги в зале дважды в неделю, на обе ноги: риск порвать связку на здоровом колене такой же, как на оперированном.</li><li>Тесты недели 9 — раз в 6–8 недель.</li></ul></section>';
}

/* ================= Прогресс ================= */
function renderProgress(){
 let h = '<header class="top"><div><h1>Прогресс</h1></div></header>';
 h += '<div class="seg big" role="group">' + [['str','Сила'],['knee','Колено'],['body','Вес тела']].map(([v, l]) => '<button data-act="pseg" data-v="' + v + '" aria-pressed="' + (ui.progSeg === v) + '">' + l + '</button>').join('') + '</div>';
 if (ui.progSeg === 'str') h += strengthHTML();
 else if (ui.progSeg === 'knee') h += kneeHTML();
 else h += bodyHTML();
 app.innerHTML = h;
}
function exSeries(id){
 return exHist(id).map(x => ({date: x.date, k: x.k, v: kindOf(id) === 'reps' ? x.sets.filter(s => !s.d).reduce((a, s) => a + s.r, 0) : bestOf(id, x.sets), sets: x.sets}));
}
function strengthHTML(){
 const ids = Object.keys(EX).filter(id => ['w','bw','reps'].includes(EX[id].kind) && exHist(id).length);
 if (!ids.length) return '<p class="empty">Здесь появятся графики, когда запишешь первые подходы. Старую историю можно загрузить в «Ещё → Данные».</p>';
 const cats = ['Грудь и плечи','Спина','Руки и пресс','Ноги'];
 let h = '<p class="hint">Графики показывают силу в килограммах с учётом повторов — так 60×10 и 65×7 можно сравнить. Процент — изменение с первой записи.</p>';
 cats.forEach(c => {
  const list = ids.filter(id => EX[id].c === c);
  if (!list.length) return;
  h += '<section class="blk"><h2 class="bt">' + c + '</h2><ul class="prog">';
  list.forEach(id => {
   const ser = exSeries(id); const last = ser[ser.length - 1]; const first = ser[0];
   const lastSets = last.sets.filter(s => !s.d);
   const top = lastSets.reduce((a, s) => e1(id, s.w, s.r) > e1(id, a.w, a.r) ? s : a, lastSets[0]);
   const delta = ser.length > 1 ? Math.round((last.v - first.v) / first.v * 100) : 0;
   h += '<li><button class="prow" data-act="exprog" data-id="' + id + '"><span class="pn">' + esc(EX[id].n) + '<small>' + fmtD(pd(last.date)) + ' · ' + setText(id, top) + '</small></span>' + spark(ser.map(s => s.v)) + '<span class="pd ' + (delta > 0 ? 'up' : '') + '">' + (ser.length > 1 ? (delta > 0 ? '+' : '') + delta + '%' : 'старт') + '</span></button></li>';
  });
  h += '</ul></section>';
 });
 return h;
}
function spark(vals){
 if (vals.length < 2) return '<svg class="spark" viewBox="0 0 64 24" aria-hidden="true"></svg>';
 const mn = Math.min(...vals), mx = Math.max(...vals), r = mx - mn || 1;
 const pts = vals.map((v, i) => (i / (vals.length - 1) * 60 + 2).toFixed(1) + ',' + (21 - (v - mn) / r * 18).toFixed(1)).join(' ');
 return '<svg class="spark" viewBox="0 0 64 24" aria-hidden="true"><polyline points="' + pts + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}
function chartSVG(ser, opts){
 opts = opts || {};
 const W = 340, H = 180, P = {l: 36, r: 12, t: 14, b: 26};
 if (!ser.length) return '';
 const vals = ser.map(s => s.v);
 let mn = Math.min(...vals), mx = Math.max(...vals);
 if (opts.target != null){ mn = Math.min(mn, opts.target); mx = Math.max(mx, opts.target); }
 const pad = (mx - mn) * .15 || 2; mn -= pad; mx += pad;
 const x = i => P.l + (ser.length === 1 ? (W - P.l - P.r) / 2 : i / (ser.length - 1) * (W - P.l - P.r));
 const y = v => P.t + (1 - (v - mn) / (mx - mn)) * (H - P.t - P.b);
 let best = -Infinity;
 let g = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(opts.label || 'График') + '">';
 [0, .5, 1].forEach(f => { const v = mn + (mx - mn) * f; g += '<line x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + y(v) + '" y2="' + y(v) + '" class="grid"/><text x="' + (P.l - 6) + '" y="' + (y(v) + 4) + '" class="ax" text-anchor="end">' + Math.round(v) + '</text>'; });
 if (opts.target != null) g += '<line x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + y(opts.target) + '" y2="' + y(opts.target) + '" class="tline"/>';
 g += '<polyline points="' + ser.map((s, i) => x(i) + ',' + y(s.v)).join(' ') + '" class="line"/>';
 ser.forEach((s, i) => { const pr = i > 0 && s.v > best + 1e-6; if (s.v > best) best = s.v; g += '<circle cx="' + x(i) + '" cy="' + y(s.v) + '" r="' + (pr && !opts.noPR ? 5 : 3.5) + '" class="' + (pr && !opts.noPR ? 'dpr' : 'dot') + '"/>'; });
 const lab = [0, ser.length - 1].filter((v, i, a) => a.indexOf(v) === i);
 lab.forEach(i => { g += '<text x="' + x(i) + '" y="' + (H - 6) + '" class="ax" text-anchor="' + (i === 0 && ser.length > 1 ? 'start' : 'end') + '">' + fmtD(pd(ser[i].date)) + '</text>'; });
 return g + '</svg>';
}
function openExProg(id){
 const ser = exSeries(id);
 let h = '<div class="shead"><h3>' + esc(EX[id].n) + '</h3><button class="btn sec sm" data-act="close">Закрыть</button></div>';
 h += chartSVG(ser, {label: 'График: ' + EX[id].n});
 h += '<p class="muted small">' + (kindOf(id) === 'reps' ? 'Сумма повторов за тренировку.' : 'Сила, кг: сколько ты поднял бы на 1 раз при таких подходах. Золотые точки — рекорды.') + '</p>';
 h += '<table class="sets"><thead><tr><th>Дата</th><th>Подходы</th></tr></thead><tbody>' + ser.slice().reverse().map(s => '<tr><td>' + fmtD(pd(s.date)) + '</td><td>' + esc(setsText(id, s.sets)) + '</td></tr>').join('') + '</tbody></table>';
 openSheet(h);
}
/* ---- Колено: тесты ---- */
function getT(cp, id){ return ((st.tests[cp] || {})[id]) || {}; }
function setT(cp, id, f, v){ st.tests[cp] = st.tests[cp] || {}; st.tests[cp][id] = st.tests[cp][id] || {}; st.tests[cp][id][f] = v; save(); }
function prevRsi(cp){ const o = [0, 3, 6, 9]; for (let j = o.indexOf(+cp) - 1; j >= 0; j--){ const v = getT(o[j], 'rsi').v; if (v !== undefined && v !== '') return +v; } return null; }
function evalT(cp, id, req){
 const d = TD[id], v = getT(cp, id), bw = Number(st.bw) || 0;
 const num = x => x === undefined || x === '' || isNaN(parseFloat(String(x).replace(',', '.'))) ? null : parseFloat(String(x).replace(',', '.'));
 let txt = '', ok = null;
 if (d.type === 'sel'){ if (!v.v) return {txt, ok}; ok = v.v === 'нет' || v.v === 'след'; txt = ok ? 'норма' : 'отёк больше нормы'; }
 else if (d.type === 'bool'){ if (v.v === undefined) return {txt, ok}; ok = !!v.v; txt = ok ? 'да' : 'нет'; }
 else if (d.type === 'rsi'){ const x = num(v.v); if (x === null) return {txt, ok}; if (req.min){ ok = x >= req.min; txt = x.toFixed(0) + ' из 100 (нужно не меньше ' + req.min + ')'; } else if (req.grow){ const pr = prevRsi(cp); ok = pr === null ? null : x >= pr; txt = x.toFixed(0) + ' из 100' + (pr === null ? '' : ' (было ' + pr.toFixed(0) + ')'); } else txt = x.toFixed(0) + ' из 100'; }
 else if (d.type === 'diff'){ const a = num(v.o), b = num(v.h); if (a === null || b === null) return {txt, ok}; const df = Math.abs(b - a); txt = 'разница ' + fw(Math.round(df * 10) / 10) + ' см'; if (req.diff) ok = df < req.diff; }
 else { const a = num(v.o), b = num(v.h); if (!a || !b) return {txt, ok};
  const sym = d.type === 'time' ? b / a * 100 : a / b * 100; txt = 'оперированная — ' + sym.toFixed(0) + '% от здоровой'; ok = true;
  if (sym > 125) txt += '. Проверь: оперированная заметно сильнее — не перепутал ноги?';
  if (req.min){ ok = sym >= req.min; txt += ' (нужно не меньше ' + req.min + '%)'; }
  if (req.abs){ ok = ok && a >= req.abs && b >= req.abs; txt += ', минимум ' + req.abs + ' на каждой'; }
  if (req.bw !== undefined){ if (bw > 0){ const r = a / bw; txt += ' · ' + fw(Math.round(r * 100) / 100) + ' твоего веса'; if (req.bw) { ok = r >= req.bw; txt += ' (нужно не меньше ' + fw(req.bw) + ')'; } } else if (req.bw) ok = null; }
  if (req.info && !req.min) ok = null; }
 if (req.info && d.type !== 'sym') ok = null;
 return {txt, ok};
}
function kneeHTML(){
 if (ui.cp == null){ const w = weekOf(todayD()); ui.cp = w >= 9 ? 9 : w >= 6 ? 6 : w >= 3 ? 3 : 0; }
 const c = CP[ui.cp];
 let h = '<p class="hint">Впиши результат обеих ног — приложение посчитает, сколько процентов от здоровой делает оперированная. Нажми на название теста, чтобы открыть инструкцию.</p>';
 h += '<nav class="weeks" aria-label="Контрольные точки">' + Object.keys(CP).map(k => '<button data-act="cp" data-v="' + k + '" aria-pressed="' + (String(k) === String(ui.cp)) + '">' + CP[k].n + '<small>' + CP[k].sub + '</small></button>').join('') + '</nav>';
 let pass = 0, tot = 0;
 let reqH = '', infoH = '', infoN = 0;
 Object.entries(c.req).forEach(([id, req]) => {
  const d = TD[id], v = getT(ui.cp, id), r = evalT(ui.cp, id, req);
  if (!req.info){ tot++; if (r.ok === true) pass++; }
  const gated = d.ex && EX[d.ex] && EX[d.ex].gate === 'surgeon' && !st.surgeonOk;
  let inp = '';
  if (d.type === 'sel') inp = '<div class="seg small">' + SWELL.map(([o, l]) => '<button data-act="tset" data-id="' + id + '" data-f="v" data-v="' + o + '" aria-pressed="' + (v.v === o) + '">' + l + '</button>').join('') + '</div>';
  else if (d.type === 'bool') inp = '<div class="seg small"><button data-act="tset" data-id="' + id + '" data-f="v" data-v="1" aria-pressed="' + (v.v === true) + '">Да</button><button data-act="tset" data-id="' + id + '" data-f="v" data-v="0" aria-pressed="' + (v.v === false) + '">Нет</button></div>';
  else if (d.type === 'rsi') inp = '<div class="tin"><input inputmode="numeric" data-act="tin" data-id="rsi" data-f="v" value="' + esc(v.v) + '" placeholder="0–100" aria-label="Балл"><button class="btn sec sm" data-act="rsi">Пройти опросник</button></div>';
  else inp = '<div class="tin two"><label>Оперированная<input inputmode="decimal" data-act="tin" data-id="' + id + '" data-f="o" value="' + esc(v.o) + '"></label><label>Здоровая<input inputmode="decimal" data-act="tin" data-id="' + id + '" data-f="h" value="' + esc(v.h) + '"></label><span class="muted">' + (d.u || '') + '</span></div>';
  const mark = req.info ? '' : r.ok === true ? '<span class="tag ok">' + ICON.check + '</span>' : r.ok === false ? '<span class="tag bad">не пройдено</span>' : '';
  const li = '<li class="test' + (gated ? ' locked' : '') + '"><div class="thead">' + (d.ex ? '<button class="link" data-ex="' + d.ex + '">' + esc(d.n) + '</button>' : '<b>' + esc(d.n) + '</b>') + mark + '</div>' + (gated ? '<p class="muted small">' + ICON.lock + ' После осмотра хирурга</p>' : inp + (r.txt ? '<p class="tres ' + (r.ok === true ? 'ok' : r.ok === false ? 'bad' : '') + '">' + esc(r.txt) + '</p>' : '')) + '</li>';
  if (req.info){ infoH += li; infoN++; } else reqH += li;
 });
 h += '<h2 class="bt">Нужно для перехода дальше</h2><ul class="tests">' + reqH + '</ul>';
 if (infoN) h += '<details class="rule"' + (ui.cpInfoOpen ? ' open' : '') + ' data-act="cpinfo"><summary>Записать для истории <span class="muted">' + infoN + '</span>' + ICON.chev + '</summary><ul class="tests inner">' + infoH + '</ul></details>';
 h += '<section class="summary"><div class="sumrow"><span>Пройдено</span><b>' + pass + ' из ' + tot + '</b></div><div class="meter"><i style="width:' + (tot ? pass / tot * 100 : 0) + '%"></i></div>' + verdict(ui.cp, pass, tot) + '</section>';
 h += '<section class="card"><h2 class="bt">Тест на специальном тренажёре</h2><p>Самопроверки в зале обычно показывают ноги ровнее, чем есть. Если найдёшь клинику спортивной медицины с изокинетическим тестом силы — сделай его хотя бы перед тренировками с командой (неделя 9). Цель — разница между ногами меньше 10%.</p></section>';
 return h;
}
function verdict(cp, pass, tot){
 if (+cp === 0){
  const sw = getT(0, 'stroke').v, v = getT(0, 'ext10');
  const a = parseFloat(String(v.o || '').replace(',', '.')), b = parseFloat(String(v.h || '').replace(',', '.'));
  if (!sw || !a || !b) return '<p class="lightbox">Внеси отёк и разгибание одной ногой — получишь маршрут.</p>';
  const s = a / b * 100;
  if (sw === 'есть' || sw === 'след+' || s < 80) return '<p class="lightbox red"><b>Сначала 3–4 недели силы без прыжков.</b> Оперированная нога делает ' + s.toFixed(0) + '% от здоровой. В «Ещё → Настройки» сдвинь дату старта на 3 недели вперёд и делай только силовые и бег-ходьбу, потом повтори тесты.</p>';
  if (s < 90) return '<p class="lightbox green"><b>Фаза 1 по плану.</b> Оперированная нога — ' + s.toFixed(0) + '% от здоровой.</p>';
  return '<p class="lightbox green"><b>Фаза 1 по плану, можно быстрее.</b> ' + s.toFixed(0) + '% — после недели 1 переходи к неделе 3.</p>';
 }
 if (tot && pass === tot) return '<p class="lightbox green"><b>Всё пройдено — переходи к следующей фазе.</b>' + (+cp === 9 ? ' Это допуск к тренировкам с командой, а не к матчу.' : '') + '</p>';
 return '<p class="lightbox yellow">Пока не всё. Повтори последнюю неделю фазы и проверься снова. Если результаты не растут 4–6 недель — к физиотерапевту.</p>';
}
function rsiSheet(){
 const saved = st.rsi[ui.cp] || [];
 let h = '<div class="shead"><h3>Опросник уверенности</h3><button class="btn sec sm" data-act="close">Закрыть</button></div><p class="muted small">Отвечай про футбол — как чувствуешь сейчас. Сдвинь каждый ползунок: 0 — левый ответ, 10 — правый. Это пересказ международного опросника для тех, кто возвращается в спорт после операции на связке.</p>';
 ui.rsiTouched = saved.map(() => true);
 RSI_Q.forEach((q, i) => { const v = saved[i] == null ? 5 : saved[i]; h += '<div class="rq"><p>' + (i + 1) + '. ' + esc(q[0]) + ' <output id="rq' + i + '">' + (saved[i] == null ? '—' : v) + '</output></p><input type="range" min="0" max="10" value="' + v + '" data-rq="' + i + '" aria-label="Ответ ' + (i + 1) + '"><div class="ran"><span>' + esc(q[1]) + '</span><span>' + esc(q[2]) + '</span></div></div>'; });
 h += '<div class="rsitot">Итог: <b id="rsiTot"></b></div><button class="btn primary" data-act="rsi-save">Сохранить</button>';
 openSheet(h); updRsi();
}
const rsiVals = () => RSI_Q.map((q, i) => +$('[data-rq="' + i + '"]').value);
function updRsi(){ const v = rsiVals(); const n = (ui.rsiTouched || []).filter(Boolean).length; $('#rsiTot').textContent = n < 12 ? 'ответь на все вопросы (' + n + ' из 12)' : (v.reduce((a, b) => a + b, 0) / 1.2).toFixed(0) + ' из 100'; }
/* ---- Вес тела ---- */
function bodyHTML(){
 const arr = (st.bodyw || []).slice().sort((a, b) => a.date.localeCompare(b.date));
 let h = '<section class="card"><h2 class="bt">Вес тела</h2><p class="muted small">Цель — подтянутый торс, а не большая масса: +0,3–0,5 кг в месяц. Быстрее — вместе с мышцами набирается жир. Взвешивайся утром натощак раз в неделю.</p><div class="tin"><input inputmode="decimal" id="bwIn" placeholder="' + fw(Number(st.bw) || 80) + '" aria-label="Вес, кг"><span class="muted">кг</span><button class="btn primary sm" data-act="bw-add">Записать</button></div></section>';
 if (arr.length){
  const ser = arr.map(x => ({date: x.date, v: x.kg}));
  h += '<section class="card">' + chartSVG(ser, {noPR: true}) + '</section>';
  if (arr.length > 1){ const days = ddiff(pd(arr[0].date), pd(arr[arr.length - 1].date)) || 1; const rate = (arr[arr.length - 1].kg - arr[0].kg) / days * 30; h += '<p class="hint">Темп: ' + (rate >= 0 ? '+' : '') + fw(Math.round(rate * 10) / 10) + ' кг в месяц. ' + (rate > 0.7 ? 'Быстровато — убавь калории на 100–200.' : rate < 0.1 ? 'Почти не растёт — добавь 150–250 ккал в день.' : 'Хороший темп.') + '</p>'; }
  h += '<ul class="plain">' + arr.slice().reverse().map(x => '<li>' + fmtD(pd(x.date)) + ' — <b>' + fw(x.kg) + ' кг</b></li>').join('') + '</ul>';
 }
 h += '<section class="card"><h2 class="bt">Питание для набора</h2><ul class="plain"><li>Белок 130–160 г в день.</li><li>Калорий на 250–300 больше, чем тратишь.</li><li>Без белка и профицита мышцы почти не растут, даже при идеальном зале.</li></ul></section>';
 return h;
}

/* ================= Журнал ================= */
function renderJournal(){
 const list = sessList().filter(hasWork).reverse();
 let h = '<header class="top"><div><h1>Журнал</h1><p class="sub">' + list.length + ' ' + plural(list.length, 'тренировка', 'тренировки', 'тренировок') + '</p></div></header>';
 if (!list.length){ app.innerHTML = h + '<p class="empty">Пока пусто. Записанные подходы и отмеченные упражнения появятся здесь. Старую историю можно загрузить в «Ещё → Данные».</p>'; return; }
 let curWeek = null;
 list.forEach(s => {
  const d = pd(s.date); const mon = addD(d, -wdIdx(d));
  const wk = iso(mon);
  if (wk !== curWeek){ if (curWeek) h += '</ul>'; curWeek = wk; h += '<h3 class="jweek">' + fmtD(mon) + ' — ' + fmtD(addD(mon, 6)) + '</h3><ul class="jlist">'; }
  const nSets = Object.values(s.ex || {}).reduce((a, e) => a + e.sets.filter(x => !x.d).length, 0);
  const nChk = Object.values(s.checks || {}).filter(Boolean).length;
  const prs = countPR(s.k);
  const open = ui.jopen === s.k;
  h += '<li class="jitem' + (open ? ' open' : '') + '"><button class="jrow" data-act="jopen" data-k="' + s.k + '"><span class="jd">' + WD[wdIdx(d)] + '<b>' + d.getDate() + '</b></span><span class="jn">' + esc((DAYS[s.day] || {short: s.day}).short) + '<small>' + (nSets ? nSets + ' ' + plural(nSets, 'подход', 'подхода', 'подходов') : '') + (nSets && nChk ? ' · ' : '') + (nChk ? nChk + ' ' + plural(nChk, 'отметка', 'отметки', 'отметок') : '') + '</small></span>' + (prs ? '<span class="jpr">' + ICON.star + prs + '</span>' : '') + '</button>';
  if (open){
   h += '<div class="jbody"><pre>' + esc(sessText(s.k)) + '</pre><div class="actions"><button class="btn sec sm" data-act="copy-sess" data-k="' + s.k + '">' + ICON.copy + ' Скопировать</button><button class="btn sec sm danger" data-act="del-sess" data-k="' + s.k + '">Удалить</button></div></div>';
  }
  h += '</li>';
 });
 h += '</ul>';
 app.innerHTML = h;
}
function sessText(k){
 const s = st.log[k]; if (!s) return '';
 const d = pd(s.date);
 let t = String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + ' — ' + ((DAYS[s.day] || {}).short || s.day) + '\n';
 Object.entries(s.ex || {}).forEach(([id, e]) => { if (e.sets && e.sets.length) t += '• ' + (EX[id] ? EX[id].n : id) + ': ' + setsText(id, e.sets) + (e.note ? ' (' + e.note + ')' : '') + '\n'; });
 const ch = Object.entries(s.checks || {}).filter(([, v]) => v).map(([c]) => (EX[c.split('#')[0]] || {n: c}).n);
 if (ch.length) t += '• Отмечено: ' + ch.join(', ') + '\n';
 if (s.note) t += s.note + '\n';
 return t.trim();
}

/* ================= Ещё ================= */
function renderMore(){
 let h = '<header class="top"><div><h1>Ещё</h1></div></header>';
 h += '<section class="blk"><h2 class="bt">Таймеры</h2><ul class="menu">' + Object.entries(TIMERS).map(([k, t]) => '<li><button data-act="timer" data-t="' + k + '">' + ICON.timer + '<span>' + esc(t[0]) + '</span></button></li>').join('') + '<li><button data-act="react-cfg">' + ICON.timer + '<span>Реакция — стрелки на экране</span></button></li></ul></section>';
 h += '<section class="blk"><h2 class="bt">Упражнения</h2><input class="search" type="search" placeholder="Найти упражнение" data-act="search" value="' + esc(ui.q || '') + '" aria-label="Поиск упражнения"><div id="libList">' + libList() + '</div></section>';
 h += '<section class="blk"><h2 class="bt">Как пользоваться</h2>' + RULES.map(([t, b], i) => '<details class="rule"><summary>' + esc(t) + ICON.chev + '</summary><div>' + b + (t === 'Вопросы хирургу' && st.notes ? '<p class="tip"><b>Твои заметки:</b> ' + esc(st.notes) + '</p>' : '') + '</div></details>').join('') + '</section>';
 h += '<section class="blk"><h2 class="bt">Настройки</h2><div class="card settings">' +
  '<label class="srow"><span>Понедельник недели 0<small>Сдвинь, если нужен блок силы или повтор недели</small></span><input type="date" data-act="set-start" value="' + esc(st.start) + '"></label>' +
  '<label class="srow"><span>Вес тела, кг<small>Для подтягиваний, брусьев и тестов</small></span><input inputmode="decimal" data-act="set-bw" value="' + esc(fw(Number(st.bw) || 80)) + '"></label>' +
  '<div class="srow"><span>Хирург проверил колено и разрешил прыжки и повороты<small>Откроет закрытые упражнения</small></span><button class="switch" aria-label="Хирург разрешил" data-act="surg-toggle" role="switch" aria-checked="' + !!st.surgeonOk + '"><i></i></button></div>' +
  '</div></section>';
 h += '<section class="blk"><h2 class="bt">Данные</h2><div class="card"><p class="muted small">Всё хранится только на этом телефоне. Раз в пару недель сохраняй копию — если почистить Safari, данные пропадут.</p><div class="actions wrap"><button class="btn sec" data-act="export">Сохранить копию</button><label class="btn sec">Загрузить из файла<input type="file" accept=".json,application/json" data-act="import" hidden></label></div><p class="muted small">Загрузка добавляет тренировки к уже записанным, ничего не стирая. Подходит и для копии, и для файла истории из старого приложения.</p></div></section>';
 h += '<p class="foot">Не заменяет осмотр хирурга и спортивного физиотерапевта. Если их рекомендации расходятся с планом — приоритет за хирургом.</p>';
 app.innerHTML = h;
}
function libList(){
 const q = (ui.q || '').trim().toLowerCase();
 const cats = {};
 Object.entries(EX).forEach(([id, e]) => { if (['legext','legcurl','calves','hyper'].includes(id)) return; if (q && !e.n.toLowerCase().includes(q)) return; (cats[e.c] = cats[e.c] || []).push([id, e]); });
 const order = ['Грудь и плечи','Спина','Руки и пресс','Ноги','Колено и баланс','Прыжки','Бег и смены направления','Мяч','Разминка','Тесты'];
 let h = '';
 order.forEach(c => { if (!cats[c]) return; h += '<details class="rule"' + (q ? ' open' : '') + '><summary>' + c + ' <span class="muted">' + cats[c].length + '</span>' + ICON.chev + '</summary><ul class="lib">' + cats[c].map(([id, e]) => '<li><button data-ex="' + id + '">' + (VID()[id] ? '<img loading="lazy" alt="" src="https://i.ytimg.com/vi/' + VID()[id][0] + '/default.jpg">' : '<span class="noimg"></span>') + '<span>' + esc(e.n) + '</span></button></li>').join('') + '</ul></details>'; });
 return h || '<p class="empty">Ничего не нашлось.</p>';
}
const RULES = [
 ['Как устроена неделя', '<p>3 раза в зал и, если получится, 4-й раз на поле.</p><ul class="plain"><li><b>Вторник — ноги и колено.</b> Прыжки, бег и повороты, сила ног на одну ногу.</li><li><b>Четверг — верх A и короткий блок ног.</b> Грудь, ширина спины, плечи.</li><li><b>Суббота — верх B и беговая дорожка.</b> Плечи, толщина спины, руки.</li><li><b>Воскресенье — поле.</b> Бег, мяч, позже повороты и реакция.</li></ul><p>Грудь, спина и плечи работают дважды в неделю — так растёт торс. Ноги — дважды, иначе колено не догнать. Махи в стороны стоят в обоих днях верха: широкие плечи дают V-силуэт.</p><p>Пропустил день — сделай его на следующий, порядок важнее календаря.</p>'],
 ['Как работают подсказки по весу', '<p>Для каждого упражнения есть диапазон повторов, например 6–8.</p><ul class="plain"><li>Все подходы дошли до верхней границы — в следующий раз вес прибавится.</li><li>Подходы ровные, но ниже верха — тот же вес, цель +1 повтор.</li><li>Подходы проседали (10, 7, 4) — тот же вес, цель — ровные подходы. В первом подходе оставляй 1–2 повтора в запасе.</li><li>Совсем не дотянул — вес снизится на шаг.</li></ul><p>Если утром колено не в норме, вес в ногах не прибавляется.</p>'],
 ['Утренняя проверка колена', '<p>Каждое утро после нагрузки — 20 секунд: проверка отёка и оценка боли на вкладке «Сегодня».</p><ul class="plain"><li><b>Зелёный</b> — по плану.</li><li><b>Жёлтый</b> (едва больше обычного, набухло под коленом, боль 3–4) — облегчённый день, не прибавляй.</li><li><b>Красный</b> (отёк, боль 5+, подкашивание) — без прыжков и бега 3–5 дней. Повторяется — к хирургу.</li></ul>'],
 ['До осмотра хирурга', '<p>Прыжки на одной ноге, повороты, спринты и мяч в движении закрыты, пока хирург не проверит стабильность колена руками. Сила, бег по прямой, мягкие прыжки на двух ногах и передачи стоя — можно.</p><p>После осмотра включи переключатель в «Настройках» — закрытые упражнения откроются.</p>'],
 ['Как читать задания', '<ul class="plain"><li><b>4 × 8–10</b> — 4 подхода по 8–10 повторов.</li><li><b>На каждую</b> — столько на каждую ногу или руку, оперированная первая.</li><li><b>Запас 1–2 повтора</b> — заканчиваешь подход, когда мог бы сделать ещё 1–2.</li><li><b>60%</b> скорости — трусца с ускорением, можно говорить. <b>70%</b> — быстро, но расслабленно. <b>80%</b> — быстро, дыхание тяжелеет. <b>90–95%</b> — почти максимум без зажима.</li></ul>'],
 ['Поле, сырость и зима', '<ul class="plain"><li>Мокрый газон или листья — повороты и торможения не быстрее 70%, или перенеси их в зал.</li><li>Заморозки, лёд, твёрдый грунт — на улице только бег по безопасной поверхности.</li><li>Холоднее +5° — разминка на 5 минут дольше.</li><li>Бутсы: на натуральном газоне — формованные шипы (FG), на искусственном — AG или TF.</li><li>Поле не получилось — бег сделай на дорожке, мяч пропусти. Если поле срывается 2 недели подряд в фазах 2–3 — продли фазу на неделю.</li></ul>'],
 ['Тревожные признаки', '<ul class="plain"><li>Колено отекло на следующий день — шаг назад на 3–5 дней.</li><li>Подкашивание или «выскакивание» — стоп прыжкам и поворотам, к хирургу.</li><li>Заклинивание, болезненные щелчки по внутренней стороне — к хирургу.</li><li>Резкая боль и отёк в икре — срочно к врачу.</li><li>Колено горячее и красное, температура — срочно к врачу.</li></ul>'],
 ['Вопросы хирургу', '<ul class="plain"><li>Стабильно ли колено при осмотре?</li><li>Что видно на последней МРТ и нужна ли повторная?</li><li>Можно ли прыжки на одной ноге, повороты и футбол? С какими ограничениями?</li><li>Какой трансплантат взяли и что учитывать для голеностопа?</li></ul>'],
];

/* ================= Карточка упражнения ================= */
function openEx(id){
 const e = EX[id]; if (!e) return;
 let h = '<div class="shead"><h3>' + esc(e.n) + '</h3><button class="btn sec sm" data-act="close">Закрыть</button></div>';
 h += vidThumb(id);
 if (e.gate === 'surgeon' && !st.surgeonOk) h += '<p class="gatebox small">' + ICON.lock + ' Закрыто до осмотра хирурга.</p>';
 h += '<ol class="steps">' + (e.steps || []).map(s => '<li>' + esc(s) + '</li>').join('') + '</ol>';
 if (e.err) h += '<h4>Частые ошибки</h4><ul class="plain">' + e.err.map(s => '<li>' + esc(s) + '</li>').join('') + '</ul>';
 if (e.tip) h += '<p class="tip">' + esc(e.tip) + '</p>';
 if (e.alt) h += '<p class="tip"><b>Замена:</b> ' + esc(e.alt) + '</p>';
 const hist = ['w','bw','reps'].includes(e.kind) ? exHist(id).slice(-3).reverse() : [];
 if (hist.length) h += '<h4>Твои последние</h4><ul class="plain">' + hist.map(x => '<li>' + fmtD(pd(x.date)) + ': ' + esc(setsText(id, x.sets)) + '</li>').join('') + '</ul>';
 openSheet(h);
}
function openSheet(html){ $('#sheet').innerHTML = '<div class="grab" aria-hidden="true"></div>' + html; const m = $('#modal'); m.classList.add('on'); m.setAttribute('aria-hidden', 'false'); $('#sheet').scrollTop = 0; }
function closeSheet(){ const m = $('#modal'); m.classList.remove('on'); m.setAttribute('aria-hidden', 'true'); }
function reactCfg(){
 const r = Object.assign({work: 20, rest: 40, sets: 4, min: 1.5, max: 3, mode: '4'}, st.react || {});
 openSheet('<div class="shead"><h3>Реакция</h3><button class="btn sec sm" data-act="close">Закрыть</button></div><p class="muted small">Для прыжков и поворотов по сигналу, когда тренируешься один. Положи телефон в 3–5 метрах перед собой. ← → — в сторону, ↑ — вперёд, ↓ — назад или разворот.</p>' +
  '<div class="card settings"><label class="srow"><span>Работа, секунд</span><input inputmode="numeric" id="rw" value="' + r.work + '"></label><label class="srow"><span>Отдых, секунд</span><input inputmode="numeric" id="rr" value="' + r.rest + '"></label><label class="srow"><span>Подходов</span><input inputmode="numeric" id="rs" value="' + r.sets + '"></label><label class="srow"><span>Стрелка каждые, секунд</span><span class="two"><input inputmode="decimal" id="rmin" value="' + fw(r.min) + '"> – <input inputmode="decimal" id="rmax" value="' + fw(r.max) + '"></span></label></div>' +
  '<div class="seg" role="group" aria-label="Режим" id="rmode">' + [['4','4 стороны'],['lr','Влево-вправо'],['feint','С финтами']].map(([v, l]) => '<button data-act="rmode" data-v="' + v + '" aria-pressed="' + (r.mode === v) + '">' + l + '</button>').join('') + '</div>' +
  '<button class="btn primary" data-act="react-go">Старт</button>');
}

/* ================= События ================= */
document.addEventListener('click', e => {
 const t = e.target;
 const tab = t.closest('.tabbar button'); if (tab){ ui.tab = tab.dataset.tab; ui.open = null; window.scrollTo(0, 0); render(); return; }
 const exb = t.closest('[data-ex]'); if (exb && !t.closest('[data-act="check"]')){ e.preventDefault(); openEx(exb.dataset.ex); return; }
 const dayb = t.closest('[data-day]'); if (dayb){ ui.day = dayb.dataset.day; ui.open = null; render(); return; }
 const wk = t.closest('[data-week]'); if (wk){ ui.planWeek = +wk.dataset.week; renderPlan(); return; }
 const mb = t.closest('button[data-m]'); if (mb){ const di = iso(todayD()); st.morning[di] = st.morning[di] || {}; st.morning[di][mb.dataset.m] = mb.dataset.v; ui.morningEdit = true; save(); render(); return; }
 if (t.id === 'modal'){ closeSheet(); return; }
 const a = t.closest('[data-act]'); if (!a) return;
 const act = a.dataset.act;
 switch (act){
  case 'play': if (canEmbed()){ e.preventDefault(); a.outerHTML = '<div class="vid"><iframe src="https://www.youtube-nocookie.com/embed/' + a.dataset.v + '?autoplay=1&playsinline=1&rel=0&modestbranding=1" title="Видео" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>'; } break;
  case 'open': ui.open = ui.open === a.dataset.o ? null : a.dataset.o; render(); if (ui.open){ const el = a.closest('li'); setTimeout(() => el && el.scrollIntoView({block: 'start', behavior: 'smooth'}), 30); } break;
  case 'variant': st.variant[a.dataset.g] = a.dataset.v; save(); render(); break;
  case 'step': {
   const inp = $('input[data-f="' + a.dataset.f + '"][data-dk="' + CSS.escape(a.dataset.dk) + '"]');
   let v = parseFloat(String(inp.value).replace(',', '.')) || 0; v = Math.max(0, Math.round((v + parseFloat(a.dataset.d)) * 100) / 100);
   inp.value = a.dataset.f === 'w' ? fw(v) : v;
   ui.draft[a.dataset.dk] = Object.assign(ui.draft[a.dataset.dk] || {}, readDraft(a.dataset.dk)); break; }
  case 'log': case 'drop': {
   unlockAudio();
   const dr = readDraft(a.dataset.dk);
   if (!(dr.r > 0)){ toast('Укажи повторы'); return; }
   if (dr.w === '' || isNaN(dr.w)) dr.w = 0;
   const s = getSess(a.dataset.k, true); const id = a.dataset.id;
   s.ex[id] = s.ex[id] || {sets: [], note: ''};
   const rec = {w: dr.w, r: dr.r};
   if (act === 'drop') rec.d = true;
   s.ex[id].sets.push(rec); s.updated = Date.now();
   ui.draft[a.dataset.dk] = act === 'drop' ? ui.draft[a.dataset.dk] : {w: dr.w, r: dr.r};
   save();
   const work = s.ex[id].sets.filter(x => !x.d).length;
   const n = +a.dataset.n || 0;
   const isPR = !rec.d && prIndexes(id, a.dataset.k).has(s.ex[id].sets.length - 1);
   if (act === 'log'){
    if (work < n) startRest(+a.dataset.rest, 'Дальше: ' + (work + 1) + '-й из ' + n + (isPR ? ' · ★ рекорд' : ''));
    else { startRest(+a.dataset.rest, 'Упражнение готово' + (isPR ? ' · ★ рекорд' : '')); }
   }
   if (act === 'drop') st.seenDrop = true;
   const arr = s.ex[id].sets, at = arr.length - 1;
   const undo = {label: 'Отменить', fn: () => { arr.splice(at, 1); stopRest(); save(); render(); }};
   if (isPR) toast('★ Рекорд: ' + setText(id, rec), undo); else toast((act === 'drop' ? 'Записано без отдыха: ' : 'Подход ' + work + ' записан: ') + setText(id, rec), undo);
   if (act === 'log' && work === n){
    const cur = +a.dataset.idx;
    render();
    const nx = [...document.querySelectorAll('li.gym')].find(li => +li.id.slice(2) > cur && !li.classList.contains('complete'));
    if (nx){ ui.open = nx.querySelector('.grow').dataset.o; render(); setTimeout(() => { const el = document.getElementById(nx.id); el && el.scrollIntoView({block: 'start', behavior: 'smooth'}); }, 60); }
    else { ui.open = null; render(); }
    break;
   }
   render(); break; }
  case 'next': {
   const items = [...document.querySelectorAll('li.gym')];
   const cur = +a.dataset.idx; const nx = items.find(li => +li.id.slice(2) > cur && !li.classList.contains('complete'));
   if (nx){ ui.open = nx.querySelector('.grow').dataset.o; render(); setTimeout(() => { const el = document.getElementById(nx.id); el && el.scrollIntoView({block: 'start', behavior: 'smooth'}); }, 30); }
   else { ui.open = null; render(); toast('Силовые на сегодня готовы'); }
   break; }
  case 'edit-set': editSet(a.dataset.k, a.dataset.id, +a.dataset.i); break;
  case 'set-save': {
   const s = st.log[a.dataset.k]; const x = s.ex[a.dataset.id].sets[+a.dataset.i];
   x.w = parseFloat(String($('#ew').value).replace(',', '.')) || 0; x.r = parseInt($('#er').value) || 0; save(); closeSheet(); render(); break; }
  case 'set-del': {
   const s = st.log[a.dataset.k]; const arr = s.ex[a.dataset.id].sets; const i = +a.dataset.i; const removed = arr.splice(i, 1)[0];
   save(); closeSheet(); render();
   toast('Подход удалён', {label: 'Вернуть', fn: () => { arr.splice(i, 0, removed); save(); render(); }}); break; }
  case 'check': { const s = getSess(a.dataset.k, true); s.checks[a.dataset.c] = !s.checks[a.dataset.c]; save(); const li = a.closest('li'); li.classList.toggle('on', !!s.checks[a.dataset.c]); a.setAttribute('aria-pressed', !!s.checks[a.dataset.c]); break; }
  case 'timer': { const tm = a.dataset.t; if (tm === 'react') reactCfg(); else if (TIMERS[tm]) runIntervals(...TIMERS[tm]); break; }
  case 'react-cfg': reactCfg(); break;
  case 'rmode': a.parentElement.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b === a)); break;
  case 'react-go': {
   const g = id => parseFloat(String($('#' + id).value).replace(',', '.'));
   const mode = ($('#rmode [aria-pressed="true"]') || {}).dataset;
   st.react = {work: g('rw') || 20, rest: g('rr') || 40, sets: g('rs') || 4, min: g('rmin') || 1.5, max: Math.max(g('rmax') || 3, g('rmin') || 1.5), mode: mode ? mode.v : '4'};
   save(); closeSheet(); runReact(); break; }
  case 'fs-stop': stopFs(); break;
  case 'fs-pause': if (fsRun && fsRun.pause) fsRun.pause(); break;
  case 'fs-skip': if (fsRun && fsRun.skip) fsRun.skip(); break;
  case 'rest-skip': stopRest(); break;
  case 'rest-add': rest.end += +a.dataset.d * 1000; rest.total = Math.max(rest.total, Math.ceil((rest.end - Date.now()) / 1000)); rest.fired = false; $('#rest').classList.remove('go'); tickRest(); break;
  case 'close': closeSheet(); break;
  case 'toast-act': if (toast.fn) toast.fn(); $('#toast').classList.remove('on'); break;
  case 'm-edit': ui.morningEdit = true; render(); break;
  case 'm-close': { const di = iso(todayD()); st.morning[di] = st.morning[di] || {}; if (!st.morning[di].sw) st.morning[di].sw = 'нет'; ui.morningEdit = false; save(); render(); break; }
  case 'm-ok': { st.morning[iso(todayD())] = {ok: true, sw: 'нет', pain: 0, flag: false, cyst: false}; ui.morningEdit = false; save(); render(); break; }
  case 'surg': ui.tab = 'more'; render(); setTimeout(() => { const el = $('[data-act="surg-toggle"]'); el && el.scrollIntoView({block: 'center'}); }, 30); break;
  case 'surg-toggle': if (!st.surgeonOk && !confirm('Хирург осмотрел колено, подтвердил стабильность и разрешил прыжки и повороты?')) return; st.surgeonOk = !st.surgeonOk; save(); render(); break;
  case 'copy-sess': copyText(sessText(a.dataset.k)); break;
  case 'del-sess': if (confirm('Удалить эту тренировку из журнала?')){ const k = a.dataset.k; const bak = st.log[k]; delete st.log[k]; save(); render(); toast('Тренировка удалена', {label: 'Вернуть', fn: () => { st.log[k] = bak; save(); render(); }}); } break;
  case 'jopen': ui.jopen = ui.jopen === a.dataset.k ? null : a.dataset.k; renderJournal(); break;
  case 'pseg': ui.progSeg = a.dataset.v; renderProgress(); break;
  case 'exprog': openExProg(a.dataset.id); break;
  case 'cp': ui.cp = +a.dataset.v; renderProgress(); break;
  case 'tset': { const v = a.dataset.v; setT(ui.cp, a.dataset.id, a.dataset.f, TD[a.dataset.id].type === 'bool' ? v === '1' : v); renderProgress(); break; }
  case 'rsi': rsiSheet(); break;
  case 'rsi-save': { if ((ui.rsiTouched || []).filter(Boolean).length < 12){ toast('Ответь на все 12 вопросов'); return; } const v = rsiVals(); st.rsi[ui.cp] = v; setT(ui.cp, 'rsi', 'v', (v.reduce((x, y) => x + y, 0) / 1.2).toFixed(0)); closeSheet(); renderProgress(); break; }
  case 'bw-add': { const v = parseFloat(String($('#bwIn').value).replace(',', '.')); if (!(v > 30 && v < 250)){ toast('Введи вес в килограммах'); return; } const di = iso(todayD()); st.bodyw = (st.bodyw || []).filter(x => x.date !== di); st.bodyw.push({date: di, kg: v}); st.bw = v; save(); renderProgress(); break; }
  case 'match': st.match = st.match || {}; st.match[a.dataset.m] = !st.match[a.dataset.m]; save(); renderPlan(); break;
  case 'export': exportData(); break;
 }
});
function readDraft(dk){
 const wi = $('input[data-f="w"][data-dk="' + CSS.escape(dk) + '"]'), ri = $('input[data-f="r"][data-dk="' + CSS.escape(dk) + '"]');
 return {w: wi ? (wi.value === '' ? '' : parseFloat(String(wi.value).replace(',', '.'))) : 0, r: ri ? parseInt(ri.value) || 0 : 0};
}
function editSet(k, id, i){
 const x = st.log[k].ex[id].sets[i];
 openSheet('<div class="shead"><h3>Подход ' + (i + 1) + ' · ' + esc(EX[id].n) + '</h3><button class="btn sec sm" data-act="close">Закрыть</button></div><div class="card settings">' + (kindOf(id) !== 'reps' ? '<label class="srow"><span>Вес, кг</span><input id="ew" inputmode="decimal" value="' + fw(x.w) + '"></label>' : '<input id="ew" type="hidden" value="0">') + '<label class="srow"><span>Повторы</span><input id="er" inputmode="numeric" value="' + x.r + '"></label></div><div class="actions"><button class="btn primary" data-act="set-save" data-k="' + k + '" data-id="' + id + '" data-i="' + i + '">Сохранить</button><button class="btn sec danger" data-act="set-del" data-k="' + k + '" data-id="' + id + '" data-i="' + i + '">Удалить подход</button></div>');
}
document.addEventListener('input', e => {
 const t = e.target;
 if (t.dataset.rq !== undefined){ ui.rsiTouched = ui.rsiTouched || []; ui.rsiTouched[+t.dataset.rq] = true; $('#rq' + t.dataset.rq).textContent = t.value; updRsi(); return; }
 if (t.dataset.m === 'pain'){ const di = iso(todayD()); st.morning[di] = st.morning[di] || {}; st.morning[di].pain = +t.value; const o = t.parentElement.querySelector('output'); if (o) o.textContent = t.value; save(); return; }
 if (t.dataset.act === 'draft'){ ui.draft[t.dataset.dk] = readDraft(t.dataset.dk); return; }
 if (t.dataset.act === 'search'){ ui.q = t.value; $('#libList').innerHTML = libList(); return; }
 if (t.dataset.act === 'sess-note'){ const s = getSess(t.dataset.k, true); s.note = t.value; save(); return; }
 if (t.dataset.act === 'tin'){ setT(ui.cp, t.dataset.id, t.dataset.f, t.value); return; }
});
document.addEventListener('toggle', e => { if (e.target.dataset && e.target.dataset.act === 'cpinfo') ui.cpInfoOpen = e.target.open; }, true);
document.addEventListener('change', e => {
 const t = e.target;
 if (t.dataset.m === 'pain'){ render(); return; }
 if (t.dataset.m){ const di = iso(todayD()); st.morning[di] = st.morning[di] || {}; st.morning[di][t.dataset.m] = t.checked; save(); render(); return; }
 if (t.dataset.act === 'tin'){ renderProgress(); toast('Сохранено'); return; }
 if (t.dataset.act === 'set-start'){ if (t.value){ st.start = t.value; save(); ui.planWeek = null; toast('Дата старта: ' + fmtD(pd(t.value))); } return; }
 if (t.dataset.act === 'set-bw'){ const v = parseFloat(String(t.value).replace(',', '.')); if (v > 30 && v < 250){ st.bw = v; save(); toast('Вес тела сохранён'); } return; }
 if (t.dataset.act === 'import'){ importFile(t.files[0]); t.value = ''; return; }
});
async function copyText(txt){
 try { await navigator.clipboard.writeText(txt); toast('Скопировано'); }
 catch (e) { const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast('Скопировано'); } catch (er) { toast('Не удалось скопировать'); } ta.remove(); }
}
async function exportData(){
 saveNow();
 const name = 'zal-' + iso(todayD()) + '.json';
 const blob = new Blob([JSON.stringify(st)], {type: 'application/json'});
 try {
  const file = new File([blob], name, {type: 'application/json'});
  if (navigator.canShare && navigator.canShare({files: [file]})){ await navigator.share({files: [file], title: 'Копия тренировок'}); return; }
 } catch (e) { if (e && e.name === 'AbortError') return; }
 const u = URL.createObjectURL(blob); const l = document.createElement('a'); l.href = u; l.download = name; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(u), 2000);
}
function importFile(f){
 if (!f) return;
 const rd = new FileReader();
 rd.onload = () => {
  try {
   const data = JSON.parse(rd.result);
   let added = 0;
   const addSess = s => { if (!s || !s.date || !s.day) return; const k = skey(s.date, s.day); const cur = st.log[k]; if (cur && hasWork(cur)) return; st.log[k] = {date: s.date, day: s.day, ex: s.ex || {}, checks: s.checks || {}, note: s.note || ''}; added++; };
   if (Array.isArray(data)) data.forEach(s => addSess(s.data || s));
   else if (data && data.log){
    Object.values(data.log).forEach(addSess);
    ['tests','rsi','morning','variant','match'].forEach(k => { if (data[k]) st[k] = Object.assign({}, data[k], st[k] || {}); });
    if (data.bodyw) { const have = new Set((st.bodyw || []).map(x => x.date)); st.bodyw = (st.bodyw || []).concat(data.bodyw.filter(x => !have.has(x.date))); }
    if (data.notes && !st.notes) st.notes = data.notes;
    if (data.start && !localStorage.getItem(LS)) st.start = data.start;
    if (data.surgeonOk) st.surgeonOk = st.surgeonOk || data.surgeonOk;
    if (data.bw && !st.bw) st.bw = data.bw;
   } else if (data && data.docs) data.docs.forEach(d => addSess(d.data));
   else throw new Error('format');
   saveNow(); render(); toast('Загружено тренировок: ' + added);
  } catch (e) { toast('Не получилось прочитать файл'); }
 };
 rd.readAsText(f);
}

/* смахнуть лист вниз */
(() => { let y0 = null, dy = 0; const sh = () => $('#sheet');
 document.addEventListener('touchstart', e => { const x = sh(); if (!$('#modal').classList.contains('on') || !x.contains(e.target) || x.scrollTop > 0 || e.target.closest('input')) { y0 = null; return; } y0 = e.touches[0].clientY; dy = 0; }, {passive: true});
 document.addEventListener('touchmove', e => { if (y0 == null) return; dy = Math.max(0, e.touches[0].clientY - y0); sh().style.transform = 'translateY(' + dy + 'px)'; }, {passive: true});
 document.addEventListener('touchend', () => { if (y0 == null) return; sh().style.transform = ''; if (dy > 90) closeSheet(); y0 = null; });
})();
/* ================= Старт ================= */
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible'){ if (rest.end && $('#rest').classList.contains('on')) tickRest(); if (ui.tab === 'today') render(); } });
render();
