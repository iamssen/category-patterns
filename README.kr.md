# Category Patterns

Color lightness와 Background contrast로 새 색상 생성 조건을 조정합니다. 기본값은
명도 55–80%, 대비 우선순위 1입니다. Global settings를 접으면 현재 값만 표시하며,
각 Restore 버튼은 해당 항목만 표시된 값으로 복원합니다.
Save로 설정을 저장하며 기존 색상은 변경하지 않습니다.

Global settings의 Background를 선택하면 전체 UI 색상이 함께 조정됩니다.
첫 실행에서는 기본 배경을 확인하거나 원하는 색을 선택하세요. Save로
배경과 확인 상태를 저장합니다. 출력 SVG의 패턴은 유지되며, 새로운 색상 생성은
선택한 배경을 기준으로 대비를 평가합니다.

색상 팔레트와 SVG 패턴을 생성하고 차트로 비교하는 앱입니다. Node.js 22.12 이상이 필요합니다.

```sh
npm install
npm run dev       # Web: Save: localStorage 저장; Download SVGs: ZIP 다운로드
npm run build     # dist/에 Web 빌드
npm run preview   # 빌드 미리보기
```

Web 빌드는 HTTPS(또는 localhost)에서 설치 가능한 PWA입니다. 온라인으로 한 번 열어 캐시한 뒤에는 오프라인에서도 편집과 SVG ZIP 내보내기를 사용할 수 있습니다. 브라우저 앱 메뉴 또는 홈 화면에 추가로 설치해 주세요. 업데이트는 모든 앱 창과 탭을 닫고 다시 열면 적용되며, 편집 중 자동 새로고침은 하지 않습니다. 개발 서버와 App 모드에서는 PWA 캐시를 사용하지 않습니다.

데스크톱 Chrome/Edge의 `showDirectoryPicker()`로 사용자가 선택하고 권한을 승인한 폴더에 직접 저장할 수 있습니다. Safari/Firefox에서는 이 폴더 선택 API를 지원하지 않습니다. PWA 설치 자체가 파일 시스템 권한을 부여하지 않으며, OPFS는 프로젝트 폴더가 아닌 브라우저 내부 저장소입니다. Web의 Download SVGs는 현재 편집 내용을 ZIP으로 다운로드하며 데이터를 저장하지 않습니다.

Colors and patterns에서 각 이름을 누르면 색상과 패턴을, 미리보기 사각형이나 HEX 색상을 누르면 색상만, 패턴 이름을 누르면 패턴만 랜덤화합니다.

첫 화면은 저장된 `default` 프로젝트의 편집 화면입니다. 팔레트 위쪽 Project 버튼으로
`/#/projects`에 이동하여 프로젝트를 선택하거나 Dark/Light 샘플로 생성합니다.
Light 샘플에는 저장된 `light-sample` 구성을 사용하며, `templates/light.json`을 수정하면 이후 생성하는
프로젝트부터 반영됩니다. 기존 프로젝트는 유지됩니다. Hash 주소는 GitHub Pages에서
직접 접속하거나 새로고침해도 사용할 수 있습니다. 프로젝트 이동과 브라우저
뒤로가기·앞으로가기에서 미저장 변경을 Save / Discard / Cancel로 처리합니다.

로컬 파일 저장:

```sh
npm run dev:app
```

App 프로젝트는 `~/category-patterns/{name}.yml`에 저장됩니다. YAML에는 `version: 1`,
`name`, 출력 경로 목록인 `outputs`, 기존 팔레트 구조인 `data`가 포함됩니다.
Projects 화면에서 생성하거나 출력 경로를 수정합니다. 한 줄에 한 경로씩 입력하며,
`~/`는 홈 디렉터리로 확장하고 상대 경로는 `~/category-patterns/` 기준입니다.
프로젝트끼리 출력 디렉터리를 공유하거나 중첩할 수 없으며 프로젝트 저장 폴더와도
분리해야 합니다. 프로젝트는 출력 경로 없이 생성할 수 있습니다. 경로가 없으면
Generate SVGs를 비활성화하고 설정 안내를 표시합니다. Projects에서 경로를 추가해 주세요.

Web의 **Export projects**는 저장된 프로젝트 전체의 출력 경로를 입력받아
`projects.zip`으로 내보냅니다. 압축 안의 YAML 파일들을 `~/category-patterns/`에 풀고
App을 실행하면 작업을 이어갈 수 있습니다. 필요한 기존 파일을 덮어쓰지 않도록 해 주세요.
입력한 경로는 브라우저에 기억합니다. **Download SVGs**는 현재 팔레트 편집 내용을
`category-patterns-{project}.zip`으로 내보내는 별도 기능입니다.

App의 **Save**는 프로젝트 YAML을 저장합니다. **Generate SVGs**는 데이터를 저장하지
않고 현재 편집 내용을 SVG로 생성합니다. `{name}.svg-state.json`이 생성 데이터와 출력
경로를 추적합니다. 경로 변경은 다음 SVG 생성 시 반영하며, 이전 경로의 관리 SVG를
정리하고 새 경로에 생성합니다. 성공하기 전까지 이전 경로도 해당 프로젝트에 예약됩니다.
관리하지 않는 파일은 보존하며, SVG 파일명이 충돌하면 생성을 중단합니다.

최초 사용 시 기존 브라우저 데이터를 `default`로 복사합니다. App에서는 기본 프로젝트가
없을 때 기존 루트 `config.yml`의 JSON 데이터와 출력 경로·이력을 이전합니다. 원래
브라우저 항목과 로컬 파일은 유지합니다. 기존 데이터가 없으면 `templates/dark.json`을
사용합니다. `config.yml`과 `data.json`은 이제 이전 용도로만 사용합니다. App 프로젝트
폴더를 변경하려면 서버 실행 전에 `CATEGORY_PATTERNS_HOME`을 지정해 주세요.

출력은 `{name}.svg`와 CSS 배경용 `{name}.fill1.svg` 등입니다. 패턴 ID는 `{name}-fill1` 형식입니다. App SVG 생성 시 이름 변경·삭제를 반영하고 관리하지 않는 파일은 보존합니다. 출력 디렉터리는 이 앱 전용으로 사용해 주세요.

검증: `npm run type-check`, `npm run lint`, `npm run build`.

GitHub Actions는 PR을 검증하고 main에 push하거나 main에서 수동 실행하면 Web 빌드를 배포합니다. 저장소 Settings → Pages의 Source를 **GitHub Actions**로 설정해 주세요. 배포에는 로컬 config.yml과 data.json이 필요하지 않습니다.
