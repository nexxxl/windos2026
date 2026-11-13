// ArtCraft image studio, photo editor and texture/node graph copy.
// Pipe table: zh-CN|zh-TW|en|es|fr|de|ja|ko
const RAW = `位图|點陣圖|Bitmap|Mapa de bits|Bitmap|Bitmap|ビットマップ|비트맵
图层、画笔、混合模式与调整图层，画布直接出 PNG。|圖層、筆刷、混合模式與調整圖層，畫布直接輸出 PNG。|Layers, brushes, blend modes and adjustment layers; the canvas exports PNG directly.|Capas, pinceles, modos de fusión y capas de ajuste; el lienzo exporta PNG directamente.|Calques, pinceaux, modes de fusion et calques de réglage ; le canevas exporte directement en PNG.|Ebenen, Pinsel, Mischmodi und Einstellungsebenen; die Leinwand exportiert direkt PNG.|レイヤー、ブラシ、描画モード、調整レイヤー。キャンバスは PNG で直接書き出せます。|레이어, 브러시, 혼합 모드, 조정 레이어. 캔버스는 PNG로 바로 내보냅니다.
V 移动 · B 画笔 · E 橡皮 · T 文字 · ⌘Z 撤销|V 移動 · B 筆刷 · E 橡皮擦 · T 文字 · ⌘Z 復原|V move · B brush · E eraser · T text · ⌘Z undo|V mover · B pincel · E borrador · T texto · ⌘Z deshacer|V déplacer · B pinceau · E gomme · T texte · ⌘Z annuler|V bewegen · B Pinsel · E Radierer · T Text · ⌘Z rückgängig|V 移動 · B ブラシ · E 消しゴム · T テキスト · ⌘Z 元に戻す|V 이동 · B 브러시 · E 지우개 · T 텍스트 · ⌘Z 실행 취소
未命名-1.psd|未命名-1.psd|Untitled-1.psd|Sin título-1.psd|Sans titre-1.psd|Unbenannt-1.psd|無題-1.psd|제목 없음-1.psd
 图层 · | 圖層 · | layers · | capas · | calques · | Ebenen · | レイヤー · | 레이어 · 
空白画布|空白畫布|Blank canvas|Lienzo en blanco|Canevas vide|Leere Leinwand|空白のキャンバス|빈 캔버스
V 移动、B 画笔、E 橡皮、T 文字；也可以直接导入图片作为底层。|V 移動、B 筆刷、E 橡皮擦、T 文字；也可以直接匯入圖片作為底層。|V move, B brush, E eraser, T text; you can also import an image as the base layer.|V mover, B pincel, E borrador, T texto; también puedes importar una imagen como capa base.|V déplacer, B pinceau, E gomme, T texte ; vous pouvez aussi importer une image comme calque de base.|V bewegen, B Pinsel, E Radierer, T Text; alternativ ein Bild als Basisebene importieren.|V 移動、B ブラシ、E 消しゴム、T テキスト。画像を最下層として読み込むこともできます。|V 이동, B 브러시, E 지우개, T 텍스트. 이미지를 바닥 레이어로 가져올 수도 있습니다.
选框|選取框|Marquee|Marco|Sélection|Auswahl|選択範囲|선택 영역
文字|文字|Text|Texto|Texte|Text|テキスト|텍스트
吸管|滴管|Eyedropper|Cuentagotas|Pipette|Pipette|スポイト|스포이드
缩放画布|縮放畫布|Zoom canvas|Ampliar lienzo|Zoom du canevas|Leinwand zoomen|キャンバスをズーム|캔버스 확대
图层显隐|圖層顯隱|Toggle layer visibility|Mostrar u ocultar capa|Afficher ou masquer le calque|Ebenensichtbarkeit umschalten|レイヤーの表示切替|레이어 표시 전환
自动选择|自動選取|Auto-select|Selección automática|Sélection automatique|Automatisch auswählen|自動選択|자동 선택
字体|字型|Font|Fuente|Police|Schrift|フォント|글꼴
样式|樣式|Style|Estilo|Style|Stil|スタイル|스타일
羽化|羽化|Feather|Desvanecer|Contour progressif|Weichzeichnen|ぼかし|페더
当前合成结果的亮度分布。|目前合成結果的亮度分布。|Luminance distribution of the current composite.|Distribución de luminancia del compuesto actual.|Distribution de luminance de la composition actuelle.|Luminanzverteilung der aktuellen Komposition.|現在の合成結果の輝度分布。|현재 합성 결과의 휘도 분포입니다.
未选择图层。|未選取圖層。|No layer selected.|Ninguna capa seleccionada.|Aucun calque sélectionné.|Keine Ebene ausgewählt.|レイヤーが選択されていません。|선택된 레이어가 없습니다.
 层| 層| layers| capas| calques| Ebenen| レイヤー| 레이어
形状|形狀|Shape|Forma|Forme|Form|シェイプ|도형
 图层 | 圖層 | Layer | Capa | Calque | Ebene | レイヤー | 레이어
 画笔 | 筆刷 | Brush | Pincel | Pinceau | Pinsel | ブラシ | 브러시
新建画笔图层|新增筆刷圖層|New brush layer|Nueva capa de pincel|Nouveau calque de pinceau|Neue Pinselebene|新規ブラシレイヤー|새 브러시 레이어
已取色 |已取色 |Color picked |Color tomado |Couleur prélevée |Farbe aufgenommen |色を取得しました |색상 추출됨 
绘制形状|繪製形狀|Draw shape|Dibujar forma|Dessiner une forme|Form zeichnen|シェイプを描く|도형 그리기
V 移动 · B 画笔 · E 橡皮 · T 文字 · U 形状 · I 取色|V 移動 · B 筆刷 · E 橡皮擦 · T 文字 · U 形狀 · I 取色|V move · B brush · E eraser · T text · U shape · I pick color|V mover · B pincel · E borrador · T texto · U forma · I tomar color|V déplacer · B pinceau · E gomme · T texte · U forme · I pipette|V bewegen · B Pinsel · E Radierer · T Text · U Form · I Farbe|V 移動 · B ブラシ · E 消しゴム · T テキスト · U シェイプ · I スポイト|V 이동 · B 브러시 · E 지우개 · T 텍스트 · U 도형 · I 색상 추출
提示词生成画面，4 张候选，保存单帧 PNG。|提示詞生成畫面，4 張候選，儲存單幀 PNG。|Generate images from a prompt, compare four candidates, and save a single frame as PNG.|Genera imágenes desde un mensaje, compara cuatro candidatos y guarda un solo fotograma en PNG.|Générez des images à partir d'un prompt, comparez quatre propositions et enregistrez une image en PNG.|Bilder per Prompt erzeugen, vier Vorschläge vergleichen und ein Einzelbild als PNG speichern.|プロンプトから画像を生成し、4 つの候補を比較して 1 フレームを PNG で保存します。|프롬프트로 이미지를 생성하고 후보 4장을 비교해 한 프레임을 PNG로 저장합니다.
输入提示词，回车生成；点击候选切换主画面|輸入提示詞，按 Enter 生成；點擊候選切換主畫面|Enter a prompt and press Enter to generate; click a candidate to switch the main view|Escribe un mensaje y pulsa Intro para generar; haz clic en un candidato para cambiar la vista principal|Saisissez un prompt et appuyez sur Entrée ; cliquez sur une proposition pour changer la vue principale|Prompt eingeben und Enter drücken; Vorschlag anklicken, um die Hauptansicht zu wechseln|プロンプトを入力して Enter で生成。候補をクリックするとメイン表示が切り替わります。|프롬프트를 입력하고 Enter로 생성. 후보를 클릭하면 메인 화면이 바뀝니다.
生成|生成|Generate|Generar|Générer|Erzeugen|生成|생성
 移动| 移動| move| mover| déplacer| bewegen| 移動| 이동
旋转|旋轉|Rotate|Rotar|Pivoter|Drehen|回転|회전
 旋转| 旋轉| rotate| rotar| pivoter| drehen| 回転| 회전
 缩放| 縮放| scale| escalar| zoom| skalieren| 拡大縮小| 크기 조정
世界|世界|World|Mundo|Monde|Welt|ワールド|월드
已完成当前画面|已完成目前畫面|Current frame complete|Fotograma actual completado|Image actuelle terminée|Aktuelles Bild fertig|現在のフレームが完成しました|현재 프레임 완료
✓ 完成|✓ 完成|✓ Done|✓ Hecho|✓ Terminé|✓ Fertig|✓ 完了|✓ 완료
描述你的画面…（例：黄昏的雪山湖泊，胶片质感）|描述你的畫面…（例：黃昏的雪山湖泊，底片質感）|Describe your image… (e.g. snowy mountain lake at dusk, film grain)|Describe tu imagen… (p. ej. lago alpino al atardecer, grano de película)|Décrivez votre image… (ex. lac de montagne au crépuscule, grain argentique)|Beschreibe dein Bild… (z. B. Bergsee in der Dämmerung, Filmkorn)|画面を説明…（例：夕暮れの雪山の湖、フィルム粒子）|화면을 설명하세요… (예: 황혼의 설산 호수, 필름 질감)
16:9 宽幅|16:9 寬幅|16:9 wide|16:9 panorámico|16:9 large|16:9 breit|16:9 ワイド|16:9 와이드
1:1 方形|1:1 方形|1:1 square|1:1 cuadrado|1:1 carré|1:1 quadratisch|1:1 正方形|1:1 정사각형
9:16 竖屏|9:16 直式|9:16 portrait|9:16 vertical|9:16 portrait|9:16 hochkant|9:16 縦長|9:16 세로
0 帧|0 幀|0 frames|0 fotogramas|0 image|0 Bilder|0 フレーム|0 프레임
添加参考图|新增參考圖|Add reference image|Añadir imagen de referencia|Ajouter une image de référence|Referenzbild hinzufügen|参照画像を追加|참조 이미지 추가
主视图|主視圖|Main view|Vista principal|Vue principale|Hauptansicht|メインビュー|메인 뷰
↓ 保存帧|↓ 儲存幀|↓ Save frame|↓ Guardar fotograma|↓ Enregistrer l'image|↓ Bild speichern|↓ フレームを保存|↓ 프레임 저장
变换模式：|變換模式：|Transform mode: |Modo de transformación: |Mode de transformation : |Transformationsmodus: |変形モード：|변형 모드: 
先写一句提示词|先寫一句提示詞|Write a prompt first|Escribe primero un mensaje|Saisissez d'abord un prompt|Zuerst einen Prompt schreiben|先にプロンプトを書いてください|먼저 프롬프트를 작성하세요
生成中…|生成中…|Generating…|Generando…|Génération…|Wird erzeugt…|生成中…|생성 중…
正在生成 4 张候选…|正在生成 4 張候選…|Generating four candidates…|Generando cuatro candidatos…|Génération de quatre propositions…|Vier Vorschläge werden erzeugt…|4 つの候補を生成中…|후보 4장 생성 중…
已生成 4 张 · |已生成 4 張 · |4 generated · |4 generadas · |4 générées · |4 erzeugt · |4 枚生成 · |4장 생성 · 
 帧| 幀| frames| fotogramas| images| Bilder| フレーム| 프레임
一句话开始|一句話開始|Start with one sentence|Empieza con una frase|Commencez par une phrase|Mit einem Satz beginnen|ひと言から始める|한 문장으로 시작
试试「黄昏的雪山湖泊，胶片质感」或「星夜下的剪影人物」。画面在本地合成，不上传任何内容。|試試「黃昏的雪山湖泊，底片質感」或「星夜下的剪影人物」。畫面在本機合成，不上傳任何內容。|Try “snowy mountain lake at dusk, film grain” or “silhouette under a starry sky”. Images are composed locally; nothing is uploaded.|Prueba «lago alpino al atardecer, grano de película» o «silueta bajo un cielo estrellado». Las imágenes se componen localmente; no se sube nada.|Essayez « lac de montagne au crépuscule, grain argentique » ou « silhouette sous un ciel étoilé ». Les images sont composées localement, rien n'est envoyé.|Probiere „Bergsee in der Dämmerung, Filmkorn“ oder „Silhouette unter Sternenhimmel“. Bilder entstehen lokal; nichts wird hochgeladen.|「夕暮れの雪山の湖、フィルム粒子」や「星空の下のシルエット」を試してください。画像はローカルで合成され、何もアップロードされません。|"황혼의 설산 호수, 필름 질감" 또는 "별밤 아래 실루엣"을 시도해 보세요. 이미지는 로컬에서 합성되며 아무것도 업로드되지 않습니다.
黄昏的雪山湖泊，胶片质感|黃昏的雪山湖泊，底片質感|Snowy mountain lake at dusk, film grain|Lago alpino al atardecer, grano de película|Lac de montagne au crépuscule, grain argentique|Bergsee in der Dämmerung, Filmkorn|夕暮れの雪山の湖、フィルム粒子|황혼의 설산 호수, 필름 질감
示例：雪山湖泊|範例：雪山湖泊|Example: mountain lake|Ejemplo: lago alpino|Exemple : lac de montagne|Beispiel: Bergsee|例：雪山の湖|예: 설산 호수
星夜下的剪影人物|星夜下的剪影人物|Silhouette under a starry sky|Silueta bajo un cielo estrellado|Silhouette sous un ciel étoilé|Silhouette unter Sternenhimmel|星空の下のシルエット|별밤 아래 실루엣
示例：星夜剪影|範例：星夜剪影|Example: starry silhouette|Ejemplo: silueta nocturna|Exemple : silhouette nocturne|Beispiel: Nachtsilhouette|例：星夜のシルエット|예: 별밤 실루엣
还没有可保存的画面|還沒有可儲存的畫面|Nothing to save yet|Aún no hay nada que guardar|Rien à enregistrer pour l'instant|Noch nichts zu speichern|保存できる画面がまだありません|저장할 화면이 없습니다
已保存当前帧|已儲存目前幀|Current frame saved|Fotograma actual guardado|Image actuelle enregistrée|Aktuelles Bild gespeichert|現在のフレームを保存しました|현재 프레임 저장됨
已加入参考图；下次生成会叠在画面里|已加入參考圖；下次生成會疊在畫面裡|Reference image added; it will be composited into the next generation|Imagen de referencia añadida; se compondrá en la próxima generación|Image de référence ajoutée ; elle sera intégrée à la prochaine génération|Referenzbild hinzugefügt; es wird in die nächste Erzeugung eingerechnet|参照画像を追加しました。次回の生成で画面に合成されます。|참조 이미지가 추가되었습니다. 다음 생성 시 화면에 합성됩니다.
画幅 |畫幅 |Aspect ratio |Relación de aspecto |Format |Seitenverhältnis |アスペクト比 |화면 비율 
保存当前帧|儲存目前幀|Save current frame|Guardar fotograma actual|Enregistrer l'image actuelle|Aktuelles Bild speichern|現在のフレームを保存|현재 프레임 저장
加入参考图…|加入參考圖…|Add reference image…|Añadir imagen de referencia…|Ajouter une image de référence…|Referenzbild hinzufügen…|参照画像を追加…|참조 이미지 추가…
四张候选|四張候選|Four candidates|Cuatro candidatos|Quatre propositions|Vier Vorschläge|4 つの候補|후보 4장
切换画幅|切換畫幅|Change aspect ratio|Cambiar relación de aspecto|Changer le format|Seitenverhältnis wechseln|アスペクト比を切り替え|화면 비율 변경
本地合成说明|本機合成說明|About local synthesis|Acerca de la síntesis local|À propos de la synthèse locale|Über die lokale Synthese|ローカル合成について|로컬 합성 안내
画面由本地 Canvas 按关键词合成，不调用云端模型|畫面由本機 Canvas 依關鍵詞合成，不呼叫雲端模型|The image is composed locally on Canvas from keywords; no cloud model is called|La imagen se compone localmente en Canvas a partir de palabras clave; no se llama a ningún modelo en la nube|L'image est composée localement sur Canvas à partir de mots-clés ; aucun modèle cloud n'est appelé|Das Bild wird lokal auf Canvas aus Schlüsselwörtern komponiert; kein Cloud-Modell wird aufgerufen|画面はローカルの Canvas がキーワードから合成します。クラウドモデルは使いません。|화면은 로컬 Canvas가 키워드로 합성하며 클라우드 모델을 호출하지 않습니다.
按提示词生成 {prompt}|依提示詞生成 {prompt}|Generate from prompt {prompt}|Generar desde el mensaje {prompt}|Générer depuis le prompt {prompt}|Aus Prompt erzeugen: {prompt}|プロンプトから生成 {prompt}|프롬프트로 생성 {prompt}
黄昏的雪山湖泊|黃昏的雪山湖泊|Snowy mountain lake at dusk|Lago alpino al atardecer|Lac de montagne au crépuscule|Bergsee in der Dämmerung|夕暮れの雪山の湖|황혼의 설산 호수
ArtCraft · 本地合成|ArtCraft · 本機合成|ArtCraft · Local synthesis|ArtCraft · Síntesis local|ArtCraft · Synthèse locale|ArtCraft · Lokale Synthese|ArtCraft · ローカル合成|ArtCraft · 로컬 합성
曝光、高光、阴影、曲线与暗角，实时显影后导出。|曝光、高光、陰影、曲線與暗角，即時顯影後匯出。|Exposure, highlights, shadows, curves and vignette; develop live, then export.|Exposición, luces, sombras, curvas y viñeta; revela en vivo y exporta.|Exposition, hautes lumières, ombres, courbes et vignettage ; développez en direct puis exportez.|Belichtung, Lichter, Schatten, Kurven und Vignette; live entwickeln und exportieren.|露出、ハイライト、シャドウ、トーンカーブ、周辺減光。リアルタイム現像して書き出します。|노출, 하이라이트, 그림자, 곡선, 비네트. 실시간 현상 후 내보냅니다.
拖右侧滑块调整；胶片条切换照片|拖右側滑桿調整；底片條切換照片|Drag the sliders on the right; use the film strip to switch photos|Arrastra los controles de la derecha; usa la tira de película para cambiar de foto|Faites glisser les curseurs à droite ; la pellicule change de photo|Rechts die Regler ziehen; der Filmstreifen wechselt das Foto|右側のスライダーで調整。フィルムストリップで写真を切り替えます。|오른쪽 슬라이더로 조정하고 필름 스트립으로 사진을 전환하세요.
未命名.jpg|未命名.jpg|Untitled.jpg|Sin título.jpg|Sans titre.jpg|Unbenannt.jpg|無題.jpg|제목 없음.jpg
修改照片|修改照片|Edit photo|Editar foto|Modifier la photo|Foto bearbeiten|写真を編集|사진 편집
图库|圖庫|Library|Biblioteca|Bibliothèque|Bibliothek|ライブラリ|라이브러리
裁剪|裁剪|Crop|Recortar|Recadrer|Zuschneiden|切り抜き|자르기
 · 曝光 | · 曝光 | · Exposure | · Exposición | · Exposition | · Belichtung | · 露出 | · 노출 
 · 对比 | · 對比 | · Contrast | · Contraste | · Contraste | · Kontrast | · コントラスト | · 대비 
 · 饱和 | · 飽和 | · Saturation | · Saturación | · Saturation | · Sättigung | · 彩度 | · 채도 
 · 模糊 | · 模糊 | · Blur | · Desenfoque | · Flou | · Unschärfe | · ぼかし | · 흐림 
光线|光線|Light|Luz|Lumière|Licht|ライト|빛
高光|高光|Highlights|Luces|Hautes lumières|Lichter|ハイライト|하이라이트
阴影|陰影|Shadows|Sombras|Ombres|Schatten|シャドウ|그림자
白色|白色|Whites|Blancos|Blancs|Weiß|ホワイト|흰색
黑色|黑色|Blacks|Negros|Noirs|Schwarz|ブラック|검정
色调|色調|Tone|Tono|Teinte|Ton|色調|색조
自然饱和度|自然飽和度|Vibrance|Intensidad|Vibrance|Dynamik|自然な彩度|생동감
效果|效果|Effects|Efectos|Effets|Effekte|エフェクト|효과
清晰度|清晰度|Clarity|Claridad|Clarté|Klarheit|明瞭度|선명도
去朦胧|去朦朧|Dehaze|Quitar neblina|Retirer le voile|Dunst entfernen|かすみ除去|안개 제거
模糊|模糊|Blur|Desenfoque|Flou|Unschärfe|ぼかし|흐림
导入-|匯入-|Import-|Importar-|Import-|Import-|読み込み-|가져오기-
自动色调|自動色調|Auto tone|Tono automático|Ton automatique|Autoton|自動色調|자동 색조
贴图|貼圖|Textures|Texturas|Textures|Texturen|テクスチャ|텍스처
程序纹理层、3D 球面预览与 2D 平铺，导出 PNG。|程序紋理層、3D 球面預覽與 2D 平鋪，匯出 PNG。|Procedural texture layers, a 3D sphere preview and 2D tiling; export PNG.|Capas de textura procedurales, vista previa esférica 3D y mosaico 2D; exporta PNG.|Calques de texture procéduraux, aperçu sphérique 3D et pavage 2D ; export PNG.|Prozedurale Texturschichten, 3D-Kugelvorschau und 2D-Kachelung; PNG exportieren.|プロシージャルなテクスチャレイヤー、3D 球体プレビュー、2D タイリング。PNG で書き出せます。|절차적 텍스처 레이어, 3D 구체 미리보기, 2D 타일링. PNG로 내보냅니다.
左栏换材质，右栏调图案与颜色|左欄換材質，右欄調圖案與顏色|Pick materials on the left, adjust pattern and color on the right|Elige materiales a la izquierda y ajusta patrón y color a la derecha|Choisissez les matériaux à gauche, réglez motif et couleur à droite|Links Material wählen, rechts Muster und Farbe einstellen|左でマテリアルを選び、右で模様と色を調整します。|왼쪽에서 재질을 고르고 오른쪽에서 무늬와 색을 조정하세요.
3D 视图 · 球面|3D 視圖 · 球面|3D view · sphere|Vista 3D · esfera|Vue 3D · sphère|3D-Ansicht · Kugel|3D ビュー · 球体|3D 보기 · 구체
2D 视图 · UV 平铺|2D 視圖 · UV 平鋪|2D view · UV tiling|Vista 2D · mosaico UV|Vue 2D · pavage UV|2D-Ansicht · UV-Kachelung|2D ビュー · UV タイリング|2D 보기 · UV 타일링
塑料白|塑膠白|Plastic white|Blanco plástico|Blanc plastique|Kunststoffweiß|プラスチックホワイト|플라스틱 화이트
拉丝金属|拉絲金屬|Brushed metal|Metal cepillado|Métal brossé|Gebürstetes Metall|ヘアライン金属|브러시드 메탈
粗糙铁|粗糙鐵|Rough iron|Hierro áspero|Fer rugueux|Rohes Eisen|ざらついた鉄|거친 철
布纹|布紋|Fabric|Tela|Tissu|Stoff|布地|천
底色层|底色層|Base color layer|Capa de color base|Calque de couleur de base|Grundfarbebene|ベースカラーレイヤー|기본 색상 레이어
图案层|圖案層|Pattern layer|Capa de patrón|Calque de motif|Musterebene|パターンレイヤー|패턴 레이어
细节层|細節層|Detail layer|Capa de detalle|Calque de détail|Detailebene|ディテールレイヤー|디테일 레이어
 单元 · | 單元 · | cells · | celdas · | cellules · | Zellen · | セル · | 셀 · 
 · 3 层| · 3 層| · 3 layers| · 3 capas| · 3 calques| · 3 Ebenen| · 3 レイヤー| · 3개 레이어
资产|資產|Assets|Recursos|Ressources|Assets|アセット|에셋
纹理集列表|紋理集清單|Texture set list|Lista de conjuntos de texturas|Liste des jeux de textures|Textursatzliste|テクスチャセット一覧|텍스처 세트 목록
隐藏|隱藏|Hide|Ocultar|Masquer|Ausblenden|非表示|숨기기
属性 · 填充|屬性 · 填充|Properties · fill|Propiedades · relleno|Propriétés · remplissage|Eigenschaften · Füllung|プロパティ · 塗り|속성 · 채우기
投影|投影|Projection|Proyección|Projection|Projektion|投影|투영
UV 投影|UV 投影|UV projection|Proyección UV|Projection UV|UV-Projektion|UV 投影|UV 투영
缩放 / 平铺|縮放 / 平鋪|Scale / tile|Escala / mosaico|Échelle / pavage|Skalieren / kacheln|拡大縮小 / タイリング|크기 / 타일링
细节色|細節色|Detail color|Color de detalle|Couleur de détail|Detailfarbe|ディテール色|디테일 색상
说明|說明|Notes|Notas|Remarques|Hinweise|説明|설명
3D 预览把同一张纹理压进球面，导出为 2D 平铺 PNG|3D 預覽把同一張紋理壓進球面，匯出為 2D 平鋪 PNG|The 3D preview wraps the same texture onto a sphere; export it as a 2D tiled PNG|La vista 3D aplica la misma textura a una esfera; expórtala como PNG con mosaico 2D|L'aperçu 3D applique la même texture sur une sphère ; exportez-la en PNG pavé 2D|Die 3D-Vorschau legt dieselbe Textur auf eine Kugel; als 2D-gekacheltes PNG exportieren|3D プレビューは同じテクスチャを球体に貼ります。2D タイリング PNG として書き出せます。|3D 미리보기는 같은 텍스처를 구체에 입힙니다. 2D 타일링 PNG로 내보내세요.
重新随机纹理|重新隨機紋理|Randomize texture again|Volver a aleatorizar la textura|Regénérer la texture|Textur erneut randomisieren|テクスチャを再ランダム化|텍스처 다시 무작위화
节点|節點|Nodes|Nodos|Nœuds|Knoten|ノード|노드
节点图生成砖墙材质，3D 立方体与 2D 视图实时联动。|節點圖生成磚牆材質，3D 立方體與 2D 視圖即時連動。|A node graph builds a brick material; the 3D cube and 2D view update live.|Un grafo de nodos genera un material de ladrillo; el cubo 3D y la vista 2D se actualizan en vivo.|Un graphe de nœuds génère un matériau de brique ; le cube 3D et la vue 2D se mettent à jour en direct.|Ein Knotengraph erzeugt ein Ziegelmaterial; 3D-Würfel und 2D-Ansicht aktualisieren live.|ノードグラフでレンガ素材を作成し、3D キューブと 2D ビューがリアルタイムに連動します。|노드 그래프로 벽돌 재질을 만들고 3D 큐브와 2D 보기가 실시간으로 연동됩니다.
拖动节点；点选节点在右栏改参数|拖動節點；點選節點在右欄改參數|Drag nodes; select one to edit its parameters on the right|Arrastra nodos; selecciona uno para editar sus parámetros a la derecha|Faites glisser les nœuds ; sélectionnez-en un pour modifier ses paramètres à droite|Knoten ziehen; einen auswählen und rechts die Parameter ändern|ノードをドラッグ。選択すると右側でパラメータを変更できます。|노드를 끌어 이동하고, 선택하면 오른쪽에서 매개변수를 바꿉니다.
砖块生成器|磚塊生成器|Brick generator|Generador de ladrillos|Générateur de briques|Ziegelgenerator|レンガ生成|벽돌 생성기
输出|輸出|Output|Salida|Sortie|Ausgabe|出力|출력
ROUNDED CUBE · 3D 视图|ROUNDED CUBE · 3D 視圖|ROUNDED CUBE · 3D view|ROUNDED CUBE · vista 3D|ROUNDED CUBE · vue 3D|ROUNDED CUBE · 3D-Ansicht|ROUNDED CUBE · 3D ビュー|ROUNDED CUBE · 3D 보기
BRICK WALL · 2D 视图|BRICK WALL · 2D 視圖|BRICK WALL · 2D view|BRICK WALL · vista 2D|BRICK WALL · vue 2D|BRICK WALL · 2D-Ansicht|BRICK WALL · 2D ビュー|BRICK WALL · 2D 보기
砖块生成器 · |磚塊生成器 · |Brick generator · |Generador de ladrillos · |Générateur de briques · |Ziegelgenerator · |レンガ生成 · |벽돌 생성기 · 
 · 间隙 | · 間隙 | · gap | · hueco | · écart | · Fuge | · 目地 | · 간격 
GPU · 预览 512×512|GPU · 預覽 512×512|GPU · preview 512×512|GPU · vista previa 512×512|GPU · aperçu 512×512|GPU · Vorschau 512×512|GPU · プレビュー 512×512|GPU · 미리보기 512×512
资源管理器|資源管理器|Asset browser|Explorador de recursos|Explorateur de ressources|Asset-Browser|アセットブラウザー|에셋 탐색기
图形|圖形|Shapes|Formas|Formes|Formen|図形|도형
4 节点|4 節點|4 nodes|4 nodos|4 nœuds|4 Knoten|4 ノード|노드 4개
过滤|過濾|Filter|Filtro|Filtre|Filter|フィルター|필터
噪波|雜訊|Noise|Ruido|Bruit|Rauschen|ノイズ|노이즈
渐变|漸層|Gradient|Degradado|Dégradé|Verlauf|グラデーション|그라데이션
已添加节点：|已新增節點：|Node added: |Nodo añadido: |Nœud ajouté : |Knoten hinzugefügt: |ノードを追加：|노드 추가됨: 
导出 2D PNG|匯出 2D PNG|Export 2D PNG|Exportar PNG 2D|Exporter en PNG 2D|2D-PNG exportieren|2D PNG を書き出し|2D PNG 내보내기
噪声 · 属性|雜訊 · 屬性|Noise · properties|Ruido · propiedades|Bruit · propriétés|Rauschen · Eigenschaften|ノイズ · プロパティ|노이즈 · 속성
分形噪声驱动砖面颗粒，也作为混合节点的输入。|分形雜訊驅動磚面顆粒，也作為混合節點的輸入。|Fractal noise drives the brick grain and also feeds the blend node.|El ruido fractal genera el grano del ladrillo y alimenta el nodo de mezcla.|Le bruit fractal génère le grain de la brique et alimente le nœud de mélange.|Fraktales Rauschen erzeugt die Ziegelkörnung und speist den Mischknoten.|フラクタルノイズがレンガ表面の粒子を作り、混合ノードにも入力されます。|프랙털 노이즈가 벽돌 표면 입자를 만들고 블렌드 노드 입력으로도 쓰입니다.
混合 · 属性|混合 · 屬性|Blend · properties|Mezcla · propiedades|Mélange · propriétés|Mischen · Eigenschaften|ブレンド · プロパティ|블렌드 · 속성
把噪声叠加到砖块输出；模式与强度实时生效。|把雜訊疊加到磚塊輸出；模式與強度即時生效。|Overlays noise onto the brick output; mode and strength apply live.|Superpone ruido a la salida de ladrillo; el modo y la intensidad se aplican en vivo.|Superpose le bruit à la sortie brique ; mode et intensité s'appliquent en direct.|Legt Rauschen über die Ziegelausgabe; Modus und Stärke wirken sofort.|ノイズをレンガ出力に重ねます。モードと強度はリアルタイムに反映されます。|노이즈를 벽돌 출력 위에 겹칩니다. 모드와 강도는 실시간으로 적용됩니다.
叠加 Overlay|覆蓋 Overlay|Overlay|Superponer|Incrustation|Ineinanderkopieren|オーバーレイ|오버레이
正片叠底 Multiply|色彩增值 Multiply|Multiply|Multiplicar|Produit|Multiplizieren|乗算|곱하기
滤色 Screen|濾色 Screen|Screen|Trama|Superposition|Negativ multiplizieren|スクリーン|스크린
正常 Normal|正常 Normal|Normal|Normal|Normal|Normal|通常|일반
强度|強度|Strength|Intensidad|Intensité|Stärke|強度|강도
输出 · 属性|輸出 · 屬性|Output · properties|Salida · propiedades|Sortie · propriétés|Ausgabe · Eigenschaften|出力 · プロパティ|출력 · 속성
通道|通道|Channels|Canales|Canaux|Kanäle|チャンネル|채널
尺寸|尺寸|Size|Tamaño|Taille|Größe|サイズ|크기
输出节点聚合混合结果；导出的是当前 2D 纹理。|輸出節點聚合混合結果；匯出的是目前 2D 紋理。|The output node aggregates the blend result; the current 2D texture is exported.|El nodo de salida agrega el resultado de la mezcla; se exporta la textura 2D actual.|Le nœud de sortie agrège le résultat du mélange ; la texture 2D actuelle est exportée.|Der Ausgabeknoten bündelt das Mischergebnis; exportiert wird die aktuelle 2D-Textur.|出力ノードが混合結果をまとめ、現在の 2D テクスチャを書き出します。|출력 노드가 블렌드 결과를 모으고 현재 2D 텍스처를 내보냅니다.
砖块生成器 · 属性|磚塊生成器 · 屬性|Brick generator · properties|Generador de ladrillos · propiedades|Générateur de briques · propriétés|Ziegelgenerator · Eigenschaften|レンガ生成 · プロパティ|벽돌 생성기 · 속성
砖墙由错缝的砖块与随机灰缝组成。|磚牆由錯縫的磚塊與隨機灰縫組成。|The wall is made of staggered bricks with randomized mortar gaps.|El muro se compone de ladrillos escalonados con juntas aleatorias.|Le mur est fait de briques décalées avec des joints aléatoires.|Die Wand besteht aus versetzten Ziegeln mit zufälligen Mörtelfugen.|壁はずらしたレンガとランダムな目地で構成されます。|벽은 엇갈린 벽돌과 무작위 줄눈으로 구성됩니다.
基本参数|基本參數|Basic parameters|Parámetros básicos|Paramètres de base|Grundparameter|基本パラメータ|기본 매개변수
宽度|寬度|Width|Ancho|Largeur|Breite|幅|너비
高度|高度|Height|Alto|Hauteur|Höhe|高さ|높이
行偏移|列偏移|Row offset|Desfase de filas|Décalage des rangées|Zeilenversatz|行オフセット|행 오프셋
间隙|間隙|Gap|Hueco|Écart|Fuge|目地|간격
倒角|倒角|Bevel|Bisel|Biseau|Fase|面取り|베벨
2D 纹理已导出|2D 紋理已匯出|2D texture exported|Textura 2D exportada|Texture 2D exportée|2D-Textur exportiert|2D テクスチャを書き出しました|2D 텍스처 내보냄
导出 2D 纹理|匯出 2D 紋理|Export 2D texture|Exportar textura 2D|Exporter la texture 2D|2D-Textur exportieren|2D テクスチャを書き出し|2D 텍스처 내보내기
添加噪波节点|新增雜訊節點|Add noise node|Añadir nodo de ruido|Ajouter un nœud de bruit|Rauschknoten hinzufügen|ノイズノードを追加|노이즈 노드 추가
添加混合节点|新增混合節點|Add blend node|Añadir nodo de mezcla|Ajouter un nœud de mélange|Mischknoten hinzufügen|ブレンドノードを追加|블렌드 노드 추가
适配节点图|適配節點圖|Fit node graph|Ajustar grafo de nodos|Ajuster le graphe|Knotengraph einpassen|ノードグラフをフィット|노드 그래프 맞춤`;
export const rows = RAW.trim().split('\n').map((line) => line.split('|'));
