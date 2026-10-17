// 본선 디스코드 로그인 → Firebase custom token 발급 서버 (cubeat에서 실행)
//
//   GET  /cisne-auth/login        디스코드 인가 화면으로 보냄
//   GET  /cisne-auth/callback     code 교환 → 등록부(tourney/<방>/teams)에 있는 선수인지 확인
//                                 → RETURN_URL#token=…  (실패: RETURN_URL#error=…)
//   POST /cisne-auth/admin/token  {key} → 관리자 Firebase custom token
//   POST /cisne-auth/admin/nicks  {key, ids: [a, b]} → { id: 길드 닉네임 | null }
//   관리자 요청은 본문을 text/plain JSON으로 받습니다 — 브라우저가 preflight(OPTIONS)를 보내지 않아 프록시 설정과 무관합니다
//   GET  /cisne-auth/healthz      ok
//
// 외부 의존성 없음 (Node 18+ 내장 fetch·crypto). 설정은 .env, 키는 firebase-sa.json 파일에서 읽습니다.
// 선수 토큰: uid = 디스코드 유저 ID, claims { room, team, nick }   관리자 토큰: uid = 'admin', claims { admin: <방> }

import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';

var env = process.env;
var PORT = Number(env.PORT || 8082);
var BASE = '/cisne-auth';
var PUBLIC_URL = (env.PUBLIC_URL || 'https://bbear.cubeat.kr').replace(/\/$/, '');
var REDIRECT_URI = PUBLIC_URL + BASE + '/callback';
var RETURN_URL = env.RETURN_URL || 'https://bbeardev.github.io/cisnedjmax/main/pick.html';
var ALLOW_ORIGIN = env.ALLOW_ORIGIN || 'https://bbeardev.github.io';
var DB_URL = (env.DB_URL || 'https://cisne-djmax-default-rtdb.asia-southeast1.firebasedatabase.app').replace(/\/$/, '');
var ROOM = env.ROOM || 'main';
var CLIENT_ID = must('DISCORD_CLIENT_ID');
var CLIENT_SECRET = must('DISCORD_CLIENT_SECRET');
var BOT_TOKEN = must('DISCORD_BOT_TOKEN');
var GUILD_ID = must('GUILD_ID');
var ADMIN_KEY = must('ADMIN_KEY');
var SA = JSON.parse(fs.readFileSync(env.FIREBASE_SA || new URL('./firebase-sa.json', import.meta.url), 'utf8'));
if (!SA.private_key || !SA.client_email) throw new Error('firebase-sa.json 에 private_key·client_email 이 없습니다');

var DISCORD = 'https://discord.com/api/v10';
var STATE_COOKIE = 'cisne_state';
var STATE_TTL = 600; // 초
var ROOM_PATH = DB_URL + '/tourney/' + encodeURIComponent(ROOM);

function must(name) {
  if (!env[name]) throw new Error('.env 에 ' + name + ' 이 없습니다');
  return env[name];
}

function log(msg, extra) {
  console.log(JSON.stringify(Object.assign({ at: new Date().toISOString(), msg: msg }, extra || {})));
}

function b64url(buf) { return Buffer.from(buf).toString('base64url'); }

function signJwt(payload) {
  var head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  var body = b64url(JSON.stringify(payload));
  var sig = crypto.createSign('RSA-SHA256').update(head + '.' + body).sign(SA.private_key);
  return head + '.' + body + '.' + b64url(sig);
}

// https://firebase.google.com/docs/auth/admin/create-custom-tokens#create_custom_tokens_using_a_third-party_jwt_library
function customToken(uid, claims) {
  var now = Math.floor(Date.now() / 1000);
  return signJwt({
    iss: SA.client_email,
    sub: SA.client_email,
    aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
    iat: now,
    exp: now + 3600,
    uid: uid,
    claims: claims
  });
}

// 서비스 계정 OAuth 토큰 (DB 규칙을 건너뛰는 관리자 권한). 만료 5분 전까지 재사용합니다.
var dbToken = null;
async function dbAccessToken() {
  if (dbToken && dbToken.exp > Date.now() + 300000) return dbToken.value;
  var now = Math.floor(Date.now() / 1000);
  var r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: signJwt({
        iss: SA.client_email,
        scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600
      })
    })
  });
  if (!r.ok) throw new Error('서비스 계정 토큰 발급 실패 ' + r.status);
  var j = await r.json();
  dbToken = { value: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return dbToken.value;
}

function sameKey(a) {
  var x = crypto.createHash('sha256').update(String(a || '')).digest();
  var y = crypto.createHash('sha256').update(ADMIN_KEY).digest();
  return crypto.timingSafeEqual(x, y);
}

function cookies(req) {
  var out = {};
  (req.headers.cookie || '').split(';').forEach(function (c) {
    var i = c.indexOf('=');
    if (i > 0) out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim());
  });
  return out;
}

function redirect(res, url, headers) {
  res.writeHead(302, Object.assign({ Location: url, 'Cache-Control': 'no-store' }, headers || {}));
  res.end();
}

function back(res, params) {
  redirect(res, RETURN_URL + '#' + new URLSearchParams(params), {
    'Set-Cookie': STATE_COOKIE + '=; Path=' + BASE + '; Max-Age=0; HttpOnly; Secure; SameSite=Lax'
  });
}

function json(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': ALLOW_ORIGIN,
    Vary: 'Origin'
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise(function (ok, fail) {
    var size = 0, chunks = [];
    req.on('data', function (c) {
      size += c.length;
      if (size > 4096) { fail(new Error('too large')); req.destroy(); } else chunks.push(c);
    });
    req.on('end', function () { ok(Buffer.concat(chunks).toString('utf8')); });
    req.on('error', fail);
  });
}

function wait(ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); }

function login(res) {
  var state = crypto.randomBytes(24).toString('base64url');
  var url = 'https://discord.com/oauth2/authorize?' + new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'identify guilds.members.read',
    state: state,
    prompt: 'none'
  });
  redirect(res, url, {
    'Set-Cookie': STATE_COOKIE + '=' + state + '; Path=' + BASE + '; Max-Age=' + STATE_TTL + '; HttpOnly; Secure; SameSite=Lax'
  });
}

// 등록부에서 선수의 팀을 찾습니다. teams = { <팀ID>: { name, members: { <디스코드ID>: 닉네임 } } }
async function findTeam(uid) {
  var r = await fetch(ROOM_PATH + '/teams.json', { headers: { Authorization: 'Bearer ' + await dbAccessToken() } });
  if (!r.ok) throw new Error('등록부 조회 실패 ' + r.status);
  var teams = (await r.json()) || {};
  return Object.keys(teams).filter(function (tid) {
    return teams[tid] && teams[tid].members && Object.prototype.hasOwnProperty.call(teams[tid].members, uid);
  })[0] || '';
}

async function callback(req, res, q) {
  if (q.get('error')) return back(res, { error: 'denied' });
  var state = cookies(req)[STATE_COOKIE];
  if (!state || state !== q.get('state') || !q.get('code')) return back(res, { error: 'state' });

  var tok = await fetch(DISCORD + '/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: q.get('code'),
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET
    })
  });
  if (!tok.ok) {
    log('토큰 교환 실패', { status: tok.status });
    return back(res, { error: 'exchange' });
  }
  var access = (await tok.json()).access_token;

  try {
    var mem = await fetch(DISCORD + '/users/@me/guilds/' + GUILD_ID + '/member', {
      headers: { Authorization: 'Bearer ' + access }
    });
    if (mem.status === 404) return back(res, { error: 'not_member' });
    if (!mem.ok) {
      log('길드 멤버 조회 실패', { status: mem.status });
      return back(res, { error: 'member' });
    }
    var m = await mem.json();
    var user = m.user || {};
    var team = await findTeam(user.id);
    if (!team) {
      log('미등록 선수', { uid: user.id });
      return back(res, { error: 'not_registered' });
    }
    var nick = m.nick || user.global_name || user.username || '';
    // 로그인할 때마다 등록부의 닉네임을 길드 닉네임으로 맞춥니다
    await fetch(ROOM_PATH + '/teams/' + encodeURIComponent(team) + '/members.json', {
      method: 'PATCH',
      headers: { Authorization: 'Bearer ' + await dbAccessToken(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ [user.id]: nick })
    }).catch(function () {});
    log('로그인', { uid: user.id, team: team });
    back(res, { token: customToken(user.id, { room: ROOM, team: team, nick: nick }) });
  } finally {
    // 디스코드 토큰은 확인에만 쓰고 바로 폐기합니다 (실패해도 진행)
    fetch(DISCORD + '/oauth2/token/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: access, token_type_hint: 'access_token', client_id: CLIENT_ID, client_secret: CLIENT_SECRET })
    }).catch(function () {});
  }
}

async function adminToken(req, res) {
  var key = '';
  try { key = JSON.parse(await readBody(req)).key; } catch (e) { /* 아래에서 거부 */ }
  if (!sameKey(key)) {
    await wait(1000);
    log('관리자 키 불일치', { keyLength: String(key || '').length });
    return json(res, 403, { error: 'key' });
  }
  json(res, 200, { token: customToken('admin', { admin: ROOM }) });
}

// 봇 토큰으로 길드 닉네임을 찾습니다 (길드에 없으면 null)
async function adminNicks(req, res) {
  var body = {};
  try { body = JSON.parse(await readBody(req)) || {}; } catch (e) { /* 아래에서 거부 */ }
  if (!sameKey(body.key)) {
    await wait(1000);
    log('관리자 키 불일치 (닉네임)', { keyLength: String(body.key || '').length });
    return json(res, 403, { error: 'key' });
  }
  var ids = (Array.isArray(body.ids) ? body.ids : []).map(String).filter(function (id) { return /^\d{5,25}$/.test(id); }).slice(0, 10);
  var out = {};
  for (var i = 0; i < ids.length; i++) {
    var r = await fetch(DISCORD + '/guilds/' + GUILD_ID + '/members/' + ids[i], { headers: { Authorization: 'Bot ' + BOT_TOKEN } });
    if (r.ok) {
      var m = await r.json(), u = m.user || {};
      out[ids[i]] = m.nick || u.global_name || u.username || '';
    } else {
      if (r.status !== 404) log('닉네임 조회 실패', { id: ids[i], status: r.status });
      out[ids[i]] = null;
    }
  }
  json(res, 200, out);
}

http.createServer(function (req, res) {
  var u = new URL(req.url, 'http://x');
  var path = u.pathname;
  var route = req.method + ' ' + path;
  function fail(e) {
    log('요청 오류', { route: route, err: String(e && e.message || e) });
    if (res.headersSent) return;
    if (path === BASE + '/callback') back(res, { error: 'server' });
    else json(res, 500, { error: 'server' });
  }
  if (path.indexOf(BASE + '/admin/') === 0) log('관리자 요청', { route: route, origin: req.headers.origin || '' });
  if (req.method === 'OPTIONS' && path.indexOf(BASE + '/admin/') === 0) {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': ALLOW_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, POST',
      'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
      'Access-Control-Max-Age': '600',
      Vary: 'Origin'
    });
    return res.end();
  }
  if (route === 'GET ' + BASE + '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
  if (route === 'GET ' + BASE + '/login') return login(res);
  if (route === 'GET ' + BASE + '/callback') return callback(req, res, u.searchParams).catch(fail);
  if (route === 'POST ' + BASE + '/admin/token') return adminToken(req, res).catch(fail);
  if (route === 'POST ' + BASE + '/admin/nicks') return adminNicks(req, res).catch(fail);
  res.writeHead(404); res.end();
}).listen(PORT, '0.0.0.0', function () {
  log('시작', { port: PORT, room: ROOM, redirect: REDIRECT_URI, return: RETURN_URL });
});
