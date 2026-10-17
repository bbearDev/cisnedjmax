// 본선 공용: Firebase 초기화, 곡 목록·곡 검색 창, 데이터 위치
// 데이터는 tourney/<방> 아래에 있습니다 (database.rules.json 참고)
//
//   config: { deadline: 자선곡 마감 (ms) }
//   teams:  { <팀ID>: { name: 팀명, n: 순서, members: { <디스코드ID>: 길드 닉네임 } } }
//   picks:  { <팀ID>: { r1: 곡, r2: 곡, f: { 0|1|2: 곡 } } }    r1=6강 r2=4강 f=결승 후보 3곡
//   곡 = { s: 곡 번호(V-ARCHIVE title), n: 곡 이름 }

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getDatabase, ref } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

var app = initializeApp({
  apiKey: 'AIzaSyCbPV3tTXlsgW-e_-IO8TlqY1PVbotkXlI',
  authDomain: 'cisne-djmax.firebaseapp.com',
  databaseURL: 'https://cisne-djmax-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'cisne-djmax',
  appId: '1:716176190972:web:d617fb332e81c1067d5679'
});

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
