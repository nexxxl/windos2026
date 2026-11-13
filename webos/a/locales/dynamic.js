// Anchored system messages. Captured names/paths/content remain byte-for-byte.
// The optional ninth column marks error details, whose known system messages
// can themselves be translated without applying that rule to ordinary names.
export const templates = `保存失败：{0}|儲存失敗：{0}|Save failed: {0}|Error al guardar: {0}|Échec de l’enregistrement : {0}|Speichern fehlgeschlagen: {0}|保存に失敗しました：{0}|저장 실패: {0}|error
设置没保存：{0}|設定未儲存：{0}|Settings were not saved: {0}|No se guardaron los ajustes: {0}|Les paramètres n’ont pas été enregistrés : {0}|Einstellungen wurden nicht gespeichert: {0}|設定を保存できませんでした：{0}|설정이 저장되지 않았습니다: {0}|error
设置未保存：{0}|設定未儲存：{0}|Settings were not saved: {0}|No se guardaron los ajustes: {0}|Les paramètres n’ont pas été enregistrés : {0}|Einstellungen wurden nicht gespeichert: {0}|設定を保存できませんでした：{0}|설정이 저장되지 않았습니다: {0}|error
写入失败：{0}|寫入失敗：{0}|Write failed: {0}|Error de escritura: {0}|Échec de l’écriture : {0}|Schreiben fehlgeschlagen: {0}|書き込みに失敗しました：{0}|쓰기 실패: {0}|error
上传失败：{0}|上傳失敗：{0}|Upload failed: {0}|Error de subida: {0}|Échec de l’importation : {0}|Hochladen fehlgeschlagen: {0}|アップロードに失敗しました：{0}|업로드 실패: {0}|error
打不开：{0}|無法開啟：{0}|Could not open: {0}|No se pudo abrir: {0}|Impossible d’ouvrir : {0}|Öffnen nicht möglich: {0}|開けませんでした：{0}|열 수 없습니다: {0}|error
修复失败：{0}|修復失敗：{0}|Repair failed: {0}|Error de reparación: {0}|Échec de la réparation : {0}|Reparatur fehlgeschlagen: {0}|修復に失敗しました：{0}|복구 실패: {0}|error
配额没保存：{0}|配額未儲存：{0}|Quota was not saved: {0}|No se guardó la cuota: {0}|Le quota n’a pas été enregistré : {0}|Kontingent wurde nicht gespeichert: {0}|容量設定を保存できませんでした：{0}|할당량이 저장되지 않았습니다: {0}|error
壁纸未更换：{0}|背景未變更：{0}|Wallpaper was not changed: {0}|No se cambió el fondo: {0}|Le fond n’a pas été changé : {0}|Hintergrund wurde nicht geändert: {0}|背景を変更できませんでした：{0}|배경이 변경되지 않았습니다: {0}|error
外观未切换：{0}|外觀未切換：{0}|Appearance was not changed: {0}|No se cambió la apariencia: {0}|L’apparence n’a pas été changée : {0}|Darstellung wurde nicht geändert: {0}|外観を切り替えられませんでした：{0}|테마가 변경되지 않았습니다: {0}|error
读不到记忆树：{0}|無法讀取記憶樹：{0}|Could not read the memory tree: {0}|No se pudo leer el árbol de memoria: {0}|Impossible de lire l’arbre de mémoire : {0}|Speicherbaum konnte nicht gelesen werden: {0}|メモリーツリーを読み取れません：{0}|메모리 트리를 읽을 수 없습니다: {0}|error
读不到回收站清单：{0}|無法讀取資源回收筒清單：{0}|Could not read Recycle Bin: {0}|No se pudo leer la papelera: {0}|Impossible de lire la corbeille : {0}|Papierkorb konnte nicht gelesen werden: {0}|ごみ箱の一覧を読み取れません：{0}|휴지통 목록을 읽을 수 없습니다: {0}|error
摄像头启动失败：{0}|相機啟動失敗：{0}|Could not start camera: {0}|No se pudo iniciar la cámara: {0}|Impossible de démarrer la caméra : {0}|Kamera konnte nicht gestartet werden: {0}|カメラを起動できません：{0}|카메라를 시작할 수 없습니다: {0}|error
您好，{0}|您好，{0}|Hello, {0}|Hola, {0}|Bonjour, {0}|Hallo, {0}|こんにちは、{0}|안녕하세요, {0}
快速打开{0}|快速開啟{0}|Quick launch {0}|Abrir rápidamente {0}|Lancer rapidement {0}|{0} schnell öffnen|{0} をすばやく開く|{0} 빠른 실행|ui
搜索 {0}|搜尋 {0}|Search {0}|Buscar en {0}|Rechercher dans {0}|{0} durchsuchen|{0} を検索|{0} 검색
正在启动 {0}…|正在啟動 {0}…|Starting {0}…|Iniciando {0}…|Démarrage de {0}…|{0} wird gestartet…|{0} を起動中…|{0} 시작 중…
{0} 上次打开着|{0} 上次仍開啟|{0} was open last time|{0} estaba abierto antes|{0} était ouvert précédemment|{0} war zuletzt geöffnet|前回は {0} が開いていました|지난번에 {0}이(가) 열려 있었습니다
当前可用应用：{0} 个。|目前可用應用程式：{0} 個。|Available apps: {0}.|Aplicaciones disponibles: {0}.|Applications disponibles : {0}.|Verfügbare Apps: {0}.|利用可能なアプリ：{0} 個。|사용 가능한 앱: {0}개.
{0} 条通知|{0} 則通知|{0} notifications|{0} notificaciones|{0} notifications|{0} Benachrichtigungen|{0} 件の通知|알림 {0}개
{0} 个文件|{0} 個檔案|{0} files|{0} archivos|{0} fichiers|{0} Dateien|{0} ファイル|파일 {0}개
{0} 个项目|{0} 個項目|{0} items|{0} elementos|{0} éléments|{0} Elemente|{0} 項目|항목 {0}개
已选择 {0} 项|已選取 {0} 項|{0} items selected|{0} elementos seleccionados|{0} éléments sélectionnés|{0} Elemente ausgewählt|{0} 項目を選択|{0}개 항목 선택됨
已选 {0} 项|已選取 {0} 項|{0} selected|{0} seleccionados|{0} sélectionnés|{0} ausgewählt|{0} 項目を選択|{0}개 선택됨
合计 {0}|合計 {0}|Total {0}|Total {0}|Total {0}|Insgesamt {0}|合計 {0}|합계 {0}
已用 {0} / 配额 {1}|已用 {0} / 配額 {1}|Used {0} / Quota {1}|Usado {0} / Cuota {1}|Utilisé {0} / Quota {1}|Belegt {0} / Kontingent {1}|使用済み {0} / 容量 {1}|사용됨 {0} / 할당량 {1}
已用 {0}|已用 {0}|Used {0}|Usado {0}|Utilisé {0}|Belegt {0}|使用済み {0}|사용됨 {0}
{0} 个文件夹|{0} 個資料夾|{0} folders|{0} carpetas|{0} dossiers|{0} Ordner|{0} フォルダー|폴더 {0}개
{0} 个文件夹 · {1} 个文件 · 含隐藏项目|{0} 個資料夾 · {1} 個檔案 · 包含隱藏項目|{0} folders · {1} files · Including hidden items|{0} carpetas · {1} archivos · Incluye elementos ocultos|{0} dossiers · {1} fichiers · Éléments cachés inclus|{0} Ordner · {1} Dateien · Einschließlich versteckter Elemente|{0} フォルダー · {1} ファイル · 隠し項目を含む|폴더 {0}개 · 파일 {1}개 · 숨긴 항목 포함
{0} 个文件夹 · {1} 个文件|{0} 個資料夾 · {1} 個檔案|{0} folders · {1} files|{0} carpetas · {1} archivos|{0} dossiers · {1} fichiers|{0} Ordner · {1} Dateien|{0} フォルダー · {1} ファイル|폴더 {0}개 · 파일 {1}개
“{0}”的搜索结果 · {1} 项|「{0}」的搜尋結果 · {1} 項|Search results for “{0}” · {1} items|Resultados de «{0}» · {1} elementos|Résultats pour « {0} » · {1} éléments|Suchergebnisse für „{0}“ · {1} Elemente|「{0}」の検索結果 · {1} 項目|“{0}” 검색 결과 · {1}개 항목
剪切了 {0} 项|已剪下 {0} 項|Cut {0} items|Se cortaron {0} elementos|{0} éléments coupés|{0} Elemente ausgeschnitten|{0} 項目を切り取りました|{0}개 항목 잘라냄
复制了 {0} 项|已複製 {0} 項|Copied {0} items|Se copiaron {0} elementos|{0} éléments copiés|{0} Elemente kopiert|{0} 項目をコピーしました|{0}개 항목 복사됨
开始下载：{0}|開始下載：{0}|Downloading: {0}|Descargando: {0}|Téléchargement : {0}|Download: {0}|ダウンロード開始：{0}|다운로드 시작: {0}
开始下载 {0} 个文件|開始下載 {0} 個檔案|Downloading {0} files|Descargando {0} archivos|Téléchargement de {0} fichiers|{0} Dateien werden heruntergeladen|{0} ファイルをダウンロード中|파일 {0}개 다운로드 시작
已传到 {0}：{1} 个文件|已傳送至 {0}：{1} 個檔案|Uploaded to {0}: {1} files|Subidos a {0}: {1} archivos|Importés dans {0} : {1} fichiers|Nach {0} hochgeladen: {1} Dateien|{0} にアップロード：{1} ファイル|{0}에 업로드됨: 파일 {1}개
已移动 {0} 项|已移動 {0} 項|Moved {0} items|Se movieron {0} elementos|{0} éléments déplacés|{0} Elemente verschoben|{0} 項目を移動しました|항목 {0}개 이동됨
已移动 {0} 项，{1} 项失败（目标可能同名）|已移動 {0} 項，{1} 項失敗（目的地可能有同名項目）|Moved {0} items; {1} failed (possible name conflicts)|Se movieron {0} elementos; fallaron {1} (posibles nombres duplicados)|{0} éléments déplacés ; {1} échecs (noms potentiellement identiques)|{0} Elemente verschoben; {1} fehlgeschlagen (mögliche Namenskonflikte)|{0} 項目を移動、{1} 項目が失敗（名前が重複している可能性）|{0}개 이동됨, {1}개 실패(이름 중복 가능)
已还原 {0} 项|已還原 {0} 項|Restored {0} items|Se restauraron {0} elementos|{0} éléments restaurés|{0} Elemente wiederhergestellt|{0} 項目を復元しました|항목 {0}개 복원됨
已还原 {0} 项，{1} 项失败（原位置可能已有同名文件）|已還原 {0} 項，{1} 項失敗（原位置可能已有同名檔案）|Restored {0} items; {1} failed (possible existing files)|Se restauraron {0} elementos; fallaron {1} (puede haber archivos existentes)|{0} éléments restaurés ; {1} échecs (fichiers peut-être déjà présents)|{0} Elemente wiederhergestellt; {1} fehlgeschlagen (möglicherweise vorhandene Dateien)|{0} 項目を復元、{1} 項目が失敗（同名ファイルが存在する可能性）|{0}개 복원됨, {1}개 실패(기존 파일과 이름 중복 가능)
已彻底删除 {0} 项|已永久刪除 {0} 項|Permanently deleted {0} items|Se eliminaron permanentemente {0} elementos|{0} éléments supprimés définitivement|{0} Elemente endgültig gelöscht|{0} 項目を完全に削除しました|항목 {0}개 영구 삭제됨
已移到回收站 · {0}|已移至資源回收筒 · {0}|Moved to Recycle Bin · {0}|Movido a la papelera · {0}|Déplacé vers la corbeille · {0}|In den Papierkorb verschoben · {0}|ごみ箱に移動しました · {0}|휴지통으로 이동됨 · {0}
已重命名为 {0}|已重新命名為 {0}|Renamed to {0}|Nombre cambiado a {0}|Renommé en {0}|In {0} umbenannt|{0} に名前を変更しました|{0}(으)로 이름 변경됨
按{0}排序|依{0}排序|Sort by {0}|Ordenar por {0}|Trier par {0}|Nach {0} sortieren|{0}で並べ替え|{0}순 정렬|ui
{0} 篇|{0} 篇|{0} documents|{0} documentos|{0} documents|{0} Dokumente|{0} 件の文書|문서 {0}개
{0} 首|{0} 首|{0} tracks|{0} pistas|{0} titres|{0} Titel|{0} 曲|{0}곡
已加入 {0} 首|已加入 {0} 首|Added {0} tracks|Se añadieron {0} pistas|{0} titres ajoutés|{0} Titel hinzugefügt|{0} 曲を追加しました|{0}곡 추가됨
已保存 {0}|已儲存 {0}|Saved {0}|Guardado {0}|Enregistré {0}|Gespeichert {0}|保存済み {0}|저장됨 {0}
{0} 章 · {1} 字|{0} 章 · {1} 字|{0} chapters · {1} characters|{0} capítulos · {1} caracteres|{0} chapitres · {1} caractères|{0} Kapitel · {1} Zeichen|{0} 章 · {1} 文字|{0}장 · {1}자
{0} 章|{0} 章|{0} chapters|{0} capítulos|{0} chapitres|{0} Kapitel|{0} 章|{0}장
{0} 字|{0} 字|{0} characters|{0} caracteres|{0} caractères|{0} Zeichen|{0} 文字|{0}자
{0} 人|{0} 人|{0} characters|{0} personajes|{0} personnages|{0} Figuren|{0} 人|{0}명
输入 · {0}|輸入 · {0}|Inputs · {0}|Entradas · {0}|Entrées · {0}|Eingaben · {0}|入力 · {0}|입력 · {0}
命令目录 · {0}|命令目錄 · {0}|Command catalog · {0}|Catálogo de comandos · {0}|Catalogue des commandes · {0}|Befehlskatalog · {0}|コマンド一覧 · {0}|명령 목록 · {0}
{0} 条输入 · {1}|{0} 筆輸入 · {1}|{0} inputs · {1}|{0} entradas · {1}|{0} entrées · {1}|{0} Eingaben · {1}|{0} 件の入力 · {1}|입력 {0}개 · {1}
工作区配额已改为 {0} MB|工作區配額已變更為 {0} MB|Workspace quota changed to {0} MB|Cuota del espacio de trabajo: {0} MB|Quota de l’espace de travail défini sur {0} Mo|Arbeitsbereichskontingent auf {0} MB geändert|ワークスペース容量を {0} MB に変更しました|작업 공간 할당량이 {0}MB로 변경됨
已注册 {0} 条命令；维护者从这里进系统面板|已註冊 {0} 條命令；維護者可從此進入系統面板|{0} commands registered; open the system panel here|{0} comandos registrados; abre aquí el panel del sistema|{0} commandes enregistrées ; ouvrez le panneau système ici|{0} Befehle registriert; Systemübersicht hier öffnen|{0} 個のコマンドが登録済み。ここからシステムパネルを開けます|명령 {0}개 등록됨. 여기서 시스템 패널을 열 수 있습니다
地址 {0}|位址 {0}|Address {0}|Dirección {0}|Adresse {0}|Adresse {0}|アドレス {0}|주소 {0}
强调色 {0}|強調色 {0}|Accent color {0}|Color de énfasis {0}|Couleur d’accentuation {0}|Akzentfarbe {0}|アクセントカラー {0}|강조 색 {0}
{0} 外观|{0} 外觀|{0} appearance|Apariencia {0}|Apparence {0}|Darstellung {0}|{0} の外観|{0} 테마|ui
当前版本 {0} · 静态二进制|目前版本 {0} · 靜態執行檔|Version {0} · Standalone binary|Versión {0} · Binario autónomo|Version {0} · Binaire autonome|Version {0} · Eigenständige Programmdatei|バージョン {0} · スタンドアロン実行ファイル|버전 {0} · 독립 실행 파일
上次检查：刚刚 · {0}|上次檢查：剛剛 · {0}|Last checked: just now · {0}|Última comprobación: ahora · {0}|Dernière vérification : à l’instant · {0}|Zuletzt geprüft: gerade eben · {0}|最終確認：たった今 · {0}|마지막 확인: 방금 · {0}
进程已退出（代码 {0}）|處理程序已結束（代碼 {0}）|Process exited (code {0})|Proceso finalizado (código {0})|Processus terminé (code {0})|Prozess beendet (Code {0})|プロセスが終了しました（コード {0}）|프로세스 종료됨(코드 {0})`.split('\n').map(line => line.split('|'));
