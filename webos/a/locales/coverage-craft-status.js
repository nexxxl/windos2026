// ArtCraft 编辑器的状态行与计数片段。
// 状态行通常由「主题 · 数值 · 单位」拼成，translate() 会先按「 · 」拆段再逐段翻译，
// 所以这里登记的是拆段后的最小单元，而不是整行。
// Pipe table: zh-CN|zh-TW|en|es|fr|de|ja|ko
const RAW = `数据|資料|Data|Datos|Données|Daten|データ|데이터
对齐|對齊|Align|Alinear|Aligner|Ausrichten|整列|정렬
求和|求和|Sum|Suma|Somme|Summe|合計|합계
清除|清除|Clear|Borrar|Effacer|Löschen|クリア|지우기
布局|版面|Layout|Diseño|Mise en page|Layout|レイアウト|레이아웃
审阅|審閱|Review|Revisar|Révision|Überprüfen|校閲|검토
引用|引用|Quote|Cita|Citation|Zitat|引用|인용
导航|導覽|Navigation|Navegación|Navigation|Navigation|ナビゲーション|탐색
字号 +|字級 +|Font size +|Tamaño +|Taille +|Schriftgröße +|文字サイズ +|글자 크기 +
字号 −|字級 −|Font size −|Tamaño −|Taille −|Schriftgröße −|文字サイズ −|글자 크기 −
标题 1|標題 1|Heading 1|Título 1|Titre 1|Überschrift 1|見出し 1|제목 1
标题 2|標題 2|Heading 2|Título 2|Titre 2|Überschrift 2|見出し 2|제목 2
已查明|已查明|Confirmed|Confirmado|Confirmé|Bestätigt|確認済み|확인됨
推断|推斷|Inferred|Inferido|Déduit|Abgeleitet|推定|추정
待查|待查|Unverified|Sin verificar|À vérifier|Ungeprüft|未確認|미확인
字节熵|位元組熵|Byte entropy|Entropía de bytes|Entropie d'octets|Byte-Entropie|バイトエントロピー|바이트 엔트로피
内嵌 URL|內嵌 URL|Embedded URL|URL incrustada|URL intégrée|Eingebettete URL|埋め込み URL|내장 URL
搜索函数或证据|搜尋函式或證據|Search functions or evidence|Buscar funciones o pruebas|Rechercher fonctions ou preuves|Funktionen oder Nachweise suchen|関数や証拠を検索|함수 또는 증거 검색
直线 \\|直線 \\|Line \\|Línea \\|Ligne \\|Linie \\|直線 \\|직선 \\
图层变换|圖層變換|Layer transform|Transformación de capa|Transformation de calque|Ebenentransformation|レイヤー変形|레이어 변환
// 启发式伪代码|// 啟發式虛擬碼|// Heuristic pseudocode|// Pseudocódigo heurístico|// Pseudo-code heuristique|// Heuristischer Pseudocode|// ヒューリスティック疑似コード|// 휴리스틱 의사 코드
真实指令解码、重定位与符号表需要可执行文件格式解析；当前视图是启发式的。|真實指令解碼、重定位與符號表需要可執行檔格式解析；目前檢視是啟發式的。|Real instruction decoding, relocation and symbol tables require executable-format parsing; this view is heuristic.|La decodificación real de instrucciones, la reubicación y las tablas de símbolos requieren analizar el formato ejecutable; esta vista es heurística.|Le décodage réel des instructions, la relocalisation et les tables de symboles nécessitent l'analyse du format exécutable ; cette vue est heuristique.|Echte Instruktionsdekodierung, Relokation und Symboltabellen erfordern das Parsen des ausführbaren Formats; diese Ansicht ist heuristisch.|実際の命令デコード、再配置、シンボルテーブルには実行ファイル形式の解析が必要です。この表示はヒューリスティックです。|실제 명령 디코딩, 재배치, 심볼 테이블은 실행 파일 형식 분석이 필요합니다. 이 보기는 휴리스틱입니다.`;

const TEMPLATES = `{0} 对象|{0} 物件|{0} objects|{0} objetos|{0} objets|{0} Objekte|{0} オブジェクト|{0}개 객체
{0} 个对象|{0} 個物件|{0} objects|{0} objetos|{0} objets|{0} Objekte|{0} オブジェクト|{0}개 객체
{0} 图层|{0} 圖層|{0} layers|{0} capas|{0} calques|{0} Ebenen|{0} レイヤー|레이어 {0}개
第 {0} 步|第 {0} 步|Step {0}|Paso {0}|Pas {0}|Schritt {0}|ステップ {0}|{0}단계
第 {0} 页，共 {1} 页|第 {0} 頁，共 {1} 頁|Page {0} of {1}|Página {0} de {1}|Page {0} sur {1}|Seite {0} von {1}|{0} / {1} ページ|{0}/{1} 페이지
{0} 页|{0} 頁|Page {0}|Página {0}|Page {0}|Seite {0}|{0} ページ|{0}페이지
{0} 个字|{0} 個字|{0} words|{0} palabras|{0} mots|{0} Wörter|{0} 文字|{0}자
共 {0} 个字|共 {0} 個字|{0} words total|{0} palabras en total|{0} mots au total|{0} Wörter insgesamt|全 {0} 文字|총 {0}자
共 {0} 字|共 {0} 字|{0} words total|{0} palabras en total|{0} mots au total|{0} Wörter insgesamt|全 {0} 文字|총 {0}자
共 {0} 字节|共 {0} 位元組|{0} bytes total|{0} bytes en total|{0} octets au total|{0} Bytes insgesamt|合計 {0} バイト|총 {0}바이트
{0} 字节|{0} 位元組|{0} bytes|{0} bytes|{0} octets|{0} Bytes|{0} バイト|{0}바이트
{0} 单元|{0} 單元|{0} units|{0} unidades|{0} unités|{0} Einheiten|{0} ユニット|{0}개 단위
间隙 {0}|間隙 {0}|Gap {0}|Hueco {0}|Écart {0}|Fuge {0}|目地 {0}|간격 {0}
曝光 {0}|曝光 {0}|Exposure {0}|Exposición {0}|Exposition {0}|Belichtung {0}|露出 {0}|노출 {0}
对比 {0}|對比 {0}|Contrast {0}|Contraste {0}|Contraste {0}|Kontrast {0}|コントラスト {0}|대비 {0}
饱和 {0}|飽和 {0}|Saturation {0}|Saturación {0}|Saturation {0}|Sättigung {0}|彩度 {0}|채도 {0}
模糊 {0}|模糊 {0}|Blur {0}|Desenfoque {0}|Flou {0}|Unschärfe {0}|ぼかし {0}|흐림 {0}
{0} 项|{0} 項|{0} items|{0} elementos|{0} éléments|{0} Elemente|{0} 項目|{0}개 항목
平均值 {0}|平均值 {0}|Average {0}|Promedio {0}|Moyenne {0}|Durchschnitt {0}|平均 {0}|평균 {0}
计数 {0}|計數 {0}|Count {0}|Recuento {0}|Nombre {0}|Anzahl {0}|件数 {0}|개수 {0}
活动单元格 {0}|作用中儲存格 {0}|Active cell {0}|Celda activa {0}|Cellule active {0}|Aktive Zelle {0}|アクティブセル {0}|활성 셀 {0}
合计 {0}|合計 {0}|Total {0}|Total {0}|Total {0}|Summe {0}|合計 {0}|합계 {0}
{0} 轨 + 主输出|{0} 軌 + 主輸出|{0} tracks + master|{0} pistas + master|{0} pistes + master|{0} Spuren + Master|{0} トラック + マスター|트랙 {0}개 + 마스터
第 {0} / {1} 张|第 {0} / {1} 張|Slide {0} / {1}|Diapositiva {0} / {1}|Diapositive {0} / {1}|Folie {0} / {1}|{0} / {1} 枚|{0} / {1}장
对开页 {0} / {1}|對開頁 {0} / {1}|Spread {0} / {1}|Pliego {0} / {1}|Double page {0} / {1}|Doppelseite {0} / {1}|見開き {0} / {1}|펼침면 {0} / {1}
可读字符串 {0}|可讀字串 {0}|{0} readable strings|{0} cadenas legibles|{0} chaînes lisibles|{0} lesbare Strings|{0} 個の可読文字列|읽을 수 있는 문자열 {0}개
函数候选 {0}|函式候選 {0}|{0} function candidates|{0} funciones candidatas|{0} fonctions candidates|{0} Funktionskandidaten|{0} 個の関数候補|함수 후보 {0}개
按 {0} 字节切分的入口候选；仅用于导航，不代表真实函数边界。|依 {0} 位元組切分的入口候選；僅用於導覽，不代表真實函式邊界。|Entry candidates split at {0}-byte boundaries; for navigation only, not real function boundaries.|Candidatos de entrada divididos cada {0} bytes; solo para navegar, no son límites reales de funciones.|Candidats d'entrée découpés tous les {0} octets ; pour la navigation uniquement, pas de vraies frontières de fonctions.|Einstiegskandidaten in {0}-Byte-Schritten; nur zur Navigation, keine echten Funktionsgrenzen.|{0} バイト単位で切ったエントリ候補。ナビゲーション用で、実際の関数境界ではありません。|{0}바이트 단위로 나눈 진입 후보. 탐색용이며 실제 함수 경계가 아닙니다.`;

export const rows = RAW.trim().split('\n').map((line) => line.split('|'));
export const templates = TEMPLATES.trim().split('\n').map((line) => line.split('|'));
