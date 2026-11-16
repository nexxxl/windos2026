# windos2026

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · **日本語** · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md)

7.94 MiB。2026年の AI ネイティブで超軽量なオペレーティングシステム。ミレニアムに持っていけば異星のテクノロジー、今日のあなたにとってはプライベートなソフトウェア工場。Bring anything. Leave with an HTML app.

もしミレニアムに戻ったとき、あなたのコンピューターが突然 2026年の AI ネイティブ OS を開いたら、何に使いますか？

windos2026 は NexlOS の DSH プラグイン版です。DSH の中に一台のデスクトップを収めます。17 のアプリ、25 のコマンド、8 つの内蔵 UI 言語、tarball は 7.94 MiB、ランタイム依存は 1 つだけ。生成したアプリは `apps/<id>/index.html` と `app.json` だけのファイルです。内蔵の 17 アプリは `src/webos/` のコードとして同梱します。

*翻訳版です。正式な内容は英語版を参照してください。*

あなたが最初に使ったパソコンのデスクトップを覚えていますか。これは、あなた自身が組み立てる一台です。ひとつの文章からアプリが生まれ、どのアプリもファイルとしてあなたについてきます。Linux はすべてのプログラムに一台のマシンを与えました。NexlOS はすべての agent に一台のコンピューターを与えます。

## あなたのものであり続ける三つ

**あなたのモデル。** プラグインは key を同梱せず、既定の provider も設定しません。現在の DSH プロファイルにあるものをそのまま読み、モデルが見えないときはそう言います。ケイパビリティ層は理由付きで `501` を返し、モデル状態は `unavailable` と表示し、準備できたふりはしません。

**あなたのアプリ。** DSH でひとこと伝えると、生成器が `apps/<id>/index.html` と `app.json` を書き、ブラウザーでページを開いて検証し、失敗したら一度だけ自動修復してからデスクトップにアイコンを置きます。そのディレクトリを任意の静的サーバーにコピーしても動きます。GitHub の URL を渡すと `importGithubApp` がリポジトリを複製し、ビルド済みのエントリを見つけてアプリとしてマウントします。

**あなたのマシン。** 7.94 MiB で 17 のアプリ、25 のコマンド、8 つの UI 言語が、すでに動かしているハーネスの中に入ります。デプロイする第二のコントロールプレーンも、アカウントも、テレメトリーもありません。同じ bundle を別の DSH プロファイルに入れても、使うのはそのプロファイルのモデルであり、私たちのものではありません。

## 2 つのエディション、2 つのライセンス

| エディション | 入手するもの | ライセンス |
| --- | --- | --- |
| **プラグイン版**（本リポジトリのソース） | 後述の 7.94 MiB パッケージ | [Apache-2.0](../../LICENSE) |
| **ユニバーサル版**（Releases） | ネイティブウィンドウシェルを同梱した単体バイナリ | 非公開のカーネルとシェルは [NexlOS Binary License 1.0](../LICENSE-BINARY.md)、同梱のデスクトップ層は Apache-2.0 のまま |

ファイル単位の正式な対応表は [LICENSING.md](../legal/LICENSING.md)。

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

![DSH 上の NexlOS](../images/host-dsh.jpg)

### Octop（ワークベンチ）

デスクトップは DSH を必要としません。同じ `src/webos/` と `index.js` が単体のホストとして動き、1 つのコマンドで Octop に常駐エントリを追加できます。

```bash
git clone https://github.com/nexxxl/windos2026.git
cd windos2026
./scripts/octop-install install
```

Octop のサイドバーに **NexlOS デスクトップ** が常駐し、メインワークスペースに開きます。コマンドバーはあなた自身の Octop agent が答えます。`./scripts/octop-install status|up|down|uninstall` で管理します。Node.js 22+ と `~/.octop` にインストールされた Octop が必要です。ホストごとの違い、制限、ロールバックは [docs/octop.md](../octop.md) を参照してください。

![Octop 上の NexlOS](../images/host-octop.jpg)

## 使い方

- **デスクトップを開く**：インストール後、Web デスクトップに入ります。初回は hello 画面で UI 言語を選びます。
- **一文でアプリを作る**：DSH で欲しいものを説明すると、埋め込みアプリを生成してデスクトップに置きます。
- **リポジトリを持ち込む**：GitHub の URL を渡すと、clone して入口を見つけ、デスクトップアプリとしてインストールします。
- **持ち出す**：生成したアプリはファイルです。`apps/<id>/` をコピーすれば、別のマシンでも動きます。

## 含まれるもの

| 項目 | 数字 |
| --- | --- |
| tarball | 7.94 MiB |
| 展開後 | 12.6 MiB / 287 ファイル |
| アプリ | 17 |
| コマンド | 25 |
| UI 言語 | 8 内蔵、7 の追加パック |
| テーマ | 2（NEXL モダン / Windos2026） |
| ランタイム依存 | 1（`jpeg-js`） |
| ライセンス | Apache-2.0（商標と第三者素材を除く） |

2026 年の位置づけと検索語の対応、および本プロジェクトが明確に主張しないこと：[docs/highlights.md](../highlights.md)。価値ページとよくある検索：[docs/faq.md](../faq.md)。利用と再配布の境界：[docs/research-use.md](../research-use.md)。AI クローラー向け要約：[llms.txt](../../llms.txt)。

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

本リポジトリのプラグインソースは Apache-2.0 です。ユニバーサル版の Release バイナリは別ライセンスで、対応表は [LICENSING.md](../legal/LICENSING.md)、条件は [LICENSE-BINARY.md](../LICENSE-BINARY.md) にあります。

プラグインのソースとドキュメントは [Apache-2.0](../../LICENSE) です。商標は Apache-2.0 では付与されず、第三者素材はそれぞれのライセンスに従います。[NOTICE](../legal/NOTICE)、[TRADEMARK.md](../legal/TRADEMARK.md)、[THIRD_PARTY_NOTICES.md](../legal/THIRD_PARTY_NOTICES.md) を参照してください。

## プロジェクト

リリース履歴：[CHANGELOG.md](../../CHANGELOG.md)。コントリビューション規約と DCO：[CONTRIBUTING.md](../../.github/CONTRIBUTING.md)。セキュリティ報告：[SECURITY.md](../../.github/SECURITY.md)。ライセンス対応表：[LICENSING.md](../legal/LICENSING.md)。バージョンとサポート範囲：[docs/releasing.md](../releasing.md)。
