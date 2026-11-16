// ArtCraft 编辑套件补齐：WordCraft / GridCraft / 分析工作台，以及位图、影音、矢量三条产线
// 里由「模板串 + 变量」拼出来的状态行与提示。
// 词条只登记最终会落到 DOM 文本节点上的字符串；源码里仅用于拼接的前后缀
// （例如 "· 合计"、"页，共"）不单独登记，改为按真实拼接结果写成模板。
// 技术术语统一：图层=layer、画板=artboard、时间轴=timeline、关键帧=keyframe、
// 混音=mix、蒙版=mask、矢量=vector、栅格=bitmap。
// 示例数据里的品牌名、文件名与代码标识符（WordCraft、The Open Studio Handbook、
// psd/fla/dwg、sub_401000 等）保持原样。

export const rows = [
  // WordCraft（docs.js）
  ["还没有标题。", "還沒有標題。", "No headings yet.", "Aún no hay títulos.", "Aucun titre pour l'instant.", "Noch keine Überschriften.", "見出しはまだありません。", "아직 제목이 없습니다."],
  ["当前浏览器不支持该命令", "目前瀏覽器不支援該指令", "This command is not supported in this browser", "Este navegador no admite este comando", "Cette commande n'est pas prise en charge par ce navigateur", "Dieser Browser unterstützt diesen Befehl nicht", "このブラウザーではこのコマンドを使用できません", "이 브라우저에서는 이 명령을 지원하지 않습니다"],
  ["分页", "分頁", "Page break", "Salto de página", "Saut de page", "Seitenumbruch", "改ページ", "페이지 나누기"],
  ["链接", "連結", "Link", "Enlace", "Lien", "Link", "リンク", "링크"],
  ["链接地址", "連結位址", "Link address", "Dirección del enlace", "Adresse du lien", "Link-Adresse", "リンク先", "링크 주소"],
  ["页面设置", "頁面設定", "Page setup", "Configuración de página", "Mise en page", "Seiteneinrichtung", "ページ設定", "페이지 설정"],
  ["常规边距", "標準邊界", "Normal margins", "Márgenes normales", "Marges normales", "Normale Ränder", "標準の余白", "보통 여백"],
  ["窄边距", "窄邊界", "Narrow margins", "Márgenes estrechos", "Marges étroites", "Schmale Ränder", "狭い余白", "좁은 여백"],
  ["宽边距", "寬邊界", "Wide margins", "Márgenes anchos", "Marges larges", "Breite Ränder", "広い余白", "넓은 여백"],
  ["横向", "橫向", "Landscape", "Apaisado", "Paysage", "Querformat", "横", "가로"],
  ["纵向", "縱向", "Portrait", "Vertical", "Portrait", "Hochformat", "縦", "세로"],
  ["校对", "校對", "Proofing", "Revisión", "Vérification", "Korrektur", "文章校正", "교정"],
  ["字数统计", "字數統計", "Word count", "Recuento de palabras", "Statistiques de mots", "Wortzahl", "文字数", "단어 수"],
  ["页边距已更新", "頁邊距已更新", "Margins updated", "Márgenes actualizados", "Marges mises à jour", "Ränder aktualisiert", "余白を更新しました", "여백이 업데이트되었습니다"],
  ["替换正文 {text}", "取代內文 {text}", "Replace body with {text}", "Reemplazar el cuerpo por {text}", "Remplacer le corps par {text}", "Text ersetzen: {text}", "本文を {text} に置き換え", "본문을 {text}(으)로 바꾸기"],
  ["保存文档到本机", "儲存文件到本機", "Save document to this device", "Guardar el documento en este equipo", "Enregistrer le document sur cet appareil", "Dokument auf diesem Gerät speichern", "文書をこの端末に保存", "문서를 이 기기에 저장"],
  ["返回 {pages, page, words}", "傳回 {pages, page, words}", "Returns {pages, page, words}", "Devuelve {pages, page, words}", "Renvoie {pages, page, words}", "Liefert {pages, page, words}", "{pages, page, words} を返す", "{pages, page, words} 반환"],

  // GridCraft（docs.js）
  ["点单元格输入；=SUM(A1:A3) 立即计算", "點儲存格輸入；=SUM(A1:A3) 立即計算", "Click a cell and type; =SUM(A1:A3) calculates instantly", "Haz clic en una celda y escribe; =SUM(A1:A3) calcula al instante", "Cliquez sur une cellule et saisissez ; =SUM(A1:A3) calcule aussitôt", "Zelle anklicken und tippen; =SUM(A1:A3) rechnet sofort", "セルをクリックして入力。=SUM(A1:A3) は即座に計算します", "셀을 클릭해 입력하세요. =SUM(A1:A3)는 즉시 계산됩니다"],
  ["季度销售", "季度銷售", "Quarterly sales", "Ventas trimestrales", "Ventes trimestrielles", "Quartalsumsatz", "四半期売上", "분기 매출"],
  ["区域", "區域", "Region", "Región", "Région", "Region", "地域", "지역"],
  ["合计", "合計", "Total", "Total", "Total", "Summe", "合計", "합계"],
  ["北区", "北區", "North", "Norte", "Nord", "Nord", "北区", "북부"],
  ["南区", "南區", "South", "Sur", "Sud", "Süd", "南区", "남부"],
  ["东区", "東區", "East", "Este", "Est", "Ost", "東区", "동부"],
  ["西区", "西區", "West", "Oeste", "Ouest", "West", "西区", "서부"],
  ["中区", "中區", "Central", "Centro", "Centre", "Mitte", "中区", "중부"],
  ["单个工作表", "單一工作表", "Single sheet", "Hoja única", "Feuille unique", "Einzelnes Blatt", "単一シート", "단일 시트"],
  ["按区域销售额", "依區域銷售額", "Sales by region", "Ventas por región", "Ventes par région", "Umsatz nach Region", "地域別売上", "지역별 매출"],
  ["已插入柱状图", "已插入柱狀圖", "Column chart inserted", "Gráfico de columnas insertado", "Histogramme inséré", "Säulendiagramm eingefügt", "縦棒グラフを挿入しました", "세로 막대형 차트 삽입됨"],
  ["图表已隐藏", "圖表已隱藏", "Chart hidden", "Gráfico oculto", "Graphique masqué", "Diagramm ausgeblendet", "グラフを非表示にしました", "차트 숨김"],
  ["粘贴：用 ⌘V", "貼上：用 ⌘V", "Paste: press ⌘V", "Pegar: pulsa ⌘V", "Coller : appuyez sur ⌘V", "Einfügen: ⌘V drücken", "貼り付け：⌘V", "붙여넣기: ⌘V"],
  ["加粗由单元格样式控制", "粗體由儲存格樣式控制", "Bold is controlled by the cell style", "La negrita la controla el estilo de celda", "Le gras est géré par le style de cellule", "Fett wird vom Zellstil gesteuert", "太字はセル スタイルで制御します", "굵게는 셀 스타일로 제어됩니다"],
  ["斜体由单元格样式控制", "斜體由儲存格樣式控制", "Italic is controlled by the cell style", "La cursiva la controla el estilo de celda", "L'italique est géré par le style de cellule", "Kursiv wird vom Zellstil gesteuert", "斜体はセル スタイルで制御します", "기울임은 셀 스타일로 제어됩니다"],
  ["下划线由单元格样式控制", "底線由儲存格樣式控制", "Underline is controlled by the cell style", "El subrayado lo controla el estilo de celda", "Le soulignement est géré par le style de cellule", "Unterstreichung wird vom Zellstil gesteuert", "下線はセル スタイルで制御します", "밑줄은 셀 스타일로 제어됩니다"],
  ["图表", "圖表", "Chart", "Gráfico", "Graphique", "Diagramm", "グラフ", "차트"],
  ["柱状图", "柱狀圖", "Column chart", "Gráfico de columnas", "Histogramme", "Säulendiagramm", "縦棒グラフ", "세로 막대형 차트"],
  ["数据表", "資料表", "Data table", "Tabla de datos", "Tableau de données", "Datentabelle", "データテーブル", "데이터 표"],
  ["函数库", "函式庫", "Function library", "Biblioteca de funciones", "Bibliothèque de fonctions", "Funktionsbibliothek", "関数ライブラリ", "함수 라이브러리"],
  ["支持 SUM / AVERAGE / MIN / MAX / COUNT 与加减乘除", "支援 SUM / AVERAGE / MIN / MAX / COUNT 與加減乘除", "Supports SUM / AVERAGE / MIN / MAX / COUNT and + − × ÷", "Admiten SUM / AVERAGE / MIN / MAX / COUNT y + − × ÷", "Prennent en charge SUM / AVERAGE / MIN / MAX / COUNT et + − × ÷", "Unterstützen SUM / AVERAGE / MIN / MAX / COUNT sowie + − × ÷", "SUM / AVERAGE / MIN / MAX / COUNT と四則演算に対応", "SUM / AVERAGE / MIN / MAX / COUNT 및 사칙연산 지원"],
  ["设置单元格 {ref} {value}", "設定儲存格 {ref} {value}", "Set cell {ref} to {value}", "Establecer la celda {ref} en {value}", "Définir la cellule {ref} sur {value}", "Zelle {ref} auf {value} setzen", "セル {ref} を {value} に設定", "셀 {ref}을(를) {value}(으)로 설정"],
  ["保存工作表到本机", "儲存工作表到本機", "Save sheet to this device", "Guardar la hoja en este equipo", "Enregistrer la feuille sur cet appareil", "Blatt auf diesem Gerät speichern", "シートをこの端末に保存", "시트를 이 기기에 저장"],

  // 分析工作台（docs.js）
  ["粘贴 hex 或上传文件；右侧记录证据", "貼上 hex 或上傳檔案；右側記錄證據", "Paste hex or upload a file; evidence is logged on the right", "Pega hexadecimal o sube un archivo; las pruebas se registran a la derecha", "Collez de l'hexadécimal ou importez un fichier ; les preuves s'affichent à droite", "Hex einfügen oder Datei hochladen; Nachweise erscheinen rechts", "hex を貼り付けるかファイルをアップロード。証拠は右側に記録されます", "hex를 붙여 넣거나 파일을 업로드하세요. 증거는 오른쪽에 기록됩니다"],
  ["// 没有输入。粘贴十六进制或上传二进制文件。", "// 沒有輸入。貼上十六進位或上傳二進位檔案。", "// No input. Paste hex or upload a binary file.", "// Sin entrada. Pega hexadecimal o sube un archivo binario.", "// Aucune entrée. Collez de l'hexadécimal ou importez un binaire.", "// Keine Eingabe. Hex einfügen oder Binärdatei hochladen.", "// 入力がありません。16 進数を貼り付けるかバイナリをアップロードしてください。", "// 입력이 없습니다. 16진수를 붙여 넣거나 바이너리를 업로드하세요."],

  // 位图产线的变换模式只有三档，直接按整句登记，比通用模板读起来更自然
  ["变换模式：移动", "變換模式：移動", "Transform mode: Move", "Modo de transformación: Mover", "Mode de transformation : Déplacer", "Transformationsmodus: Verschieben", "変形モード：移動", "변형 모드: 이동"],
  ["变换模式：旋转", "變換模式：旋轉", "Transform mode: Rotate", "Modo de transformación: Girar", "Mode de transformation : Rotation", "Transformationsmodus: Drehen", "変形モード：回転", "변형 모드: 회전"],
  ["变换模式：缩放", "變換模式：縮放", "Transform mode: Scale", "Modo de transformación: Escalar", "Mode de transformation : Mise à l'échelle", "Transformationsmodus: Skalieren", "変形モード：拡大縮小", "변형 모드: 크기 조절"],

  // 影音／矢量产线里被拼进状态行的固定前缀（"WAV 已导出" 已由 art-vector-time-extra.js 登记）
  ["工程已打开", "工程已開啟", "Project opened", "Proyecto abierto", "Projet ouvert", "Projekt geöffnet", "プロジェクトを開きました", "프로젝트 열림"],
  ["点击继续，Esc 退出", "點擊繼續，Esc 退出", "Click to continue, Esc to exit", "Haz clic para continuar, Esc para salir", "Cliquez pour continuer, Échap pour quitter", "Klicken zum Fortfahren, Esc zum Beenden", "クリックで続行、Esc で終了", "클릭하여 계속, Esc로 종료"],
];

export const templates = [
  // WordCraft 视野缩放
  ["显示比例 {0}", "顯示比例 {0}", "Zoom {0}", "Zoom {0}", "Zoom {0}", "Zoom {0}", "表示倍率 {0}", "확대/縮小 {0}"],

  // 工作台载入状态："已载入 X · N 字节" 拆段后是 "已载入 X" 与 "N 字节"，
  // 不带文件名的 "已载入 N 字节" 需要单独一条，否则会退化成 "已载入 N bytes"。
  ["已载入 {0}", "已載入 {0}", "Loaded {0}", "Cargado {0}", "Chargé {0}", "Geladen {0}", "{0} を読み込みました", "{0} 불러옴"],
  ["已载入 {0} 字节", "已載入 {0} 位元組", "Loaded {0} bytes", "Cargados {0} bytes", "Chargé {0} octets", "{0} Bytes geladen", "{0} バイトを読み込みました", "{0}바이트 불러옴"],

  // 位图产线
  ["已取色 {0}", "已取色 {0}", "Picked {0}", "Color tomado {0}", "Couleur prélevée : {0}", "Farbe aufgenommen: {0}", "{0} を取得", "{0} 색상 추출됨"],
  ["画幅 {0}", "畫幅 {0}", "Aspect {0}", "Formato {0}", "Format {0}", "Format {0}", "アスペクト {0}", "화면 비율 {0}"],
  ["已选 {0}", "已選 {0}", "Selected {0}", "Seleccionado {0}", "Sélection : {0}", "Ausgewählt: {0}", "{0} を選択中", "{0} 선택됨"],
  ["已生成 {0} 张", "已產生 {0} 張", "Generated {0}", "{0} generados", "{0} générés", "{0} erzeugt", "{0} 枚生成しました", "{0}장 생성됨"],
  ["{0} 帧", "{0} 幀", "{0} frames", "{0} fotogramas", "{0} images", "{0} Frames", "{0} フレーム", "{0}프레임"],
  ["已添加节点：{0}", "已新增節點：{0}", "Added node: {0}", "Nodo añadido: {0}", "Nœud ajouté : {0}", "Knoten hinzugefügt: {0}", "ノードを追加しました：{0}", "노드 추가됨: {0}", "ui"],

  // 影音产线
  ["已插入 {0} 到 {1}", "已插入 {0} 到 {1}", "Inserted {0} into {1}", "Se insertó {0} en {1}", "{0} inséré dans {1}", "{0} in {1} eingefügt", "{0} を {1} に挿入しました", "{0}을(를) {1}에 삽입함"],
  ["精灵表已导出（{0} 帧）", "精靈表已匯出（{0} 幀）", "Sprite sheet exported ({0} frames)", "Hoja de sprites exportada ({0} fotogramas)", "Feuille de sprites exportée ({0} images)", "Sprite-Sheet exportiert ({0} Frames)", "スプライトシートを書き出しました（{0} フレーム）", "스프라이트 시트 내보냄({0}프레임)"],
  ["峰值 {0}", "峰值 {0}", "Peak {0}", "Pico {0}", "Crête {0}", "Spitze {0}", "ピーク {0}", "피크 {0}"],
  ["{0} 轨", "{0} 軌", "{0} tracks", "{0} pistas", "{0} pistes", "{0} Spuren", "{0} トラック", "트랙 {0}개"],
  ["源监视器：{0}", "來源監視器：{0}", "Source monitor: {0}", "Monitor de origen: {0}", "Moniteur source : {0}", "Quellmonitor: {0}", "ソースモニター：{0}", "소스 모니터: {0}"],
  ["{0} 片段", "{0} 片段", "{0} clips", "{0} clips", "{0} clips", "{0} Clips", "{0} 個のクリップ", "클립 {0}개"],
  ["{0} 张", "{0} 張", "{0} slides", "{0} diapositivas", "{0} diapositives", "{0} Folien", "{0} 枚", "{0}장"],

  // 矢量产线
  ["工具：{0}", "工具：{0}", "Tool: {0}", "Herramienta: {0}", "Outil : {0}", "Werkzeug: {0}", "ツール：{0}", "도구: {0}"],

  // 分析工作台的动态句子：整句登记，避免逐段拼接留下中文
  ["当前区域 {0}", "目前區域 {0}", "Current range {0}", "Rango actual {0}", "Plage actuelle {0}", "Aktueller Bereich {0}", "現在の範囲 {0}", "현재 범위 {0}"],
  ["函数 {0}", "函式 {0}", "Function {0}", "Función {0}", "Fonction {0}", "Funktion {0}", "関数 {0}", "함수 {0}"],
  ["{0}（偏移 0x{1}）", "{0}（偏移 0x{1}）", "{0} (offset 0x{1})", "{0} (desplazamiento 0x{1})", "{0} (offset 0x{1})", "{0} (Offset 0x{1})", "{0}（オフセット 0x{1}）", "{0} (오프셋 0x{1})"],
  ["; 启发式反汇编 · {0}", "; 啟發式反組譯 · {0}", "; Heuristic disassembly · {0}", "; Desensamblado heurístico · {0}", "; Désassemblage heuristique · {0}", "; Heuristische Disassemblierung · {0}", "; ヒューリスティック逆アセンブル · {0}", "; 휴리스틱 디스어셈블 · {0}"],
  ["在字节偏移 0x{0} 附近有 URL 字符串；它出现在函数 {1} 的尾部。启发式判断：该函数可能负责更新检查。", "在位元組偏移 0x{0} 附近有 URL 字串；它出現在函式 {1} 的尾部。啟發式判斷：該函式可能負責更新檢查。", "There is a URL string near byte offset 0x{0}; it appears at the end of function {1}. Heuristic call: this function may handle update checks.", "Hay una cadena URL cerca del desplazamiento de byte 0x{0}; aparece al final de la función {1}. Deducción heurística: esta función podría gestionar la comprobación de actualizaciones.", "Une chaîne URL se trouve près de l'offset d'octet 0x{0} ; elle apparaît à la fin de la fonction {1}. Déduction heuristique : cette fonction gère peut-être les mises à jour.", "Nahe Byte-Offset 0x{0} befindet sich eine URL-Zeichenkette; sie erscheint am Ende von Funktion {1}. Heuristische Annahme: Diese Funktion prüft möglicherweise auf Updates.", "バイトオフセット 0x{0} 付近に URL 文字列があります。関数 {1} の末尾に現れます。ヒューリスティック判断：この関数は更新確認を担う可能性があります。", "바이트 오프셋 0x{0} 근처에 URL 문자열이 있습니다. 함수 {1}의 끝부분에 나타납니다. 휴리스틱 판단: 이 함수가 업데이트 확인을 담당할 수 있습니다."],
  ["共切出 {0} 个入口候选，首个为 {1}。真实边界需要解析可执行文件头与符号表。", "共切出 {0} 個入口候選，首個為 {1}。真實邊界需要解析可執行檔頭與符號表。", "Found {0} entry-point candidates; the first is {1}. Real boundaries require parsing the executable header and symbol table.", "Se extrajeron {0} candidatos a punto de entrada; el primero es {1}. Los límites reales requieren analizar la cabecera del ejecutable y la tabla de símbolos.", "{0} candidats comme points d'entrée ; le premier est {1}. Les vraies limites exigent d'analyser l'en-tête de l'exécutable et la table des symboles.", "{0} Einstiegspunkt-Kandidaten gefunden; der erste ist {1}. Echte Grenzen erfordern das Parsen von Executable-Header und Symboltabelle.", "入口候補を {0} 個切り出しました。最初は {1} です。実際の境界には実行ファイルヘッダーとシンボルテーブルの解析が必要です。", "진입점 후보 {0}개를 찾았습니다. 첫 번째는 {1}입니다. 실제 경계는 실행 파일 헤더와 심볼 테이블을 분석해야 합니다."],
  ["{0} @ {1} 占 {2} 字节；在 Hex 视图可看到它的原始字节，在 Pseudo-C 视图可看到按字节生成的语句。", "{0} @ {1} 佔 {2} 位元組；在 Hex 視圖可看到它的原始位元組，在 Pseudo-C 視圖可看到按位元組產生的語句。", "{0} @ {1} takes up {2} bytes; the Hex view shows its raw bytes, and the Pseudo-C view shows statements generated byte by byte.", "{0} @ {1} ocupa {2} bytes; la vista Hex muestra sus bytes sin procesar y la vista Pseudo-C las sentencias generadas byte a byte.", "{0} @ {1} occupe {2} octets ; la vue Hex montre les octets bruts et la vue Pseudo-C les instructions générées octet par octet.", "{0} @ {1} belegt {2} Bytes; die Hex-Ansicht zeigt die Rohbytes, die Pseudo-C-Ansicht die byteweise erzeugten Anweisungen.", "{0} @ {1} は {2} バイトを占めます。Hex ビューでは生のバイト、Pseudo-C ビューではバイト単位で生成した文を確認できます。", "{0} @ {1}은(는) {2}바이트를 차지합니다. Hex 보기에서는 원시 바이트를, Pseudo-C 보기에서는 바이트 단위로 생성한 문장을 볼 수 있습니다."],
];
