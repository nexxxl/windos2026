# windos2026

[English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · **한국어** · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md)

7 MB. 2026년의 AI 네이티브 초경량 운영체제. 밀레니엄으로 가면 외계 기술, 오늘은 당신의 개인 소프트웨어 공장. Bring anything. Leave with an HTML app.

밀레니엄으로 돌아갔을 때 컴퓨터가 갑자기 2026년의 AI 네이티브 OS를 열었다면, 무엇에 쓰시겠습니까?

windos2026은 NexlOS의 DSH 플러그인 에디션입니다. DSH 안에 완전한 데스크톱을 넣습니다. 앱 17개, 명령 25개, 내장 UI 언어 8개, tarball 7.31 MiB, 런타임 의존성 1개. 데스크톱의 모든 앱은 `apps/<id>/index.html`과 `app.json`뿐입니다. 읽고, 고치고, 그대로 가져갈 수 있습니다.

*번역본입니다. 기준 문서는 영어판입니다.*

## 설치

저장소 URL을 DSH에 보내고 이렇게 말합니다.

```text
https://github.com/nexxxl/windos2026
install windos2026
```

DSH가 저장소를 clone하고 `plugin_manager install_bundle`로 현재 프로필에 설치합니다. 로컬 디렉터리를 직접 지정할 수도 있습니다.

```text
plugin_manager install_bundle target=/absolute/path/to/windos2026
```

대화 없이 로컬 프로필에 설치할 수도 있습니다.

```sh
./scripts/install-posix.sh
powershell -ExecutionPolicy Bypass -File scripts\install-windows.ps1
```

Node.js 22+와 로컬 bundle을 로드할 수 있는 DSH가 필요합니다. npm 패키지는 아직 게시되지 않았고, `npm install @nexlos/os`는 현재 404를 반환합니다.

## 사용

- **데스크톱 열기**: 설치 후 웹 데스크톱으로 들어갑니다. 첫 실행에서는 hello 화면에서 UI 언어를 고릅니다.
- **한 문장으로 앱 만들기**: DSH에서 원하는 것을 설명하면 내장 앱을 생성해 데스크톱에 올립니다.
- **저장소 가져오기**: GitHub URL을 주면 clone하고 진입점을 찾아 데스크톱 앱으로 설치합니다.
- **가지고 나가기**: 앱은 파일입니다. `apps/<id>/`를 복사하면 다른 기기에서도 실행됩니다.

## 포함된 것

| 항목 | 숫자 |
| --- | --- |
| tarball | 7.31 MiB |
| 압축 해제 | 11.2 MB / 260 파일 |
| 앱 | 17 |
| 명령 | 25 |
| UI 언어 | 내장 8개, 선택 팩 7개 |
| 테마 | 2 (NEXL 모던 / Windos2026) |
| 런타임 의존성 | 1 (`jpeg-js`) |
| 라이선스 | Apache-2.0 (상표와 제3자 자산 제외) |

## 하지 않는 것

- 제3자 계정도, 호스팅 앱 스토어도 필요 없습니다. 앱, 코드, 데이터는 당신의 기기에 남습니다.
- 텔레메트리를 수집하지 않습니다.
- 시스템 설정을 바꾸지 않습니다. 설치 프로그램은 DSH 프로필의 의존성과 링크만 쓰고, 제거는 그것만 지웁니다.
- CJK 폰트, 유니버설 에디션 바이너리, 내부 이력을 함께 넣지 않습니다. 이 저장소에 없습니다.
- Windows가 완전히 검증되었다고 주장하지 않습니다. 알려진 경계는 [Windows 검증](docs/windows-validation.md)에 있습니다.

## 개발

```sh
npm ci
npm run check
npm test
npm pack --pack-destination /absolute/path/to/artifacts
```

크기 게이트:

```sh
./scripts/verify-lite.sh
```

## 라이선스

플러그인 소스와 문서는 [Apache-2.0](LICENSE)입니다. 상표는 Apache-2.0으로 부여되지 않으며, 제3자 자산은 각자의 라이선스를 따릅니다. [NOTICE](NOTICE), [TRADEMARK.md](TRADEMARK.md), [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)를 참고하세요.
