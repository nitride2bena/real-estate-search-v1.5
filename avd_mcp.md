# 안드로이드 가상 기기(AVD) 생성 및 구글 안티그래비티 MCP 연동 가이드

실물 스마트폰 없이 PC에 안드로이드 가상 기기(AVD)를 띄우고, 구글 안티그래비티(Google Antigravity) 환경에서 `ego-browser`처럼 네이티브 앱 UI를 탐색·제어하기 위한 전체 구축 체크리스트 및 설정 구조입니다.

---

## 1단계: 호스트 환경 및 SDK 사전 준비 체크리스트

가상 기기를 원활하게 구동하기 위해 하드웨어 가상화와 필수 CLI 도구를 먼저 준비합니다.

- [ ] **BIOS/UEFI 가상화 활성화:** CPU 설정에서 `Intel VT-x` 또는 `AMD-V` 옵션이 켜져 있는지 확인합니다.
- [ ] **OS 하이퍼바이저 활성화:**
  - **Windows:** `제어판 > 프로그램 및 기능 > Windows 기능 켜기/끄기`에서 **Windows 하이퍼바이저 플랫폼(Windows Hypervisor Platform)** 체크 후 재부팅합니다.
  - **macOS (Apple Silicon):** 기본 내장된 Hypervisor.framework를 사용하므로 별도 설정이 필요 없습니다.
- [ ] **Android SDK 및 에뮬레이터 도구 설치:**
  - Android Studio의 **SDK Manager** 또는 커맨드라인 도구(`sdkmanager`)를 통해 아래 3가지 필수 패키지를 설치합니다.
    1. `platform-tools` (ADB 포함)
    2. `emulator` (가상 기기 구동 엔진)
    3. `system-images;android-34;google_apis;x86_64` (Apple Silicon Mac의 경우 `arm64-v8a` 선택)
- [ ] **환경 변수(`PATH`) 등록 및 확인:**
  - `ANDROID_HOME` 경로를 지정하고, `$ANDROID_HOME/platform-tools`와 `$ANDROID_HOME/emulator`를 시스템 `PATH`에 추가합니다.
  - 터미널에서 `adb --version` 및 `emulator -version` 입력 시 정상 출력되는지 확인합니다.

---

## 2단계: 가상 기기(AVD) 생성 및 구동 체크리스트

Android Studio의 **Device Manager** 또는 터미널 명령어(`avdmanager`)로 가상 기기를 생성하고 부팅합니다.

- [ ] **가상 기기 프로필 생성:**
  - CLI로 생성할 경우 아래 명령어를 실행합니다.
  ```bash
  avdmanager create avd -n "antigravity_pixel" -k "system-images;android-34;google_apis;x86_64" -d "pixel_8"
  ```
- [ ] **에뮬레이터 부팅 (일반 모드 vs 헤드리스 모드):**
  - **화면 확인이 필요한 경우 (일반 부팅):**
    ```bash
    emulator -avd antigravity_pixel -no-snapshot-load
    ```
  - **창 없이 백그라운드 리소스를 아끼며 구동할 경우 (헤드리스 부팅):**
    ```bash
    emulator -avd antigravity_pixel -no-window -no-audio -no-boot-anim
    ```
- [ ] **ADB 인식 상태 검증:**
  - 가상 기기 부팅 완료 후 새 터미널에서 `adb devices`를 실행합니다.
  - 출력 결과에 `emulator-5554   device` 상태가 표시되는지 확인합니다. (`offline` 상태라면 완전히 부팅될 때까지 10~20초 대기합니다.)
- [ ] **테스트용 앱(`.apk`) 설치:**
  - 제어하려는 안드로이드 앱 패키지를 가상 기기에 직접 설치합니다.
  ```bash
  adb -s emulator-5554 install ./target_app.apk
  ```

---

## 3단계: 구글 안티그래비티 MCP 서버 설정 파일 구조

구글 안티그래비티의 전역 설정 파일(`~/.gemini/antigravity/mcp_config.json`)에 안드로이드 UI 제어용 MCP 서버를 등록합니다.

### A. 표준 로컬 환경 (Windows 네이티브 또는 macOS)

안티그래비티와 에뮬레이터가 동일한 OS 환경에서 실행될 때 사용하는 기본 구조입니다.

```json
{
  "mcpServers": {
    "android-mobile": {
      "command": "npx",
      "args": [
        "-y",
        "@mobilenext/mobile-mcp@latest"
      ],
      "env": {
        "ANDROID_HOME": "/Users/username/Library/Android/sdk"
      }
    }
  }
}
```
*(참고: Windows 환경에서는 `ANDROID_HOME` 경로를 `"C:\\Users\\username\\AppData\\Local\\Android\\Sdk"` 형태로 입력합니다.)*

### B. WSL2(Ubuntu) 내부 안티그래비티 + Windows 호스트 에뮬레이터 연동 구조

WSL2 환경에서 안티그래비티를 실행하면서 GPU 가속을 위해 Windows 쪽에서 띄운 에뮬레이터를 제어하려면, Windows의 ADB 서버 포트(`5037`)와 연결해야 합니다.

1. **Windows PowerShell에서 ADB 서버를 외부(WSL2) 수신 허용 모드로 재시작:**
   ```powershell
   adb kill-server
   adb -a -P 5037 nodaemon server
   ```
2. **WSL2 내부의 `mcp_config.json` 설정:**
   Windows 호스트 IP(WSL2에서 `ip route show | grep default`로 확인되는 게이트웨이 IP)를 `ADB_SERVER_SOCKET` 환경 변수로 지정합니다.

```json
{
  "mcpServers": {
    "android-mobile": {
      "command": "npx",
      "args": [
        "-y",
        "@mobilenext/mobile-mcp@latest"
      ],
      "env": {
        "ADB_SERVER_SOCKET": "tcp:172.24.160.1:5037"
      }
    }
  }
}
```

---

## 4단계: 최종 연동 및 제어 테스트 체크리스트

설정 저장 후 안티그래비티 에이전트가 가상 기기를 정상 조작할 수 있는지 검증합니다.

- [ ] **MCP 서버 리로드:** 안티그래비티 설정 창에서 `android-mobile` 서버 상태가 **Connected(초록불)**로 표시되는지 확인합니다.
- [ ] **UI 트리 및 스크린샷 조회 테스트:**
  - 에이전트 프롬프트에 *"현재 연결된 안드로이드 에뮬레이터 화면의 UI 요소 목록과 스크린샷을 확인해 줘"*라고 입력하여 `emulator-5554`의 화면 정보가 반환되는지 확인합니다.
- [ ] **앱 실행 및 인터랙션 테스트:**
  - *"설치된 테스트 앱을 실행하고, 로그인 버튼을 탭해 줘"*와 같은 자연어 명령으로 실제 에뮬레이터 화면의 터치 및 텍스트 입력이 동작하는지 최종 점검합니다.