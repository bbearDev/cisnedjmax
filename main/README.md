# 본선 (main)

본선 경기용 위젯 폴더입니다. 팀장 선출전 위젯은 `../leader/`에 있습니다.

- 주소: `https://bbeardev.github.io/cisnedjmax/main/○○.html`
- 이미지: `https://raw.githubusercontent.com/bbearDev/cisnedjmax/main/main/○○.png`
- Firebase 방 이름: `main` (`secrets/main`, `keyword/main`, `bracket/main`)

## 방송 오버레이

OBS 브라우저 소스(1920×1080)에 `overlay.html`을 넣습니다. 화면은 관리 페이지 **경기 진행** 탭의 **방송 화면** 버튼으로 바꿉니다.

| 주소 | 화면 |
|---|---|
| `overlay.html` | 관리 페이지에서 고른 화면 (대기·게임설명·대진표·트랙리스트·빈 화면) |
| `overlay.html?scene=standby` | 대기화면 + 타이머 고정 |
| `overlay.html?scene=rule` | 게임설명 고정 |
| `overlay.html?scene=bracket` | 대진표 고정 |
| `overlay.html?scene=track` | 트랙리스트 고정 (6강·4강은 2칸, 결승은 3칸) |
| `overlay.html?scene=blank` | 빈 화면 고정 (로고와 배경만) |

화면이 바뀔 때의 전환 효과(컷·페이드·스와이프·슬라이드·색상으로 페이드)와 방향·색·시간도 같은 곳에서 고릅니다. OBS 기본 전환과 같은 동작을 오버레이 안에서 재현한 것입니다.

OBS 장면을 직접 나누고 싶으면 `?scene=`으로 고정한 소스를 장면마다 넣으면 됩니다. 배경 시안은 `main_overlay/`에 있습니다.
데이터는 `tourney/main/live`(공개 읽기)에 있고, 선수별 점수는 `tourney/main/scores`(관리자만)에 따로 둡니다. 구조는 `common.js` 맨 위 주석을 참고하세요.
