# windos2026

[English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · **日本語** · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md)

7.95 MiB。2026年の AI ネイティブで超軽量なオペレーティングシステム。ミレニアムに持っていけば異星のテクノロジー、今日のあなたにとってはプライベートなソフトウェア工場。Bring anything. Leave with an HTML app.

もしミレニアムに戻ったとき、あなたのコンピューターが突然 2026年の AI ネイティブ OS を開いたら、何に使いますか？

windos2026 は NexlOS の DSH プラグイン版です。DSH の中に一台のデスクトップを収めます。17 のアプリ、25 のコマンド、8 つの内蔵 UI 言語、tarball は 7.95 MiB、ランタイム依存は 1 つだけ。生成したアプリは `apps/<id>/index.html` と `app.json` だけのファイルです。内蔵の 17 アプリは `webos/` のコードとして同梱します。

*翻訳版です。正式な内容は英語版を参照してください。*

## 2 つのエディション、2 つのライセンス

| エディション | 入手するもの | ライセンス |
| --- | --- | --- |
| **プラグイン版**（本リポジトリのソース） | 後述の 7.95 MiB パッケージ | [Apache-2.0](LICENSE) |
| **ユニバーサル版**（Releases） | ネイティブウィンドウシェルを同梱した単体バイナリ | 非公開のカーネルとシェルは [NexlOS Binary License 1.0](LICENSE-BINARY.md)、同梱のデスクトップ層は Apache-2.0 のまま |

ファイル単位の正式な対応表は [LICENSING.md](LICENSING.md)。

ユニバーサル版は未公開です。資産権利の確認が終わるまで、Releases にバイナリは掲載しません。

## インストール

リポジトリの URL を DSH に送り、こう言います。

```text
https://github.com/nexxxl/windos2026
install windos2026
```

DSH はリポジトリを clone し、`plugin_manager install_bundle` で現在のプロファイルにインストールします。ローカルディレクトリを直接指定することもできます。

```text
plugin_manager install_bundle target=/absolute/path/to/windos2026
```

会話を介さず、ローカルプロファイルに入れることもできます。

```sh
./scripts/install-posix.sh
powershell -ExecutionPolicy Bypass -File scripts\install-windows.ps1
```

Node.js 22+ と、ローカル bundle を読み込める DSH が必要です。npm での公開はありません。上のリポジトリまたはローカルスクリプトからインストールしてください。

## 使い方

- **デスクトップを開く**：インストール後、Web デスクトップに入ります。初回は hello 画面で UI 言語を選びます。
- **一文でアプリを作る**：DSH で欲しいものを説明すると、埋め込みアプリを生成してデスクトップに置きます。
- **リポジトリを持ち込む**：GitHub の URL を渡すと、clone して入口を見つけ、デスクトップアプリとしてインストールします。
- **持ち出す**：生成したアプリはファイルです。`apps/<id>/` をコピーすれば、別のマシンでも動きます。

## 含まれるもの

| 項目 | 数字 |
| --- | --- |
| tarball | 7.95 MiB |
| 展開後 | 12.6 MiB / 293 ファイル |
| アプリ | 17 |
| コマンド | 25 |
| UI 言語 | 8 内蔵、7 の追加パック |
| テーマ | 2（NEXL モダン / Windos2026） |
| ランタイム依存 | 1（`jpeg-js`） |
| ライセンス | Apache-2.0（商標と第三者素材を除く） |

## やらないこと

- 第三者のアカウントも、ホストされたアプリストアも不要。アプリ、コード、データはあなたのマシンに残ります。
- テレメトリは収集しません。
- システム設定は変更しません。インストーラーは DSH プロファイルの依存とリンクだけを書き、アンインストールはそれだけを外します。
- 公開 tarball と公開ソース候補に CJK オフィス用フォントパック、ユニバーサル版バイナリ、内部の開発履歴は含みません。tarball 内の唯一の CJK 書体は THIRD_PARTY_NOTICES に記載した OFL ピクセルフォントです。
- Windows の完全検証は主張しません。Windows 経路は alpha として扱います。

## 開発

```sh
npm ci
npm run check
npm test
npm pack --pack-destination /absolute/path/to/artifacts
```

サイズゲート：

```sh
./scripts/verify-lite.sh
```

## ライセンス

本リポジトリのプラグインソースは Apache-2.0 です。ユニバーサル版の Release バイナリは別ライセンスで、対応表は [LICENSING.md](LICENSING.md)、条件は [LICENSE-BINARY.md](LICENSE-BINARY.md) にあります。

プラグインのソースとドキュメントは [Apache-2.0](LICENSE) です。商標は Apache-2.0 では付与されず、第三者素材はそれぞれのライセンスに従います。[NOTICE](NOTICE)、[TRADEMARK.md](TRADEMARK.md)、[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) を参照してください。
