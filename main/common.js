// 본선 공용: Firebase 초기화, 곡 목록·곡 검색 창, 데이터 위치
// 데이터는 tourney/<방> 아래에 있습니다 (database.rules.json 참고)
//
//   config: { deadline: 자선곡 마감 (ms) }
//   teams:  { <팀ID>: { name: 팀명, n: 순서, members: { <디스코드ID>: 길드 닉네임 } } }
//   picks:  { <팀ID>: { r1: 곡, r2: 곡, f: { 0|1|2: 곡 } } }    r1=6강 r2=4강 f=결승 후보 3곡
//   곡 = { s: 곡 번호(V-ARCHIVE title), n: 곡 이름 }
//
//   live:   방송 화면이 읽는 공개 데이터 (쓰기는 관리자만)
//     scene: 'standby' | 'rule' | 'bracket' | 'track' | 'blank'   오버레이에 띄울 화면 (blank = 로고와 배경만 있는 화면)
//     timer: 대기화면 타이머 종료 시각 (서버 ms)
//     fx:    { <화면>: { type: 'cut'|'fade'|'swipe'|'slide'|'color', dir: 'left'|'right'|'up'|'down', color: CSS 색, ms } }
//            화면마다 그 화면으로 바뀔 때의 전환 효과
//     r1:    [팀ID × 6]   6강 배치 (대진표 맨 아래 칸 왼쪽부터)
//     cur:   'm1'~'m5'    트랙리스트에 띄울 경기
//     matches: { m1~m5: {
//       win:    팀ID                           관리자가 확정한 승자
//       sum:    { 팀ID: 숫자 }                  대진표 점수 (6강·4강: 획득 점수 합, 결승: 승수)
//       games:  [{ song: 곡, by: 팀ID, base: 기준점수, at: 추첨 시각, d: { <디스코드ID>: 난이도 } }]   판 순서대로
//               난이도 = { btn: '4B'~'8B', pat: 'NM'|'HD'|'MX'|'SC' }  관리자가 선수마다 넣음 (비어 있을 수 있음)
//       pool:   [곡 × 최대 6], drawAt: 시각    결승만: 3곡 추첨 후보와 추첨 시각
//     } }
//   scores: { m1~m5: { <판 번호>: { <디스코드ID>: 점수 } } }   관리자만 읽기

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getDatabase, ref, onValue } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

// 앱 이름(<html data-app>)마다 로그인이 따로 저장됩니다 — 관리자와 선수가 한 브라우저에 함께 로그인해도 서로 덮어쓰지 않습니다
var app = initializeApp({
  apiKey: 'AIzaSyCbPV3tTXlsgW-e_-IO8TlqY1PVbotkXlI',
  authDomain: 'cisne-djmax.firebaseapp.com',
  databaseURL: 'https://cisne-djmax-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'cisne-djmax',
  appId: '1:716176190972:web:d617fb332e81c1067d5679'
}, document.documentElement.dataset.app || 'player');

export var auth = getAuth(app);
export var db = getDatabase(app);
export var ROOM = new URLSearchParams(location.search).get('room') || 'main';
export var AUTH_URL = 'https://bbear.cubeat.kr/cisne-auth';
export var STAGES = [
  { key: 'r1', name: '6강', count: 1 },
  { key: 'r2', name: '4강', count: 1 },
  { key: 'f', name: '결승', count: 3 }
];

export function roomRef(path) { return ref(db, 'tourney/' + ROOM + (path ? '/' + path : '')); }

// 6강 3경기 → 4강(1경기 승자 vs 2경기 승자) → 결승(4강 승자 vs 3경기 부전승). stage는 쓰는 자선곡 칸
export var MATCHES = [
  { id: 'm1', name: '6강 1경기', stage: 'r1' },
  { id: 'm2', name: '6강 2경기', stage: 'r1' },
  { id: 'm3', name: '6강 3경기', stage: 'r1' },
  { id: 'm4', name: '4강', stage: 'r2' },
  { id: 'm5', name: '결승', stage: 'f' }
];
export var SCENES = [
  { id: 'standby', name: '대기' },
  { id: 'rule', name: '게임설명' },
  { id: 'bracket', name: '대진표' },
  { id: 'track', name: '트랙리스트' },
  { id: 'blank', name: '빈 화면' }
];
// 화면 전환 효과 (OBS 기본 전환과 같은 동작)
export var FX_TYPES = [
  { id: 'cut', name: '컷' },
  { id: 'fade', name: '페이드' },
  { id: 'swipe', name: '스와이프' },
  { id: 'slide', name: '슬라이드' },
  { id: 'color', name: '색상으로 페이드' }
];
export var FX_DIRS = [{ id: 'left', name: '← 왼쪽' }, { id: 'right', name: '→ 오른쪽' }, { id: 'up', name: '↑ 위' }, { id: 'down', name: '↓ 아래' }];
export var FX_COLORS = [{ id: '#000000', name: '검정' }, { id: '#ffffff', name: '흰색' }, { id: '#4a1458', name: '보라' }];
export var FX_MS = [300, 500, 800, 1000, 1500];
// 난이도 (관리자 경기 진행 탭에서 판·선수마다 입력)
export var BUTTONS = ['4B', '5B', '6B', '8B'];
export var PATTERNS = ['NM', 'HD', 'MX', 'SC'];
export function diffText(d) { return d ? [d.btn, d.pat].filter(Boolean).join(' ') : ''; }
export var BASE_MIN = 1400000, BASE_MAX = 2000000, BASE_STEP = 10000;
// 추첨을 누른 뒤 이 시간 안에 화면을 연 오버레이만 릴을 돌립니다
export var REEL_MS = 3000;

// Firebase는 빈 값을 지우고 배열을 객체로 돌려줄 수 있어 정리합니다
// 순서 번호는 유지합니다 ({ 1: x } → [ , x])
function list(v) {
  if (Array.isArray(v)) return v;
  var out = [];
  Object.keys(v || {}).forEach(function (k) { if (/^\d+$/.test(k)) out[+k] = v[k]; });
  return out;
}
export function normLive(v) {
  v = v || {};
  var out = { scene: v.scene || 'standby', timer: v.timer || 0, r1: [], cur: v.cur || '', matches: {}, fx: {} };
  // 예전에는 모든 화면이 효과 하나({ type, … })를 같이 썼습니다. 남아 있으면 화면별 설정이 없는 칸의 기본값으로 씁니다
  var fx = v.fx || {}, shared = typeof fx.type === 'string' ? fx : {};
  SCENES.forEach(function (s) {
    var f = Object.assign({}, shared, fx[s.id]);
    out.fx[s.id] = { type: f.type || 'fade', dir: f.dir || 'left', color: f.color || '#000000', ms: f.ms == null ? 500 : f.ms };
  });
  var r1 = v.r1 || {};
  for (var i = 0; i < 6; i++) out.r1[i] = r1[i] || '';
  MATCHES.forEach(function (m) {
    var x = (v.matches || {})[m.id] || {};
    out.matches[m.id] = { win: x.win || '', sum: x.sum || {}, games: Array.from(list(x.games), function (g) { return g || {}; }),
      pool: list(x.pool).filter(Boolean), drawAt: x.drawAt || 0 };
  });
  return out;
}

// 6강 배치와 경기별 승자로 대진표 전체를 계산합니다.
// 승자가 지금 그 경기 팀이 아니면(앞 경기 승자가 바뀐 경우) 무시합니다.
export function derive(live) {
  var r1 = live.r1, win = {}, teams = {};
  function decide(id, a, b) {
    var w = live.matches[id].win;
    teams[id] = [a, b];
    win[id] = a && b && (w === a || w === b) ? w : '';
    return win[id];
  }
  var r2 = [decide('m1', r1[0], r1[1]), decide('m2', r1[2], r1[3]), decide('m3', r1[4], r1[5])];
  var r3 = [decide('m4', r2[0], r2[1]), r2[2]];
  var r4 = [decide('m5', r3[0], r3[1])];
  return { r1: r1, r2: r2, r3: r3, r4: r4, win: win, teams: teams };
}

export function matchInfo(mid) { return MATCHES.filter(function (m) { return m.id === mid; })[0]; }
export function gameCount(mid) { return matchInfo(mid).stage === 'f' ? 3 : 2; }

// 판의 팀 합산 점수 (두 선수 점수가 모두 있어야 계산)
export function teamTotal(teams, scores, mid, i, tid) {
  var sc = ((scores[mid] || {})[i]) || {}, ms = Object.keys((teams[tid] || {}).members || {});
  if (ms.length !== 2 || ms.some(function (u) { return typeof sc[u] !== 'number'; })) return null;
  return sc[ms[0]] + sc[ms[1]];
}
// 판의 획득 점수 |기준 − 합산|
export function gameDiff(live, teams, scores, mid, i, tid) {
  var g = live.matches[mid].games[i] || {}, t = teamTotal(teams, scores, mid, i, tid);
  return g.base && t != null ? Math.abs(g.base - t) : null;
}

export function fmtScore(n) { return n == null ? '' : n.toLocaleString('en-US'); }

// 서버 시각 (추첨 시각·타이머를 PC 시계 차이 없이 맞춥니다)
var offset = 0;
onValue(ref(db, '.info/serverTimeOffset'), function (s) { offset = s.val() || 0; });
export function serverNow() { return Date.now() + offset; }

export function esc(t) { var d = document.createElement('div'); d.textContent = t == null ? '' : t; return d.innerHTML; }

export function jacketUrl(c) { return c ? 'https://v-archive.net/s3/images/jackets/' + c.s + '.jpg' : ''; }

export function fmtTime(ms) {
  return ms ? new Date(ms).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' }) : '미정';
}

// 결승 후보처럼 여러 곡 칸은 { 0: 곡, 1: 곡 } 객체 또는 배열로 올 수 있어 배열로 맞춥니다
export function slots(p, stage) {
  var v = (p || {})[stage.key];
  if (stage.count === 1) return [v || null];
  var out = [];
  for (var i = 0; i < stage.count; i++) out.push((v && v[i]) || null);
  return out;
}

var songs = null;
export function loadSongs() {
  if (!songs) {
    songs = fetch('https://cisne-djmax-default-rtdb.asia-southeast1.firebasedatabase.app/songs.json')
      .then(function (r) { return r.json(); })
      .then(function (d) { return (Array.isArray(d) ? d : Object.keys(d || {}).map(function (k) { return d[k]; })).filter(Boolean); });
  }
  return songs;
}

// 곡 검색 창. 곡 이름·작곡가로 찾고, 고른 곡을 { s, n } 로 돌려줍니다
var picker;
export function pickSong(title) {
  if (!picker) {
    picker = document.createElement('div');
    picker.className = 'picker';
    picker.hidden = true;
    picker.innerHTML = '<div class="picker-box"><div class="picker-head"><b></b><button type="button" class="picker-close">닫기</button></div>' +
      '<input type="search" placeholder="곡 이름이나 작곡가" autocomplete="off"><div class="picker-list"></div></div>';
    document.body.appendChild(picker);
  }
  var input = picker.querySelector('input'), list = picker.querySelector('.picker-list');
  picker.querySelector('b').textContent = title;
  input.value = '';
  list.innerHTML = '<p class="hint">곡 목록을 불러오는 중입니다…</p>';
  picker.hidden = false;
  input.focus();

  return new Promise(function (done) {
    var all = [];
    function close(v) {
      picker.hidden = true;
      input.oninput = list.onclick = picker.onclick = picker.querySelector('.picker-close').onclick = null;
      removeEventListener('keydown', onKey);
      done(v);
    }
    function onKey(e) { if (e.key === 'Escape') close(null); }
    function search() {
      var t = input.value.trim().toLowerCase();
      if (!t) { list.innerHTML = '<p class="hint">곡 이름이나 작곡가를 입력하세요.</p>'; return; }
      var found = all.filter(function (s) {
        return (s.name || '').toLowerCase().indexOf(t) >= 0 || (s.composer || '').toLowerCase().indexOf(t) >= 0;
      }).slice(0, 40);
      list.innerHTML = found.length ? found.map(function (s) {
        return '<button type="button" class="picker-song" data-s="' + s.title + '"><img loading="lazy" alt="" src="' + jacketUrl({ s: s.title }) + '">' +
          '<span>' + esc(s.name) + '<small>' + esc(s.composer) + ' · ' + esc(s.dlc) + '</small></span></button>';
      }).join('') : '<p class="hint">검색 결과가 없습니다.</p>';
    }
    loadSongs().then(function (d) { all = d; search(); }, function () { list.innerHTML = '<p class="hint">곡 목록을 불러오지 못했습니다.</p>'; });
    input.oninput = search;
    list.onclick = function (e) {
      var b = e.target.closest('.picker-song');
      if (!b) return;
      var s = all.filter(function (x) { return String(x.title) === b.dataset.s; })[0];
      close({ s: s.title, n: s.name });
    };
    picker.querySelector('.picker-close').onclick = function () { close(null); };
    picker.onclick = function (e) { if (e.target === picker) close(null); };
    addEventListener('keydown', onKey);
  });
}
