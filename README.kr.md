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

로컬 파일 저장:

```sh
cp config.template.yml config.yml
# config.yml의 data, outputs 경로를 수정합니다.
npm run dev:app
```

App의 Save는 data.json만 저장합니다. Generate SVGs는 데이터 저장 없이 현재 편집 내용을 모든 출력 디렉터리에 SVG로 생성합니다. 저장과 독립적으로 이전 출력의 정리를 추적하기 위해 `{데이터 경로}.svg-state.json`에 출력 이력을 보관합니다. 상대 경로는 config.yml 기준이며 config.yml과 data.json은 Git에서 제외됩니다.

Web은 localStorage에 데이터가 없으면 data.template.json을 사용합니다. App은 최초 실행 시 설정된 데이터 파일이 없으면 템플릿을 해당 경로에 복사합니다. 기존 데이터 파일은 유지합니다.

출력은 `{name}.svg`와 CSS 배경용 `{name}.fill1.svg` 등입니다. 패턴 ID는 `{name}-fill1` 형식입니다. App SVG 생성 시 이름 변경·삭제를 반영하고 관리하지 않는 파일은 보존합니다. 출력 디렉터리는 이 앱 전용으로 사용해 주세요.

검증: `npm run type-check`, `npm run lint`, `npm run build`.

GitHub Actions는 PR을 검증하고 main에 push하거나 main에서 수동 실행하면 Web 빌드를 배포합니다. 저장소 Settings → Pages의 Source를 **GitHub Actions**로 설정해 주세요. 배포에는 로컬 config.yml과 data.json이 필요하지 않습니다.
