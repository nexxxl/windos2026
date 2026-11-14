# windos2026

[English](README.md) · [简体中文](README.zh-CN.md) · **繁體中文** · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md)

7 MB，一台 2026 年的 AI 超輕原生作業系統：回到千禧年是外星科技，留在今天是你的私人軟體工廠。Bring anything. Leave with an HTML app.

如果回到千禧年，你的電腦意外打開一個2026年的AI原生作業系統，你會用來幹嘛？

windos2026 是 NexlOS 的 DSH 外掛版。它把一台完整的桌面裝進 DSH：17 個應用程式、25 條指令、8 種內建介面語言，壓縮包 7.38 MiB，只有一個執行階段相依套件。桌面上的每個應用程式都是 `apps/<id>/index.html` 加一份 `app.json`，可以直接讀、直接改、直接帶走。

## 安裝

把倉庫網址傳給 DSH，再說一句：

```text
https://github.com/nexxxl/windos2026
安裝 windos2026
```

DSH 會複製倉庫，再用 `plugin_manager install_bundle` 裝進目前設定檔。也可以直接指向本機目錄：

```text
plugin_manager install_bundle target=/absolute/path/to/windos2026
```

或者不經過對話，用指令碼裝進本機 profile：

```sh
./scripts/install-posix.sh
powershell -ExecutionPolicy Bypass -File scripts\install-windows.ps1
```

需要 Node.js 22+ 和可載入本機 bundle 的 DSH。沒有 npm 發佈，請用上面的倉庫安裝或本機腳本。

## 使用

- **打開桌面**：裝好後進入 Web 桌面；首次會先過一次 hello 引導，選好介面語言再進系統。
- **說一句話造應用**：在 DSH 裡描述你要的東西，它會生成一個內嵌應用程式，落到桌面上。
- **把倉庫搬進來**：給一個 GitHub 網址，它會複製、找入口，裝成桌面應用程式。
- **帶走**：應用程式就是檔案。複製 `apps/<id>/`，換一台機器照樣能跑。

## 裡面有什麼

| 項目 | 數字 |
| --- | --- |
| 壓縮包 | 7.38 MiB |
| 解包 | 10.8 MiB / 274 檔案 |
| 應用程式 | 17 |
| 指令 | 25 |
| 介面語言 | 8 種內建，7 種可選語言包 |
| 主題 | 2 套（NEXL 現代 / Windos2026） |
| 執行階段相依 | 1（`jpeg-js`） |
| 授權 | Apache-2.0（商標與第三方素材除外） |

## 它不做什麼

- 不需要第三方帳號，不需要託管的應用程式商店；應用程式、程式碼和資料都在你自己的機器上。
- 不收集遙測。
- 不改系統設定；安裝指令碼只寫 DSH profile 的相依與連結，解除安裝只移除這些。
- 不綁定 CJK 字型、通用版二進位檔和內部歷史；這些不在這個倉庫裡。
- 不聲稱 Windows 已完整驗證；已知邊界寫在 [Windows 驗證](docs/windows-validation.md)。

## 開發

```sh
npm ci
npm run check
npm test
npm pack --pack-destination /absolute/path/to/artifacts
```

體積檢查：

```sh
./scripts/verify-lite.sh
```

## 授權

外掛原始碼與文件依 [Apache-2.0](LICENSE) 提供。商標不隨 Apache-2.0 授予，第三方素材依各自授權，見 [NOTICE](NOTICE)、[TRADEMARK.md](TRADEMARK.md)、[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
