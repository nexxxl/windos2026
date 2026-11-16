// Draw board palettes, film looks and camera messages.
// Pipe table: zh-CN|zh-TW|en|es|fr|de|ja|ko
const RAW = `朱墨|朱墨|Cinnabar ink|Tinta de cinabrio|Encre de cinabre|Zinnobertinte|朱墨|주묵
胭脂|胭脂|Rouge|Carmín|Rouge|Rouge|臙脂|연지
朱砂|硃砂|Vermilion|Bermellón|Vermillon|Zinnober|辰砂|진사
赭石|赭石|Ochre|Ocre|Ocre|Ocker|赭石|황토
妃红|妃紅|Imperial pink|Rosa imperial|Rose impérial|Kaiserrosa|妃色|비홍
桃红|桃紅|Peach pink|Rosa melocotón|Rose pêche|Pfirsichrosa|桃色|도홍
海棠|海棠|Begonia|Begonia|Bégonia|Begonie|海棠|해당
檀色|檀色|Sandalwood|Sándalo|Santal|Sandelholz|檀色|단색
榴花|榴花|Pomegranate|Granada|Grenade|Granatapfel|榴花|석류
茜色|茜色|Madder|Rubia|Garance|Krapp|茜色|꼭두서니
殷红|殷紅|Crimson|Carmesí|Cramoisi|Karmesin|殷紅|은홍
酡红|酡紅|Flushed red|Rojo sonrojado|Rouge empourpré|Errötendes Rot|酡紅|타홍
绯红|緋紅|Scarlet|Escarlata|Écarlate|Scharlach|緋色|비홍
绛|絳|Deep crimson|Carmesí profundo|Cramoisi profond|Tiefkarmesin|絳|강
绛唇|絳唇|Crimson lips|Labios carmesí|Lèvres cramoisies|Karmesinlippen|絳唇|강순
缃琥|緗琥|Amber silk|Seda ámbar|Soie ambre|Bernsteinsseide|緗琥|상호
藤黄|藤黃|Gamboge|Gamboge|Gomme-gutte|Gummigutt|藤黄|등황
鹅黄|鵝黃|Gosling yellow|Amarillo pollito|Jaune poussin|Gänseküken-Gelb|鵞鳥黄|아황
缃色|緗色|Pale yellow|Amarillo pálido|Jaune pâle|Blasses Gelb|緗色|상색
琥珀|琥珀|Amber|Ámbar|Ambre|Bernstein|琥珀|호박
杏黄|杏黃|Apricot|Albaricoque|Abricot|Aprikose|杏黄|행황
黄栌|黃櫨|Smoke tree|Árbol del humo|Arbre à fumée|Perückenstrauch|黄櫨|황로
秋香|秋香|Autumn olive|Olivo otoñal|Olivier d'automne|Herbstolive|秋香|추향
姜黄|薑黃|Turmeric|Cúrcuma|Curcuma|Kurkuma|鬱金|강황
茶色|茶色|Tea brown|Marrón té|Brun thé|Teebraun|茶色|다색
枯黄|枯黃|Withered yellow|Amarillo marchito|Jaune flétri|Verwelktes Gelb|枯黄|고황
昏黄|昏黃|Dusk yellow|Amarillo crepuscular|Jaune crépusculaire|Dämmerungsgelb|昏黄|혼황
赤|赤|Red|Rojo|Rouge|Rot|赤|적
翠碧|翠碧|Jade green|Verde jade|Vert jade|Jadegrün|翠碧|취벽
石绿|石綠|Mineral green|Verde mineral|Vert minéral|Mineralgrün|石緑|석록
松花|松花|Pine pollen|Polen de pino|Pollen de pin|Kiefernpollen|松花|송화
竹青|竹青|Bamboo green|Verde bambú|Vert bambou|Bambusgrün|竹青|죽청
葱绿|蔥綠|Scallion green|Verde cebolleta|Vert ciboule|Lauchgrün|葱緑|총록
翡翠|翡翠|Emerald|Esmeralda|Émeraude|Smaragd|翡翠|비취
碧色|碧色|Azure green|Verde azur|Vert azur|Azurgrün|碧色|벽색
铜绿|銅綠|Patina|Pátina|Patine|Patina|銅緑|동록
柳绿|柳綠|Willow green|Verde sauce|Vert saule|Weidengrün|柳緑|유록
松柏|松柏|Pine green|Verde pino|Vert pin|Kieferngrün|松柏|송백
艾绿|艾綠|Mugwort green|Verde artemisa|Vert armoise|Beifußgrün|艾緑|애록
葱倩|蔥倩|Fresh scallion|Cebolleta fresca|Ciboule fraîche|Frischer Lauch|葱倩|총천
苍绿|蒼綠|Deep green|Verde profundo|Vert profond|Tiefgrün|蒼緑|창록
青霭|青靄|Misty blue-green|Azul verdoso brumoso|Bleu-vert brumeux|Dunstiges Blaugrün|青靄|청애
石青|石青|Mineral blue|Azul mineral|Bleu minéral|Mineralblau|石青|석청
花青|花青|Indigo blue|Azul añil|Bleu indigo|Indigoblau|花青|화청
天青|天青|Sky blue|Azul cielo|Bleu ciel|Himmelblau|天青|천청
月白|月白|Moon white|Blanco luna|Blanc lune|Mondweiß|月白|월백
群青|群青|Ultramarine|Ultramar|Outremer|Ultramarin|群青|군청
藏青|藏青|Navy|Azul marino|Bleu marine|Marineblau|蔵青|장청
湖蓝|湖藍|Lake blue|Azul lago|Bleu lac|Seeblau|湖藍|호람
苍青|蒼青|Deep azure|Azul profundo|Azur profond|Tiefazur|蒼青|창청
靛青|靛青|Indigo|Índigo|Indigo|Indigo|藍鉄|쪽빛
紫霞|紫霞|Violet glow|Resplandor violeta|Lueur violette|Violetter Schimmer|紫霞|자하
青莲|青蓮|Lotus violet|Violeta loto|Violet lotus|Lotusviolett|青蓮|청련
紫棠|紫棠|Violet plum|Ciruela violeta|Prune violette|Violettpflaume|紫棠|자당
丁香|丁香|Lilac|Lila|Lilas|Flieder|丁香|라일락
雪青|雪青|Snow violet|Violeta nieve|Violet neige|Schneeviolett|雪青|설청
酱紫|醬紫|Plum purple|Púrpura ciruela|Pourpre prune|Pflaumenpurpur|醬紫|장자
藕荷|藕荷|Lotus root|Raíz de loto|Racine de lotus|Lotuswurzel|藕荷|우하
黛紫|黛紫|Dark violet|Violeta oscuro|Violet sombre|Dunkelviolett|黛紫|대자
魏紫|魏紫|Peony violet|Violeta peonía|Violet pivoine|Pfingstrosenviolett|魏紫|위자
玄素|玄素|Black and white|Blanco y negro|Noir et blanc|Schwarz und Weiß|玄素|현소
墨色|墨色|Ink black|Negro tinta|Noir encre|Tintenschwarz|墨色|묵색
胡粉|胡粉|Lead white|Blanco de plomo|Blanc de plomb|Bleiweiß|胡粉|호분
玄色|玄色|Deep black|Negro profundo|Noir profond|Tiefschwarz|玄色|현색
漆黑|漆黑|Pitch black|Negro azabache|Noir d'encre|Pechschwarz|漆黒|칠흑
缁色|緇色|Monk black|Negro monje|Noir moine|Mönchsschwarz|緇色|치색
黧|黧|Dark sallow|Pálido oscuro|Terreux sombre|Dunkel fahl|黧|려
铅粉|鉛粉|Lead powder|Polvo de plomo|Poudre de plomb|Bleipulver|鉛粉|연분
精白|精白|Pure white|Blanco puro|Blanc pur|Reinweiß|精白|정백
鸦青|鴉青|Crow blue|Azul cuervo|Bleu corbeau|Krähenblau|鴉青|아청
液化|液化|Liquify|Licuar|Liquéfier|Verflüssigen|液化|액화
本色|本色|Natural|Natural|Naturel|Natürlich|自然色|본색
自然原片|自然原片|Natural original|Original natural|Original naturel|Natürliches Original|ナチュラル原画|자연 원본
宣和|宣和|Xuanhe|Xuanhe|Xuanhe|Xuanhe|宣和|선화
Classic Chrome·宣和画院|Classic Chrome·宣和畫院|Classic Chrome · Xuanhe Academy|Classic Chrome · Academia Xuanhe|Classic Chrome · Académie Xuanhe|Classic Chrome · Xuanhe-Akademie|Classic Chrome·宣和画院|Classic Chrome · 선화화원
汝窑|汝窯|Ru ware|Loza Ru|Céramique Ru|Ru-Keramik|汝窯|여요
Velvia·雨过天青|Velvia·雨過天青|Velvia · Sky after rain|Velvia · Cielo tras la lluvia|Velvia · Ciel après la pluie|Velvia · Himmel nach dem Regen|Velvia·雨過天青|Velvia · 비 갠 하늘
Provia·云破处|Provia·雲破處|Provia · Where clouds break|Provia · Donde rompen las nubes|Provia · Où les nuages se déchirent|Provia · Wo die Wolken aufbrechen|Provia·雲の切れ間|Provia · 구름이 갈라지는 곳
绢素|絹素|Raw silk|Seda cruda|Soie brute|Rohseide|絹素|견소
Astia·生绢温润|Astia·生絹溫潤|Astia · Warm raw silk|Astia · Seda cruda cálida|Astia · Soie brute chaleureuse|Astia · Warme Rohseide|Astia·生絹の温もり|Astia · 따뜻한 생견
墨韵|墨韻|Ink mood|Aire de tinta|Air d'encre|Tintenstimmung|墨韻|묵운
Acros·墨分五色|Acros·墨分五色|Acros · Five shades of ink|Acros · Cinco tonos de tinta|Acros · Cinq nuances d'encre|Acros · Fünf Tintenschattierungen|Acros·墨の五色|Acros · 다섯 빛깔 먹
长卷|長卷|Long scroll|Rollo largo|Long rouleau|Lange Rolle|長巻|장권
Eterna·千里江山|Eterna·千里江山|Eterna · A thousand miles of rivers and mountains|Eterna · Mil millas de ríos y montañas|Eterna · Mille lis de rivières et montagnes|Eterna · Tausend Meilen Flüsse und Berge|Eterna·千里江山|Eterna · 천 리 강산
旧笺|舊箋|Old letter paper|Papel de carta antiguo|Vieux papier à lettres|Altes Briefpapier|古い便箋|오래된 편지지
Vintage·尺素情怀|Vintage·尺素情懷|Vintage · Letters of old|Vintage · Cartas de antaño|Vintage · Lettres d'autrefois|Vintage · Briefe von einst|Vintage·尺素の思い|Vintage · 옛 편지
褪朱|褪朱|Faded vermilion|Bermellón desvaído|Vermillon délavé|Verblasstes Zinnober|褪朱|퇴주
Faded·丹青褪去|Faded·丹青褪去|Faded · Colors worn away|Faded · Colores desvaídos|Faded · Couleurs fanées|Faded · Verblasste Farben|Faded·丹青の褪色|Faded · 바랜 채색
寒潭|寒潭|Cold pool|Estanque frío|Étang froid|Kalter Teich|寒潭|한담
Cool·清冷深潭|Cool·清冷深潭|Cool · Cold deep pool|Cool · Estanque profundo y frío|Cool · Étang profond et froid|Cool · Kalter tiefer Teich|Cool·清冷の深潭|Cool · 차가운 깊은 못
暮山|暮山|Dusk mountain|Montaña al crepúsculo|Montagne au crépuscule|Dämmerungsberg|暮山|모산
Warm·暮山紫烟|Warm·暮山紫煙|Warm · Purple haze on dusk mountains|Warm · Bruma violeta sobre montañas|Warm · Brume violette sur les monts|Warm · Violetter Dunst über Bergen|Warm·暮山の紫煙|Warm · 저녁 산의 보랏빛 안개
幻光|幻光|Phantom light|Luz fantasma|Lumière fantôme|Phantomlicht|幻光|환광
Technicolor·浮光幻影|Technicolor·浮光幻影|Technicolor · Shimmering mirage|Technicolor · Espejismo vibrante|Technicolor · Mirage chatoyant|Technicolor · Schimmernde Fata Morgana|Technicolor·浮光幻影|Technicolor · 일렁이는 신기루
留影|留影|Keepsake|Recuerdo|Souvenir|Andenken|留影|유영
Polaroid·光影留念|Polaroid·光影留念|Polaroid · A keepsake of light|Polaroid · Recuerdo de luz|Polaroid · Souvenir de lumière|Polaroid · Lichtandenken|Polaroid·光の思い出|Polaroid · 빛의 기념
[RetroCamera] 摄像头不可用:|[RetroCamera] 相機不可用:|[RetroCamera] Camera unavailable:|[RetroCamera] Cámara no disponible:|[RetroCamera] Caméra indisponible :|[RetroCamera] Kamera nicht verfügbar:|[RetroCamera] カメラを利用できません：|[RetroCamera] 카메라를 사용할 수 없습니다:
旧数码·低保真|舊數位·低保真|Old digital · lo-fi|Digital antiguo · lo-fi|Vieux numérique · lo-fi|Alt-Digital · Lo-Fi|旧デジタル·ローファイ|옛 디지털 · 로파이
玩具相机·漏光|玩具相機·漏光|Toy camera · light leak|Cámara de juguete · fuga de luz|Appareil jouet · fuite de lumière|Spielzeugkamera · Lichtleck|トイカメラ·光漏れ|토이 카메라 · 빛샘
即影即有·柔光|即影即有·柔光|Instant · soft glow|Instantánea · brillo suave|Instantané · éclat doux|Sofortbild · weicher Glanz|インスタント·柔らかな光|즉석 · 부드러운 빛
高感金调·暖夜|高感金調·暖夜|High-ISO gold · warm night|Oro de ISO alto · noche cálida|Or ISO élevé · nuit chaude|High-ISO-Gold · warme Nacht|高感度ゴールド·暖かな夜|고감도 골드 · 따뜻한 밤
黑白颗粒·墨分五色|黑白顆粒·墨分五色|B&W grain · five shades of ink|Grano B/N · cinco tonos de tinta|Grain N&B · cinq nuances d'encre|S/W-Korn · fünf Tintenschattierungen|モノクロ粒子·墨の五色|흑백 입자 · 다섯 빛깔 먹
电影影调·宽动态|電影影調·寬動態|Cinematic · wide dynamic range|Cine · alto rango dinámico|Cinéma · plage dynamique étendue|Kino · hoher Dynamikumfang|映画調·ワイドダイナミック|영화 톤 · 넓은 다이내믹
漏光|漏光|Light leak|Fuga de luz|Fuite de lumière|Lichtleck|光漏れ|빛샘
暖光溢出·胶片漏光|暖光溢出·底片漏光|Warm spill · film light leak|Derrame cálido · fuga de película|Débordement chaud · fuite argentique|Warmes Streulicht · Filmlichtleck|暖光の滲み·フィルム光漏れ|따뜻한 빛 번짐 · 필름 빛샘
过期卷|過期卷|Expired roll|Rollo caducado|Pellicule périmée|Abgelaufener Film|期限切れフィルム|유통기한 지난 필름
褪色偏移·过期胶卷|褪色偏移·過期膠卷|Faded shift · expired film|Desviación desvaída · película caducada|Dérive délavée · pellicule périmée|Verblasste Verschiebung · abgelaufener Film|退色シフト·期限切れフィルム|바랜 색 이동 · 유통기한 지난 필름
冲洗|沖洗|Develop|Revelar|Développer|Entwickeln|現像|현상
交叉冲洗·青橙|交叉沖洗·青橙|Cross-process · teal and orange|Proceso cruzado · turquesa y naranja|Traitement croisé · cyan et orange|Crossentwicklung · Türkis und Orange|クロスプロセス·青橙|교차 현상 · 청록과 주황
艳丽正片·饱和极致|豔麗正片·飽和極致|Vivid slide · maximum saturation|Diapositiva viva · saturación máxima|Diapositive vive · saturation maximale|Lebendiger Diafilm · maximale Sättigung|ビビッドポジ·最大彩度|선명한 슬라이드 · 최대 채도
宝丽来·褪色留影|寶麗來·褪色留影|Polaroid · faded keepsake|Polaroid · recuerdo desvaído|Polaroid · souvenir délavé|Polaroid · verblasstes Andenken|ポラロイド·褪せた思い出|폴라로이드 · 바랜 기념`;
export const rows = RAW.trim().split('\n').map((line) => line.split('|'));
