# 키워드선택 — Sync 오버레이 + 원격 조작 가이드

```
관리자 (어디서든 브라우저)                 방송 PC (OBS)
keyword.html?control&key=…  ──저장──▶  Firebase  ──실시간──▶  Sync 오버레이
                                                          └ 외부 URL 위젯: keyword.html
```

- 방송 화면: Sync 오버레이의 **외부 URL 위젯**으로 `keyword.html`을 띄웁니다.
- 조작판: 관리자가 PC·휴대폰 어디서든 `keyword.html?control&key=비밀키`를 열어 조작합니다.
- 중계: Firebase Realtime Database(무료)가 상태를 저장하고 실시간으로 전달합니다.

> Sync의 **인라인(HTML 업로드) 위젯**은 외부 통신이 막혀 있어(`connect-src 'none'`) 이 기능을 쓸 수 없습니다. 반드시 **외부 URL 위젯**으로 넣어야 합니다.

---

## 1. GitHub Pages 켜기 (저장소 주인, 한 번만)

1. https://github.com/bbearDev/cisnedjmax → **Settings → Pages**
2. **Source**: `Deploy from a branch`
3. **Branch**: `main` / `/ (root)` → **Save**
4. 1~2분 뒤 아래 주소가 열리면 완료
   ```
   https://bbeardev.github.io/cisnedjmax/keyword.html
   ```

---

## 2. Firebase 만들기 (한 번만)

### 2-1. 프로젝트와 데이터베이스
1. https://console.firebase.google.com → **프로젝트 추가** (Google 애널리틱스는 꺼도 됨)
2. 왼쪽 메뉴 **빌드 → Realtime Database → 데이터베이스 만들기**
3. 위치: **싱가포르(asia-southeast1)** → **잠금 모드로 시작**
4. 데이터 탭 위쪽의 주소를 복사해 둡니다. (이게 `DB_URL`)
   ```
   https://프로젝트이름-default-rtdb.asia-southeast1.firebasedatabase.app
   ```

### 2-2. 보안 규칙
**규칙** 탭에 아래를 그대로 붙여 넣고 **게시**합니다.

```json
{
  "rules": {
    "secrets": { ".read": false, ".write": false },
    "keyword": {
      "$room": {
        "state": { ".read": true },
        ".write": "newData.child('key').val() === root.child('secrets').child($room).val()"
      }
    }
  }
}
```

- 화면(위젯)은 키워드 상태를 **읽기만** 합니다.
- **비밀키를 아는 사람만** 상태를 바꿀 수 있습니다.

### 2-3. 비밀키 만들기
비밀키는 조작판 주소에 들어가는 비밀번호입니다. 추측하기 어려운 무작위 문자열을 씁니다.
아래 방법 중 하나로 만들고 메모해 둡니다.

- **브라우저**: 아무 페이지에서 `F12` → **Console** 탭 → 아래 입력 후 Enter
  ```js
  crypto.randomUUID()
  ```
- **Windows PowerShell**:
  ```powershell
  [guid]::NewGuid().ToString()
  ```

결과 예: `3f6c2a9e-8b1d-4c7a-9e2f-5d0b7a1c4e88` (따옴표는 빼고 사용)

> - 영문·숫자·`-`만 쓰세요. 공백·`&`·`#`·`?`·한글은 주소에서 깨질 수 있습니다.
> - 비밀키는 저장소·디스코드 공개 채널 등에 올리지 마세요. 조작판 주소 자체가 비밀번호입니다.
> - 유출되면 Firebase에서 값만 바꾸면 됩니다(아래 방법 B). 이전 주소는 바로 쓸 수 없게 됩니다.

### 2-4. 비밀키 등록
`secrets/main` 위치에 비밀키를 저장합니다. `main`은 방 이름입니다.
(경기·장면별로 따로 쓰고 싶으면 `secrets` 아래에 방을 더 만들고, 위젯·조작판 주소에 `&room=방이름`을 붙입니다.)

#### 방법 A. JSON 가져오기 (처음 한 번, 추천)
1. 메모장에 아래를 붙여 넣고 `여기에비밀키`를 2-3에서 만든 값으로 바꿉니다.
   ```json
   {
     "secrets": {
       "main": "여기에비밀키"
     }
   }
   ```
2. **파일 형식: 모든 파일**로 바꾸고 `secrets.json`으로 저장합니다. (`.txt`가 붙지 않게)
3. Firebase 콘솔 → **Realtime Database → 데이터** 탭
4. 데이터 영역 **오른쪽 위 ⋮ (점 세 개)** → **JSON 가져오기**
5. `secrets.json` 선택 → **가져오기**

> ⚠️ JSON 가져오기는 **DB 전체를 덮어씁니다.** DB가 비어 있는 처음에만 쓰세요.
> 이미 키워드 상태(`keyword`)가 저장된 뒤라면 방법 B를 쓰세요.

#### 방법 B. 직접 추가 / 비밀키 변경
1. **데이터** 탭 트리 맨 위의 DB 주소 줄(`https://…firebasedatabase.app/`)에 **마우스를 올립니다.**
   **+** 아이콘은 마우스를 올려야 나타납니다.
2. **+** 클릭 → 키 `secrets`, 값은 비워 두고 옆의 **+** 를 한 번 더 클릭
3. 하위 칸에 키 `main`, 값 `여기에비밀키` → **추가**

비밀키를 바꿀 때는 `main` 값을 클릭해 직접 고치면 됩니다.

#### 확인
트리가 아래처럼 보이면 완료입니다.
```
https://프로젝트이름-default-rtdb.asia-southeast1.firebasedatabase.app/
└ secrets
   └ main: "3f6c2a9e-8b1d-4c7a-9e2f-5d0b7a1c4e88"
```

- 조작판 주소의 `&key=` 값과 **글자 하나까지** 같아야 합니다(대소문자·공백 포함).
- 콘솔에서의 추가·수정은 보안 규칙과 상관없이 됩니다.

---

## 3. keyword.html에 DB 주소 넣기 (한 번만)

`keyword.html` 위쪽의 `DB_URL`에 2-1에서 복사한 주소를 넣고 커밋합니다.

```js
var DB_URL = 'https://프로젝트이름-default-rtdb.asia-southeast1.firebasedatabase.app';
var ROOM = 'main';
```

(파일을 고치지 않고 주소 뒤에 `?db=…&room=…`로 넘겨도 됩니다.)

---

## 4. Sync 오버레이에 위젯 추가

1. Sync **오버레이 빌더 → 커스텀 위젯** 추가
2. 종류: **외부 URL**
3. 주소
   ```
   https://bbeardev.github.io/cisnedjmax/keyword.html
   ```
4. 크기: **1920 × 1080** (화면 전체)
5. 저장 후 OBS의 Sync 오버레이 브라우저 소스에서 키워드가 보이면 완료

---

## 5. 관리자 조작판

아래 주소를 관리자 브라우저(PC·휴대폰)로 엽니다.

```
https://bbeardev.github.io/cisnedjmax/keyword.html?control&key=여기에비밀키
```

| 기능 | 동작 |
|---|---|
| 키워드 버튼 | 한 번 누르면 화면에 취소선 + 흐려짐, 한 번 더 누르면 복구 |
| 섞기 | 키워드 위치를 새로 무작위 배치 |
| 초기화 | 지운 키워드를 모두 복구 |
| 키워드 편집 | 한 줄에 하나씩 입력 → **키워드 저장** (화면에 즉시 반영) |

- 오른쪽 위가 **실시간 연결됨**(초록)이면 정상입니다.
- 관리자가 여러 명이어도 모두 같은 상태를 실시간으로 봅니다.
- 상태는 Firebase에 저장되므로 OBS·Sync를 새로고침해도 유지됩니다.
- 이 주소를 OBS **독 → 사용자 지정 브라우저 독**에 넣어 OBS 안에서 조작해도 됩니다.

---

## 문제 해결

| 증상 | 확인할 것 |
|---|---|
| 조작판에 **DB_URL 미설정** | 3단계 `DB_URL` 입력·커밋 여부, 또는 주소에 `&db=…` 추가 |
| 조작판에 **주소에 &key= 가 없습니다** | 조작판 주소 끝에 `&key=비밀키`를 붙였는지 |
| **저장 실패: key 확인** | Firebase 데이터 탭 `secrets/main` 값과 주소의 `key`가 같은지(2-4), 2-2 규칙을 게시했는지 |
| 조작판은 정상인데 화면이 그대로 | Sync 위젯이 **외부 URL** 종류인지(인라인 X), 주소가 `github.io`인지 |
| 위젯 자리에 아무것도 안 나옴 | 1단계 GitHub Pages가 켜졌는지, 주소를 브라우저로 직접 열어 확인 |
| 커밋한 수정이 안 보임 | GitHub Pages 반영까지 1~2분 대기 후 Sync 오버레이 새로고침 |
