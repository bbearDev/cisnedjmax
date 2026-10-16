// 대진표(bracket.html)·트랙리스트(track.html) 공용: Firebase 상태 구조와 경기 계산
// 상태는 bracket/<방>/state 한 곳에 저장합니다 (sync-remote-guide.md 참고)
//
// state = {
//   players: { <선수ID>: { name, n(등록 순서), picks: { r1|r2|r3: 보면 } } },  r1=6강 r2=4강 r3=준결승 자선곡
//   r1: [선수ID × 6],                       6강 배치 (맨 아래 칸 왼쪽부터)
//   matches: { m1~m5: {
//     win: 선수ID,                          관리자가 고른 승자
//     rnd: 보면,                            랜덤곡
//     pick: { <선수ID>: 보면 },              이 경기에만 바꾼 자선곡 (없으면 사전 등록 곡)
//     score: { <선수ID>: { <곡키>: 점수 } },  곡키 = 자선곡 주인의 선수ID 또는 'rnd'
//     cur: 곡키                              지금 플레이 중인 곡
//   } },
//   live: 'm1'~'m5',                        트랙리스트에 표시할 경기
//   rand: { b, d, min, max }                랜덤곡 조건 (버튼('ALL'=전체), 난이도, 레벨 범위)
// }
// 보면 = { s: 곡 번호(V-ARCHIVE title), n: 곡 이름, b: '6B', d: 'SC', l: 레벨 }

var DB_URL = 'https://cisne-djmax-default-rtdb.asia-southeast1.firebasedatabase.app/';
var ROOM = 'main';

var q = new URLSearchParams(location.search);
DB_URL = (q.get('db') || DB_URL).replace(/\/$/, '');
ROOM = q.get('room') || ROOM;
var ROOT_URL = DB_URL + '/bracket/' + encodeURIComponent(ROOM);
var KEY = q.get('key') || '';
// ?view = 조작판과 같은 화면을 읽기 전용으로 (비밀키 없이 열람, 저장 안 함)
var VIEW = q.has('view') && !q.has('control');
var CONSOLE = q.has('control') || VIEW;

// pre: 이 경기에서 쓰는 사전 등록 자선곡 칸
var MATCHES = [
  { id: 'm1', name: '6강 1경기', pre: 'r1' },
  { id: 'm2', name: '6강 2경기', pre: 'r1' },
  { id: 'm3', name: '6강 3경기', pre: 'r1' },
  { id: 'm4', name: '4강', pre: 'r2' },
  { id: 'm5', name: '준결승', pre: 'r3' }
];
var PRE_NAMES = { r1: '6강', r2: '4강', r3: '준결승' };
var BUTTONS = ['4B', '5B', '6B', '8B'];
var DIFFS = ['NM', 'HD', 'MX', 'SC'];
// 대진표 칸이 속한 경기 (4강 오른쪽은 부전승, 맨 위는 결승=우승 칸)
var SLOT_MATCH = { r1: ['m1', 'm1', 'm2', 'm2', 'm3', 'm3'], r2: ['m4', 'm4', ''], r3: ['m5', 'm5'], r4: [''] };

function matchInfo(id) { return MATCHES.filter(function (m) { return m.id === id; })[0]; }

// Firebase는 빈 값을 지우고 배열을 객체로 돌려줄 수 있어 정리합니다
function normalize(s) {
  s = s || {};
  var out = { players: {}, r1: [], matches: {}, live: s.live || '', rand: s.rand || {} };
  var P = s.players || {};
  Object.keys(P).forEach(function (id) {
    var p = P[id] || {};
    out.players[id] = { name: p.name || '', n: p.n || 0, picks: p.picks || {} };
  });
  var r1 = s.r1 || {};
  for (var i = 0; i < 6; i++) out.r1[i] = r1[i] || '';
  MATCHES.forEach(function (m) {
    var x = (s.matches || {})[m.id] || {};
    out.matches[m.id] = { win: x.win || '', rnd: x.rnd || null, pick: x.pick || {}, score: x.score || {}, cur: x.cur || '' };
  });
  out.rand = { b: out.rand.b || '6B', d: out.rand.d || '', min: out.rand.min || 1, max: out.rand.max || 15 };
  return out;
}

// 6강 배치와 경기별 승자로 대진표 전체를 계산합니다.
// 승자가 지금 그 경기 선수가 아니면(앞 경기 승자가 바뀐 경우) 무시합니다.
function derive(s) {
  var r1 = s.r1, win = {};
  function decide(id, a, b) {
    var w = s.matches[id].win;
    win[id] = a && b && (w === a || w === b) ? w : '';
    return win[id];
  }
  var r2 = [decide('m1', r1[0], r1[1]), decide('m2', r1[2], r1[3]), decide('m3', r1[4], r1[5])];
  var r3 = [decide('m4', r2[0], r2[1]), r2[2]];
  var r4 = [decide('m5', r3[0], r3[1])];
  return {
    r1: r1, r2: r2, r3: r3, r4: r4, win: win,
    m1: [r1[0], r1[1]], m2: [r1[2], r1[3]], m3: [r1[4], r1[5]], m4: [r2[0], r2[1]], m5: [r3[0], r3[1]]
  };
}

function playerName(s, id) { return id && s.players[id] ? s.players[id].name : ''; }

// 경기의 곡 3개: [왼쪽 선수 자선곡, 랜덤곡, 오른쪽 선수 자선곡]
function matchSongs(s, g, id) {
  var m = s.matches[id], ids = g[id], pre = matchInfo(id).pre;
  function pickOf(pid) {
    if (!pid) return null;
    return m.pick[pid] || (s.players[pid] && s.players[pid].picks[pre]) || null;
  }
  return [
    { key: ids[0], chart: pickOf(ids[0]), custom: !!(ids[0] && m.pick[ids[0]]) },
    { key: 'rnd', chart: m.rnd, custom: false },
    { key: ids[1], chart: pickOf(ids[1]), custom: !!(ids[1] && m.pick[ids[1]]) }
  ];
}

// 선수의 경기 3곡 점수 합계 (입력한 점수가 없으면 null)
function total(s, g, id, pid) {
  var sc = pid && s.matches[id].score[pid];
  if (!sc) return null;
  var sum = 0, any = false;
  [g[id][0], 'rnd', g[id][1]].forEach(function (k) {
    if (k && typeof sc[k] === 'number') { sum += sc[k]; any = true; }
  });
  return any ? sum : null;
}

// 합계가 더 높은 선수 (동점이거나 점수가 없으면 '')
function leader(s, g, id) {
  var a = g[id][0], b = g[id][1];
  if (!a || !b) return '';
  var ta = total(s, g, id, a), tb = total(s, g, id, b);
  if (ta == null && tb == null) return '';
  ta = ta || 0; tb = tb || 0;
  return ta > tb ? a : tb > ta ? b : '';
}

function fmtScore(n) { return n == null ? '' : n.toLocaleString('en-US'); }
function chartDiff(c) { return c ? c.b + ' ' + c.d + ' ' + c.l : ''; }
// V-ARCHIVE 사이트가 쓰는 자켓 경로 (120×120, 신곡 포함). /static/images/jackets/는 80×80이고 781번 이후가 없습니다.
function jacketUrl(c) { return c ? 'https://v-archive.net/s3/images/jackets/' + c.s + '.jpg' : ''; }

function subscribe(onState, onStatus) {
  var es = new EventSource(ROOT_URL + '/state.json');
  es.addEventListener('put', function (e) {
    var msg = JSON.parse(e.data);
    if (msg.path === '/') onState(normalize(msg.data));
    else refetch();
  });
  es.addEventListener('patch', refetch);
  es.onopen = function () { onStatus && onStatus(true); };
  es.onerror = function () { onStatus && onStatus(false); };
  function refetch() {
    fetch(ROOT_URL + '/state.json').then(function (r) { return r.json(); })
      .then(function (d) { onState(normalize(d)); });
  }
}

// 바뀐 경로만 저장합니다. 예: save({ 'matches/m1/win': 'p1', 'live': 'm1' })  (null은 삭제)
// key는 매번 '비밀키:새 값'으로 보내야 규칙을 통과합니다 (이전 key를 재사용한 쓰기 차단).
function save(patch) {
  var body = { key: KEY + ':' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) };
  Object.keys(patch).forEach(function (p) { body['state/' + p] = patch[p]; });
  return fetch(ROOT_URL + '.json', { method: 'PATCH', body: JSON.stringify(body) })
    .then(function (r) { return r.status; }, function () { return 0; });
}

// 화면 상태에도 같은 변경을 바로 반영합니다
function setPath(obj, path, val) {
  var ks = path.split('/'), o = obj;
  for (var i = 0; i < ks.length - 1; i++) {
    if (o[ks[i]] == null || typeof o[ks[i]] !== 'object') o[ks[i]] = {};
    o = o[ks[i]];
  }
  if (val === null) delete o[ks[ks.length - 1]]; else o[ks[ks.length - 1]] = val;
}

function statusText(code) {
  return code === 200 ? ['실시간 연결됨', 'ok']
    : code === 401 ? ['저장 실패: key 확인', 'err']
    : code === 0 ? ['저장 실패: 네트워크', 'err']
    : ['저장 실패 (' + code + ')', 'err'];
}

// 1920×1080 무대를 잘리지 않게 창에 맞추고 가운데 정렬합니다
function fitStage(stage) {
  function fit() {
    var s = Math.min(innerWidth / 1920, innerHeight / 1080);
    stage.style.transform = 'translate(' + (innerWidth - 1920 * s) / 2 + 'px,' +
      (innerHeight - 1080 * s) / 2 + 'px) scale(' + s + ')';
  }
  addEventListener('resize', fit);
  fit();
}
