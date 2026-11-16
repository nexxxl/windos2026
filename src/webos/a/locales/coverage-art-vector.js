// ArtCraft vector, CAD, print layout, mobile design and deck demos.
// Pipe table: zh-CN|zh-TW|en|es|fr|de|ja|ko
const RAW = `矢量|向量|Vector|Vector|Vectoriel|Vektor|ベクター|벡터
矩形、椭圆、自由笔与文字，拖动排列，导出 SVG / PNG。|矩形、橢圓、自由筆與文字，拖動排列，匯出 SVG / PNG。|Rectangles, ellipses, freehand and text; drag to arrange and export SVG / PNG.|Rectángulos, elipses, mano alzada y texto; arrastra para ordenar y exporta SVG / PNG.|Rectangles, ellipses, main levée et texte ; glissez pour organiser et exportez en SVG / PNG.|Rechtecke, Ellipsen, Freihand und Text; ziehen zum Anordnen, Export als SVG / PNG.|長方形、楕円、フリーハンド、テキスト。ドラッグで配置し、SVG / PNG で書き出せます。|사각형, 타원, 자유 펜, 텍스트. 끌어 배치하고 SVG / PNG로 내보냅니다.
V 选择 · M 矩形 · L 椭圆 · P 钢笔 · T 文字|V 選取 · M 矩形 · L 橢圓 · P 鋼筆 · T 文字|V select · M rectangle · L ellipse · P pen · T text|V seleccionar · M rectángulo · L elipse · P pluma · T texto|V sélection · M rectangle · L ellipse · P plume · T texte|V auswählen · M Rechteck · L Ellipse · P Stift · T Text|V 選択 · M 長方形 · L 楕円 · P ペン · T テキスト|V 선택 · M 사각형 · L 타원 · P 펜 · T 텍스트
未命名-1.ai|未命名-1.ai|Untitled-1.ai|Sin título-1.ai|Sans titre-1.ai|Unbenannt-1.ai|無題-1.ai|제목 없음-1.ai
未命名-1.ai @ 100% (RGB)|未命名-1.ai @ 100% (RGB)|Untitled-1.ai @ 100% (RGB)|Sin título-1.ai @ 100% (RGB)|Sans titre-1.ai @ 100% (RGB)|Unbenannt-1.ai @ 100% (RGB)|無題-1.ai @ 100% (RGB)|제목 없음-1.ai @ 100% (RGB)
单文档工作区|單文件工作區|Single-document workspace|Espacio de un documento|Espace de travail mono-document|Einzeldokument-Arbeitsbereich|単一ドキュメントのワークスペース|단일 문서 작업 공간
选择 V|選取 V|Select V|Seleccionar V|Sélection V|Auswählen V|選択 V|선택 V
直接选择 A|直接選取 A|Direct select A|Selección directa A|Sélection directe A|Direktauswahl A|ダイレクト選択 A|직접 선택 A
形状|形狀|Shape|Forma|Forme|Form|シェイプ|도형
矩形 M|矩形 M|Rectangle M|Rectángulo M|Rectangle M|Rechteck M|長方形 M|사각형 M
椭圆 L|橢圓 L|Ellipse L|Elipse L|Ellipse L|Ellipse L|楕円 L|타원 L
绘制|繪製|Draw|Dibujar|Dessiner|Zeichnen|描画|그리기
钢笔 P|鋼筆 P|Pen P|Pluma P|Plume P|Stift P|ペン P|펜 P
文字 T|文字 T|Text T|Texto T|Texte T|Text T|テキスト T|텍스트 T
置入图片|置入圖片|Place image|Colocar imagen|Placer une image|Bild platzieren|画像を配置|이미지 배치
导出 SVG|匯出 SVG|Export SVG|Exportar SVG|Exporter en SVG|SVG exportieren|SVG を書き出し|SVG 내보내기
置顶|置頂|Bring to front|Traer al frente|Avant-plan|Nach vorne|最前面へ|맨 앞으로
置底|置底|Send to back|Enviar al fondo|Arrière-plan|Nach hinten|最背面へ|맨 뒤로
左对齐|左對齊|Align left|Alinear a la izquierda|Aligner à gauche|Linksbündig|左揃え|왼쪽 정렬
居中|置中|Center|Centrar|Centrer|Zentrieren|中央揃え|가운데 정렬
右对齐|右對齊|Align right|Alinear a la derecha|Aligner à droite|Rechtsbündig|右揃え|오른쪽 정렬
工具：|工具：|Tools: |Herramientas: |Outils : |Werkzeuge: |ツール：|도구: 
 对象 · | 物件 · | objects · | objetos · | objets · | Objekte · | オブジェクト · | 개체 · 
画第一块图形|畫第一塊圖形|Draw your first shape|Dibuja tu primera forma|Dessinez votre première forme|Erste Form zeichnen|最初の図形を描く|첫 도형 그리기
拖出矩形或椭圆，也可以直接写字。选中后底部浮动条可以复制、置顶、对齐。|拖出矩形或橢圓，也可以直接寫字。選取後底部浮動列可以複製、置頂、對齊。|Drag out a rectangle or ellipse, or type directly. Select a shape to copy, bring it forward or align it from the floating bar below.|Arrastra un rectángulo o una elipse, o escribe directamente. Selecciona una forma para copiarla, traerla al frente o alinearla desde la barra inferior.|Tracez un rectangle ou une ellipse, ou saisissez du texte. Sélectionnez une forme pour la copier, la mettre au premier plan ou l'aligner depuis la barre inférieure.|Rechteck oder Ellipse aufziehen oder direkt tippen. Ausgewählte Form unten kopieren, nach vorne holen oder ausrichten.|長方形や楕円をドラッグするか、直接文字を入力します。選択すると下部のフローティングバーでコピー、最前面、整列ができます。|사각형이나 타원을 끌어 그리거나 바로 입력하세요. 선택하면 아래 떠 있는 막대에서 복사, 맨 앞으로, 정렬을 할 수 있습니다.
SVG 已导出|SVG 已匯出|SVG exported|SVG exportado|SVG exporté|SVG exportiert|SVG を書き出しました|SVG 내보냄
图层面板在下方|圖層面板在下方|The layers panel is below|El panel de capas está abajo|Le panneau des calques est en bas|Die Ebenenpalette ist unten|レイヤーパネルは下にあります|레이어 패널은 아래에 있습니다
尺寸|尺寸|Size|Tamaño|Taille|Größe|サイズ|크기
选择对象后显示变换与外观。|選取物件後顯示變換與外觀。|Select an object to see its transform and appearance.|Selecciona un objeto para ver su transformación y apariencia.|Sélectionnez un objet pour voir sa transformation et son apparence.|Objekt auswählen, um Transformation und Aussehen zu sehen.|オブジェクトを選択すると変形と外観が表示されます。|개체를 선택하면 변형과 모양이 표시됩니다.
保存到本机|儲存到本機|Save to this device|Guardar en este equipo|Enregistrer sur cet appareil|Auf diesem Gerät speichern|この端末に保存|이 기기에 저장
置入图片…|置入圖片…|Place image…|Colocar imagen…|Placer une image…|Bild platzieren…|画像を配置…|이미지 배치…
添加文字|新增文字|Add text|Añadir texto|Ajouter du texte|Text hinzufügen|テキストを追加|텍스트 추가
保存画板到本机|儲存畫板到本機|Save artboard to this device|Guardar mesa de trabajo en este equipo|Enregistrer le plan de travail sur cet appareil|Zeichenfläche auf diesem Gerät speichern|アートボードをこの端末に保存|아트보드를 이 기기에 저장
毫米网格、捕捉、直线/圆/矩形与命令行，导出 DXF。|毫米網格、捕捉、直線/圓/矩形與命令列，匯出 DXF。|Millimeter grid, snapping, line/circle/rectangle tools and a command line; export DXF.|Cuadrícula milimétrica, ajuste, línea/círculo/rectángulo y línea de comandos; exporta DXF.|Grille millimétrique, accrochage, ligne/cercle/rectangle et ligne de commande ; export DXF.|Millimeterraster, Einrasten, Linie/Kreis/Rechteck und Befehlszeile; DXF exportieren.|ミリ格子、スナップ、直線／円／長方形、コマンドライン。DXF で書き出せます。|밀리미터 격자, 스냅, 선/원/사각형, 명령줄. DXF로 내보냅니다.
命令行输入 LINE / CIRCLE / RECT，回车执行|命令列輸入 LINE / CIRCLE / RECT，按 Enter 執行|Type LINE / CIRCLE / RECT in the command line, then press Enter|Escribe LINE / CIRCLE / RECT en la línea de comandos y pulsa Intro|Saisissez LINE / CIRCLE / RECT puis appuyez sur Entrée|LINE / CIRCLE / RECT in die Befehlszeile eingeben und Enter drücken|コマンドラインに LINE / CIRCLE / RECT を入力して Enter|명령줄에 LINE / CIRCLE / RECT를 입력하고 Enter
2D 线框|2D 線框|2D wireframe|Armazón 2D|Fil de fer 2D|2D-Drahtgitter|2D ワイヤーフレーム|2D 와이어프레임
绘图|繪圖|Draw|Dibujo|Dessin|Zeichnen|作図|그리기
多段线|多段線|Polyline|Polilínea|Polyligne|Polylinie|ポリライン|폴리라인
圆弧|圓弧|Arc|Arco|Arc|Bogen|円弧|호
修改|修改|Modify|Modificar|Modifier|Ändern|修正|수정
偏移|偏移|Offset|Desfase|Décalage|Versatz|オフセット|오프셋
注释|註釋|Annotate|Anotar|Annoter|Beschriften|注釈|주석
线性标注|線性標註|Linear dimension|Cota lineal|Cote linéaire|Linearbemaßung|直線寸法|선형 치수
引线|引線|Leader|Directriz|Ligne de rappel|Führungslinie|引き出し線|지시선
指定第一点|指定第一點|Specify first point|Indica el primer punto|Spécifiez le premier point|Ersten Punkt angeben|始点を指定|첫 점 지정
指定起点，双击结束|指定起點，按兩下結束|Specify the start point; double-click to finish|Indica el punto inicial; doble clic para terminar|Spécifiez le point de départ ; double-cliquez pour terminer|Startpunkt angeben; Doppelklick zum Beenden|始点を指定し、ダブルクリックで終了|시작점을 지정하고 두 번 클릭해 종료
指定第一个角点|指定第一個角點|Specify the first corner|Indica la primera esquina|Spécifiez le premier coin|Erste Ecke angeben|最初の角を指定|첫 모서리 지정
指定圆心|指定圓心|Specify the center|Indica el centro|Spécifiez le centre|Mittelpunkt angeben|中心を指定|중심 지정
指定标注第一点|指定標註第一點|Specify the first dimension point|Indica el primer punto de cota|Spécifiez le premier point de cote|Ersten Bemaßungspunkt angeben|寸法の始点を指定|치수 첫 점 지정
指定引线起点|指定引線起點|Specify the leader start|Indica el inicio de la directriz|Spécifiez le début de la ligne de rappel|Start der Führungslinie angeben|引き出し線の始点を指定|지시선 시작점 지정
选择要移动的对象|選取要移動的物件|Select objects to move|Selecciona los objetos que mover|Sélectionnez les objets à déplacer|Zu verschiebende Objekte wählen|移動するオブジェクトを選択|이동할 개체 선택
选择要复制的对象|選取要複製的物件|Select objects to copy|Selecciona los objetos que copiar|Sélectionnez les objets à copier|Zu kopierende Objekte wählen|コピーするオブジェクトを選択|복사할 개체 선택
选择要偏移的对象|選取要偏移的物件|Select objects to offset|Selecciona los objetos que desfasar|Sélectionnez les objets à décaler|Zu versetzende Objekte wählen|オフセットするオブジェクトを選択|오프셋할 개체 선택
命令：|指令：|Command: |Comando: |Commande : |Befehl: |コマンド：|명령: 
选择对象|選取物件|Select objects|Seleccionar objetos|Sélectionner des objets|Objekte wählen|オブジェクトを選択|개체 선택
模型 · |模型 · |Model · |Modelo · |Modèle · |Modell · |モデル · |모델 · 
捕捉 5mm|鎖點 5mm|Snap 5mm|Ajuste 5mm|Accrochage 5mm|Einrasten 5 mm|スナップ 5mm|스냅 5mm
自由|自由|Free|Libre|Libre|Frei|フリー|자유
特性|性質|Properties|Propiedades|Propriétés|Eigenschaften|プロパティ|특성
几何|幾何|Geometry|Geometría|Géométrie|Geometrie|ジオメトリ|형상
未选择对象。|未選取物件。|No objects selected.|Ningún objeto seleccionado.|Aucun objet sélectionné.|Keine Objekte ausgewählt.|オブジェクトが選択されていません。|선택된 개체가 없습니다.
输入命令|輸入指令|Enter command|Introduce un comando|Saisir une commande|Befehl eingeben|コマンドを入力|명령 입력
栅格|格線|Grid|Cuadrícula|Grille|Raster|グリッド|격자
捕捉|鎖點|Snap|Ajuste|Accrochage|Einrasten|スナップ|스냅
正交|正交|Ortho|Ortogonal|Ortho|Ortho|直交|직교
对象捕捉|物件鎖點|Object snap|Ajuste a objetos|Accrochage objet|Objektfang|オブジェクトスナップ|개체 스냅
缩放到范围|縮放至範圍|Zoom to extents|Zoom a extensión|Zoom sur l'étendue|Auf Grenzen zoomen|範囲にズーム|범위에 맞추기
DXF 已导出|DXF 已匯出|DXF exported|DXF exportado|DXF exporté|DXF exportiert|DXF を書き出しました|DXF 내보냄
导出 DXF|匯出 DXF|Export DXF|Exportar DXF|Exporter en DXF|DXF exportieren|DXF を書き出し|DXF 내보내기
删除所选|刪除所選|Delete selection|Eliminar selección|Supprimer la sélection|Auswahl löschen|選択を削除|선택 삭제
画一条示例直线|畫一條範例直線|Draw a sample line|Dibujar una línea de ejemplo|Tracer une ligne d'exemple|Beispiellinie zeichnen|サンプルの直線を描く|예제 선 그리기
画一个半径 60mm 的圆|畫一個半徑 60mm 的圓|Draw a circle with a 60 mm radius|Dibujar un círculo de 60 mm de radio|Tracer un cercle de 60 mm de rayon|Kreis mit 60 mm Radius zeichnen|半径 60mm の円を描く|반지름 60mm 원 그리기
添加一段 200mm 线性标注|新增一段 200mm 線性標註|Add a 200 mm linear dimension|Añadir una cota lineal de 200 mm|Ajouter une cote linéaire de 200 mm|200-mm-Linearbemaßung hinzufügen|200mm の直線寸法を追加|200mm 선형 치수 추가
保存图纸到本机|儲存圖紙到本機|Save drawing to this device|Guardar plano en este equipo|Enregistrer le dessin sur cet appareil|Zeichnung auf diesem Gerät speichern|図面をこの端末に保存|도면을 이 기기에 저장
版面|版面|Layout|Maquetación|Mise en page|Layout|レイアウト|레이아웃
对开页、页边距与分栏参考线，文字与图形排版后导出 PNG。|對開頁、頁邊距與分欄參考線，文字與圖形排版後匯出 PNG。|Facing pages, margins and column guides; arrange text and shapes, then export PNG.|Páginas enfrentadas, márgenes y guías de columnas; maqueta texto y formas y exporta PNG.|Pages en regard, marges et repères de colonnes ; composez texte et formes puis exportez en PNG.|Doppelseiten, Ränder und Spaltenhilfen; Text und Formen setzen und als PNG exportieren.|見開きページ、余白、段組みガイド。テキストと図形を組んで PNG で書き出します。|양면 페이지, 여백, 단 가이드. 텍스트와 도형을 배치한 뒤 PNG로 내보냅니다.
右侧 Pages 换页；蓝框内拖对象|右側 Pages 換頁；藍框內拖物件|Use Pages on the right to switch pages; drag objects inside the blue frame|Usa Pages a la derecha para cambiar de página; arrastra objetos dentro del marco azul|Utilisez Pages à droite pour changer de page ; glissez les objets dans le cadre bleu|Rechts mit Pages blättern; Objekte im blauen Rahmen ziehen|右側の Pages でページを切り替え、青い枠内でオブジェクトをドラッグします。|오른쪽 Pages로 페이지를 넘기고 파란 프레임 안에서 개체를 끄세요.
印刷|印刷|Print|Impresión|Impression|Druck|印刷|인쇄
封面|封面|Cover|Portada|Couverture|Titel|表紙|표지
内页|內頁|Inside pages|Páginas interiores|Pages intérieures|Innenseiten|本文ページ|내지
抓手|抓手|Hand|Mano|Main|Hand|ハンド|손
填色|填色|Fill|Relleno|Remplissage|Füllung|塗り|채우기
填色：黑|填色：黑|Fill: black|Relleno: negro|Remplissage : noir|Füllung: Schwarz|塗り：黒|채우기: 검정
描边：无|描邊：無|Stroke: none|Trazo: ninguno|Contour : aucun|Kontur: keine|線：なし|획: 없음
在这里输入正文。|在這裡輸入正文。|Type body text here.|Escribe el texto aquí.|Saisissez le texte ici.|Hier den Fließtext eingeben.|ここに本文を入力します。|여기에 본문을 입력하세요.
第 |第 |Page |Página |Page |Seite |第 |페이지 
 页 · | 頁 · |  · |  · |  · |  · | ページ · | 페이지 · 
 对象 · 对开页 2 / 2| 物件 · 對開頁 2 / 2| objects · spread 2 / 2| objetos · pliego 2 / 2| objets · double page 2 / 2| Objekte · Doppelseite 2 / 2| オブジェクト · 見開き 2 / 2| 개체 · 양면 2 / 2
A4 · 210 × 297 mm · 3 栏|A4 · 210 × 297 mm · 3 欄|A4 · 210 × 297 mm · 3 columns|A4 · 210 × 297 mm · 3 columnas|A4 · 210 × 297 mm · 3 colonnes|A4 · 210 × 297 mm · 3 Spalten|A4 · 210 × 297 mm · 3 段|A4 · 210 × 297 mm · 3단
页面面板见下方|頁面面板見下方|The pages panel is below|El panel de páginas está abajo|Le panneau des pages est en bas|Die Seitenpalette ist unten|ページパネルは下にあります|페이지 패널은 아래에 있습니다
图层：文字 / 图形 / 背景|圖層：文字 / 圖形 / 背景|Layers: text / shapes / background|Capas: texto / formas / fondo|Calques : texte / formes / fond|Ebenen: Text / Formen / Hintergrund|レイヤー：テキスト / 図形 / 背景|레이어: 텍스트 / 도형 / 배경
 项| 項| items| elementos| éléments| Elemente| 項目|개 항목
＋ 文本框|＋ 文字框|＋ Text box|＋ Cuadro de texto|＋ Zone de texte|＋ Textfeld|＋ テキストボックス|＋ 텍스트 상자
＋ 图形|＋ 圖形|＋ Shape|＋ Forma|＋ Forme|＋ Form|＋ 図形|＋ 도형
所选对象|所選物件|Selected object|Objeto seleccionado|Objet sélectionné|Ausgewähltes Objekt|選択中のオブジェクト|선택한 개체
添加文本框|新增文字框|Add text box|Añadir cuadro de texto|Ajouter une zone de texte|Textfeld hinzufügen|テキストボックスを追加|텍스트 상자 추가
添加图形|新增圖形|Add shape|Añadir forma|Ajouter une forme|Form hinzufügen|図形を追加|도형 추가
 页| 頁| pages| páginas| pages| Seiten| ページ|페이지
当前页已导出|目前頁已匯出|Current page exported|Página actual exportada|Page actuelle exportée|Aktuelle Seite exportiert|現在のページを書き出しました|현재 페이지 내보냄
导出当前页|匯出目前頁|Export current page|Exportar página actual|Exporter la page actuelle|Aktuelle Seite exportieren|現在のページを書き出し|현재 페이지 내보내기
手机画板、图层树与设计面板，拖拽移动并导出画板 PNG。|手機畫板、圖層樹與設計面板，拖曳移動並匯出畫板 PNG。|Phone artboards, layer tree and design panel; drag to move and export artboards as PNG.|Mesas de móvil, árbol de capas y panel de diseño; arrastra para mover y exporta PNG.|Plans téléphone, arbre de calques et panneau de design ; glissez pour déplacer et exportez en PNG.|Handy-Artboards, Ebenenbaum und Designpanel; ziehen zum Verschieben, Artboards als PNG exportieren.|スマホのアートボード、レイヤーツリー、デザインパネル。ドラッグで移動し、アートボードを PNG で書き出せます。|휴대폰 아트보드, 레이어 트리, 디자인 패널. 끌어 이동하고 아트보드를 PNG로 내보냅니다.
点画板选中；拖元素移动|點畫板選取；拖元素移動|Click an artboard to select it; drag elements to move them|Haz clic en una mesa para seleccionarla; arrastra elementos para moverlos|Cliquez sur un plan pour le sélectionner ; glissez les éléments pour les déplacer|Artboard anklicken zum Auswählen; Elemente zum Verschieben ziehen|アートボードをクリックで選択。要素をドラッグで移動します。|아트보드를 클릭해 선택하고 요소를 끌어 이동하세요.
草稿|草稿|Draft|Borrador|Brouillon|Entwurf|下書き|초안
搜索命令和工具|搜尋指令和工具|Search commands and tools|Buscar comandos y herramientas|Rechercher commandes et outils|Befehle und Werkzeuge suchen|コマンドとツールを検索|명령 및 도구 검색
你好，Maya|你好，Maya|Hello, Maya|Hola, Maya|Bonjour Maya|Hallo Maya|こんにちは、Maya|안녕하세요, Maya
早上好，Maya|早安，Maya|Good morning, Maya|Buenos días, Maya|Bonjour Maya|Guten Morgen, Maya|おはようございます、Maya|좋은 아침이에요, Maya
今天去哪？|今天去哪？|Where to today?|¿Adónde hoy?|Où aller aujourd'hui ?|Wohin heute?|今日はどこへ？|오늘은 어디로?
搜索步道、山峰、湖泊|搜尋步道、山峰、湖泊|Search trails, peaks, lakes|Buscar senderos, picos, lagos|Rechercher sentiers, sommets, lacs|Wege, Gipfel, Seen suchen|トレイル、山、湖を検索|트레일, 봉우리, 호수 검색
附近 · Lake Agnes 茶屋|附近 · Lake Agnes 茶屋|Nearby · Lake Agnes Tea House|Cerca · Lake Agnes Tea House|À proximité · Lake Agnes Tea House|In der Nähe · Lake Agnes Tea House|近く · Lake Agnes ティーハウス|근처 · Lake Agnes 티하우스
开始徒步|開始健行|Start hiking|Empezar a caminar|Commencer la randonnée|Wanderung starten|ハイキング開始|하이킹 시작
缩放 100%|縮放 100%|Zoom 100%|Zoom 100 %|Zoom 100 %|Zoom 100 %|ズーム 100%|확대 100%
缩放 75%|縮放 75%|Zoom 75%|Zoom 75 %|Zoom 75 %|Zoom 75 %|ズーム 75%|확대 75%
设计|設計|Design|Diseño|Design|Design|デザイン|디자인
原型|原型|Prototype|Prototipo|Prototype|Prototyp|プロトタイプ|프로토타입
原型连线在本地不跳转；这里保留交互参数的位置。|原型連線在本機不跳轉；這裡保留互動參數的位置。|Prototype links do not navigate locally; this area holds the interaction parameters.|Los enlaces del prototipo no navegan localmente; aquí se guardan los parámetros de interacción.|Les liens du prototype ne naviguent pas localement ; cet espace garde les paramètres d'interaction.|Prototyp-Links navigieren lokal nicht; hier liegen die Interaktionsparameter.|プロトタイプのリンクはローカルでは遷移しません。ここにインタラクションのパラメータを置いています。|프로토타입 링크는 로컬에서 이동하지 않습니다. 여기에 상호작용 매개변수가 있습니다.
点画板内的元素查看尺寸与填充。|點畫板內的元素查看尺寸與填色。|Click an element in the artboard to see its size and fill.|Haz clic en un elemento de la mesa para ver su tamaño y relleno.|Cliquez sur un élément du plan pour voir sa taille et son remplissage.|Element im Artboard anklicken, um Größe und Füllung zu sehen.|アートボード内の要素をクリックするとサイズと塗りが表示されます。|아트보드 안의 요소를 클릭하면 크기와 채우기가 표시됩니다.
导出画板 PNG|匯出畫板 PNG|Export artboard PNG|Exportar PNG de la mesa|Exporter l'artboard en PNG|Artboard als PNG exportieren|アートボードを PNG で書き出し|아트보드 PNG 내보내기
画板已导出|畫板已匯出|Artboard exported|Mesa exportada|Plan exporté|Artboard exportiert|アートボードを書き出しました|아트보드 내보냄
演示|簡報|Slides|Presentación|Diaporama|Präsentation|スライド|프레젠테이션
浅色功能区的幻灯片编辑器，拖元素、写备注、全屏放映。|淺色功能區的簡報編輯器，拖元素、寫備註、全螢幕放映。|A light-ribbon slide editor: drag elements, write notes and present full screen.|Un editor de diapositivas con cinta clara: arrastra elementos, escribe notas y presenta a pantalla completa.|Un éditeur de diapositives à ruban clair : glissez les éléments, écrivez des notes et projetez en plein écran.|Ein Folieneditor mit heller Leiste: Elemente ziehen, Notizen schreiben, im Vollbild präsentieren.|明るいリボンのスライドエディター。要素をドラッグし、メモを書き、全画面で発表できます。|밝은 리본의 슬라이드 편집기. 요소를 끌고 메모를 쓰고 전체 화면으로 발표합니다.
点幻灯片编辑；拖动元素排版|點簡報編輯；拖動元素排版|Click a slide to edit; drag elements to lay out|Haz clic en una diapositiva para editar; arrastra elementos para maquetar|Cliquez sur une diapositive pour éditer ; glissez les éléments pour composer|Folie anklicken zum Bearbeiten; Elemente zum Anordnen ziehen|スライドをクリックで編集。要素をドラッグしてレイアウトします。|슬라이드를 클릭해 편집하고 요소를 끌어 배치하세요.
未命名演示|未命名簡報|Untitled slides|Presentación sin título|Diaporama sans titre|Unbenannte Präsentation|無題のスライド|제목 없는 프레젠테이션
从太阳到你的天空|從太陽到你的天空|From the Sun to your sky|Del Sol a tu cielo|Du Soleil à votre ciel|Von der Sonne zu deinem Himmel|太陽からあなたの空へ|태양에서 당신의 하늘까지
开场：用一张极光的照片抓住注意力。|開場：用一張極光的照片抓住注意力。|Opening: grab attention with an aurora photo.|Apertura: capta la atención con una foto de aurora.|Ouverture : captez l'attention avec une photo d'aurore.|Einstieg: mit einem Polarlichtfoto Aufmerksamkeit gewinnen.|導入：オーロラの写真で注目を集めます。|오프닝: 오로라 사진으로 시선을 사로잡습니다.
太阳风如何点亮极光|太陽風如何點亮極光|How solar wind lights up the aurora|Cómo el viento solar enciende la aurora|Comment le vent solaire allume l'aurore|Wie Sonnenwind das Polarlicht entzündet|太陽風がオーロラを照らす仕組み|태양풍이 오로라를 밝히는 원리
太阳风|太陽風|Solar wind|Viento solar|Vent solaire|Sonnenwind|太陽風|태양풍
解释太阳风与磁层。|解釋太陽風與磁層。|Explain solar wind and the magnetosphere.|Explica el viento solar y la magnetosfera.|Expliquez le vent solaire et la magnétosphère.|Sonnenwind und Magnetosphäre erklären.|太陽風と磁気圏を説明します。|태양풍과 자기권을 설명합니다.
磁层|磁層|Magnetosphere|Magnetosfera|Magnétosphère|Magnetosphäre|磁気圏|자기권
粒子碰撞|粒子碰撞|Particle collisions|Colisiones de partículas|Collisions de particules|Teilchenkollisionen|粒子衝突|입자 충돌
配色|配色|Palette|Paleta|Palette|Farbpalette|配色|색상
三种配色方案。|三種配色方案。|Three color schemes.|Tres combinaciones de color.|Trois jeux de couleurs.|Drei Farbschemata.|3 つの配色。|세 가지 색상 구성.
光的三原色|光的三原色|Additive primaries|Primarios aditivos|Primaires additives|Additive Grundfarben|光の三原色|빛의 삼원색
工程已保存到本机|工程已儲存到本機|Project saved to this device|Proyecto guardado en este equipo|Projet enregistré sur cet appareil|Projekt auf diesem Gerät gespeichert|プロジェクトをこの端末に保存しました|프로젝트를 이 기기에 저장했습니다
保存失败：存档过大或浏览器禁写|儲存失敗：存檔過大或瀏覽器禁寫|Save failed: the project is too large or the browser blocked writing|Error al guardar: el proyecto es demasiado grande o el navegador bloqueó la escritura|Échec de l'enregistrement : projet trop volumineux ou écriture bloquée|Speichern fehlgeschlagen: Projekt zu groß oder Browser blockiert das Schreiben|保存に失敗：プロジェクトが大きすぎるか、ブラウザが書き込みを禁止しています|저장 실패: 프로젝트가 너무 크거나 브라우저가 쓰기를 차단했습니다
工程保存失败|工程儲存失敗|Project save failed|Error al guardar el proyecto|Échec de l'enregistrement du projet|Projekt speichern fehlgeschlagen|プロジェクトの保存に失敗|프로젝트 저장 실패
工程文件已导出|工程檔案已匯出|Project file exported|Archivo de proyecto exportado|Fichier de projet exporté|Projektdatei exportiert|プロジェクトファイルを書き出しました|프로젝트 파일 내보냄
不是有效的 DeckCraft 工程文件|不是有效的 DeckCraft 工程檔案|Not a valid DeckCraft project file|No es un archivo de proyecto DeckCraft válido|Ce n'est pas un fichier de projet DeckCraft valide|Keine gültige DeckCraft-Projektdatei|有効な DeckCraft プロジェクトファイルではありません|유효한 DeckCraft 프로젝트 파일이 아닙니다
工程已打开 · |工程已開啟 · |Project opened · |Proyecto abierto · |Projet ouvert · |Projekt geöffnet · |プロジェクトを開きました · |프로젝트 열림 · 
 张| 張| slides| diapositivas| diapositives| Folien| 枚|장
单击此处添加备注|按此新增備註|Click to add speaker notes|Haz clic para añadir notas|Cliquez pour ajouter des notes|Klicken, um Notizen hinzuzufügen|クリックしてメモを追加|클릭하여 발표자 노트 추가
幻灯片|簡報|Slide|Diapositiva|Diapositive|Folie|スライド|슬라이드
版式|版面配置|Layout|Diseño|Disposition|Layout|レイアウト|레이아웃
版式：标题和内容|版面配置：標題和內容|Layout: title and content|Diseño: título y contenido|Disposition : titre et contenu|Layout: Titel und Inhalt|レイアウト：タイトルと内容|레이아웃: 제목 및 내용
重设|重設|Reset|Restablecer|Réinitialiser|Zurücksetzen|リセット|재설정
字体|字型|Font|Fuente|Police|Schrift|フォント|글꼴
字号在右侧属性里调整|字級在右側屬性裡調整|Font size is adjusted in the properties on the right|El tamaño de fuente se ajusta en las propiedades de la derecha|La taille de police se règle dans les propriétés à droite|Schriftgröße wird rechts in den Eigenschaften eingestellt|フォントサイズは右側のプロパティで調整します|글꼴 크기는 오른쪽 속성에서 조정합니다
左|左|Left|Izquierda|Gauche|Links|左|왼쪽
中|中|Center|Centro|Centre|Mitte|中央|가운데
右|右|Right|Derecha|Droite|Rechts|右|오른쪽
插入|插入|Insert|Insertar|Insérer|Einfügen|挿入|삽입
文本框|文字框|Text box|Cuadro de texto|Zone de texte|Textfeld|テキストボックス|텍스트 상자
放映|放映|Present|Presentar|Projeter|Präsentieren|発表|발표
纸色|紙色|Paper|Papel|Papier|Papier|紙色|종이색
冷色|冷色|Cool|Frío|Froid|Kühl|寒色|차가운 색
极光|極光|Aurora|Aurora|Aurore|Polarlicht|オーロラ|오로라
日落|日落|Sunset|Atardecer|Coucher de soleil|Sonnenuntergang|夕日|일몰
光晕|光暈|Halo|Halo|Halo|Halo|ハロー|광환
幻灯片放映|簡報放映|Slide show|Presentación|Diaporama|Diashow|スライドショー|슬라이드 쇼
开始放映|開始放映|Start presenting|Empezar presentación|Lancer la projection|Präsentation starten|発表を開始|발표 시작
从头开始|從頭開始|From the beginning|Desde el principio|Depuis le début|Von Anfang an|最初から|처음부터
从当前|從目前|From current|Desde la actual|Depuis l'actuelle|Ab aktueller|現在から|현재부터
 张 · | 張 · |  · |  · |  · |  · | 枚 · |장 · 
 个对象| 個物件| objects| objetos| objets| Objekte| オブジェクト|개 개체
中文（中国）|中文（中國）|Chinese (China)|Chino (China)|Chinois (Chine)|Chinesisch (China)|中国語（中国）|중국어(중국)
新幻灯片|新增簡報|New slide|Nueva diapositiva|Nouvelle diapositive|Neue Folie|新しいスライド|새 슬라이드
双击右侧改文字|按兩下右側改文字|Double-click on the right to edit text|Haz doble clic a la derecha para editar el texto|Double-cliquez à droite pour modifier le texte|Rechts doppelklicken, um Text zu ändern|右側をダブルクリックして文字を編集|오른쪽을 두 번 클릭해 텍스트 편집
先选中一个文本框|先選取一個文字框|Select a text box first|Selecciona primero un cuadro de texto|Sélectionnez d'abord une zone de texte|Zuerst ein Textfeld auswählen|先にテキストボックスを選択してください|먼저 텍스트 상자를 선택하세요
 · 点击继续，Esc 退出| · 點擊繼續，Esc 退出| · click to continue, Esc to exit| · clic para continuar, Esc para salir| · cliquez pour continuer, Échap pour quitter| · Klick zum Fortfahren, Esc zum Beenden| · クリックで続行、Esc で終了| · 클릭하여 계속, Esc로 종료
导出工程文件…|匯出工程檔案…|Export project file…|Exportar archivo de proyecto…|Exporter le fichier de projet…|Projektdatei exportieren…|プロジェクトファイルを書き出し…|프로젝트 파일 내보내기…
打开工程文件…|開啟工程檔案…|Open project file…|Abrir archivo de proyecto…|Ouvrir le fichier de projet…|Projektdatei öffnen…|プロジェクトファイルを開く…|프로젝트 파일 열기…
从当前开始|從目前開始|Start from current|Empezar desde la actual|Démarrer depuis l'actuelle|Ab aktueller Folie starten|現在から開始|현재부터 시작
当前幻灯片已导出|目前簡報已匯出|Current slide exported|Diapositiva actual exportada|Diapositive actuelle exportée|Aktuelle Folie exportiert|現在のスライドを書き出しました|현재 슬라이드 내보냄
新增幻灯片|新增簡報|Add slide|Añadir diapositiva|Ajouter une diapositive|Folie hinzufügen|スライドを追加|슬라이드 추가
保存工程到本机|儲存工程到本機|Save project to this device|Guardar proyecto en este equipo|Enregistrer le projet sur cet appareil|Projekt auf diesem Gerät speichern|プロジェクトをこの端末に保存|프로젝트를 이 기기에 저장
导出工程 JSON 文件|匯出工程 JSON 檔案|Export project JSON file|Exportar archivo JSON del proyecto|Exporter le projet en JSON|Projekt als JSON exportieren|プロジェクト JSON を書き出し|프로젝트 JSON 내보내기
打开工程 JSON 文件|開啟工程 JSON 檔案|Open project JSON file|Abrir archivo JSON del proyecto|Ouvrir un projet JSON|Projekt-JSON öffnen|プロジェクト JSON を開く|프로젝트 JSON 열기`;
export const rows = RAW.trim().split('\n').map((line) => line.split('|'));
