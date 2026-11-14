// Browser-QA additions. Columns: zh-CN, zh-TW, en, es, fr, de, ja, ko.
// Actual directory names such as 文稿 and nexl交换区 stay unchanged.
export const rows = `创建中|建立中|Creating|Creando|Création en cours|Wird erstellt|作成中|생성 중
就绪|就緒|Ready|Listo|Prêt|Bereit|準備完了|준비됨
成员|成員|Members|Miembros|Membres|Mitglieder|メンバー|구성원
待认领|待認領|Unclaimed|Sin asignar|À attribuer|Nicht zugewiesen|引き受け待ち|미할당
（未命名任务）|（未命名任務）|(Untitled task)|(Tarea sin título)|(Tâche sans titre)|(Unbenannte Aufgabe)|（無題のタスク）|(이름 없는 작업)
便捷办公|便捷辦公|Office|Oficina fácil|Bureautique pratique|Einfache Büroarbeit|かんたんオフィス|간편 오피스
办公|辦公|Office|Oficina|Bureautique|Büro|オフィス|오피스
Word、Excel、PPT、Markdown、HTML 与 PDF：文件统一存进「文稿」。|Word、Excel、PPT、Markdown、HTML 與 PDF：檔案統一存入「文稿」。|Word, Excel, PPT, Markdown, HTML, and PDF: all files are stored in “Documents”.|Word, Excel, PPT, Markdown, HTML y PDF: todos los archivos se guardan en «Documentos».|Word, Excel, PPT, Markdown, HTML et PDF : tous les fichiers sont enregistrés dans « Documents ».|Word, Excel, PPT, Markdown, HTML und PDF: Alle Dateien werden in „Dokumente“ gespeichert.|Word、Excel、PPT、Markdown、HTML、PDF：すべてのファイルは「書類」に保存されます。|Word, Excel, PPT, Markdown, HTML, PDF: 모든 파일은 「문서」에 저장됩니다.
图像与材质|影像與材質|Images and materials|Imágenes y materiales|Images et matériaux|Bilder und Materialien|画像とマテリアル|이미지 및 재질
矢量与版面|向量與版面|Vectors and layouts|Vectores y maquetación|Vecteurs et mise en page|Vektoren und Layouts|ベクターとレイアウト|벡터 및 레이아웃
时间与声音|時間與聲音|Time and sound|Tiempo y sonido|Temps et son|Zeit und Ton|時間とサウンド|시간 및 사운드
文档与元工具|文件與元工具|Documents and meta-tools|Documentos y metaherramientas|Documents et méta-outils|Dokumente und Meta-Werkzeuge|ドキュメントとメタツール|문서 및 메타 도구
搜索 craft、功能或能力…|搜尋 craft、對應軟體或功能…|Search crafts, comparable software, or capabilities…|Buscar crafts, software de referencia o funciones…|Rechercher des crafts, des logiciels de référence ou des fonctionnalités…|Crafts, vergleichbare Software oder Funktionen suchen…|craft、参考ソフトウェア、機能を検索…|craft, 참고 소프트웨어 또는 기능 검색…
搜索 craft|搜尋 craft|Search crafts|Buscar crafts|Rechercher des crafts|Crafts suchen|craft を検索|craft 검색
没有匹配的 craft。|沒有符合條件的 craft。|No matching crafts.|No hay crafts que coincidan.|Aucun craft correspondant.|Keine passenden Crafts.|一致する craft はありません。|일치하는 craft가 없습니다.
可用|可用|Available|Disponible|Disponible|Verfügbar|利用可能|사용 가능
上游 ArtCraft 的浏览器移植 · 非官方 · 装在 NexlOS 里|上游 ArtCraft 的瀏覽器移植 · 非官方 · 裝在 NexlOS 裡|A browser port of upstream ArtCraft · unofficial · runs inside NexlOS|Un port de navegador de ArtCraft · no oficial · dentro de NexlOS|Un portage navigateur d’ArtCraft · non officiel · dans NexlOS|Ein Browser-Port von ArtCraft · inoffiziell · läuft in NexlOS|上流 ArtCraft のブラウザ移植 · 非公式 · NexlOS 上で動作|업스트림 ArtCraft의 브라우저 이식 · 비공식 · NexlOS에서 실행
所有内容留在本机，导出走浏览器下载|所有內容保留在本機，匯出透過瀏覽器下載|All content stays on this device; exports download through your browser|Todo el contenido permanece en este dispositivo; las exportaciones se descargan desde el navegador|Tout le contenu reste sur cet appareil ; les exportations se téléchargent dans le navigateur|Alle Inhalte bleiben auf diesem Gerät; Exporte werden über den Browser heruntergeladen|すべてのコンテンツはこの端末に保存され、エクスポートはブラウザーでダウンロードします|모든 콘텐츠는 이 기기에 보관되며, 내보낸 파일은 브라우저로 다운로드합니다
架构转译自 storytold 的 ArtCraft 矩阵（MIT / Apache-2.0）：共享原子命令、单一文档状态、多入口派生。|架構轉譯自 storytold 的 ArtCraft 矩陣（MIT / Apache-2.0）：共用原子命令、單一文件狀態、多入口衍生。|Architecture adapted from storytold’s ArtCraft matrix (MIT / Apache-2.0): shared atomic commands, a single document state, and multiple entry points built on it.|Arquitectura adaptada de la matriz ArtCraft de storytold (MIT / Apache-2.0): comandos atómicos compartidos, un único estado de documento y varios puntos de entrada basados en él.|Architecture adaptée de la matrice ArtCraft de storytold (MIT / Apache-2.0) : commandes atomiques partagées, état de document unique et plusieurs points d’entrée qui en découlent.|Die Architektur basiert auf der ArtCraft-Matrix von storytold (MIT / Apache-2.0): gemeinsame atomare Befehle, ein einziger Dokumentzustand und mehrere darauf aufbauende Einstiegspunkte.|storytold の ArtCraft マトリクス（MIT / Apache-2.0）を基にしたアーキテクチャ：共有アトミックコマンド、単一のドキュメント状態、それを基にした複数の入口。|storytold의 ArtCraft 매트릭스(MIT / Apache-2.0)를 바탕으로 한 아키텍처: 공유 원자 명령, 단일 문서 상태, 이를 기반으로 하는 여러 진입점.
本实现是零依赖的轻量版本，不包含上游的 Rust 渲染器或 AI 模型调用。|此實作為零相依套件的輕量版本，不包含上游的 Rust 算繪器或 AI 模型呼叫。|This is a lightweight, dependency-free implementation. It does not include the upstream Rust renderer or AI model calls.|Esta es una implementación ligera y sin dependencias. No incluye el renderizador Rust ni las llamadas a modelos de IA del proyecto original.|Cette implémentation légère est sans dépendances. Elle n’inclut ni le moteur de rendu Rust ni les appels aux modèles d’IA du projet d’origine.|Dies ist eine schlanke Implementierung ohne Abhängigkeiten. Der Rust-Renderer und die KI-Modellaufrufe des Ursprungsprojekts sind nicht enthalten.|この実装は依存ライブラリのない軽量版です。元プロジェクトの Rust レンダラーや AI モデルの呼び出しは含まれていません。|이 구현은 의존성이 없는 경량 버전이며, 원본 프로젝트의 Rust 렌더러나 AI 모델 호출은 포함하지 않습니다.`.split('\n').map(line => line.split('|'));

// Match the complete settings messages, preserving formatted counts and sizes.
export const templates = `收件箱 {0} 个文件 · 发件箱 {1} 个文件。上传走 此电脑 → 上传，下载走 此电脑 → 下载。|收件匣 {0} 個檔案 · 寄件匣 {1} 個檔案。上傳請至 本機 → 上傳，下載請至 本機 → 下載。|Inbox: {0} files · Outbox: {1} files. To upload, go to This PC → Upload; to download, go to This PC → Download.|Bandeja de entrada: {0} archivos · Bandeja de salida: {1} archivos. Para subir, ve a Este equipo → Subir; para descargar, ve a Este equipo → Descargar.|Boîte de réception : {0} fichiers · Boîte d’envoi : {1} fichiers. Pour importer, ouvrez Ce PC → Importer ; pour télécharger, ouvrez Ce PC → Télécharger.|Posteingang: {0} Dateien · Postausgang: {1} Dateien. Zum Hochladen: Dieser PC → Hochladen; zum Herunterladen: Dieser PC → Herunterladen.|受信箱：{0} ファイル · 送信箱：{1} ファイル。アップロードは この PC → アップロード、ダウンロードは この PC → ダウンロード から行えます。|받은 편지함: 파일 {0}개 · 보낸 편지함: 파일 {1}개. 업로드는 내 PC → 업로드, 다운로드는 내 PC → 다운로드에서 할 수 있습니다.
NexlOS 占用 {0} · {1} 个文件|NexlOS 佔用 {0} · {1} 個檔案|NexlOS uses {0} · {1} files|NexlOS ocupa {0} · {1} archivos|NexlOS occupe {0} · {1} fichiers|NexlOS belegt {0} · {1} Dateien|NexlOS 使用量 {0} · {1} ファイル|NexlOS 사용량 {0} · 파일 {1}개`.split('\n').map(line => line.split('|'));

rows.push(
  ['松开即上传到当前文件夹', '放開即上傳至目前資料夾', 'Release to upload to this folder', 'Suelta para subir a esta carpeta', 'Relâchez pour importer dans ce dossier', 'Loslassen, um in diesen Ordner hochzuladen', '離すと現在のフォルダーにアップロードします', '놓으면 현재 폴더에 업로드합니다'],
  ['打开汇报', '開啟報告', 'Open report', 'Abrir informe', 'Ouvrir le rapport', 'Bericht öffnen', 'レポートを開く', '보고서 열기']
);
rows.push(
  ['关闭桌面…', '關閉桌面…', 'Shut Down…', 'Apagar…', 'Arrêter…', 'Herunterfahren…', 'デスクトップの終了…', '종료…'],
  ['关闭 Windos2026', '關閉 Windos2026', 'Shut Down Windos2026', 'Apagar Windos2026', 'Arrêter Windos2026', 'Windos2026 herunterfahren', 'Windos2026 の終了', 'Windos2026 종료'],
  ['你希望桌面执行什么操作？', '你希望桌面執行什麼操作？', 'What would you like the desktop to do?', '¿Qué quieres que haga el escritorio?', 'Que souhaitez-vous faire ?', 'Was soll der Desktop tun?', 'デスクトップで何を行いますか？', '데스크톱에서 어떤 작업을 하시겠습니까?'],
  ['重新启动桌面', '重新啟動桌面', 'Restart desktop', 'Reiniciar el escritorio', 'Redémarrer le bureau', 'Desktop neu starten', 'デスクトップを再起動', '데스크톱 다시 시작'],
  ['关闭桌面', '關閉桌面', 'Shut down desktop', 'Apagar el escritorio', 'Fermer le bureau', 'Desktop schließen', 'デスクトップを終了', '데스크톱 종료'],
  ['桌面已关闭', '桌面已關閉', 'Desktop shut down', 'Escritorio apagado', 'Bureau fermé', 'Desktop geschlossen', 'デスクトップは終了しました', '데스크톱이 종료되었습니다'],
  ['现在可以安全关闭此窗口。', '現在可以安全關閉此視窗。', 'It is now safe to close this window.', 'Ya puedes cerrar esta ventana.', 'Vous pouvez maintenant fermer cette fenêtre.', 'Sie können dieses Fenster jetzt schließen.', 'このウィンドウを閉じることができます。', '이제 이 창을 닫아도 됩니다.'],
  ['重播开机画面与音效', '重播開機畫面與音效', 'Replay startup screen and sound', 'Repetir la pantalla y el sonido de inicio', 'Rejouer l’écran et le son de démarrage', 'Startbildschirm und Startklang wiederholen', '起動画面とサウンドを再生', '시작 화면 및 사운드 다시 재생']
);
rows.push(
  ['排列图标', '排列圖示', 'Arrange Icons', 'Organizar iconos', 'Réorganiser les icônes', 'Symbole anordnen', 'アイコンの整列', '아이콘 정렬'],
  ['按名称', '依名稱', 'By Name', 'Por nombre', 'Par nom', 'Nach Name', '名前順', '이름순'],
  ['按类型', '依類型', 'By Type', 'Por tipo', 'Par type', 'Nach Typ', '種類順', '유형순'],
  ['自动排列', '自動排列', 'Auto Arrange', 'Organización automática', 'Réorganisation automatique', 'Automatisch anordnen', '自動整列', '자동 정렬'],
  ['对齐图标', '對齊圖示', 'Line Up Icons', 'Alinear iconos', 'Aligner les icônes', 'Symbole ausrichten', 'アイコンを等間隔に整列', '아이콘 맞춤'],
  ['粘贴快捷方式', '貼上捷徑', 'Paste Shortcut', 'Pegar acceso directo', 'Coller le raccourci', 'Verknüpfung einfügen', 'ショートカットの貼り付け', '바로 가기 붙여넣기'],
  ['文件夹…', '資料夾…', 'Folder…', 'Carpeta…', 'Dossier…', 'Ordner…', 'フォルダー…', '폴더…'],
  ['文本文档…', '文字文件…', 'Text Document…', 'Documento de texto…', 'Document texte…', 'Textdokument…', 'テキスト文書…', '텍스트 문서…'],
  ['移动', '移動', 'Move', 'Mover', 'Déplacer', 'Verschieben', '移動', '이동'],
  ['新建文本文档.txt', '新增文字文件.txt', 'New Text Document.txt', 'Nuevo documento de texto.txt', 'Nouveau document texte.txt', 'Neues Textdokument.txt', '新しいテキスト文書.txt', '새 텍스트 문서.txt'],
  ['名称包含不支持的字符', '名稱包含不支援的字元', 'The name contains unsupported characters', 'El nombre contiene caracteres no admitidos', 'Le nom contient des caractères non pris en charge', 'Der Name enthält nicht unterstützte Zeichen', '名前に使用できない文字が含まれています', '이름에 지원되지 않는 문자가 포함되어 있습니다'],
  ['已创建', '已建立', 'Created', 'Creado', 'Créé', 'Erstellt', '作成しました', '생성됨']
);
rows.push(['主输出', '主輸出', 'Master output', 'Salida principal', 'Sortie principale', 'Master-Ausgang', 'マスター出力', '마스터 출력']);
rows.push(['无画面 · 把素材放到 V1', '無畫面 · 將素材放到 V1', 'No picture · Add media to V1', 'Sin imagen · Añade contenido a V1', 'Aucune image · Ajoutez un média sur V1', 'Kein Bild · Medien auf V1 ablegen', '映像なし · V1 に素材を追加', '화면 없음 · V1에 미디어 추가']);
rows.push(
  ['声音…', '音效…', 'Sounds…', 'Sonidos…', 'Sons…', 'Sounds…', 'サウンド…', '소리…'],
  ['声音设置', '音效設定', 'Sound settings', 'Configuración de sonido', 'Paramètres audio', 'Soundeinstellungen', 'サウンド設定', '소리 설정']
);
rows.push(
  ['next-link · 复古未来操作系统', 'next-link · 復古未來作業系統', 'next-link · Retro-futuristic operating system', 'next-link · Sistema operativo retrofuturista', 'next-link · Système d’exploitation rétrofuturiste', 'next-link · Retrofuturistisches Betriebssystem', 'next-link · レトロフューチャーのオペレーティングシステム', 'next-link · 레트로 퓨처 운영체제'],
  ['下一代互动关系接口', '下一代互動關係介面', 'Next-generation interface for interactive relationships', 'Interfaz de nueva generación para relaciones interactivas', 'Interface de nouvelle génération pour les relations interactives', 'Schnittstelle der nächsten Generation für interaktive Beziehungen', '次世代のインタラクティブな関係性インターフェース', '차세대 상호작용 관계 인터페이스']
);
