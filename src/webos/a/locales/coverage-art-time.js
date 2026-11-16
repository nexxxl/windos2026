// ArtCraft video, compositing, sprite and audio demos.
// Pipe table: zh-CN|zh-TW|en|es|fr|de|ja|ko
const RAW = `素材箱、源/节目监视器、时间线与抽帧导出。|素材箱、來源/節目監視器、時間軸與抽幀匯出。|Media bin, source/program monitors, timeline and frame export.|Caja de medios, monitores de origen/programa, línea de tiempo y exportación de fotogramas.|Médiathèque, moniteurs source/programme, timeline et export d'images.|Medienkorb, Quell-/Programmmonitor, Timeline und Frame-Export.|メディアビン、ソース／プログラムモニター、タイムライン、フレーム書き出し。|미디어 빈, 소스/프로그램 모니터, 타임라인, 프레임 내보내기.
双击素材放到时间线；拖标尺找镜头|按兩下素材放到時間軸；拖標尺找鏡頭|Double-click media to add it to the timeline; drag the ruler to find a shot|Haz doble clic en un medio para añadirlo a la línea de tiempo; arrastra la regla para buscar un plano|Double-cliquez un média pour l'ajouter à la timeline ; faites glisser la règle pour trouver un plan|Medium doppelklicken, um es zur Timeline hinzuzufügen; Lineal ziehen, um eine Einstellung zu finden|メディアをダブルクリックでタイムラインに追加。ルーラーをドラッグしてショットを探します。|미디어를 두 번 클릭해 타임라인에 추가하고, 눈금자를 끌어 장면을 찾으세요.
未命名项目|未命名專案|Untitled project|Proyecto sin título|Projet sans titre|Unbenanntes Projekt|無題のプロジェクト|제목 없는 프로젝트
工程文件已导出|工程檔案已匯出|Project file exported|Archivo de proyecto exportado|Fichier de projet exporté|Projektdatei exportiert|プロジェクトファイルを書き出しました|프로젝트 파일 내보냄
不是有效的 FilmCraft 工程文件|不是有效的 FilmCraft 工程檔案|Not a valid FilmCraft project file|No es un archivo de proyecto FilmCraft válido|Ce n'est pas un fichier de projet FilmCraft valide|Keine gültige FilmCraft-Projektdatei|有効な FilmCraft プロジェクトファイルではありません|유효한 FilmCraft 프로젝트 파일이 아닙니다
工程已打开 · |工程已開啟 · |Project opened · |Proyecto abierto · |Projet ouvert · |Projekt geöffnet · |プロジェクトを開きました · |프로젝트 열림 · 
 片段| 片段| clips| clips| clips| Clips| クリップ| 클립
源监视器|來源監視器|Source monitor|Monitor de origen|Moniteur source|Quellmonitor|ソースモニター|소스 모니터
适应|適應|Fit|Ajustar|Ajuster|Anpassen|フィット|맞춤
节目监视器|節目監視器|Program monitor|Monitor de programa|Moniteur programme|Programmmonitor|プログラムモニター|프로그램 모니터
序列 01|序列 01|Sequence 01|Secuencia 01|Séquence 01|Sequenz 01|シーケンス 01|시퀀스 01
1/2 · 适应|1/2 · 適應|1/2 · fit|1/2 · ajustar|1/2 · ajuster|1/2 · anpassen|1/2 · フィット|1/2 · 맞춤
序列 01 · |序列 01 · |Sequence 01 · |Secuencia 01 · |Séquence 01 · |Sequenz 01 · |シーケンス 01 · |시퀀스 01 · 
项目：未命名项目|專案：未命名專案|Project: untitled project|Proyecto: sin título|Projet : sans titre|Projekt: unbenanntes Projekt|プロジェクト：無題のプロジェクト|프로젝트: 제목 없음
5 项|5 項|5 items|5 elementos|5 éléments|5 Elemente|5 項目|5개 항목
双击加入时间线|按兩下加入時間軸|Double-click to add to the timeline|Haz doble clic para añadir a la línea de tiempo|Double-cliquez pour ajouter à la timeline|Doppelklicken, um zur Timeline hinzuzufügen|ダブルクリックでタイムラインに追加|두 번 클릭해 타임라인에 추가
插入到时间线|插入到時間軸|Insert into timeline|Insertar en la línea de tiempo|Insérer dans la timeline|In die Timeline einfügen|タイムラインに挿入|타임라인에 삽입
源监视器 · |來源監視器 · |Source monitor · |Monitor de origen · |Moniteur source · |Quellmonitor · |ソースモニター · |소스 모니터 · 
源监视器：|來源監視器：|Source monitor: |Monitor de origen: |Moniteur source : |Quellmonitor: |ソースモニター：|소스 모니터: 
当前位置三条轨道都已被占用，请换一个时间点再插入|目前位置三條軌道都已被佔用，請換一個時間點再插入|All three tracks are occupied at this position; pick another time|Las tres pistas están ocupadas en esta posición; elige otro momento|Les trois pistes sont occupées ici ; choisissez un autre instant|Alle drei Spuren sind an dieser Position belegt; wähle eine andere Zeit|この位置は 3 本すべてのトラックが使用中です。別の時間を選んでください。|이 위치는 세 트랙이 모두 사용 중입니다. 다른 시점을 선택하세요.
已插入 |已插入 |Inserted |Insertado: |Inséré : |Eingefügt: |挿入しました |삽입됨 
 到 | 到| into | en | dans | in | に| 에
该位置与同轨道片段重叠，已取消移动|該位置與同軌道片段重疊，已取消移動|This position overlaps a clip on the same track; the move was cancelled|Esta posición se solapa con un clip de la misma pista; se canceló el movimiento|Cette position chevauche un clip de la même piste ; déplacement annulé|Diese Position überlappt einen Clip derselben Spur; Verschieben abgebrochen|この位置は同じトラックのクリップと重なるため、移動を中止しました|이 위치는 같은 트랙의 클립과 겹쳐 이동이 취소되었습니다
时间线：序列 01|時間軸：序列 01|Timeline: Sequence 01|Línea de tiempo: Secuencia 01|Timeline : Séquence 01|Timeline: Sequenz 01|タイムライン：シーケンス 01|타임라인: 시퀀스 01
播放/暂停|播放/暫停|Play/pause|Reproducir/Pausar|Lecture/Pause|Wiedergabe/Pause|再生/一時停止|재생/일시정지
结尾|結尾|End|Final|Fin|Ende|終わり|끝
保存到本机|儲存到本機|Save to this device|Guardar en este equipo|Enregistrer sur cet appareil|Auf diesem Gerät speichern|この端末に保存|이 기기에 저장
剪辑已保存到本机|剪輯已儲存到本機|Edit saved to this device|Montaje guardado en este equipo|Montage enregistré sur cet appareil|Schnitt auf diesem Gerät gespeichert|編集をこの端末に保存しました|편집본을 이 기기에 저장했습니다
导出工程文件|匯出工程檔案|Export project file|Exportar archivo de proyecto|Exporter le fichier de projet|Projektdatei exportieren|プロジェクトファイルを書き出し|프로젝트 파일 내보내기
打开工程文件|開啟工程檔案|Open project file|Abrir archivo de proyecto|Ouvrir le fichier de projet|Projektdatei öffnen|プロジェクトファイルを開く|프로젝트 파일 열기
导出当前帧 PNG|匯出目前幀 PNG|Export current frame as PNG|Exportar fotograma actual en PNG|Exporter l'image actuelle en PNG|Aktuelles Bild als PNG exportieren|現在のフレームを PNG で書き出し|현재 프레임 PNG 내보내기
插入素材|插入素材|Insert media|Insertar medio|Insérer un média|Medium einfügen|メディアを挿入|미디어 삽입
序列|序列|Sequence|Secuencia|Séquence|Sequenz|シーケンス|시퀀스
把第一段素材插入时间线|把第一段素材插入時間軸|Insert the first clip into the timeline|Insertar el primer clip en la línea de tiempo|Insérer le premier clip dans la timeline|Ersten Clip in die Timeline einfügen|最初のクリップをタイムラインに挿入|첫 클립을 타임라인에 삽입
保存剪辑到本机|儲存剪輯到本機|Save edit to this device|Guardar montaje en este equipo|Enregistrer le montage sur cet appareil|Schnitt auf diesem Gerät speichern|編集をこの端末に保存|편집본을 이 기기에 저장
导出 FilmCraft 工程文件|匯出 FilmCraft 工程檔案|Export FilmCraft project file|Exportar archivo de proyecto FilmCraft|Exporter le projet FilmCraft|FilmCraft-Projekt exportieren|FilmCraft プロジェクトを書き出し|FilmCraft 프로젝트 내보내기
打开 FilmCraft 工程文件|開啟 FilmCraft 工程檔案|Open FilmCraft project file|Abrir archivo de proyecto FilmCraft|Ouvrir un projet FilmCraft|FilmCraft-Projekt öffnen|FilmCraft プロジェクトを開く|FilmCraft 프로젝트 열기
返回 {current, playing, selected, clips}|傳回 {current, playing, selected, clips}|Returns {current, playing, selected, clips}|Devuelve {current, playing, selected, clips}|Renvoie {current, playing, selected, clips}|Gibt {current, playing, selected, clips} zurück|{current, playing, selected, clips} を返します|{current, playing, selected, clips} 반환
按选中片段微调 start {dir, big}|依選取片段微調 start {dir, big}|Nudge start by the selected clip {dir, big}|Ajustar start según el clip seleccionado {dir, big}|Ajuster start selon le clip sélectionné {dir, big}|start am ausgewählten Clip ausrichten {dir, big}|選択クリップで start を微調整 {dir, big}|선택 클립으로 start 미세 조정 {dir, big}
合成|合成|Composite|Composición|Composition|Komposition|コンポジション|컴포지션
图层变换与关键帧插值，合成窗口实时播放。|圖層變換與關鍵幀插值，合成視窗即時播放。|Layer transforms and keyframe interpolation, played live in the composition window.|Transformaciones de capa e interpolación de fotogramas clave, con reproducción en vivo en la ventana de composición.|Transformations de calques et interpolation d'images clés, lues en direct dans la fenêtre de composition.|Ebenentransformationen und Keyframe-Interpolation, live im Kompositionsfenster.|レイヤー変形とキーフレーム補間。コンポジションウィンドウでリアルタイム再生します。|레이어 변형과 키프레임 보간. 컴포지션 창에서 실시간 재생됩니다.
选中图层，在右栏改变换；空格播放|選取圖層，在右欄改變換；空白鍵播放|Select a layer and change its transform on the right; press Space to play|Selecciona una capa y cambia su transformación a la derecha; pulsa Espacio para reproducir|Sélectionnez un calque et modifiez sa transformation à droite ; Espace pour lire|Ebene auswählen und rechts die Transformation ändern; Leertaste zum Abspielen|レイヤーを選び、右側で変形を変更。スペースキーで再生します。|레이어를 선택하고 오른쪽에서 변형을 바꾸세요. Space로 재생합니다.
合成已保存到本机|合成已儲存到本機|Composition saved to this device|Composición guardada en este equipo|Composition enregistrée sur cet appareil|Komposition auf diesem Gerät gespeichert|コンポジションをこの端末に保存しました|컴포지션을 이 기기에 저장했습니다
保存失败：存档过大或浏览器禁写|儲存失敗：存檔過大或瀏覽器禁寫|Save failed: the project is too large or the browser blocked writing|Error al guardar: el proyecto es demasiado grande o el navegador bloqueó la escritura|Échec de l'enregistrement : projet trop volumineux ou écriture bloquée par le navigateur|Speichern fehlgeschlagen: Projekt zu groß oder Browser blockiert das Schreiben|保存に失敗：プロジェクトが大きすぎるか、ブラウザが書き込みを禁止しています|저장 실패: 프로젝트가 너무 크거나 브라우저가 쓰기를 차단했습니다
不是有效的 EffectCraft 工程文件|不是有效的 EffectCraft 工程檔案|Not a valid EffectCraft project file|No es un archivo de proyecto EffectCraft válido|Ce n'est pas un fichier de projet EffectCraft valide|Keine gültige EffectCraft-Projektdatei|有効な EffectCraft プロジェクトファイルではありません|유효한 EffectCraft 프로젝트 파일이 아닙니다
 图层| 圖層| layers| capas| calques| Ebenen| レイヤー| 레이어
LOWER THIRD · 片头字幕|LOWER THIRD · 片頭字幕|LOWER THIRD · title card|LOWER THIRD · rótulo inicial|LOWER THIRD · carton de titre|LOWER THIRD · Titelinsert|LOWER THIRD · タイトルカード|LOWER THIRD · 오프닝 자막
合成 · |合成 · |Composition · |Composición · |Composition · |Komposition · |コンポジション · |컴포지션 · 
时间线 · EffectCraft Intro|時間軸 · EffectCraft Intro|Timeline · EffectCraft Intro|Línea de tiempo · EffectCraft Intro|Timeline · EffectCraft Intro|Timeline · EffectCraft Intro|タイムライン · EffectCraft Intro|타임라인 · EffectCraft Intro
效果与预设|效果與預設|Effects and presets|Efectos y ajustes preestablecidos|Effets et préréglages|Effekte und Vorgaben|エフェクトとプリセット|효과 및 프리셋
拖动时间线上的播放头，右栏参数随关键帧插值。|拖動時間軸上的播放頭，右欄參數隨關鍵幀插值。|Drag the playhead; parameters on the right follow keyframe interpolation.|Arrastra el cabezal de reproducción; los parámetros de la derecha siguen la interpolación.|Déplacez la tête de lecture ; les paramètres à droite suivent l'interpolation.|Spielkopf ziehen; die Parameter rechts folgen der Keyframe-Interpolation.|再生ヘッドをドラッグすると、右側のパラメータがキーフレーム補間で変化します。|재생 헤드를 끌면 오른쪽 매개변수가 키프레임 보간을 따릅니다.
预览|預覽|Preview|Vista previa|Aperçu|Vorschau|プレビュー|미리보기
图层变换 · |圖層變換 · |Layer transform · |Transformación de capa · |Transformation du calque · |Ebenentransformation · |レイヤー変形 · |레이어 변형 · 
X 位置|X 位置|X position|Posición X|Position X|X-Position|X 位置|X 위치
Y 位置|Y 位置|Y position|Posición Y|Position Y|Y-Position|Y 位置|Y 위치
旋转|旋轉|Rotation|Rotación|Rotation|Drehung|回転|회전
段插值|段插值|Segment interpolation|Interpolación de segmento|Interpolation de segment|Segmentinterpolation|区間補間|구간 보간
贝塞尔（平滑）|貝茲（平滑）|Bezier (smooth)|Bézier (suave)|Bézier (lissé)|Bezier (weich)|ベジェ（スムーズ）|베지어(부드럽게)
线性|線性|Linear|Lineal|Linéaire|Linear|リニア|선형
保持（阶跃）|保持（階躍）|Hold (step)|Mantener (escalón)|Conserver (paliers)|Halten (Schritt)|ホールド（ステップ）|유지(계단)
改动会写入当前时间最近的关键帧；拖动播放头看插值。|變更會寫入目前時間最近的關鍵幀；拖動播放頭看插值。|Changes are written to the nearest keyframe at the current time; drag the playhead to see interpolation.|Los cambios se escriben en el fotograma clave más cercano; arrastra el cabezal para ver la interpolación.|Les modifications s'écrivent sur l'image clé la plus proche ; déplacez la tête de lecture pour voir l'interpolation.|Änderungen gehen an den nächsten Keyframe; Spielkopf ziehen, um die Interpolation zu sehen.|変更は現在時刻に最も近いキーフレームに書き込まれます。再生ヘッドをドラッグして補間を確認してください。|변경 사항은 현재 시간에서 가장 가까운 키프레임에 기록됩니다. 재생 헤드를 끌어 보간을 확인하세요.
导出工程文件…|匯出工程檔案…|Export project file…|Exportar archivo de proyecto…|Exporter le fichier de projet…|Projektdatei exportieren…|プロジェクトファイルを書き出し…|프로젝트 파일 내보내기…
打开工程文件…|開啟工程檔案…|Open project file…|Abrir archivo de proyecto…|Ouvrir le fichier de projet…|Projektdatei öffnen…|プロジェクトファイルを開く…|프로젝트 파일 열기…
播放合成|播放合成|Play composition|Reproducir composición|Lire la composition|Komposition abspielen|コンポジションを再生|컴포지션 재생
保存合成到本机|儲存合成到本機|Save composition to this device|Guardar composición en este equipo|Enregistrer la composition sur cet appareil|Komposition auf diesem Gerät speichern|コンポジションをこの端末に保存|컴포지션을 이 기기에 저장
导出工程 JSON 文件|匯出工程 JSON 檔案|Export project JSON file|Exportar archivo JSON del proyecto|Exporter le projet en JSON|Projekt als JSON exportieren|プロジェクト JSON を書き出し|프로젝트 JSON 내보내기
打开工程 JSON 文件|開啟工程 JSON 檔案|Open project JSON file|Abrir archivo JSON del proyecto|Ouvrir un projet JSON|Projekt-JSON öffnen|プロジェクト JSON を開く|프로젝트 JSON 열기
帧条、洋葱皮、画笔与精灵表导出。|幀條、洋蔥皮、筆刷與精靈表匯出。|Frame strip, onion skin, brushes and sprite sheet export.|Tira de fotogramas, papel cebolla, pinceles y exportación de hoja de sprites.|Bande de images, pelure d'oignon, pinceaux et export de planche de sprites.|Frameleiste, Zwiebelhaut, Pinsel und Spritesheet-Export.|フレームバー、オニオンスキン、ブラシ、スプライトシート書き出し。|프레임 바, 어니언 스킨, 브러시, 스프라이트 시트 내보내기.
画笔逐帧画；开洋葱皮对齐上一帧|筆刷逐幀畫；開洋蔥皮對齊上一幀|Draw frame by frame; turn on onion skin to align with the previous frame|Dibuja fotograma a fotograma; activa el papel cebolla para alinear con el anterior|Dessinez image par image ; activez la pelure d'oignon pour aligner sur la précédente|Bild für Bild zeichnen; Zwiebelhaut zum Ausrichten am vorherigen Bild einschalten|1 フレームずつ描画。オニオンスキンをオンにすると前のフレームに合わせられます。|프레임마다 그리세요. 어니언 스킨을 켜면 이전 프레임에 맞출 수 있습니다.
帧数过多，超过 400 KB 存档上限，本次未保存|幀數過多，超過 400 KB 存檔上限，本次未儲存|Too many frames; the 400 KB save limit was exceeded, so this change was not saved|Demasiados fotogramas; se superó el límite de 400 KB y no se guardó|Trop d'images ; la limite de 400 Ko est dépassée, rien n'a été enregistré|Zu viele Frames; das 400-KB-Limit wurde überschritten, nicht gespeichert|フレームが多すぎて 400 KB の保存上限を超えたため、今回は保存されませんでした|프레임이 너무 많아 400KB 저장 한도를 초과해 이번에는 저장하지 않았습니다
新建帧|新增幀|New frame|Nuevo fotograma|Nouvelle image|Neues Bild|新規フレーム|새 프레임
复制帧|複製幀|Duplicate frame|Duplicar fotograma|Dupliquer l'image|Bild duplizieren|フレームを複製|프레임 복제
第 |第 |Frame |Fotograma |Image |Bild |第 |프레임 
 帧 · | 幀 · | frame · | fotograma · | image · | Bild · | フレーム · | 프레임 · 
工具属性|工具屬性|Tool properties|Propiedades de la herramienta|Propriétés de l'outil|Werkzeugeigenschaften|ツールプロパティ|도구 속성
笔刷|筆刷|Brush|Pincel|Pinceau|Pinsel|ブラシ|브러시
 洋葱皮| 洋蔥皮| onion skin| papel cebolla| pelure d'oignon| Zwiebelhaut| オニオンスキン| 어니언 스킨
帧率|影格率|Frame rate|Fotogramas por segundo|Images par seconde|Bildrate|フレームレート|프레임 속도
导出精灵表|匯出精靈表|Export sprite sheet|Exportar hoja de sprites|Exporter la planche de sprites|Spritesheet exportieren|スプライトシートを書き出し|스프라이트 시트 내보내기
精灵表已导出（|精靈表已匯出（|Sprite sheet exported (|Hoja de sprites exportada (|Planche de sprites exportée (|Spritesheet exportiert (|スプライトシートを書き出しました（|스프라이트 시트 내보냄(
 帧）| 幀）| frames)| fotogramas)| images)| Bilder)| フレーム）| 프레임)
保存帧到本机|儲存幀到本機|Save frame to this device|Guardar fotograma en este equipo|Enregistrer l'image sur cet appareil|Bild auf diesem Gerät speichern|フレームをこの端末に保存|프레임을 이 기기에 저장
混音|混音|Mix|Mezcla|Mixage|Mix|ミックス|믹스
七通道调音台、区域编辑器与 WebAudio 合成，导出 WAV。|七通道混音台、區域編輯器與 WebAudio 合成，匯出 WAV。|Seven-channel mixer, region editor and WebAudio synthesis; export WAV.|Mezclador de siete canales, editor de regiones y síntesis WebAudio; exporta WAV.|Console sept canaux, éditeur de régions et synthèse WebAudio ; export WAV.|Siebenkanal-Mixer, Bereichseditor und WebAudio-Synthese; WAV exportieren.|7 チャンネルミキサー、リージョンエディター、WebAudio 合成。WAV で書き出せます。|7채널 믹서, 영역 편집기, WebAudio 합성. WAV로 내보냅니다.
推子调音量；M/S 静音独奏；空格播放|推子調音量；M/S 靜音獨奏；空白鍵播放|Faders set level; M/S mute and solo; Space plays|Los faders ajustan el nivel; M/S silencian y aíslan; Espacio reproduce|Les faders règlent le niveau ; M/S coupent et isolent ; Espace lit|Fader regeln die Lautstärke; M/S stummschalten und solo; Leertaste spielt|フェーダーで音量調整。M/S でミュート／ソロ。スペースキーで再生。|페이더로 음량 조절, M/S로 음소거/솔로, Space로 재생.
播放/停止|播放/停止|Play/stop|Reproducir/Detener|Lecture/Arrêt|Wiedergabe/Stopp|再生/停止|재생/정지
 步 · 44.1 kHz| 步 · 44.1 kHz| steps · 44.1 kHz| pasos · 44.1 kHz| pas · 44,1 kHz| Schritte · 44,1 kHz| ステップ · 44.1 kHz| 스텝 · 44.1 kHz
声像|聲像|Pan|Paneo|Panoramique|Panorama|パン|패닝
编辑 · 区域|編輯 · 區域|Edit · regions|Editar · regiones|Éditer · régions|Bearbeiten · Bereiche|編集 · リージョン|편집 · 영역
点击方块开/关 · 当前步高亮|點擊方塊開/關 · 目前步高亮|Click a square to toggle it · the current step is highlighted|Haz clic en un cuadro para activarlo · el paso actual se resalta|Cliquez sur une case pour l'activer · le pas courant est surligné|Kästchen anklicken zum Umschalten · aktueller Schritt hervorgehoben|マスをクリックでオン／オフ · 現在のステップがハイライトされます|사각형을 클릭해 켜고 끄기 · 현재 스텝 강조
 · 第 | · 第 | · step | · paso | · pas | · Schritt | · 第 | · 
 步| 步| step| paso| pas| Schritt| ステップ| 스텝
 轨 · 1 bar · | 軌 · 1 bar · | track · 1 bar · | pista · 1 compás · | piste · 1 mesure · | Spur · 1 Takt · | トラック · 1 小節 · | 트랙 · 1마디 · 
渲染波形…|算繪波形…|Rendering waveform…|Generando forma de onda…|Génération de la forme d'onde…|Wellenform wird gerendert…|波形をレンダリング中…|파형 렌더링 중…
旁通|旁通|Bypass|Bypass|Contournement|Bypass|バイパス|바이패스
HPF 频率|HPF 頻率|HPF frequency|Frecuencia HPF|Fréquence HPF|HPF-Frequenz|HPF 周波数|HPF 주파수
LF 增益|LF 增益|LF gain|Ganancia LF|Gain LF|LF-Verstärkung|LF ゲイン|LF 게인
HF 增益|HF 增益|HF gain|Ganancia HF|Gain HF|HF-Verstärkung|HF ゲイン|HF 게인
LPF 频率|LPF 頻率|LPF frequency|Frecuencia LPF|Fréquence LPF|LPF-Frequenz|LPF 周波数|LPF 주파수
推子与 M/S 实时影响声音；EQ 参数作用于示例显示。|推子與 M/S 即時影響聲音；EQ 參數作用於範例顯示。|Faders and M/S affect the sound live; EQ settings apply to the demo display.|Los faders y M/S afectan al sonido en vivo; el EQ se aplica a la visualización de ejemplo.|Les faders et M/S agissent en direct ; l'EQ s'applique à l'affichage de démonstration.|Fader und M/S wirken live; EQ-Parameter gelten für die Demoanzeige.|フェーダーと M/S は音にリアルタイムで影響します。EQ はサンプル表示に適用されます。|페이더와 M/S는 소리에 실시간으로 영향을 줍니다. EQ는 예제 표시에 적용됩니다.
混音 · |混音 · |Mix · |Mezcla · |Mixage · |Mix · |ミックス · |믹스 · 
 轨 + 主输出 · | 軌 + 主輸出 · | tracks + master · | pistas + master · | pistes + master · | Spuren + Master · | トラック + マスター · | 트랙 + 마스터 · 
 BPM · 16 步| BPM · 16 步| BPM · 16 steps| BPM · 16 pasos| BPM · 16 pas| BPM · 16 Schritte| BPM · 16 ステップ| BPM · 16 스텝
WAV 已导出 · 复用上次渲染|WAV 已匯出 · 沿用上次算繪|WAV exported · reused the last render|WAV exportado · se reutilizó la última renderización|WAV exporté · rendu précédent réutilisé|WAV exportiert · letztes Rendering wiederverwendet|WAV を書き出しました · 前回のレンダリングを再利用|WAV 내보냄 · 이전 렌더링 재사용
WAV 已导出 · 峰值 |WAV 已匯出 · 峰值 |WAV exported · peak |WAV exportado · pico |WAV exporté · crête |WAV exportiert · Spitze |WAV を書き出しました · ピーク |WAV 내보냄 · 피크 
（已限幅到 0.98）|（已限幅到 0.98）|(limited to 0.98)|(limitado a 0.98)|(limité à 0,98)|(auf 0,98 begrenzt)|（0.98 にリミット）|(0.98로 제한)
轨道|軌道|Tracks|Pistas|Pistes|Spuren|トラック|트랙
全部取消静音|全部取消靜音|Unmute all|Reactivar todo|Tout réactiver|Alle stummschalten aufheben|すべてミュート解除|모두 음소거 해제
全部取消独奏|全部取消獨奏|Unsolo all|Quitar todos los solos|Tout désisoler|Alle Solos aufheben|すべてソロ解除|모두 솔로 해제
保存工程到本机|儲存工程到本機|Save project to this device|Guardar proyecto en este equipo|Enregistrer le projet sur cet appareil|Projekt auf diesem Gerät speichern|プロジェクトをこの端末に保存|프로젝트를 이 기기에 저장`;
export const rows = RAW.trim().split('\n').map((line) => line.split('|'));
