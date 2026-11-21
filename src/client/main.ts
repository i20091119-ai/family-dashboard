// 거실 가족 대시보드 화면.
// 평일 07:30–08:30 아침 출발 도우미, 17:00–22:00 홈, 그 외 어두운 화면(터치하면 1분 켜짐).
import { iGa } from '../shared/village.ts';
import { dustLevel, emojiAt } from '../shared/weather.ts';
import { DOW, HAJUN_STEPS, kstOf, modeAt, MORNING, MORNING_STEPS, msOfKst, parseHm, type Mode, type Who } from '../shared/time.ts';
import { ApiError, call, device } from './api.ts';
import type { State, Todo } from './types.ts';
import { familyOn, renderMini, renderVillage } from './village-view.ts';
import { lpcEl, wander } from './lpc.ts';

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const app = $('#app');

let state: State | null = null;
let delta = 0; // 서버 시각 − 이 기기 시각 (시험 시각 포함)
let wakeUntil = 0;
const WAKE_MS = 60_000;
const POPUP_MS = 30_000;
const POLL_MS = 60_000;

const nowMs = () => Date.now() + delta;
const now = () => kstOf(nowMs());

// ---------- 불러오기 ----------
async function load() {
  try {
    const s = await call<State>('/api/state');
    state = s;
    delta = s.now.ms - Date.now();
    render();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return showLogin(!!e.body.setup);
    toast(e instanceof Error ? e.message : '연결이 잠깐 끊겼어요.');
  }
}

function showLogin(setup: boolean) {
  app.className = 'screen login';
  app.innerHTML = `
    <form class="login-box">
      <h1>🏡 우리 가족 화면</h1>
      <p>${setup ? '처음이에요! 가족이 같이 쓸 <b>접속 코드</b>를 정해 주세요. (4글자 이상)' : '가족 접속 코드를 넣어 주세요. 이 기기에서는 1년 동안 기억해요.'}</p>
      <input name="code" type="password" inputmode="text" autocomplete="current-password" placeholder="접속 코드" required>
      <button>${setup ? '이 코드로 정하기' : '들어가기'}</button>
      <p class="err"></p>
    </form>`;
  const form = $('form', app) as HTMLFormElement;
  form.onsubmit = async ev => {
    ev.preventDefault();
    const code = (form.elements.namedItem('code') as HTMLInputElement).value;
    try { await call(setup ? '/api/setup' : '/api/login', { code }); await load(); } catch (e) { $('.err', form).textContent = (e as Error).message; }
  };
}

// ---------- 화면 고르기 ----------
let shownMode: Mode | 'wake' | null = null;
function currentMode(): Mode | 'wake' {
  const m = modeAt(now());
  if (m === 'dark' && Date.now() < wakeUntil) return 'wake';
  return m;
}

function render() {
  if (!state) return;
  const mode = currentMode();
  if (mode !== shownMode) { closePopup(); shownMode = mode; }
  if (mode === 'morning') renderMorning();
  else if (mode === 'dark') renderDark();
  else renderHome();
  renderSimBand();
}

function renderSimBand() {
  let band = $('#sim-band');
  const on = !!device.simOffset || device.pqPlayer === 'sim';
  if (!on) { band?.remove(); return; }
  if (!band) { band = document.createElement('button'); band.id = 'sim-band'; band.onclick = () => openAdmin(); document.body.appendChild(band); }
  const n = now();
  band.textContent = `🧪 시험 중 · ${n.date} (${DOW[n.weekday]}) ${n.time.slice(0, 5)}${device.pqPlayer === 'sim' ? ' · 포켓퀴즈 시험용 기록' : ''}`;
}

// ---------- 하늘 띠 (시계·날짜·날씨) ----------
function skyBar(): string {
  const n = now();
  const w = state!.weather;
  const h = Math.floor(n.minutes / 60), mm = String(n.minutes % 60).padStart(2, '0');
  const ampm = h < 12 ? '오전' : '오후', h12 = h % 12 === 0 ? 12 : h % 12;
  const date = `${Number(n.date.slice(5, 7))}월 ${Number(n.date.slice(8))}일 ${DOW[n.weekday]}요일`;
  let weather = '';
  if (w) {
    const nowKey = `${n.date}T${String(h).padStart(2, '0')}`;
    const later = w.hours.filter(x => x.at.slice(0, 13) > nowKey);
    const picks = [0, 3, 6, 9].map(i => later[i]).filter(Boolean);
    const dust = w.dust ? dustLevel(w.dust.pm10, w.dust.pm25) : null;
    weather = `<div class="w-now"><span class="w-emoji">${emojiAt(w.code, h)}</span><b class="w-temp">${w.temp}°</b>
        <div class="w-sub"><b>${esc(w.text)}</b><small>최고 ${w.max}° · 최저 ${w.min}°</small></div></div>
      ${dust ? `<div class="w-dust lv${dust.level}"><small>미세먼지</small><span>${dust.face}</span><b>${dust.text}</b></div>` : ''}
      <div class="w-hours">${picks.map(x => { const hh = Number(x.at.slice(11, 13)); return `<span><small>${hh}시</small><i>${emojiAt(x.code, hh)}</i><b>${x.temp}°</b>${x.rain ? `<em>💧${x.rain}%</em>` : '<em></em>'}</span>`; }).join('')}</div>
      ${w.tip ? `<div class="w-tip"><b>나갈 때</b> ${esc(w.tip)}</div>` : ''}`;
  }
  return `<div class="sky-time"><div class="sky-date">${date}</div><div class="sky-clock"><small>${ampm}</small><b>${h12}</b><i>:</i><b>${mm}</b></div></div>
    <div class="sky-weather">${weather}</div>`;
}

// ---------- 아침 출발 도우미 ----------
function renderMorning() {
  const s = state!;
  const n = now();
  const start = parseHm(MORNING.start), end = parseHm('08:30');
  const pct = (min: number) => Math.max(0, Math.min(100, ((min - start) / (end - start)) * 100));
  const nowMin = n.minutes + Number(n.time.slice(6, 8)) / 60;
  const tapOf = (who: Who, step: string) => s.morning.taps.find(t => t.who === who && t.step === step);
  const partnerImg = s.pq?.partner?.image.art ?? '';
  const nextSeojun = MORNING_STEPS.find(st => !tapOf('seojun', st.key));
  const leftToDoor = Math.max(0, Math.ceil(parseHm('08:28') - nowMin));
  // 버튼은 바뀔 때만 다시 그림 (누르는 중에 버튼이 바뀌어 눌림이 사라지지 않게). 시계·막대는 매초
  const key = JSON.stringify([s.morning.taps, partnerImg, nextSeojun?.key, leftToDoor, n.minutes, s.weather?.at]);
  if (app.classList.contains('morning') && app.dataset.key === key) {
    $('.bar-fill', app).style.width = `${pct(nowMin)}%`;
    $('.bar-now', app).style.left = `${pct(nowMin)}%`;
    $('.sky', app).innerHTML = skyBar();
    return;
  }
  app.dataset.key = key;
  app.className = 'screen morning';
  const partnerPx = s.pq?.partner?.image.art ?? '';
  app.innerHTML = `
    <header class="sky">${skyBar()}</header>
    <button class="gear" aria-label="설정">⚙️</button>
    <section class="bar-card">
      <div class="bar-title">${leftToDoor > 0 ? `현관까지 <b>${leftToDoor}분</b> 남았어요` : '현관으로 출발! 🚪'}</div>
      <div class="bar">
        <div class="bar-track"><div class="bar-fill" style="width:${pct(nowMin)}%"></div></div>
        <div class="bar-now" style="left:${pct(nowMin)}%">${partnerPx ? `<img src="${esc(partnerPx)}" alt="">` : ''}<span>같이 준비하자!</span></div>
        <div class="bar-mark start" style="left:0"><b>07:30</b></div>
        ${MORNING_STEPS.map(st => `<div class="bar-mark ${nowMin >= parseHm(st.until) ? 'past' : ''}" style="left:${pct(parseHm(st.until))}%"><i></i><b>${st.until}</b><span>${st.emoji}</span></div>`).join('')}
        <div class="bar-door">🚪</div>
      </div>
    </section>
    <section class="row seojun">
      <div class="who">${partnerImg ? `<img src="${esc(partnerImg)}" alt="">` : '⭐'}<span>서준</span></div>
      <div class="steps">
        ${MORNING_STEPS.map(st => {
          const t = tapOf('seojun', st.key);
          return `<button class="step ${t ? 'done' : ''} ${nextSeojun?.key === st.key ? 'next' : ''}" data-who="seojun" data-step="${st.key}">
            <span class="emoji">${st.emoji}</span>${partnerImg ? `<img class="pmon" src="${esc(partnerImg)}" alt="">` : ''}
            <span class="label">${st.label}</span><span class="until">${t ? `✓ ${t.time.slice(0, 5)}` : `${st.until}까지`}</span></button>`;
        }).join('')}
      </div>
    </section>
    <section class="row hajun">
      <div class="who"><span class="face">🧒</span><span>하준</span></div>
      <div class="steps pics">
        ${HAJUN_STEPS.map(st => {
          const t = tapOf('hajun', st.key);
          return `<button class="pic ${t ? 'done' : ''}" data-who="hajun" data-step="${st.key}" aria-label="${st.label}"><span class="emoji">${st.emoji}</span>${t ? '<span class="star">⭐</span>' : ''}</button>`;
        }).join('')}
      </div>
    </section>`;
  app.querySelectorAll<HTMLButtonElement>('[data-step]').forEach(b => { b.onclick = () => void tapMorning(b.dataset.who as Who, b.dataset.step!); });
  $('.gear', app).onclick = () => openAdmin();
}

async function tapMorning(who: Who, step: string) {
  try {
    const r = await call<{ taps: State['morning']['taps'] }>('/api/morning', { who, step });
    state!.morning.taps = r.taps;
    render();
  } catch (e) { toast((e as Error).message); }
}

// ---------- 어두운 화면 ----------
function renderDark() {
  const n = now();
  app.className = 'screen dark';
  app.dataset.key = '';
  app.innerHTML = `<div class="dark-clock">${n.time.slice(0, 5)}</div>`;
}
document.addEventListener('pointerdown', () => {
  if (modeAt(now()) !== 'dark') return;
  const was = currentMode();
  wakeUntil = Date.now() + WAKE_MS;
  if (was === 'dark') { render(); void load(); }
}, true);

// ---------- 홈 ----------
// 마을이 화면 전체(빈칸 없음), 그 위에 하늘 띠·버튼·창·카드가 떠 있음
function renderHome() {
  const s = state!;
  const pq = s.pq;
  const guests = pq?.village.guests ?? [];
  const g = guests[0];
  const guestLine = g ? `<img src="${esc(g.image.pixel)}" alt=""><span>오늘 <b>${esc(g.name)}</b>${guests.length > 1 ? ` 외 ${guests.length - 1}마리가` : iGa(g.name)} 놀러 왔어! ${pq?.dailyMission.done ? '폰에서 말 걸어 봐' : '미션 끝내고 말 걸어 봐'}</span>` : '';
  if (!app.classList.contains('home')) {
    app.className = 'screen home';
    app.innerHTML = `
      <div class="village" aria-hidden="true"></div>
      <div class="overlay">
        <header class="sky"></header>
        <nav class="buttons">
          <button data-pop="schedule"><span>📅</span>가족 일정</button>
          <button data-pop="todo"><span>📝</span>할 일·장보기</button>
          <button data-pop="seojun"><span>⭐</span>서준이 집</button>
          <button data-pop="hajun"><span>🌱</span>하준이 집</button>
        </nav>
        <div class="pop-slot"></div>
        <footer class="bottom"><p class="guest-line"></p></footer>
      </div>
      <button class="gear" aria-label="설정">⚙️<i class="dot"></i></button>`;
    app.querySelectorAll<HTMLButtonElement>('[data-pop]').forEach(b => { b.onclick = () => (popKind === b.dataset.pop ? closePopup() : openPopup(b.dataset.pop!)); });
    $('.gear', app).onclick = () => openAdmin();
  }
  $('.sky', app).innerHTML = skyBar();
  $('.gear .dot', app).hidden = !s.school.warning.warn;
  app.querySelectorAll<HTMLButtonElement>('[data-pop]').forEach(b => b.classList.toggle('on', b.dataset.pop === popKind));
  const gl = $('.guest-line', app);
  if (gl.dataset.html !== guestLine) { gl.innerHTML = guestLine; gl.dataset.html = guestLine; }
  gl.hidden = !guestLine;
  const vEl = $('.village', app);
  if (pq) renderVillage(vEl, pq, s.pqBase);
  else vEl.innerHTML = `<div class="village-empty">🏡<br><small>${esc(s.pqError ?? '포켓몬 마을을 불러오는 중…')}</small></div>`;
}

const MARK = { book: '●', other: '■', try: '▲' } as Record<string, string>;

// ---------- 팝업 (30초 뒤 저절로 닫힘, 만지면 다시 30초) ----------
let popTimer = 0;
let popKind: string | null = null;
let todoTab: 'todo' | 'shop' = 'todo';
let todoBy: string | null = null;
let houseTimers: number[] = [];
function closePopup() { $('#popup')?.remove(); window.clearTimeout(popTimer); houseTimers.forEach(h => window.clearInterval(h)); houseTimers = []; popKind = null; app.querySelectorAll('[data-pop]').forEach(b => b.classList.remove('on')); }
function bumpPopup() { window.clearTimeout(popTimer); popTimer = window.setTimeout(closePopup, POPUP_MS); }
const POP_TITLE: Record<string, string> = { schedule: '📅 가족 일정', todo: '📝 우리 집 할 일', seojun: '⭐ 서준이 집', hajun: '🌱 하준이 집' };
function openPopup(kind: string) {
  closePopup();
  const slot = $('.pop-slot', app);
  if (!slot) return;
  popKind = kind;
  const card = document.createElement('div');
  card.id = 'popup';
  card.className = `pop-card ${kind}`;
  card.innerHTML = `<header class="pop-head"><h2>${POP_TITLE[kind]}</h2><button class="pop-close" aria-label="닫기">✕</button></header><div class="pop-body"></div><div class="pop-timer"><i></i></div>`;
  card.addEventListener('pointerdown', () => { bumpPopup(); restartTimerBar(); });
  card.addEventListener('input', () => { bumpPopup(); restartTimerBar(); });
  $('.pop-close', card).onclick = closePopup;
  slot.appendChild(card);
  app.querySelectorAll<HTMLButtonElement>('[data-pop]').forEach(b => b.classList.toggle('on', b.dataset.pop === kind));
  fillPopup();
  bumpPopup();
  restartTimerBar();
}
function restartTimerBar() {
  const bar = $('#popup .pop-timer i');
  if (!bar) return;
  bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = '';
}
function fillPopup() {
  const body = $('#popup .pop-body');
  if (!body || !state) return;
  const s = state;
  if (popKind === 'schedule') {
    body.innerHTML = `<div class="soon">🗓️<p>아빠·엄마·서준 일정이 여기에 나올 거예요.</p><small>네이버 캘린더 연결은 다음 단계에서 해요.</small></div>`;
  } else if (popKind === 'hajun') {
    // 미리보기 (기록 없음): 하준이 집·마당 + 하준 캐릭터 + 습관 카드 2장 + 스티커 10칸
    const stickers = 3;
    body.innerHTML = `<div class="hj-grid"><div class="hj-left"><div class="hj-scene"></div>
      <p class="hj-preview">👀 미리보기예요 · 아직 기록되지 않아요</p></div><div class="hj-right">
      <div class="hj-habits">
        <button data-habit="meal"><span>🍚</span><b>앉아서 밥 먹기</b><small>저녁</small></button>
        <button data-habit="toy"><span>🧸</span><b>장난감 정리</b><small>자기 전</small></button>
      </div>
      <div class="hj-stickers"><div class="hj-st-title">⭐ 스티커 <b>${stickers}</b>/10 <small>10개 모으면 마당에 새 물건!</small></div>
        <div class="hj-st-row">${Array.from({ length: 10 }, (_, i) => `<i class="${i < stickers ? 'on' : ''}">${i < stickers ? '⭐' : ''}</i>`).join('')}</div></div></div></div>`;
    const scene = $('.hj-scene', body);
    const tile = Math.floor(scene.clientWidth / 12);
    const world = renderMini(scene, s.pqBase, [
      '............', '............', '............', '............', '............', '............',
      '..=.........', '..======....', '.......=====',
    ], [
      { kind: 'house', x: 1, y: 0, img: '/img/hajun-house.png' },
      { kind: 'treeRound', x: 9, y: 0 }, { kind: 'pineSmall', x: 7, y: 1 },
      { kind: 'flowerYellow', x: 6, y: 4 }, { kind: 'flowerPink', x: 0, y: 6 }, { kind: 'flowerWhite', x: 4, y: 8 },
      // 스티커로 받은 물건 (예시)
      { kind: 'bench', x: 8, y: 4 }, { kind: 'pot', x: 10, y: 4 }, { kind: 'flowerBox', x: 9, y: 6 },
      { kind: 'fenceTL', x: 7, y: 3 }, { kind: 'fenceT', x: 8, y: 3 }, { kind: 'fenceT', x: 9, y: 3 }, { kind: 'fenceT', x: 10, y: 3 }, { kind: 'fenceTR', x: 11, y: 3 },
    ], tile);
    const hj = lpcEl(s.pqBase, 'hajun', tile * 2.6 / 64);
    hj.classList.add('vw-person');
    world.appendChild(hj);
    const place = (x: number, y: number) => { hj.style.left = `${(x + 0.5) * tile - tile * 1.3}px`; hj.style.top = `${(y + 1) * tile - tile * 2.4}px`; hj.style.zIndex = String(12 + y); };
    houseTimers.forEach(h => window.clearInterval(h));
    houseTimers = [wander(hj, place, { x: 4, y: 6 }, 2, (x, y) => (x <= 5 && y < 6) || x < 0 || x > 11 || y > 8)];
    body.querySelectorAll<HTMLButtonElement>('[data-habit]').forEach(b => { b.onclick = () => toast('미리보기예요. 다음 단계에서 어른이 누르면 스티커가 붙어요'); });
  } else if (popKind === 'seojun') {
    // 서준이 집: 집 앞 마당(서준 캐릭터 + 파트너 포켓몬, 보기만) + 오늘 미션·이번 주 훈련·마을
    const pq = s.pq;
    if (!pq) { body.innerHTML = `<p class="soon">${esc(s.pqError)}</p>`; return; }
    const m = pq.dailyMission;
    const lv = pq.village.level;
    const t = pq.training;
    const left = Math.max(0, t.goal - t.score);
    body.innerHTML = `<div class="hj-grid"><div class="hj-left"><div class="hj-scene sj-scene"></div>
        <p class="hj-preview">🏠 서준이 방은 다음 단계에서 열려요</p></div>
      <div class="hj-right">
        <div class="sj-card ${m.done ? 'done' : ''}"><span>${m.done ? '✅' : '✏️'}</span><div><b>오늘 일일미션</b><small>${m.done ? '다 했어! 마을에 들어갈 수 있어' : m.started ? `${m.answered}/${m.total} 풀었어` : '아직 시작 전이야'}</small></div></div>
        <div class="sj-card train"><div class="sj-tt"><b>📅 이번 주 훈련</b><em>${t.score}/${t.goal}</em></div>
          <div class="sj-days">${t.days.map(d => `<span class="${d.mark ?? ''} ${d.future ? 'future' : ''} ${d.date === pq.today ? 'today' : ''}"><i>${d.mark ? MARK[d.mark] : ''}</i><small>${d.dow}</small></span>`).join('')}</div>
          <div class="sj-bar"><i style="width:${Math.min(100, (t.score / Math.max(1, t.goal)) * 100)}%"></i></div>
          <small class="sj-left">${t.reached ? '이번 주 목표 달성! 💎 전설 조각을 받을 거야' : `${left}개 더 하면 이번 주 목표!`}</small></div>
        <div class="sj-card"><span>🏡</span><div><b>포켓몬 마을 Lv.${lv.level}</b><small>🏠 마을점수 ${lv.points}${lv.next ? ` / ${lv.next}` : ''}${pq.village.guests.length ? ` · 손님 ${pq.village.guests.length}마리` : ''}</small></div></div>
      </div></div>`;
    const scene = $('.sj-scene', body);
    const tile = Math.floor(scene.clientWidth / 12);
    const world = renderMini(scene, s.pqBase, [
      '............', '............', '............', '............', '............', '............',
      '..=.........', '..==========', '............',
    ], [
      { kind: 'house', x: 1, y: 0 }, { kind: 'mailbox', x: 6, y: 3 },
      { kind: 'treePine', x: 9, y: 0 }, { kind: 'fruitTree_apple', x: 7, y: 2 },
      { kind: 'flowerRed', x: 0, y: 6 }, { kind: 'flowerBlue', x: 10, y: 5 }, { kind: 'mushroom', x: 5, y: 8 }, { kind: 'rock', x: 11, y: 8 },
    ], tile);
    const sj = lpcEl(s.pqBase, 'seojun', tile * 2 / 64);
    sj.classList.add('vw-person');
    world.appendChild(sj);
    const placeP = (el: HTMLElement, k: number) => (x: number, y: number) => { el.style.left = `${(x + 0.5) * tile - tile * k / 2}px`; el.style.top = `${(y + 1) * tile - tile * k * 0.92}px`; el.style.zIndex = String(12 + y); };
    const block = (x: number, y: number) => (x <= 5 && y < 6) || x < 0 || x > 11 || y > 8 || (x >= 7 && x <= 8 && y < 5);
    houseTimers.forEach(h => window.clearInterval(h));
    houseTimers = [wander(sj, placeP(sj, 2), { x: 3, y: 6 }, 2, block)];
    if (pq.partner) {
      const mon = document.createElement('img');
      mon.className = 'vw-mon-mini'; mon.src = pq.partner.image.pixel; mon.alt = pq.partner.name;
      mon.style.width = mon.style.height = `${tile * 3}px`; mon.style.position = 'absolute';
      world.appendChild(mon);
      houseTimers.push(wander(mon, placeP(mon, 3), { x: 5, y: 7 }, 2, block));
    }
  } else if (popKind === 'todo') {
    const list = s.todos.filter(t => t.kind === todoTab);
    const person = (k: string | null) => s.people.find(p => p.key === k);
    body.innerHTML = `
      <div class="tabs"><button data-tab="todo" class="${todoTab === 'todo' ? 'on' : ''}">🧹 할 일</button><button data-tab="shop" class="${todoTab === 'shop' ? 'on' : ''}">🛒 장보기</button></div>
      <div class="faces"><span>누구예요?</span>${s.people.map(p => `<button data-by="${p.key}" class="${todoBy === p.key ? 'on' : ''}"><i>${p.face}</i>${p.name}</button>`).join('')}</div>
      <form class="add"><input name="text" maxlength="60" placeholder="${todoTab === 'shop' ? '예: 우유, 계란' : '예: 분리수거'}" autocomplete="off"><button>추가</button></form>
      <ul class="todos">${list.length ? list.map(t => todoItem(t, person(t.by)?.face ?? '', person(t.done_by)?.face ?? '')).join('') : '<li class="empty">아직 없어요</li>'}</ul>`;
    body.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(b => { b.onclick = () => { todoTab = b.dataset.tab as 'todo' | 'shop'; fillPopup(); }; });
    body.querySelectorAll<HTMLButtonElement>('[data-by]').forEach(b => { b.onclick = () => { todoBy = b.dataset.by!; fillPopup(); }; });
    const form = $('form.add', body) as HTMLFormElement;
    form.onsubmit = ev => { ev.preventDefault(); const text = (form.elements.namedItem('text') as HTMLInputElement).value; if (text.trim()) void todoOp({ op: 'add', kind: todoTab, text }); };
    body.querySelectorAll<HTMLButtonElement>('[data-done]').forEach(b => { b.onclick = () => void todoOp({ op: b.dataset.state === 'done' ? 'undone' : 'done', id: Number(b.dataset.done) }); });
    body.querySelectorAll<HTMLButtonElement>('[data-del]').forEach(b => { b.onclick = () => { if (confirm('지울까요?')) void todoOp({ op: 'delete', id: Number(b.dataset.del) }); }; });
  }
}
function todoItem(t: Todo, face: string, doneFace: string) {
  const done = !!t.done_at;
  const time = done ? new Date(t.done_at!).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' }) : '';
  return `<li class="${done ? 'done' : ''}"><button class="check" data-done="${t.id}" data-state="${done ? 'done' : ''}">${done ? '✅' : '⬜'}</button>
    <span class="text">${esc(t.text)}</span><span class="meta">${done ? `${doneFace} ${time}` : face}</span><button class="del" data-del="${t.id}" aria-label="지우기">✕</button></li>`;
}
async function todoOp(body: Record<string, unknown>) {
  if (!todoBy) { toast('먼저 내 얼굴 버튼을 눌러 주세요'); $('#popup .faces')?.classList.add('shake'); return; }
  try {
    const r = await call<{ todos: Todo[] }>('/api/todos', { ...body, by: todoBy });
    state!.todos = r.todos;
    fillPopup();
  } catch (e) { toast((e as Error).message); }
}

// ---------- 설정 (보호자·개발 메뉴) ----------
type Admin = {
  now: { date: string; time: string }; sim: boolean; pqPlayer: 'family' | 'sim';
  pq: { url: string; hasCode: boolean; real: string; preview: string; error: string | null; school: State['pq'] extends infer P ? P extends { school: infer S } ? S | null : null : null };
  hookUrl: string; warning: { warn: boolean; weekdays: number; records: number }; weekStart: string; familyCodeFromEnv: boolean;
  arrivals: { date: string; time: string; status: string; ok: number | null; deadline: string | null; message: string | null; source: string }[];
  taps: { date: string; who: Who; step: string; time: string }[];
};
async function openAdmin() {
  closePopup();
  let a: Admin;
  try { a = await call<Admin>('/api/admin'); } catch (e) { toast((e as Error).message); return; }
  $('#admin')?.remove();
  const el = document.createElement('div');
  el.id = 'admin';
  const n = now();
  const dates = [...new Set([...a.taps.map(t => t.date), ...a.arrivals.map(r => r.date)])].sort().reverse().slice(0, 14);
  const tapAt = (d: string, who: Who, step: string) => a.taps.find(t => t.date === d && t.who === who && t.step === step)?.time.slice(0, 5) ?? '';
  const pqSchool = (d: string) => a.pq.school?.recent.find(r => r.date === d);
  const okText = (r: Admin['arrivals'][number]) => r.status === 'pending' ? '⏳ 보내는 중' : r.status === 'refused' ? `❌ ${esc(r.message)}` : r.ok === 1 ? `✅ 제때 (기준 ${r.deadline})` : r.ok === 0 ? `🕘 늦음 (기준 ${r.deadline})` : r.status === 'duplicate' ? '↩️ 포켓퀴즈에 이미 있음' : esc(r.status);
  const sample = `이서준 학생이 ${Number(n.date.slice(5, 7))}/${Number(n.date.slice(8))} 08:41에 교문[후문]으로 등교하였습니다`;
  el.innerHTML = `<div class="admin-card">
    <header><h2>⚙️ 설정</h2><button class="x" aria-label="닫기">✕</button></header>
    ${a.warning.warn ? `<div class="warn">⚠️ <b>이번 주 등교 기록이 0건이에요.</b> 엄마 폰의 MacroDroid(아이알리미 알림 보내기)가 꺼졌는지 확인해 주세요.</div>` : ''}

    <section><h3>🏫 등교 기록</h3>
      <table><tr><th>날짜</th><th>교문</th><th>판정</th></tr>
      ${a.arrivals.length ? a.arrivals.slice(0, 14).map(r => `<tr><td>${r.date.slice(5)} (${DOW[new Date(r.date + 'T00:00:00Z').getUTCDay()]})</td><td>${r.time}</td><td>${okText(r)}</td></tr>`).join('') : '<tr><td colspan="3">아직 없어요</td></tr>'}
      </table>
      <p class="hint">아이알리미가 놓친 날은 포켓퀴즈 보호자 공간 → 학습 현황 → "✅ 오늘 제때 도착으로 적기"(그날 밤 9시까지).</p>
    </section>

    <section><h3>🌅 아침 기록 (2주 비교용)</h3>
      <div class="scroll"><table class="taps"><tr><th>날짜</th>${MORNING_STEPS.map(s => `<th>서준<br>${s.emoji}</th>`).join('')}${HAJUN_STEPS.map(s => `<th>하준<br>${s.emoji}</th>`).join('')}<th>교문</th></tr>
      ${dates.length ? dates.map(d => `<tr><td>${d.slice(5)}</td>${MORNING_STEPS.map(s => `<td>${tapAt(d, 'seojun', s.key)}</td>`).join('')}${HAJUN_STEPS.map(s => `<td>${tapAt(d, 'hajun', s.key)}</td>`).join('')}<td>${a.arrivals.find(r => r.date === d)?.time ?? pqSchool(d)?.time ?? ''}</td></tr>`).join('') : '<tr><td colspan="11">아직 없어요</td></tr>'}
      </table></div>
    </section>

    <section><h3>📲 등교 알림 받는 주소 (엄마 폰 MacroDroid)</h3>
      <div class="copy"><code>${esc(a.hookUrl)}</code><button data-copy="${esc(a.hookUrl)}">복사</button></div>
      <ol class="hint">
        <li>MacroDroid → 매크로 추가 → <b>트리거: 알림 수신</b> → 앱: 아이알리미, 글자 "등교" 포함</li>
        <li><b>동작: HTTP 요청</b> → 방법 POST, 주소 = 위 주소, 본문 = <code>[notification]</code> (알림 글자)</li>
        <li>하교 알림은 대시보드가 알아서 건너뛰어요. 알림 글은 저장하지 않고 시각만 남겨요.</li>
      </ol>
      <button class="small" data-op="hookReset">주소 새로 만들기 (예전 주소는 막힘)</button>
    </section>

    <section><h3>🔗 포켓퀴즈 연결</h3>
      <form class="pq">
        <label><input type="radio" name="url" value="${a.pq.real}" ${a.pq.url === a.pq.real ? 'checked' : ''}> 진짜 사이트</label>
        <label><input type="radio" name="url" value="${a.pq.preview}" ${a.pq.url === a.pq.preview ? 'checked' : ''}> 미리보기 사이트</label>
        <input name="code" type="password" placeholder="${a.pq.hasCode ? '접속 코드 (바꿀 때만 넣기)' : '포켓퀴즈 접속 코드'}" autocomplete="off">
        <button>저장</button>
      </form>
      <p class="hint">${a.pq.error ? `❌ ${esc(a.pq.error)}` : '✅ 연결됨'} · 코드는 포켓퀴즈 보호자 공간 → 전체 설정 → "🏫 제때 등교 · 가족 대시보드 연결"에서 만들어요.</p>
    </section>

    ${a.familyCodeFromEnv ? '' : `<section><h3>🔑 가족 접속 코드 바꾸기</h3>
      <form class="code"><input name="code" type="password" placeholder="새 코드 (4글자 이상)"><button>바꾸기</button></form>
      <p class="hint">바꾸면 태블릿·폰 모두 새 코드를 한 번 넣어야 해요.</p></section>`}

    <section class="dev"><h3>🧪 개발 메뉴 (이 기기만)</h3>
      <p>지금 이 화면 시각: <b>${n.date} (${DOW[n.weekday]}) ${n.time.slice(0, 5)}</b>${device.simOffset ? ' · 시험 중' : ''}</p>
      <form class="simtime"><input type="date" name="date" value="${n.date}"><input type="time" name="time" value="${n.time.slice(0, 5)}"><button>이 시각으로</button></form>
      <div class="quick">
        <button data-sim="07:40">평일 07:40 아침</button><button data-sim="08:22">평일 08:22</button>
        <button data-sim="18:00">18:00 홈</button><button data-sim="23:00">23:00 밤</button><button data-real>진짜 시각으로</button>
      </div>
      <label class="toggle"><input type="checkbox" name="family" ${familyOn() ? 'checked' : ''}> 마을에 가족 캐릭터 보이기 (미리보기)</label>
      <label class="toggle"><input type="checkbox" name="pqsim" ${device.pqPlayer === 'sim' ? 'checked' : ''}> 포켓퀴즈 <b>시험용 기록</b> 보기 (포켓퀴즈 개발 탭 시뮬레이션)</label>
      <p class="hint">시험 중엔 아침 버튼 기록이 시험용으로 따로 쌓여요.</p>
      <form class="simarr"><textarea name="text" rows="2">${esc(sample)}</textarea><button>시험 등교 알림 넣기</button></form>
      <p class="hint">시험 알림은 시험용 기록에만, 포켓퀴즈에도 시험용 기록(?player=sim)으로 보내요.</p>
      <button class="small" data-op="clearSim">시험 기록 지우기</button>
    </section>
  </div>`;
  document.body.appendChild(el);
  $('.x', el).onclick = () => el.remove();
  el.onclick = ev => { if (ev.target === el) el.remove(); };
  el.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach(b => { b.onclick = () => { void navigator.clipboard?.writeText(b.dataset.copy!).then(() => toast('복사했어요')); }; });
  const post = async (body: Record<string, unknown>, msg: string) => { try { const r = await call<Record<string, unknown>>('/api/admin', body); toast(msg); return r; } catch (e) { toast((e as Error).message); return null; } };
  el.querySelectorAll<HTMLButtonElement>('[data-op]').forEach(b => { b.onclick = async () => { if (b.dataset.op === 'hookReset' && !confirm('주소를 새로 만들면 MacroDroid에도 새 주소를 넣어야 해요. 할까요?')) return; await post({ op: b.dataset.op }, '했어요'); void openAdmin(); void load(); }; });
  ($('form.pq', el) as HTMLFormElement).onsubmit = async ev => {
    ev.preventDefault(); const f = ev.target as HTMLFormElement;
    await post({ op: 'pq', url: (f.querySelector('input[name=url]:checked') as HTMLInputElement)?.value ?? a.pq.real, code: (f.elements.namedItem('code') as HTMLInputElement).value }, '저장했어요');
    void openAdmin(); void load();
  };
  const codeForm = $('form.code', el) as HTMLFormElement | null;
  if (codeForm) codeForm.onsubmit = async ev => { ev.preventDefault(); await post({ op: 'code', code: (codeForm.elements.namedItem('code') as HTMLInputElement).value }, '코드를 바꿨어요'); };
  const setSim = (ms: number) => { device.simOffset = ms; wakeUntil = 0; el.remove(); void load(); };
  ($('form.simtime', el) as HTMLFormElement).onsubmit = ev => {
    ev.preventDefault(); const f = ev.target as HTMLFormElement;
    const d = (f.elements.namedItem('date') as HTMLInputElement).value, t = (f.elements.namedItem('time') as HTMLInputElement).value;
    if (d && t) setSim(msOfKst(d, t) - Date.now());
  };
  el.querySelectorAll<HTMLButtonElement>('[data-sim]').forEach(b => { b.onclick = () => {
    // 평일 버튼: 오늘이 주말이면 다음 월요일
    let d = n.date; const wd = new Date(d + 'T00:00:00Z').getUTCDay();
    if (b.dataset.sim! < '09:00' && (wd === 0 || wd === 6)) d = new Date(Date.parse(d + 'T00:00:00Z') + (wd === 6 ? 2 : 1) * 86400_000).toISOString().slice(0, 10);
    setSim(msOfKst(d, b.dataset.sim!) - Date.now());
  }; });
  $('[data-real]', el).onclick = () => setSim(0);
  ($('input[name=family]', el) as HTMLInputElement).onchange = ev => { try { localStorage.setItem('fd-family', (ev.target as HTMLInputElement).checked ? 'on' : 'off'); } catch { /* 이 기기에 저장 못 하면 그대로 */ } app.className = ''; render(); };
  ($('input[name=pqsim]', el) as HTMLInputElement).onchange = ev => { device.pqPlayer = (ev.target as HTMLInputElement).checked ? 'sim' : 'family'; void load(); void openAdmin(); };
  ($('form.simarr', el) as HTMLFormElement).onsubmit = async ev => {
    ev.preventDefault();
    const r = await post({ op: 'simArrival', text: ((ev.target as HTMLFormElement).elements.namedItem('text') as HTMLTextAreaElement).value }, '보냈어요');
    if (r) toast(String((r as { reason?: string }).reason ?? ((r as { result?: { message?: string; error?: string } }).result?.message || (r as { result?: { error?: string } }).result?.error || '보냈어요')));
    void openAdmin();
  };
}

// ---------- 알림 글 ----------
let toastTimer = 0;
function toast(text: string) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = text; t.classList.add('on');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove('on'), 2600);
}

// ---------- 시작 ----------
void load();
window.setInterval(() => { render(); }, 1000);
window.setInterval(() => { if (currentMode() !== 'dark') void load(); }, POLL_MS);
window.addEventListener('resize', () => { if (shownMode === 'home' || shownMode === 'wake') { app.className = ''; render(); } });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void load(); });
