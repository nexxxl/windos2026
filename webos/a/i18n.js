import { EXTRA_TRANSLATIONS, MESSAGE_TEMPLATES, OVERLAY_TRANSLATIONS, OVERLAY_TEMPLATES } from './locales/catalog.js';
import { rows as OFFICE_ROWS, templates as OFFICE_TEMPLATES } from './locales/office-en.js';
// 界面语言：以中文原文为 key 的轻量字典 + DOM 本地化器。
// 只翻译系统界面的已登记文案；用户内容、路径与第三方应用不参与。
// Chrome 72 兼容：不使用可选链、空值合并等新语法。

export const LANGUAGES = [
  { code: 'zh-CN', label: '简体中文' },
  { code: 'zh-TW', label: '繁體中文' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'ar', label: 'العربية', dir: 'rtl' },
  { code: 'cs', label: 'Čeština' },
  { code: 'it', label: 'Italiano' },
  { code: 'pt-BR', label: 'Português (Brasil)' },
  { code: 'ru', label: 'Русский' },
  { code: 'tr', label: 'Türkçe' },
  { code: 'vi', label: 'Tiếng Việt' },
];

const DICT = {
  'zh-TW': {
    '设置': '設定', '系统': '系統', '设备': '裝置', '网络和 Internet': '網路和網際網路',
    '个性化': '個人化', '应用': '應用程式', '时间和语言': '時間與語言', '游戏': '遊戲',
    '隐私': '隱私權', '更新和安全': '更新與安全性', '开始': '開始', '搜索': '搜尋',
    '全部应用': '所有應用程式', '最近使用': '最近使用', '已固定': '已釘選', '电源': '電源',
    '任务视图': '工作檢視', '显示桌面': '顯示桌面', '通知': '通知', '快速设置': '快速設定',
    '没有新通知': '沒有新通知', '清除全部': '全部清除', '深色模式': '深色模式',
    '减少动画': '減少動畫', '亮度': '亮度', '电池': '電池', '充电中': '充電中',
    '已连接': '已連線', '未连接': '未連線', '音量': '音量', '日历': '行事曆',
    '关闭': '關閉', '最小化': '最小化', '最大化': '最大化', '还原': '還原',
    '关闭窗口': '關閉視窗', '此电脑': '本機', '画板': '畫板', '终端': '終端機',
    '书房': '書房', '视频': '影片', '音乐': '音樂', '扫一扫': '掃描', '记忆': '記憶',
    '显示': '顯示器', '声音': '音效', '选择主题': '選擇主題', 'NEXL现代主题': 'NEXL 現代主題',
    'Windos2026': 'Windos2026', '现代主题背景': '現代主題背景', '湖畔公园': '湖畔公園',
    '上传背景图片': '上傳背景圖片',
    '强调色': '強調色', '界面语言': '介面語言', '语言': '語言', '当前时间': '目前時間',
    '时区': '時區', '24 小时制': '24 小時制', '跟随本机时钟': '跟隨本機時鐘',
    '由浏览器从本机系统读取': '由瀏覽器從本機系統讀取', '保存': '儲存', '已保存': '已儲存',
    '关于': '關於', '版本': '版本', '本地账户': '本機帳戶', '工作区': '工作區',
    '磁盘可用': '磁碟可用', '今天': '今天', '上午': '上午', '下午': '下午',
    '周一': '週一', '周二': '週二', '周三': '週三', '周四': '週四', '周五': '週五', '周六': '週六', '周日': '週日',
  },
  en: {
    '设置': 'Settings', '系统': 'System', '设备': 'Devices', '网络和 Internet': 'Network & Internet',
    '个性化': 'Personalization', '应用': 'Apps', '时间和语言': 'Time & language', '游戏': 'Gaming',
    '隐私': 'Privacy', '更新和安全': 'Update & security', '开始': 'Start', '搜索': 'Search',
    '全部应用': 'All apps', '最近使用': 'Recent', '已固定': 'Pinned', '电源': 'Power',
    '任务视图': 'Task view', '显示桌面': 'Show desktop', '通知': 'Notifications', '快速设置': 'Quick settings',
    '没有新通知': 'No new notifications', '清除全部': 'Clear all', '深色模式': 'Dark mode',
    '减少动画': 'Reduce motion', '亮度': 'Brightness', '电池': 'Battery', '充电中': 'Charging',
    '已连接': 'Connected', '未连接': 'Disconnected', '音量': 'Volume', '日历': 'Calendar',
    '关闭': 'Close', '最小化': 'Minimize', '最大化': 'Maximize', '还原': 'Restore',
    '关闭窗口': 'Close window', '此电脑': 'This PC', '画板': 'Canvas', '终端': 'Terminal',
    '书房': 'Study', '视频': 'Video', '音乐': 'Music', '扫一扫': 'Scan', '记忆': 'Memory',
    '显示': 'Display', '声音': 'Sound', '选择主题': 'Choose a theme', 'NEXL现代主题': 'NEXL Modern',
    'Windos2026': 'Windos2026', '现代主题背景': 'Modern wallpapers', '湖畔公园': 'Lakeside Park',
    '上传背景图片': 'Upload wallpaper',
    '强调色': 'Accent color', '界面语言': 'Display language', '语言': 'Language', '当前时间': 'Current time',
    '时区': 'Time zone', '24 小时制': '24-hour clock', '跟随本机时钟': 'Follows this device',
    '由浏览器从本机系统读取': 'Read from the system browser', '保存': 'Save', '已保存': 'Saved',
    '关于': 'About', '版本': 'Version', '本地账户': 'Local account', '工作区': 'Workspace',
    '磁盘可用': 'Disk available', '今天': 'Today', '上午': 'AM', '下午': 'PM',
    '周一': 'Mon', '周二': 'Tue', '周三': 'Wed', '周四': 'Thu', '周五': 'Fri', '周六': 'Sat', '周日': 'Sun',
  },
  es: {
    '设置': 'Configuración', '系统': 'Sistema', '设备': 'Dispositivos', '网络和 Internet': 'Red e Internet',
    '个性化': 'Personalización', '应用': 'Aplicaciones', '时间和语言': 'Hora e idioma', '游戏': 'Juegos',
    '隐私': 'Privacidad', '更新和安全': 'Actualización y seguridad', '开始': 'Inicio', '搜索': 'Buscar',
    '全部应用': 'Todas las aplicaciones', '最近使用': 'Recientes', '已固定': 'Anclados', '电源': 'Energía',
    '任务视图': 'Vista de tareas', '显示桌面': 'Mostrar escritorio', '通知': 'Notificaciones',
    '快速设置': 'Configuración rápida', '没有新通知': 'No hay notificaciones nuevas', '清除全部': 'Borrar todo',
    '深色模式': 'Modo oscuro', '减少动画': 'Reducir movimiento', '亮度': 'Brillo', '电池': 'Batería',
    '充电中': 'Cargando', '已连接': 'Conectado', '未连接': 'Desconectado', '音量': 'Volumen',
    '日历': 'Calendario', '关闭': 'Cerrar', '最小化': 'Minimizar', '最大化': 'Maximizar',
    '还原': 'Restaurar', '关闭窗口': 'Cerrar ventana', '此电脑': 'Este equipo', '画板': 'Lienzo',
    '终端': 'Terminal', '书房': 'Estudio', '视频': 'Vídeo', '音乐': 'Música', '扫一扫': 'Escanear',
    '记忆': 'Memoria', '显示': 'Pantalla', '声音': 'Sonido', '选择主题': 'Elegir un tema',
    'NEXL现代主题': 'NEXL Moderno', 'Windos2026': 'Windos2026', '现代主题背景': 'Fondos modernos',
    '湖畔公园': 'Parque junto al lago',
    '上传背景图片': 'Subir fondo', '强调色': 'Color de énfasis', '界面语言': 'Idioma de interfaz',
    '语言': 'Idioma', '当前时间': 'Hora actual', '时区': 'Zona horaria', '24 小时制': 'Formato de 24 horas',
    '跟随本机时钟': 'Sigue este dispositivo', '由浏览器从本机系统读取': 'Leído del navegador del sistema',
    '保存': 'Guardar', '已保存': 'Guardado', '关于': 'Acerca de', '版本': 'Versión',
    '本地账户': 'Cuenta local', '工作区': 'Espacio de trabajo', '磁盘可用': 'Disco disponible',
    '今天': 'Hoy', '上午': 'a. m.', '下午': 'p. m.',
    '周一': 'lun', '周二': 'mar', '周三': 'mié', '周四': 'jue', '周五': 'vie', '周六': 'sáb', '周日': 'dom',
  },
  fr: {
    '设置': 'Paramètres', '系统': 'Système', '设备': 'Appareils', '网络和 Internet': 'Réseau et Internet',
    '个性化': 'Personnalisation', '应用': 'Applications', '时间和语言': 'Heure et langue', '游戏': 'Jeux',
    '隐私': 'Confidentialité', '更新和安全': 'Mise à jour et sécurité', '开始': 'Démarrer', '搜索': 'Rechercher',
    '全部应用': 'Toutes les applications', '最近使用': 'Récents', '已固定': 'Épinglés', '电源': 'Alimentation',
    '任务视图': 'Vue des tâches', '显示桌面': 'Afficher le bureau', '通知': 'Notifications',
    '快速设置': 'Réglages rapides', '没有新通知': 'Aucune nouvelle notification', '清除全部': 'Tout effacer',
    '深色模式': 'Mode sombre', '减少动画': 'Réduire les animations', '亮度': 'Luminosité', '电池': 'Batterie',
    '充电中': 'En charge', '已连接': 'Connecté', '未连接': 'Déconnecté', '音量': 'Volume',
    '日历': 'Calendrier', '关闭': 'Fermer', '最小化': 'Réduire', '最大化': 'Agrandir',
    '还原': 'Restaurer', '关闭窗口': 'Fermer la fenêtre', '此电脑': 'Ce PC', '画板': 'Tableau',
    '终端': 'Terminal', '书房': 'Bureau', '视频': 'Vidéo', '音乐': 'Musique', '扫一扫': 'Scanner',
    '记忆': 'Mémoire', '显示': 'Affichage', '声音': 'Son', '选择主题': 'Choisir un thème',
    'NEXL现代主题': 'NEXL Moderne', 'Windos2026': 'Windos2026', '现代主题背景': 'Fonds modernes',
    '湖畔公园': 'Parc au bord du lac',
    '上传背景图片': 'Importer un fond', '强调色': "Couleur d'accentuation", '界面语言': "Langue d'affichage",
    '语言': 'Langue', '当前时间': 'Heure actuelle', '时区': 'Fuseau horaire', '24 小时制': 'Format 24 heures',
    '跟随本机时钟': 'Suit cet appareil', '由浏览器从本机系统读取': 'Lu depuis le navigateur système',
    '保存': 'Enregistrer', '已保存': 'Enregistré', '关于': 'À propos', '版本': 'Version',
    '本地账户': 'Compte local', '工作区': 'Espace de travail', '磁盘可用': 'Disque disponible',
    '今天': "Aujourd'hui", '上午': 'AM', '下午': 'PM',
    '周一': 'lun', '周二': 'mar', '周三': 'mer', '周四': 'jeu', '周五': 'ven', '周六': 'sam', '周日': 'dim',
  },
  de: {
    '设置': 'Einstellungen', '系统': 'System', '设备': 'Geräte', '网络和 Internet': 'Netzwerk und Internet',
    '个性化': 'Personalisierung', '应用': 'Apps', '时间和语言': 'Zeit und Sprache', '游戏': 'Spiele',
    '隐私': 'Datenschutz', '更新和安全': 'Update und Sicherheit', '开始': 'Start', '搜索': 'Suchen',
    '全部应用': 'Alle Apps', '最近使用': 'Zuletzt verwendet', '已固定': 'Angeheftet', '电源': 'Energie',
    '任务视图': 'Aufgabenansicht', '显示桌面': 'Desktop anzeigen', '通知': 'Benachrichtigungen',
    '快速设置': 'Schnelleinstellungen', '没有新通知': 'Keine neuen Benachrichtigungen', '清除全部': 'Alle löschen',
    '深色模式': 'Dunkelmodus', '减少动画': 'Bewegung reduzieren', '亮度': 'Helligkeit', '电池': 'Akku',
    '充电中': 'Wird geladen', '已连接': 'Verbunden', '未连接': 'Getrennt', '音量': 'Lautstärke',
    '日历': 'Kalender', '关闭': 'Schließen', '最小化': 'Minimieren', '最大化': 'Maximieren',
    '还原': 'Wiederherstellen', '关闭窗口': 'Fenster schließen', '此电脑': 'Dieser PC', '画板': 'Zeichenbrett',
    '终端': 'Terminal', '书房': 'Studium', '视频': 'Video', '音乐': 'Musik', '扫一扫': 'Scannen',
    '记忆': 'Speicher', '显示': 'Anzeige', '声音': 'Ton', '选择主题': 'Design auswählen',
    'NEXL现代主题': 'NEXL Modern', 'Windos2026': 'Windos2026', '现代主题背景': 'Moderne Hintergründe',
    '湖畔公园': 'Park am See',
    '上传背景图片': 'Hintergrund hochladen', '强调色': 'Akzentfarbe', '界面语言': 'Anzeigesprache',
    '语言': 'Sprache', '当前时间': 'Aktuelle Zeit', '时区': 'Zeitzone', '24 小时制': '24-Stunden-Format',
    '跟随本机时钟': 'Folgt diesem Gerät', '由浏览器从本机系统读取': 'Vom Systembrowser gelesen',
    '保存': 'Speichern', '已保存': 'Gespeichert', '关于': 'Info', '版本': 'Version',
    '本地账户': 'Lokales Konto', '工作区': 'Arbeitsbereich', '磁盘可用': 'Verfügbarer Speicher',
    '今天': 'Heute', '上午': 'AM', '下午': 'PM',
    '周一': 'Mo', '周二': 'Di', '周三': 'Mi', '周四': 'Do', '周五': 'Fr', '周六': 'Sa', '周日': 'So',
  },
  ja: {
    '设置': '設定', '系统': 'システム', '设备': 'デバイス', '网络和 Internet': 'ネットワークとインターネット',
    '个性化': '個人用設定', '应用': 'アプリ', '时间和语言': '時刻と言語', '游戏': 'ゲーム',
    '隐私': 'プライバシー', '更新和安全': '更新とセキュリティ', '开始': 'スタート', '搜索': '検索',
    '全部应用': 'すべてのアプリ', '最近使用': '最近使った項目', '已固定': 'ピン留め', '电源': '電源',
    '任务视图': 'タスクビュー', '显示桌面': 'デスクトップを表示', '通知': '通知',
    '快速设置': 'クイック設定', '没有新通知': '新しい通知はありません', '清除全部': 'すべて消去',
    '深色模式': 'ダークモード', '减少动画': 'モーションを減らす', '亮度': '明るさ', '电池': 'バッテリー',
    '充电中': '充電中', '已连接': '接続済み', '未连接': '未接続', '音量': '音量',
    '日历': 'カレンダー', '关闭': '閉じる', '最小化': '最小化', '最大化': '最大化',
    '还原': '元に戻す', '关闭窗口': 'ウィンドウを閉じる', '此电脑': 'この PC', '画板': 'キャンバス',
    '终端': 'ターミナル', '书房': '書斎', '视频': 'ビデオ', '音乐': 'ミュージック', '扫一扫': 'スキャン',
    '记忆': 'メモリー', '显示': 'ディスプレイ', '声音': 'サウンド', '选择主题': 'テーマを選択',
    'NEXL现代主题': 'NEXL モダン', 'Windos2026': 'Windos2026', '现代主题背景': 'モダンな背景',
    '湖畔公园': '湖畔公園',
    '上传背景图片': '背景をアップロード', '强调色': 'アクセントカラー', '界面语言': '表示言語',
    '语言': '言語', '当前时间': '現在の時刻', '时区': 'タイムゾーン', '24 小时制': '24 時間制',
    '跟随本机时钟': 'このデバイスに従う', '由浏览器从本机系统读取': 'システム ブラウザーから読み取り',
    '保存': '保存', '已保存': '保存済み', '关于': 'バージョン情報', '版本': 'バージョン',
    '本地账户': 'ローカル アカウント', '工作区': 'ワークスペース', '磁盘可用': '使用可能なディスク',
    '今天': '今日', '上午': '午前', '下午': '午後',
    '周一': '月', '周二': '火', '周三': '水', '周四': '木', '周五': '金', '周六': '土', '周日': '日',
  },
  ko: {
    '设置': '설정', '系统': '시스템', '设备': '장치', '网络和 Internet': '네트워크 및 인터넷',
    '个性化': '개인 설정', '应用': '앱', '时间和语言': '시간 및 언어', '游戏': '게임',
    '隐私': '개인 정보 보호', '更新和安全': '업데이트 및 보안', '开始': '시작', '搜索': '검색',
    '全部应用': '모든 앱', '最近使用': '최근 사용', '已固定': '고정됨', '电源': '전원',
    '任务视图': '작업 보기', '显示桌面': '바탕 화면 표시', '通知': '알림',
    '快速设置': '빠른 설정', '没有新通知': '새 알림 없음', '清除全部': '모두 지우기',
    '深色模式': '다크 모드', '减少动画': '동작 줄이기', '亮度': '밝기', '电池': '배터리',
    '充电中': '충전 중', '已连接': '연결됨', '未连接': '연결 끊김', '音量': '볼륨',
    '日历': '캘린더', '关闭': '닫기', '最小化': '최소화', '最大化': '최대화',
    '还原': '복원', '关闭窗口': '창 닫기', '此电脑': '내 PC', '画板': '캔버스',
    '终端': '터미널', '书房': '서재', '视频': '비디오', '音乐': '음악', '扫一扫': '스캔',
    '记忆': '메모리', '显示': '디스플레이', '声音': '소리', '选择主题': '테마 선택',
    'NEXL现代主题': 'NEXL 모던', 'Windos2026': 'Windos2026', '现代主题背景': '모던 배경',
    '湖畔公园': '호숫가 공원',
    '上传背景图片': '배경 업로드', '强调色': '강조 색', '界面语言': '표시 언어',
    '语言': '언어', '当前时间': '현재 시간', '时区': '표준 시간대', '24 小时制': '24시간제',
    '跟随本机时钟': '이 장치 따르기', '由浏览器从本机系统读取': '시스템 브라우저에서 읽음',
    '保存': '저장', '已保存': '저장됨', '关于': '정보', '版本': '버전',
    '本地账户': '로컬 계정', '工作区': '작업 공간', '磁盘可用': '사용 가능한 디스크',
    '今天': '오늘', '上午': '오전', '下午': '오후',
    '周一': '월', '周二': '화', '周三': '수', '周四': '목', '周五': '금', '周六': '토', '周日': '일',
  },
};

// 设置页与系统页的补充词条。未覆盖的长文案回退英文，保证外语界面不夹中文。
const EXTRA = {
  "en": {
    "由本机设备控制": "Controlled by this device",
    "显示在桌面右下角": "Shown at the bottom right of the desktop",
    "由本机设备管理": "Managed by this device",
    "宿主工作区": "Host workspace",
    "工作区根目录": "Workspace root",
    "部署时切给 NexlOS 的宿主目录，可直接在文件管理器里打开": "The host folder assigned to NexlOS. Open it directly in the file manager.",
    "配额": "Quota",
    "上传、写入与记忆树都按这条上限执行": "Uploads, writes, and the memory tree all respect this limit.",
    "记忆树": "Memory tree",
    "打开工作区": "Open workspace",
    "修复目录": "Repair folder",
    "调整配额": "Adjust quota",
    "存储": "Storage",
    "设备名称、版本、NexlOS 目录与命令目录": "Device name, version, NexlOS folder, and command catalog",
    "查看": "View",
    "蓝牙和其他设备": "Bluetooth & other devices",
    "此设备由浏览器提供输入，没有可配对的蓝牙适配器": "Input comes from the browser. No Bluetooth adapter is available for pairing.",
    "未检测到": "Not detected",
    "鼠标、键盘和笔": "Mouse, keyboard & pen",
    "指针与键盘事件由本机浏览器转发到 NexlOS": "Pointer and keyboard events are forwarded to NexlOS by the local browser.",
    "本机": "This device",
    "打印机和扫描仪": "Printers & scanners",
    "NexlOS 不直接管理打印队列": "NexlOS does not manage print queues directly.",
    "无": "None",
    "设备页只报告真实可见的状态；没有的硬件不会伪造一个图标。": "This page reports only what is really present. Missing hardware is never faked with an icon.",
    "已连接到 NexlOS 本机回环": "Connected to the NexlOS loopback",
    "浏览器网络可用；应用通过本机 HTTP 服务访问内核": "Browser networking is available. Apps reach the kernel through the local HTTP service.",
    "以太网": "Ethernet",
    "IPv4 地址": "IPv4 address",
    "NexlOS 默认只监听本机回环": "NexlOS listens only on loopback by default.",
    "代理": "Proxy",
    "不经过任何代理，数据留在本机": "No proxy is used. Data stays on this device.",
    "应用联网": "App networking",
    "查看应用": "View apps",
    "NexlOS 是单机系统：没有云端账户，也没有远程同步。": "NexlOS is a standalone system: no cloud account and no remote sync.",
    "主题、背景与配色，让桌面成为你的创作空间": "Themes, wallpapers, and colors make the desktop your workspace.",
    "自由选择深浅配色与强调色": "Choose light or dark colors and an accent color.",
    "使用中": "In use",
    "经典桌面、立体边框与固定配色": "Classic desktop, dimensional borders, fixed palette",
    "选择深浅配色与强调色，或换一张喜欢的背景。每套主题会记住自己的背景。": "Choose light or dark colors and an accent, or pick a wallpaper. Each theme remembers its own background.",
    "当前": "Current",
    "标题栏、开关、选中项都会跟着变": "Title bars, switches, and selections follow the accent.",
    "深浅配色主题": "Light and dark themes",
    "浅色": "Light",
    "任务栏、开始菜单与窗口用浅色": "Taskbar, Start menu, and windows use light colors",
    "深色": "Dark",
    "外壳与系统应用切到深色": "Shell and system apps switch to dark",
    "窗口与开始菜单改用更短的过渡": "Windows and the Start menu use shorter transitions",
    "主题会立即作用于桌面外壳；第三方应用保留自己的配色。": "Themes apply to the desktop shell immediately. Third-party apps keep their own colors.",
    "全部来自 NexlOS 应用清单": "All entries come from the NexlOS app catalog.",
    "浏览 NexlOS 目录：空间、应用、库与日志。": "Browse the NexlOS tree: spaces, apps, libraries, and logs.",
    "内置": "Built-in",
    "在宿主电脑上跑 shell：git、npm、构建脚本。": "Run a shell on the host: git, npm, build scripts.",
    "宿主工作区的记忆树：主题、观察与项目。": "The host workspace memory tree: topics, observations, and projects.",
    "书目、正文、总纲、人物、任务与导出。": "Books, manuscripts, outlines, characters, tasks, and export.",
    "宋韵画笺：毛笔、水彩、蜡笔、画框、套索与拍立得，导出 PNG 到工作区。": "Song-style canvas: brush, watercolor, crayon, frames, lasso, and instant photos, exported as PNG to the workspace.",
    "内容矿机：选题雷达、六步创作主线、剧集资产与交付包。": "Content engine: topic radar, six-step story pipeline, episode assets, and delivery packs.",
    "NexlOS 的独立空库：只放这台系统的写作笔记，不读取原有知识库。": "A separate empty vault for this system's writing notes. It does not read an existing knowledge base.",
    "本地或网络视频：拖入即播，支持画中画与全屏。": "Local or network video: drop to play, with picture-in-picture and full screen.",
    "曲库、环境音与后台播放：手机锁屏也能继续。": "Library, ambient sound, and background playback that continues on the lock screen.",
    "摄像头扫码：二维码、网址与 NexlOS 应用链接。": "Camera scanning for QR codes, URLs, and NexlOS app links.",
    "主题、壁纸、颜色、应用与更新。": "Themes, wallpapers, colors, apps, and updates.",
    "内核版本、命令目录与运行状态。": "Kernel version, command catalog, and runtime status.",
    "默认应用": "Default apps",
    "Web 浏览器、邮件、地图由本机浏览器提供": "Web browser, mail, and maps are provided by the local browser",
    "打开系统面板": "Open system panel",
    "命令目录与内核状态": "Command catalog and kernel status",
    "内置应用随 NexlOS 二进制发布；第三方应用在独立配置里运行。": "Built-in apps ship inside the NexlOS binary. Third-party apps run from separate configurations.",
    "任务栏与设置里的时间立即切换": "The taskbar and Settings clock switch immediately",
    "整台系统的显示语言": "Display language for the whole system",
    "NexlOS 没有内置 NTP 客户端，时间与区域直接跟随这台设备。": "NexlOS has no built-in NTP client. Time and region follow this device.",
    "Xbox 游戏栏": "Xbox Game Bar",
    "NexlOS 不注入系统级覆盖层": "NexlOS does not inject a system-wide overlay",
    "不可用": "Unavailable",
    "游戏模式": "Game mode",
    "窗口与动画已经是轻量路径": "Windows and animations already use a light path",
    "始终开启": "Always on",
    "捕获": "Capture",
    "需要录屏时使用本机浏览器或系统工具": "Use the local browser or system tools to record the screen",
    "外部": "External",
    "这一页保留 Win10 的分类位置，但只写 NexlOS 真实具备的能力。": "This page keeps the Windows 10 category but lists only what NexlOS really does.",
    "位置、相机、麦克风、诊断": "Location, camera, microphone, diagnostics",
    "位置": "Location",
    "NexlOS 不请求定位权限": "NexlOS does not request location permission",
    "相机": "Camera",
    "应用无法访问摄像头": "Apps cannot access the camera",
    "麦克风": "Microphone",
    "应用无法访问麦克风": "Apps cannot access the microphone",
    "诊断数据": "Diagnostic data",
    "只在本机记录内核命令耗时": "Only kernel command timing is recorded locally",
    "基本": "Basic",
    "后台应用": "Background apps",
    "关闭窗口即释放 iframe，不在后台常驻": "Closing a window releases its iframe; nothing stays resident",
    "由桌面管理": "Managed by the desktop",
    "NexlOS 不向任何服务器上传数据。": "NexlOS uploads no data to any server.",
    "NexlOS 更新": "NexlOS update",
    "当前版本": "Current version",
    "你使用的是最新版本": "You are on the latest version",
    "NexlOS 以单个二进制发布，替换文件即完成更新": "NexlOS ships as one binary. Replace the file to update.",
    "检查更新": "Check for updates",
    "恢复默认外观": "Reset appearance",
    "主题、强调色、壁纸与时钟制式回到初始值": "Theme, accent, wallpaper, and clock format return to defaults",
    "恢复": "Reset",
    "备份": "Backup",
    "把 NexlOS 目录整体复制走就是完整备份": "Copying the whole NexlOS folder is a complete backup",
    "面向维护者": "For maintainers",
    "命令目录、运行状态与空间清单": "Command catalog, runtime status, and space inventory",
    "更新与恢复都不会删除空间、应用与库。": "Updates and resets never delete spaces, apps, or libraries.",
    "设置分类": "Settings categories",
    "查找设置": "Find a setting",
    "账户与关于": "Account and about",
    "没有匹配的设置。": "No matching settings.",
    "正在读取设置…": "Loading settings…",
    "重试": "Retry",
    "内核托管": "Kernel hosted",
    "壁纸已更换": "Wallpaper changed",
    "外观已恢复默认": "Appearance reset to defaults",
    "名字最多 24 个字": "The name can be at most 24 characters",
    "图片太大，未能保存": "The image is too large to save",
    "读不到这张图片": "That image could not be read",
    "工作区目录已补齐": "Workspace folders restored",
    "浏览器报告当前离线": "The browser reports it is offline",
    "无法读取": "Cannot read",
    "断开": "Disconnect",
    "离线": "Offline",
    "星河": "Golden Peaks at Sunset",
    "日落金山": "Golden Peaks at Sunset",
    "夜脊": "Night ridge",
    "应用和功能": "Apps & features",
    "观察": "Observations",
    "项目": "Projects",
    "星野": "NEXL"
  },
  "zh-TW": {
    "由本机设备控制": "由本機裝置控制",
    "显示在桌面右下角": "顯示在桌面右下角",
    "由本机设备管理": "由本機裝置管理",
    "宿主工作区": "宿主工作區",
    "工作区根目录": "工作區根目錄",
    "配额": "配額",
    "记忆树": "記憶樹",
    "打开工作区": "開啟工作區",
    "修复目录": "修復目錄",
    "调整配额": "調整配額",
    "存储": "儲存空間",
    "查看": "檢視",
    "蓝牙和其他设备": "藍牙與其他裝置",
    "未检测到": "未偵測到",
    "本机": "本機",
    "打印机和扫描仪": "印表機與掃描器",
    "无": "無",
    "以太网": "乙太網路",
    "IPv4 地址": "IPv4 位址",
    "代理": "代理伺服器",
    "应用联网": "應用程式網路",
    "查看应用": "檢視應用程式",
    "使用中": "使用中",
    "当前": "目前",
    "浅色": "淺色",
    "深色": "深色",
    "内置": "內建",
    "默认应用": "預設應用程式",
    "打开系统面板": "開啟系統面板",
    "任务栏与设置里的时间立即切换": "工作列與設定裡的時間立即切換",
    "整台系统的显示语言": "整台系統的顯示語言",
    "不可用": "無法使用",
    "游戏模式": "遊戲模式",
    "捕获": "擷取",
    "始终开启": "始終開啟",
    "外部": "外部",
    "位置": "位置",
    "相机": "相機",
    "麦克风": "麥克風",
    "诊断数据": "診斷資料",
    "基本": "基本",
    "后台应用": "背景應用程式",
    "由桌面管理": "由桌面管理",
    "NexlOS 更新": "NexlOS 更新",
    "当前版本": "目前版本",
    "检查更新": "檢查更新",
    "恢复默认外观": "還原預設外觀",
    "恢复": "還原",
    "备份": "備份",
    "面向维护者": "面向維護者",
    "设置分类": "設定分類",
    "查找设置": "尋找設定",
    "账户与关于": "帳戶與關於",
    "没有匹配的设置。": "沒有符合的設定。",
    "正在读取设置…": "正在讀取設定…",
    "重试": "重試",
    "内核托管": "核心託管",
    "壁纸已更换": "桌布已更換",
    "外观已恢复默认": "外觀已還原預設",
    "名字最多 24 个字": "名字最多 24 個字",
    "图片太大，未能保存": "圖片太大，未能儲存",
    "读不到这张图片": "讀不到這張圖片",
    "工作区目录已补齐": "工作區目錄已補齊",
    "浏览器报告当前离线": "瀏覽器回報目前離線",
    "无法读取": "無法讀取",
    "断开": "中斷連線",
    "离线": "離線",
    "星河": "日落金山",
    "日落金山": "日落金山",
    "夜脊": "夜脊",
    "部署时切给 NexlOS 的宿主目录，可直接在文件管理器里打开": "部署時切給 NexlOS 的宿主目錄，可直接在檔案總管裡開啟",
    "上传、写入与记忆树都按这条上限执行": "上傳、寫入與記憶樹都按這條上限執行",
    "设备名称、版本、NexlOS 目录与命令目录": "裝置名稱、版本、NexlOS 目錄與命令目錄",
    "此设备由浏览器提供输入，没有可配对的蓝牙适配器": "此裝置由瀏覽器提供輸入，沒有可配對的藍牙適配器",
    "鼠标、键盘和笔": "滑鼠、鍵盤與觸控筆",
    "指针与键盘事件由本机浏览器转发到 NexlOS": "指標與鍵盤事件由本機瀏覽器轉送到 NexlOS",
    "NexlOS 不直接管理打印队列": "NexlOS 不直接管理列印佇列",
    "设备页只报告真实可见的状态；没有的硬件不会伪造一个图标。": "裝置頁只回報真實可見的狀態；沒有的硬體不會偽造一個圖示。",
    "已连接到 NexlOS 本机回环": "已連線到 NexlOS 本機回環",
    "浏览器网络可用；应用通过本机 HTTP 服务访问内核": "瀏覽器網路可用；應用程式透過本機 HTTP 服務存取核心",
    "NexlOS 默认只监听本机回环": "NexlOS 預設只監聽本機回環",
    "不经过任何代理，数据留在本机": "不經過任何代理，資料留在本機",
    "NexlOS 是单机系统：没有云端账户，也没有远程同步。": "NexlOS 是單機系統：沒有雲端帳戶，也沒有遠端同步。",
    "主题、背景与配色，让桌面成为你的创作空间": "主題、背景與配色，讓桌面成為你的創作空間",
    "自由选择深浅配色与强调色": "自由選擇深淺配色與強調色",
    "经典桌面、立体边框与固定配色": "經典桌面、立體邊框與固定配色",
    "选择深浅配色与强调色，或换一张喜欢的背景。每套主题会记住自己的背景。": "選擇深淺配色與強調色，或換一張喜歡的背景。每套主題會記住自己的背景。",
    "标题栏、开关、选中项都会跟着变": "標題列、開關、選取項目都會跟著變",
    "深浅配色主题": "深淺配色主題",
    "任务栏、开始菜单与窗口用浅色": "工作列、開始功能表與視窗使用淺色",
    "外壳与系统应用切到深色": "外殼與系統應用程式切換為深色",
    "窗口与开始菜单改用更短的过渡": "視窗與開始功能表改用更短的過場",
    "主题会立即作用于桌面外壳；第三方应用保留自己的配色。": "主題會立即套用到桌面外殼；第三方應用程式保留自己的配色。",
    "全部来自 NexlOS 应用清单": "全部來自 NexlOS 應用程式清單",
    "浏览 NexlOS 目录：空间、应用、库与日志。": "瀏覽 NexlOS 目錄：空間、應用程式、庫與日誌。",
    "在宿主电脑上跑 shell：git、npm、构建脚本。": "在宿主電腦上執行 shell：git、npm、建置指令碼。",
    "宿主工作区的记忆树：主题、观察与项目。": "宿主工作區的記憶樹：主題、觀察與專案。",
    "书目、正文、总纲、人物、任务与导出。": "書目、正文、總綱、人物、任務與匯出。",
    "宋韵画笺：毛笔、水彩、蜡笔、画框、套索与拍立得，导出 PNG 到工作区。": "宋韻畫箋：毛筆、水彩、蠟筆、畫框、套索與拍立得，匯出 PNG 到工作區。",
    "内容矿机：选题雷达、六步创作主线、剧集资产与交付包。": "內容礦機：選題雷達、六步創作主線、劇集資產與交付包。",
    "NexlOS 的独立空库：只放这台系统的写作笔记，不读取原有知识库。": "NexlOS 的獨立空庫：只放這台系統的寫作筆記，不讀取原有知識庫。",
    "本地或网络视频：拖入即播，支持画中画与全屏。": "本機或網路影片：拖入即播，支援子母畫面與全螢幕。",
    "曲库、环境音与后台播放：手机锁屏也能继续。": "曲庫、環境音與背景播放：手機鎖屏也能繼續。",
    "摄像头扫码：二维码、网址与 NexlOS 应用链接。": "相機掃描：QR 碼、網址與 NexlOS 應用程式連結。",
    "主题、壁纸、颜色、应用与更新。": "主題、桌布、顏色、應用程式與更新。",
    "内核版本、命令目录与运行状态。": "核心版本、命令目錄與執行狀態。",
    "Web 浏览器、邮件、地图由本机浏览器提供": "網頁瀏覽器、郵件、地圖由本機瀏覽器提供",
    "命令目录与内核状态": "命令目錄與核心狀態",
    "内置应用随 NexlOS 二进制发布；第三方应用在独立配置里运行。": "內建應用程式隨 NexlOS 二進位檔發布；第三方應用程式在獨立設定中執行。",
    "NexlOS 没有内置 NTP 客户端，时间与区域直接跟随这台设备。": "NexlOS 沒有內建 NTP 用戶端，時間與區域直接跟隨這台裝置。",
    "Xbox 游戏栏": "Xbox 遊戲列",
    "NexlOS 不注入系统级覆盖层": "NexlOS 不注入系統級覆蓋層",
    "窗口与动画已经是轻量路径": "視窗與動畫已經是輕量路徑",
    "需要录屏时使用本机浏览器或系统工具": "需要錄影時使用本機瀏覽器或系統工具",
    "这一页保留 Win10 的分类位置，但只写 NexlOS 真实具备的能力。": "這一頁保留 Win10 的分類位置，但只寫 NexlOS 真實具備的能力。",
    "位置、相机、麦克风、诊断": "位置、相機、麥克風、診斷",
    "NexlOS 不请求定位权限": "NexlOS 不要求定位權限",
    "应用无法访问摄像头": "應用程式無法存取攝影機",
    "应用无法访问麦克风": "應用程式無法存取麥克風",
    "只在本机记录内核命令耗时": "只在本機記錄核心命令耗時",
    "关闭窗口即释放 iframe，不在后台常驻": "關閉視窗即釋放 iframe，不在背景常駐",
    "NexlOS 不向任何服务器上传数据。": "NexlOS 不向任何伺服器上傳資料。",
    "你使用的是最新版本": "你使用的是最新版本",
    "NexlOS 以单个二进制发布，替换文件即完成更新": "NexlOS 以單一二進位檔發布，替換檔案即完成更新",
    "主题、强调色、壁纸与时钟制式回到初始值": "主題、強調色、桌布與時鐘制式回到初始值",
    "把 NexlOS 目录整体复制走就是完整备份": "把 NexlOS 目錄整體複製走就是完整備份",
    "命令目录、运行状态与空间清单": "命令目錄、執行狀態與空間清單",
    "更新与恢复都不会删除空间、应用与库。": "更新與還原都不會刪除空間、應用程式與庫。",
    "应用和功能": "應用程式與功能",
    "观察": "觀察",
    "项目": "專案",
    "星野": "NEXL"
  },
  "es": {
    "由本机设备控制": "Controlado por este dispositivo",
    "显示在桌面右下角": "Se muestra en la esquina inferior derecha del escritorio",
    "由本机设备管理": "Gestionado por este dispositivo",
    "宿主工作区": "Espacio de trabajo del host",
    "工作区根目录": "Raíz del espacio de trabajo",
    "配额": "Cuota",
    "记忆树": "Árbol de memoria",
    "打开工作区": "Abrir espacio de trabajo",
    "修复目录": "Reparar carpeta",
    "调整配额": "Ajustar cuota",
    "存储": "Almacenamiento",
    "查看": "Ver",
    "蓝牙和其他设备": "Bluetooth y otros dispositivos",
    "未检测到": "No detectado",
    "本机": "Este dispositivo",
    "打印机和扫描仪": "Impresoras y escáneres",
    "无": "Ninguno",
    "以太网": "Ethernet",
    "IPv4 地址": "Dirección IPv4",
    "代理": "Proxy",
    "应用联网": "Red de aplicaciones",
    "查看应用": "Ver aplicaciones",
    "使用中": "En uso",
    "当前": "Actual",
    "浅色": "Claro",
    "深色": "Oscuro",
    "内置": "Integrada",
    "默认应用": "Aplicaciones predeterminadas",
    "打开系统面板": "Abrir panel del sistema",
    "任务栏与设置里的时间立即切换": "El reloj de la barra de tareas y de Configuración cambia al instante",
    "整台系统的显示语言": "Idioma de todo el sistema",
    "不可用": "No disponible",
    "游戏模式": "Modo de juego",
    "捕获": "Captura",
    "始终开启": "Siempre activo",
    "外部": "Externo",
    "位置": "Ubicación",
    "相机": "Cámara",
    "麦克风": "Micrófono",
    "诊断数据": "Datos de diagnóstico",
    "基本": "Básico",
    "后台应用": "Aplicaciones en segundo plano",
    "由桌面管理": "Gestionado por el escritorio",
    "NexlOS 更新": "Actualización de NexlOS",
    "当前版本": "Versión actual",
    "检查更新": "Buscar actualizaciones",
    "恢复默认外观": "Restablecer apariencia",
    "恢复": "Restablecer",
    "备份": "Copia de seguridad",
    "面向维护者": "Para mantenedores",
    "设置分类": "Categorías de configuración",
    "查找设置": "Buscar un ajuste",
    "账户与关于": "Cuenta y Acerca de",
    "没有匹配的设置。": "No hay ajustes coincidentes.",
    "正在读取设置…": "Cargando ajustes…",
    "重试": "Reintentar",
    "内核托管": "Kernel alojado",
    "壁纸已更换": "Fondo cambiado",
    "外观已恢复默认": "Apariencia restablecida",
    "名字最多 24 个字": "El nombre puede tener como máximo 24 caracteres",
    "图片太大，未能保存": "La imagen es demasiado grande para guardarla",
    "读不到这张图片": "No se pudo leer esa imagen",
    "工作区目录已补齐": "Carpetas del espacio de trabajo restauradas",
    "浏览器报告当前离线": "El navegador indica que está sin conexión",
    "无法读取": "No se puede leer",
    "断开": "Desconectar",
    "离线": "Sin conexión",
    "星河": "Picos dorados al atardecer",
    "日落金山": "Picos dorados al atardecer",
    "夜脊": "Cresta nocturna",
    "部署时切给 NexlOS 的宿主目录，可直接在文件管理器里打开": "La carpeta host asignada a NexlOS. Ábrela directamente en el explorador de archivos.",
    "上传、写入与记忆树都按这条上限执行": "Las cargas, escrituras y el árbol de memoria respetan este límite.",
    "设备名称、版本、NexlOS 目录与命令目录": "Nombre del dispositivo, versión, carpeta NexlOS y catálogo de comandos",
    "此设备由浏览器提供输入，没有可配对的蓝牙适配器": "La entrada proviene del navegador. No hay adaptador Bluetooth para emparejar.",
    "鼠标、键盘和笔": "Ratón, teclado y lápiz",
    "指针与键盘事件由本机浏览器转发到 NexlOS": "El navegador local reenvía los eventos de puntero y teclado a NexlOS.",
    "NexlOS 不直接管理打印队列": "NexlOS no gestiona directamente las colas de impresión.",
    "设备页只报告真实可见的状态；没有的硬件不会伪造一个图标。": "Esta página solo muestra lo que existe. El hardware ausente no se simula con un icono.",
    "已连接到 NexlOS 本机回环": "Conectado al bucle local de NexlOS",
    "浏览器网络可用；应用通过本机 HTTP 服务访问内核": "La red del navegador está disponible. Las aplicaciones acceden al kernel por el servicio HTTP local.",
    "NexlOS 默认只监听本机回环": "NexlOS solo escucha en el bucle local de forma predeterminada.",
    "不经过任何代理，数据留在本机": "No se usa ningún proxy. Los datos permanecen en este dispositivo.",
    "NexlOS 是单机系统：没有云端账户，也没有远程同步。": "NexlOS es un sistema autónomo: sin cuenta en la nube ni sincronización remota.",
    "主题、背景与配色，让桌面成为你的创作空间": "Temas, fondos y colores convierten el escritorio en tu espacio creativo.",
    "自由选择深浅配色与强调色": "Elige libremente colores claros u oscuros y un color de énfasis.",
    "经典桌面、立体边框与固定配色": "Escritorio clásico, bordes dimensionales y paleta fija",
    "选择深浅配色与强调色，或换一张喜欢的背景。每套主题会记住自己的背景。": "Elige colores claros u oscuros y un color de énfasis, o cambia el fondo. Cada tema recuerda su propio fondo.",
    "标题栏、开关、选中项都会跟着变": "Las barras de título, los interruptores y las selecciones siguen el color.",
    "深浅配色主题": "Temas claro y oscuro",
    "任务栏、开始菜单与窗口用浅色": "La barra de tareas, el menú Inicio y las ventanas usan colores claros",
    "外壳与系统应用切到深色": "El shell y las aplicaciones del sistema cambian a oscuro",
    "窗口与开始菜单改用更短的过渡": "Las ventanas y el menú Inicio usan transiciones más cortas",
    "主题会立即作用于桌面外壳；第三方应用保留自己的配色。": "El tema se aplica al shell al instante. Las aplicaciones de terceros conservan sus colores.",
    "全部来自 NexlOS 应用清单": "Todo procede del catálogo de aplicaciones de NexlOS.",
    "浏览 NexlOS 目录：空间、应用、库与日志。": "Explora el árbol NexlOS: espacios, aplicaciones, bibliotecas y registros.",
    "在宿主电脑上跑 shell：git、npm、构建脚本。": "Ejecuta un shell en el host: git, npm, scripts de compilación.",
    "宿主工作区的记忆树：主题、观察与项目。": "El árbol de memoria del espacio de trabajo: temas, observaciones y proyectos.",
    "书目、正文、总纲、人物、任务与导出。": "Libros, manuscritos, esquemas, personajes, tareas y exportación.",
    "宋韵画笺：毛笔、水彩、蜡笔、画框、套索与拍立得，导出 PNG 到工作区。": "Lienzo Song: pincel, acuarela, cera, marcos, lazo y fotos instantáneas, exportados como PNG al espacio de trabajo.",
    "内容矿机：选题雷达、六步创作主线、剧集资产与交付包。": "Motor de contenido: radar de temas, flujo creativo de seis pasos, activos de episodios y paquetes de entrega.",
    "NexlOS 的独立空库：只放这台系统的写作笔记，不读取原有知识库。": "Un almacén vacío independiente para las notas de escritura de este sistema. No lee una base de conocimiento existente.",
    "本地或网络视频：拖入即播，支持画中画与全屏。": "Vídeo local o de red: arrastra para reproducir, con imagen en imagen y pantalla completa.",
    "曲库、环境音与后台播放：手机锁屏也能继续。": "Biblioteca, sonido ambiente y reproducción en segundo plano que continúa con la pantalla bloqueada.",
    "摄像头扫码：二维码、网址与 NexlOS 应用链接。": "Escaneo con cámara de códigos QR, URL y enlaces de aplicaciones NexlOS.",
    "主题、壁纸、颜色、应用与更新。": "Temas, fondos, colores, aplicaciones y actualizaciones.",
    "内核版本、命令目录与运行状态。": "Versión del kernel, catálogo de comandos y estado de ejecución.",
    "Web 浏览器、邮件、地图由本机浏览器提供": "El navegador local proporciona el navegador web, el correo y los mapas",
    "命令目录与内核状态": "Catálogo de comandos y estado del kernel",
    "内置应用随 NexlOS 二进制发布；第三方应用在独立配置里运行。": "Las aplicaciones integradas se publican dentro del binario NexlOS. Las de terceros se ejecutan desde configuraciones independientes.",
    "NexlOS 没有内置 NTP 客户端，时间与区域直接跟随这台设备。": "NexlOS no incluye un cliente NTP. La hora y la región siguen a este dispositivo.",
    "Xbox 游戏栏": "Barra de juegos de Xbox",
    "NexlOS 不注入系统级覆盖层": "NexlOS no inyecta una capa superpuesta del sistema",
    "窗口与动画已经是轻量路径": "Las ventanas y animaciones ya usan una ruta ligera",
    "需要录屏时使用本机浏览器或系统工具": "Usa el navegador local o las herramientas del sistema para grabar la pantalla",
    "这一页保留 Win10 的分类位置，但只写 NexlOS 真实具备的能力。": "Esta página conserva la categoría de Windows 10, pero solo muestra lo que NexlOS hace de verdad.",
    "位置、相机、麦克风、诊断": "Ubicación, cámara, micrófono, diagnóstico",
    "NexlOS 不请求定位权限": "NexlOS no solicita permiso de ubicación",
    "应用无法访问摄像头": "Las aplicaciones no pueden acceder a la cámara",
    "应用无法访问麦克风": "Las aplicaciones no pueden acceder al micrófono",
    "只在本机记录内核命令耗时": "Solo se registra localmente el tiempo de los comandos del kernel",
    "关闭窗口即释放 iframe，不在后台常驻": "Cerrar una ventana libera su iframe; nada queda residente",
    "NexlOS 不向任何服务器上传数据。": "NexlOS no sube datos a ningún servidor.",
    "你使用的是最新版本": "Tienes la versión más reciente",
    "NexlOS 以单个二进制发布，替换文件即完成更新": "NexlOS se distribuye como un solo binario. Reemplaza el archivo para actualizar.",
    "主题、强调色、壁纸与时钟制式回到初始值": "Tema, color de énfasis, fondo y formato de reloj vuelven a los valores iniciales",
    "把 NexlOS 目录整体复制走就是完整备份": "Copiar toda la carpeta NexlOS es una copia de seguridad completa",
    "命令目录、运行状态与空间清单": "Catálogo de comandos, estado de ejecución e inventario de espacios",
    "更新与恢复都不会删除空间、应用与库。": "Las actualizaciones y los restablecimientos nunca borran espacios, aplicaciones ni bibliotecas.",
    "应用和功能": "Aplicaciones y características",
    "观察": "Observaciones",
    "项目": "Proyectos",
    "星野": "NEXL"
  },
  "fr": {
    "由本机设备控制": "Controlé par cet appareil",
    "显示在桌面右下角": "Affiché en bas à droite du bureau",
    "由本机设备管理": "Géré par cet appareil",
    "宿主工作区": "Espace de travail hôte",
    "工作区根目录": "Racine de l'espace de travail",
    "配额": "Quota",
    "记忆树": "Arbre de mémoire",
    "打开工作区": "Ouvrir l'espace de travail",
    "修复目录": "Réparer le dossier",
    "调整配额": "Ajuster le quota",
    "存储": "Stockage",
    "查看": "Voir",
    "蓝牙和其他设备": "Bluetooth et autres appareils",
    "未检测到": "Non détecté",
    "本机": "Cet appareil",
    "打印机和扫描仪": "Imprimantes et scanners",
    "无": "Aucun",
    "以太网": "Ethernet",
    "IPv4 地址": "Adresse IPv4",
    "代理": "Proxy",
    "应用联网": "Réseau des applications",
    "查看应用": "Voir les applications",
    "使用中": "Utilisé",
    "当前": "Actuel",
    "浅色": "Clair",
    "深色": "Sombre",
    "内置": "Intégrée",
    "默认应用": "Applications par défaut",
    "打开系统面板": "Ouvrir le panneau système",
    "任务栏与设置里的时间立即切换": "L'horloge de la barre des tâches et des Paramètres change immédiatement",
    "整台系统的显示语言": "Langue d'affichage de tout le système",
    "不可用": "Indisponible",
    "游戏模式": "Mode jeu",
    "捕获": "Capture",
    "始终开启": "Toujours activé",
    "外部": "Externe",
    "位置": "Position",
    "相机": "Appareil photo",
    "麦克风": "Microphone",
    "诊断数据": "Données de diagnostic",
    "基本": "De base",
    "后台应用": "Applications en arrière-plan",
    "由桌面管理": "Géré par le bureau",
    "NexlOS 更新": "Mise à jour de NexlOS",
    "当前版本": "Version actuelle",
    "检查更新": "Rechercher des mises à jour",
    "恢复默认外观": "Réinitialiser l'apparence",
    "恢复": "Réinitialiser",
    "备份": "Sauvegarde",
    "面向维护者": "Pour les mainteneurs",
    "设置分类": "Catégories de paramètres",
    "查找设置": "Rechercher un paramètre",
    "账户与关于": "Compte et à propos",
    "没有匹配的设置。": "Aucun paramètre correspondant.",
    "正在读取设置…": "Chargement des paramètres…",
    "重试": "Réessayer",
    "内核托管": "Noyau hébergé",
    "壁纸已更换": "Fond d'écran modifié",
    "外观已恢复默认": "Apparence réinitialisée",
    "名字最多 24 个字": "Le nom peut contenir au maximum 24 caractères",
    "图片太大，未能保存": "L'image est trop volumineuse pour être enregistrée",
    "读不到这张图片": "Impossible de lire cette image",
    "工作区目录已补齐": "Dossiers de l'espace de travail restaurés",
    "浏览器报告当前离线": "Le navigateur signale une absence de connexion",
    "无法读取": "Lecture impossible",
    "断开": "Déconnecter",
    "离线": "Hors ligne",
    "星河": "Pics dorés au coucher du soleil",
    "日落金山": "Pics dorés au coucher du soleil",
    "夜脊": "Crête nocturne",
    "部署时切给 NexlOS 的宿主目录，可直接在文件管理器里打开": "Le dossier hôte attribué à NexlOS. Ouvrez-le directement dans le gestionnaire de fichiers.",
    "上传、写入与记忆树都按这条上限执行": "Les envois, écritures et l'arbre de mémoire respectent cette limite.",
    "设备名称、版本、NexlOS 目录与命令目录": "Nom de l'appareil, version, dossier NexlOS et catalogue de commandes",
    "此设备由浏览器提供输入，没有可配对的蓝牙适配器": "L'entrée vient du navigateur. Aucun adaptateur Bluetooth à appairer.",
    "鼠标、键盘和笔": "Souris, clavier et stylet",
    "指针与键盘事件由本机浏览器转发到 NexlOS": "Les événements de pointeur et de clavier sont transmis à NexlOS par le navigateur local.",
    "NexlOS 不直接管理打印队列": "NexlOS ne gère pas directement les files d'impression.",
    "设备页只报告真实可见的状态；没有的硬件不会伪造一个图标。": "Cette page n'affiche que ce qui existe. Le matériel absent n'est jamais simulé par une icône.",
    "已连接到 NexlOS 本机回环": "Connecté à la boucle locale NexlOS",
    "浏览器网络可用；应用通过本机 HTTP 服务访问内核": "Le réseau du navigateur est disponible. Les applications accèdent au noyau via le service HTTP local.",
    "NexlOS 默认只监听本机回环": "NexlOS n'écoute que sur la boucle locale par défaut.",
    "不经过任何代理，数据留在本机": "Aucun proxy n'est utilisé. Les données restent sur cet appareil.",
    "NexlOS 是单机系统：没有云端账户，也没有远程同步。": "NexlOS est un système autonome : aucun compte cloud ni synchronisation distante.",
    "主题、背景与配色，让桌面成为你的创作空间": "Thèmes, fonds et couleurs font du bureau votre espace de création.",
    "自由选择深浅配色与强调色": "Choisissez librement des couleurs claires ou sombres et une couleur d'accentuation.",
    "经典桌面、立体边框与固定配色": "Bureau classique, bordures en relief et palette fixe",
    "选择深浅配色与强调色，或换一张喜欢的背景。每套主题会记住自己的背景。": "Choisissez des couleurs claires ou sombres et une accentuation, ou changez de fond. Chaque thème retient son propre fond.",
    "标题栏、开关、选中项都会跟着变": "Les barres de titre, les commutateurs et les sélections suivent cette couleur.",
    "深浅配色主题": "Thèmes clair et sombre",
    "任务栏、开始菜单与窗口用浅色": "La barre des tâches, le menu Démarrer et les fenêtres utilisent des couleurs claires",
    "外壳与系统应用切到深色": "Le shell et les applications système passent en sombre",
    "窗口与开始菜单改用更短的过渡": "Les fenêtres et le menu Démarrer utilisent des transitions plus courtes",
    "主题会立即作用于桌面外壳；第三方应用保留自己的配色。": "Le thème s'applique immédiatement au shell. Les applications tierces gardent leurs couleurs.",
    "全部来自 NexlOS 应用清单": "Tout provient du catalogue d'applications NexlOS.",
    "浏览 NexlOS 目录：空间、应用、库与日志。": "Parcourez l'arborescence NexlOS : espaces, applications, bibliothèques et journaux.",
    "在宿主电脑上跑 shell：git、npm、构建脚本。": "Exécutez un shell sur l'hôte : git, npm, scripts de build.",
    "宿主工作区的记忆树：主题、观察与项目。": "L'arbre de mémoire de l'espace de travail : thèmes, observations et projets.",
    "书目、正文、总纲、人物、任务与导出。": "Livres, manuscrits, plans, personnages, tâches et export.",
    "宋韵画笺：毛笔、水彩、蜡笔、画框、套索与拍立得，导出 PNG 到工作区。": "Toile Song : pinceau, aquarelle, pastel gras, cadres, lasso et photos instantanées, exportés en PNG vers l'espace de travail.",
    "内容矿机：选题雷达、六步创作主线、剧集资产与交付包。": "Moteur de contenu : radar de sujets, parcours créatif en six étapes, actifs d'épisodes et packs de livraison.",
    "NexlOS 的独立空库：只放这台系统的写作笔记，不读取原有知识库。": "Un coffre vide indépendant pour les notes d'écriture de ce système. Il ne lit pas de base de connaissances existante.",
    "本地或网络视频：拖入即播，支持画中画与全屏。": "Vidéo locale ou réseau : glissez pour lire, avec incrustation vidéo et plein écran.",
    "曲库、环境音与后台播放：手机锁屏也能继续。": "Bibliothèque, sons d'ambiance et lecture en arrière-plan qui continue sur l'écran verrouillé.",
    "摄像头扫码：二维码、网址与 NexlOS 应用链接。": "Scan caméra des QR codes, URL et liens d'applications NexlOS.",
    "主题、壁纸、颜色、应用与更新。": "Thèmes, fonds d'écran, couleurs, applications et mises à jour.",
    "内核版本、命令目录与运行状态。": "Version du noyau, catalogue de commandes et état d'exécution.",
    "Web 浏览器、邮件、地图由本机浏览器提供": "Le navigateur local fournit le navigateur web, le courrier et les cartes",
    "命令目录与内核状态": "Catalogue de commandes et état du noyau",
    "内置应用随 NexlOS 二进制发布；第三方应用在独立配置里运行。": "Les applications intégrées sont livrées dans le binaire NexlOS. Les applications tierces s'exécutent depuis des configurations séparées.",
    "NexlOS 没有内置 NTP 客户端，时间与区域直接跟随这台设备。": "NexlOS n'inclut pas de client NTP. L'heure et la région suivent cet appareil.",
    "Xbox 游戏栏": "Barre de jeu Xbox",
    "NexlOS 不注入系统级覆盖层": "NexlOS n'injecte pas de surcouche système",
    "窗口与动画已经是轻量路径": "Les fenêtres et animations utilisent déjà un chemin léger",
    "需要录屏时使用本机浏览器或系统工具": "Utilisez le navigateur local ou les outils système pour enregistrer l'écran",
    "这一页保留 Win10 的分类位置，但只写 NexlOS 真实具备的能力。": "Cette page conserve la catégorie de Windows 10, mais ne décrit que ce que NexlOS fait réellement.",
    "位置、相机、麦克风、诊断": "Position, appareil photo, microphone, diagnostic",
    "NexlOS 不请求定位权限": "NexlOS ne demande pas l'autorisation de localisation",
    "应用无法访问摄像头": "Les applications ne peuvent pas accéder à l'appareil photo",
    "应用无法访问麦克风": "Les applications ne peuvent pas accéder au microphone",
    "只在本机记录内核命令耗时": "Seul le temps des commandes du noyau est enregistré localement",
    "关闭窗口即释放 iframe，不在后台常驻": "Fermer une fenêtre libère son iframe ; rien ne reste en mémoire",
    "NexlOS 不向任何服务器上传数据。": "NexlOS n'envoie aucune donnée à un serveur.",
    "你使用的是最新版本": "Vous utilisez la dernière version",
    "NexlOS 以单个二进制发布，替换文件即完成更新": "NexlOS est livré sous forme d'un seul binaire. Remplacez le fichier pour mettre à jour.",
    "主题、强调色、壁纸与时钟制式回到初始值": "Thème, couleur d'accentuation, fond d'écran et format d'horloge reviennent aux valeurs initiales",
    "把 NexlOS 目录整体复制走就是完整备份": "Copier tout le dossier NexlOS constitue une sauvegarde complète",
    "命令目录、运行状态与空间清单": "Catalogue de commandes, état d'exécution et inventaire des espaces",
    "更新与恢复都不会删除空间、应用与库。": "Les mises à jour et réinitialisations ne suppriment jamais espaces, applications ni bibliothèques.",
    "应用和功能": "Applications et fonctionnalités",
    "观察": "Observations",
    "项目": "Projets",
    "星野": "NEXL"
  },
  "de": {
    "由本机设备控制": "Von diesem Gerät gesteuert",
    "显示在桌面右下角": "Unten rechts auf dem Desktop",
    "由本机设备管理": "Von diesem Gerät verwaltet",
    "宿主工作区": "Host-Arbeitsbereich",
    "工作区根目录": "Arbeitsbereichsstamm",
    "配额": "Kontingent",
    "记忆树": "Gedächtnisbaum",
    "打开工作区": "Arbeitsbereich öffnen",
    "修复目录": "Ordner reparieren",
    "调整配额": "Kontingent anpassen",
    "存储": "Speicher",
    "查看": "Anzeigen",
    "蓝牙和其他设备": "Bluetooth und andere Geräte",
    "未检测到": "Nicht erkannt",
    "本机": "Dieses Gerät",
    "打印机和扫描仪": "Drucker und Scanner",
    "无": "Keine",
    "以太网": "Ethernet",
    "IPv4 地址": "IPv4-Adresse",
    "代理": "Proxy",
    "应用联网": "App-Netzwerk",
    "查看应用": "Apps anzeigen",
    "使用中": "In Verwendung",
    "当前": "Aktuell",
    "浅色": "Hell",
    "深色": "Dunkel",
    "内置": "Integriert",
    "默认应用": "Standard-Apps",
    "打开系统面板": "Systempanel öffnen",
    "任务栏与设置里的时间立即切换": "Uhr in Taskleiste und Einstellungen wechselt sofort",
    "整台系统的显示语言": "Anzeigesprache des gesamten Systems",
    "不可用": "Nicht verfügbar",
    "游戏模式": "Spielmodus",
    "捕获": "Aufnahme",
    "始终开启": "Immer aktiv",
    "外部": "Extern",
    "位置": "Standort",
    "相机": "Kamera",
    "麦克风": "Mikrofon",
    "诊断数据": "Diagnosedaten",
    "基本": "Basis",
    "后台应用": "Hintergrund-Apps",
    "由桌面管理": "Vom Desktop verwaltet",
    "NexlOS 更新": "NexlOS-Update",
    "当前版本": "Aktuelle Version",
    "检查更新": "Nach Updates suchen",
    "恢复默认外观": "Aussehen zurücksetzen",
    "恢复": "Zurücksetzen",
    "备份": "Sicherung",
    "面向维护者": "Für Maintainer",
    "设置分类": "Einstellungskategorien",
    "查找设置": "Einstellung suchen",
    "账户与关于": "Konto und Info",
    "没有匹配的设置。": "Keine passenden Einstellungen.",
    "正在读取设置…": "Einstellungen werden geladen…",
    "重试": "Erneut versuchen",
    "内核托管": "Kernel gehostet",
    "壁纸已更换": "Hintergrund geändert",
    "外观已恢复默认": "Aussehen zurückgesetzt",
    "名字最多 24 个字": "Der Name darf höchstens 24 Zeichen haben",
    "图片太大，未能保存": "Das Bild ist zu groß zum Speichern",
    "读不到这张图片": "Dieses Bild konnte nicht gelesen werden",
    "工作区目录已补齐": "Arbeitsbereichsordner wiederhergestellt",
    "浏览器报告当前离线": "Der Browser meldet, dass er offline ist",
    "无法读取": "Kann nicht gelesen werden",
    "断开": "Trennen",
    "离线": "Offline",
    "星河": "Goldene Gipfel im Abendlicht",
    "日落金山": "Goldene Gipfel im Abendlicht",
    "夜脊": "Nachtgrat",
    "部署时切给 NexlOS 的宿主目录，可直接在文件管理器里打开": "Der NexlOS zugewiesene Hostordner. Direkt im Dateimanager öffnen.",
    "上传、写入与记忆树都按这条上限执行": "Uploads, Schreibvorgänge und der Gedächtnisbaum folgen diesem Limit.",
    "设备名称、版本、NexlOS 目录与命令目录": "Gerätename, Version, NexlOS-Ordner und Befehlskatalog",
    "此设备由浏览器提供输入，没有可配对的蓝牙适配器": "Eingabe über den Browser. Kein Bluetooth-Adapter zum Koppeln.",
    "鼠标、键盘和笔": "Maus, Tastatur und Stift",
    "指针与键盘事件由本机浏览器转发到 NexlOS": "Zeiger- und Tastaturereignisse werden vom lokalen Browser an NexlOS weitergeleitet.",
    "NexlOS 不直接管理打印队列": "NexlOS verwaltet Druckwarteschlangen nicht direkt.",
    "设备页只报告真实可见的状态；没有的硬件不会伪造一个图标。": "Diese Seite zeigt nur real Vorhandenes. Fehlende Hardware wird nicht mit einem Symbol vorgetäuscht.",
    "已连接到 NexlOS 本机回环": "Mit der NexlOS-Loopback verbunden",
    "浏览器网络可用；应用通过本机 HTTP 服务访问内核": "Browsernetzwerk ist verfügbar. Apps erreichen den Kernel über den lokalen HTTP-Dienst.",
    "NexlOS 默认只监听本机回环": "NexlOS lauscht standardmäßig nur auf Loopback.",
    "不经过任何代理，数据留在本机": "Es wird kein Proxy verwendet. Daten bleiben auf diesem Gerät.",
    "NexlOS 是单机系统：没有云端账户，也没有远程同步。": "NexlOS ist ein eigenständiges System: kein Cloud-Konto und keine Remotesynchronisierung.",
    "主题、背景与配色，让桌面成为你的创作空间": "Designs, Hintergründe und Farben machen den Desktop zu deinem Arbeitsbereich.",
    "自由选择深浅配色与强调色": "Hell oder dunkel und eine Akzentfarbe frei wählen.",
    "经典桌面、立体边框与固定配色": "Klassischer Desktop, plastische Rahmen, feste Farbpalette",
    "选择深浅配色与强调色，或换一张喜欢的背景。每套主题会记住自己的背景。": "Hell oder dunkel und eine Akzentfarbe wählen oder einen Hintergrund aussuchen. Jedes Design merkt sich seinen Hintergrund.",
    "标题栏、开关、选中项都会跟着变": "Titelleisten, Schalter und Auswahl folgen der Akzentfarbe.",
    "深浅配色主题": "Helles und dunkles Design",
    "任务栏、开始菜单与窗口用浅色": "Taskleiste, Startmenü und Fenster verwenden helle Farben",
    "外壳与系统应用切到深色": "Shell und System-Apps wechseln zu dunkel",
    "窗口与开始菜单改用更短的过渡": "Fenster und Startmenü verwenden kürzere Übergänge",
    "主题会立即作用于桌面外壳；第三方应用保留自己的配色。": "Das Design wirkt sofort auf die Shell. Drittanbieter-Apps behalten ihre Farben.",
    "全部来自 NexlOS 应用清单": "Alle Einträge stammen aus dem NexlOS-App-Katalog.",
    "浏览 NexlOS 目录：空间、应用、库与日志。": "Den NexlOS-Baum durchsuchen: Bereiche, Apps, Bibliotheken und Protokolle.",
    "在宿主电脑上跑 shell：git、npm、构建脚本。": "Shell auf dem Host ausführen: git, npm, Build-Skripte.",
    "宿主工作区的记忆树：主题、观察与项目。": "Der Gedächtnisbaum des Host-Arbeitsbereichs: Themen, Beobachtungen und Projekte.",
    "书目、正文、总纲、人物、任务与导出。": "Bücher, Manuskripte, Gliederungen, Figuren, Aufgaben und Export.",
    "宋韵画笺：毛笔、水彩、蜡笔、画框、套索与拍立得，导出 PNG 到工作区。": "Song-Leinwand: Pinsel, Aquarell, Wachsmalstift, Rahmen, Lasso und Sofortfotos, als PNG in den Arbeitsbereich exportiert.",
    "内容矿机：选题雷达、六步创作主线、剧集资产与交付包。": "Content-Engine: Themenradar, sechsstufiger Kreativ-Workflow, Episoden-Assets und Lieferpakete.",
    "NexlOS 的独立空库：只放这台系统的写作笔记，不读取原有知识库。": "Ein eigener leerer Speicher für die Schreibnotizen dieses Systems. Eine vorhandene Wissensdatenbank wird nicht gelesen.",
    "本地或网络视频：拖入即播，支持画中画与全屏。": "Lokales oder Netzwerkvideo: zum Abspielen ablegen, mit Bild-in-Bild und Vollbild.",
    "曲库、环境音与后台播放：手机锁屏也能继续。": "Bibliothek, Umgebungsklang und Hintergrundwiedergabe, die auf dem Sperrbildschirm weiterläuft.",
    "摄像头扫码：二维码、网址与 NexlOS 应用链接。": "Kamera-Scan für QR-Codes, URLs und NexlOS-App-Links.",
    "主题、壁纸、颜色、应用与更新。": "Designs, Hintergründe, Farben, Apps und Updates.",
    "内核版本、命令目录与运行状态。": "Kernelversion, Befehlskatalog und Laufzeitstatus.",
    "Web 浏览器、邮件、地图由本机浏览器提供": "Webbrowser, E-Mail und Karten werden vom lokalen Browser bereitgestellt",
    "命令目录与内核状态": "Befehlskatalog und Kernelstatus",
    "内置应用随 NexlOS 二进制发布；第三方应用在独立配置里运行。": "Integrierte Apps sind im NexlOS-Binary enthalten. Drittanbieter-Apps laufen aus separaten Konfigurationen.",
    "NexlOS 没有内置 NTP 客户端，时间与区域直接跟随这台设备。": "NexlOS hat keinen integrierten NTP-Client. Zeit und Region folgen diesem Gerät.",
    "Xbox 游戏栏": "Xbox Game Bar",
    "NexlOS 不注入系统级覆盖层": "NexlOS fügt kein systemweites Overlay ein",
    "窗口与动画已经是轻量路径": "Fenster und Animationen nutzen bereits einen leichten Pfad",
    "需要录屏时使用本机浏览器或系统工具": "Zum Aufnehmen des Bildschirms den lokalen Browser oder Systemwerkzeuge verwenden",
    "这一页保留 Win10 的分类位置，但只写 NexlOS 真实具备的能力。": "Diese Seite behält die Windows-10-Kategorie, beschreibt aber nur, was NexlOS wirklich kann.",
    "位置、相机、麦克风、诊断": "Standort, Kamera, Mikrofon, Diagnose",
    "NexlOS 不请求定位权限": "NexlOS fordert keine Standortberechtigung an",
    "应用无法访问摄像头": "Apps können nicht auf die Kamera zugreifen",
    "应用无法访问麦克风": "Apps können nicht auf das Mikrofon zugreifen",
    "只在本机记录内核命令耗时": "Nur die Laufzeit von Kernelbefehlen wird lokal erfasst",
    "关闭窗口即释放 iframe，不在后台常驻": "Beim Schließen wird das iframe freigegeben; nichts bleibt im Hintergrund",
    "NexlOS 不向任何服务器上传数据。": "NexlOS lädt keine Daten auf einen Server hoch.",
    "你使用的是最新版本": "Du verwendest die neueste Version",
    "NexlOS 以单个二进制发布，替换文件即完成更新": "NexlOS erscheint als einzelne Binärdatei. Zum Aktualisieren die Datei ersetzen.",
    "主题、强调色、壁纸与时钟制式回到初始值": "Design, Akzentfarbe, Hintergrund und Uhrformat werden zurückgesetzt",
    "把 NexlOS 目录整体复制走就是完整备份": "Das gesamte NexlOS-Verzeichnis zu kopieren ist eine vollständige Sicherung",
    "命令目录、运行状态与空间清单": "Befehlskatalog, Laufzeitstatus und Bereichsübersicht",
    "更新与恢复都不会删除空间、应用与库。": "Updates und Zurücksetzen löschen nie Bereiche, Apps oder Bibliotheken.",
    "应用和功能": "Apps und Features",
    "观察": "Beobachtungen",
    "项目": "Projekte",
    "星野": "NEXL"
  },
  "ja": {
    "由本机设备控制": "このデバイスで制御",
    "显示在桌面右下角": "デスクトップの右下に表示",
    "由本机设备管理": "このデバイスで管理",
    "宿主工作区": "ホスト ワークスペース",
    "工作区根目录": "ワークスペースのルート",
    "配额": "クォータ",
    "记忆树": "メモリツリー",
    "打开工作区": "ワークスペースを開く",
    "修复目录": "フォルダーを修復",
    "调整配额": "クォータを調整",
    "存储": "ストレージ",
    "查看": "表示",
    "蓝牙和其他设备": "Bluetooth とその他のデバイス",
    "未检测到": "検出されません",
    "本机": "このデバイス",
    "打印机和扫描仪": "プリンターとスキャナー",
    "无": "なし",
    "以太网": "イーサネット",
    "IPv4 地址": "IPv4 アドレス",
    "代理": "プロキシ",
    "应用联网": "アプリのネットワーク",
    "查看应用": "アプリを表示",
    "使用中": "使用中",
    "当前": "現在",
    "浅色": "ライト",
    "深色": "ダーク",
    "内置": "組み込み",
    "默认应用": "既定のアプリ",
    "打开系统面板": "システム パネルを開く",
    "任务栏与设置里的时间立即切换": "タスクバーと設定の時計はすぐに切り替わります",
    "整台系统的显示语言": "システム全体の表示言語",
    "不可用": "使用できません",
    "游戏模式": "ゲーム モード",
    "捕获": "キャプチャ",
    "始终开启": "常にオン",
    "外部": "外部",
    "位置": "位置情報",
    "相机": "カメラ",
    "麦克风": "マイク",
    "诊断数据": "診断データ",
    "基本": "基本",
    "后台应用": "バックグラウンド アプリ",
    "由桌面管理": "デスクトップで管理",
    "NexlOS 更新": "NexlOS の更新",
    "当前版本": "現在のバージョン",
    "检查更新": "更新を確認",
    "恢复默认外观": "外観をリセット",
    "恢复": "リセット",
    "备份": "バックアップ",
    "面向维护者": "メンテナー向け",
    "设置分类": "設定のカテゴリ",
    "查找设置": "設定を検索",
    "账户与关于": "アカウントとバージョン情報",
    "没有匹配的设置。": "一致する設定はありません。",
    "正在读取设置…": "設定を読み込み中…",
    "重试": "再試行",
    "内核托管": "カーネル ホスト",
    "壁纸已更换": "背景を変更しました",
    "外观已恢复默认": "外観を既定に戻しました",
    "名字最多 24 个字": "名前は 24 文字までです",
    "图片太大，未能保存": "画像が大きすぎて保存できません",
    "读不到这张图片": "この画像を読み取れません",
    "工作区目录已补齐": "ワークスペースのフォルダーを復元しました",
    "浏览器报告当前离线": "ブラウザーはオフラインを報告しています",
    "无法读取": "読み取れません",
    "断开": "切断",
    "离线": "オフライン",
    "星河": "夕陽の金山",
    "日落金山": "夕陽の金山",
    "夜脊": "夜の稜線",
    "部署时切给 NexlOS 的宿主目录，可直接在文件管理器里打开": "NexlOS に割り当てられたホスト フォルダー。ファイル マネージャーで直接開けます。",
    "上传、写入与记忆树都按这条上限执行": "アップロード、書き込み、メモリツリーはすべてこの上限に従います。",
    "设备名称、版本、NexlOS 目录与命令目录": "デバイス名、バージョン、NexlOS フォルダー、コマンド カタログ",
    "此设备由浏览器提供输入，没有可配对的蓝牙适配器": "入力はブラウザーから提供されます。ペアリングできる Bluetooth アダプターはありません。",
    "鼠标、键盘和笔": "マウス、キーボード、ペン",
    "指针与键盘事件由本机浏览器转发到 NexlOS": "ポインターとキーボードのイベントはローカル ブラウザーから NexlOS に転送されます。",
    "NexlOS 不直接管理打印队列": "NexlOS は印刷キューを直接管理しません。",
    "设备页只报告真实可见的状态；没有的硬件不会伪造一个图标。": "このページは実際に存在するものだけを表示します。ないハードウェアをアイコンで偽装しません。",
    "已连接到 NexlOS 本机回环": "NexlOS のループバックに接続済み",
    "浏览器网络可用；应用通过本机 HTTP 服务访问内核": "ブラウザーのネットワークを利用できます。アプリはローカル HTTP サービス経由でカーネルにアクセスします。",
    "NexlOS 默认只监听本机回环": "NexlOS は既定でループバックのみをリッスンします。",
    "不经过任何代理，数据留在本机": "プロキシは使用しません。データはこのデバイスに残ります。",
    "NexlOS 是单机系统：没有云端账户，也没有远程同步。": "NexlOS はスタンドアロン システムです。クラウド アカウントもリモート同期もありません。",
    "主题、背景与配色，让桌面成为你的创作空间": "テーマ、背景、配色でデスクトップを創作空間にします。",
    "自由选择深浅配色与强调色": "ライト/ダークの配色とアクセント カラーを自由に選べます。",
    "经典桌面、立体边框与固定配色": "クラシックなデスクトップ、立体的な枠、固定配色",
    "选择深浅配色与强调色，或换一张喜欢的背景。每套主题会记住自己的背景。": "ライト/ダークの配色とアクセント カラーを選ぶか、背景を変更します。テーマごとに背景を記憶します。",
    "标题栏、开关、选中项都会跟着变": "タイトル バー、スイッチ、選択項目がアクセント カラーに合わせて変わります。",
    "深浅配色主题": "ライトとダークのテーマ",
    "任务栏、开始菜单与窗口用浅色": "タスクバー、スタート メニュー、ウィンドウにライト配色を使用",
    "外壳与系统应用切到深色": "シェルとシステム アプリをダークに切り替え",
    "窗口与开始菜单改用更短的过渡": "ウィンドウとスタート メニューの遷移を短くします",
    "主题会立即作用于桌面外壳；第三方应用保留自己的配色。": "テーマはデスクトップ シェルにすぐ反映されます。サードパーティ製アプリは独自の配色を保ちます。",
    "全部来自 NexlOS 应用清单": "すべて NexlOS のアプリ カタログから取得しています。",
    "浏览 NexlOS 目录：空间、应用、库与日志。": "NexlOS のツリーを参照: スペース、アプリ、ライブラリ、ログ。",
    "在宿主电脑上跑 shell：git、npm、构建脚本。": "ホストで shell を実行: git、npm、ビルド スクリプト。",
    "宿主工作区的记忆树：主题、观察与项目。": "ホスト ワークスペースのメモリツリー: トピック、観察、プロジェクト。",
    "书目、正文、总纲、人物、任务与导出。": "書誌、本文、構成、人物、タスク、エクスポート。",
    "宋韵画笺：毛笔、水彩、蜡笔、画框、套索与拍立得，导出 PNG 到工作区。": "宋風キャンバス: 筆、水彩、クレヨン、フレーム、投げ縄、インスタント写真。PNG でワークスペースに書き出します。",
    "内容矿机：选题雷达、六步创作主线、剧集资产与交付包。": "コンテンツ エンジン: 題材レーダー、6 ステップの創作フロー、エピソード資産、納品パッケージ。",
    "NexlOS 的独立空库：只放这台系统的写作笔记，不读取原有知识库。": "このシステム専用の空の保管庫。既存の知識ベースは読み込みません。",
    "本地或网络视频：拖入即播，支持画中画与全屏。": "ローカルまたはネットワーク動画: ドロップして再生、ピクチャー イン ピクチャーと全画面に対応。",
    "曲库、环境音与后台播放：手机锁屏也能继续。": "ライブラリ、環境音、バックグラウンド再生。ロック画面でも続きます。",
    "摄像头扫码：二维码、网址与 NexlOS 应用链接。": "カメラで QR コード、URL、NexlOS アプリリンクをスキャン。",
    "主题、壁纸、颜色、应用与更新。": "テーマ、背景、色、アプリ、更新。",
    "内核版本、命令目录与运行状态。": "カーネル バージョン、コマンド カタログ、実行状態。",
    "Web 浏览器、邮件、地图由本机浏览器提供": "ウェブ ブラウザー、メール、地図はローカル ブラウザーが提供します",
    "命令目录与内核状态": "コマンド カタログとカーネル状態",
    "内置应用随 NexlOS 二进制发布；第三方应用在独立配置里运行。": "組み込みアプリは NexlOS バイナリに含まれます。サードパーティ製アプリは個別の構成で実行されます。",
    "NexlOS 没有内置 NTP 客户端，时间与区域直接跟随这台设备。": "NexlOS には NTP クライアントが組み込まれていません。時刻と地域はこのデバイスに従います。",
    "Xbox 游戏栏": "Xbox ゲーム バー",
    "NexlOS 不注入系统级覆盖层": "NexlOS はシステム全体のオーバーレイを挿入しません",
    "窗口与动画已经是轻量路径": "ウィンドウとアニメーションはすでに軽量パスを使用しています",
    "需要录屏时使用本机浏览器或系统工具": "画面録画にはローカル ブラウザーまたはシステム ツールを使用",
    "这一页保留 Win10 的分类位置，但只写 NexlOS 真实具备的能力。": "このページは Windows 10 のカテゴリ位置を保ちますが、NexlOS が実際にできることだけを記載します。",
    "位置、相机、麦克风、诊断": "位置情報、カメラ、マイク、診断",
    "NexlOS 不请求定位权限": "NexlOS は位置情報の許可を要求しません",
    "应用无法访问摄像头": "アプリはカメラにアクセスできません",
    "应用无法访问麦克风": "アプリはマイクにアクセスできません",
    "只在本机记录内核命令耗时": "カーネル コマンドの所要時間だけをローカルに記録します",
    "关闭窗口即释放 iframe，不在后台常驻": "ウィンドウを閉じると iframe を解放し、バックグラウンドに残しません",
    "NexlOS 不向任何服务器上传数据。": "NexlOS はどのサーバーにもデータを送信しません。",
    "你使用的是最新版本": "最新バージョンを使用しています",
    "NexlOS 以单个二进制发布，替换文件即完成更新": "NexlOS は単一バイナリで配布されます。ファイルを置き換えるだけで更新できます。",
    "主题、强调色、壁纸与时钟制式回到初始值": "テーマ、アクセント カラー、背景、時計形式を初期値に戻します",
    "把 NexlOS 目录整体复制走就是完整备份": "NexlOS フォルダー全体をコピーすれば完全なバックアップになります",
    "命令目录、运行状态与空间清单": "コマンド カタログ、実行状態、スペース一覧",
    "更新与恢复都不会删除空间、应用与库。": "更新とリセットでスペース、アプリ、ライブラリが削除されることはありません。",
    "应用和功能": "アプリと機能",
    "观察": "観察",
    "项目": "プロジェクト",
    "星野": "NEXL"
  },
  "ko": {
    "由本机设备控制": "이 장치에서 제어",
    "显示在桌面右下角": "데스크톱 오른쪽 아래에 표시",
    "由本机设备管理": "이 장치에서 관리",
    "宿主工作区": "호스트 작업 공간",
    "工作区根目录": "작업 공간 루트",
    "配额": "할당량",
    "记忆树": "메모리 트리",
    "打开工作区": "작업 공간 열기",
    "修复目录": "폴더 복구",
    "调整配额": "할당량 조정",
    "存储": "저장소",
    "查看": "보기",
    "蓝牙和其他设备": "Bluetooth 및 기타 장치",
    "未检测到": "감지되지 않음",
    "本机": "이 장치",
    "打印机和扫描仪": "프린터 및 스캐너",
    "无": "없음",
    "以太网": "이더넷",
    "IPv4 地址": "IPv4 주소",
    "代理": "프록시",
    "应用联网": "앱 네트워킹",
    "查看应用": "앱 보기",
    "使用中": "사용 중",
    "当前": "현재",
    "浅色": "밝게",
    "深色": "어둡게",
    "内置": "내장",
    "默认应用": "기본 앱",
    "打开系统面板": "시스템 패널 열기",
    "任务栏与设置里的时间立即切换": "작업 표시줄과 설정 시계가 즉시 전환됩니다",
    "整台系统的显示语言": "전체 시스템 표시 언어",
    "不可用": "사용할 수 없음",
    "游戏模式": "게임 모드",
    "捕获": "캡처",
    "始终开启": "항상 켜짐",
    "外部": "외부",
    "位置": "위치",
    "相机": "카메라",
    "麦克风": "마이크",
    "诊断数据": "진단 데이터",
    "基本": "기본",
    "后台应用": "백그라운드 앱",
    "由桌面管理": "데스크톱에서 관리",
    "NexlOS 更新": "NexlOS 업데이트",
    "当前版本": "현재 버전",
    "检查更新": "업데이트 확인",
    "恢复默认外观": "모양 초기화",
    "恢复": "초기화",
    "备份": "백업",
    "面向维护者": "유지관리자용",
    "设置分类": "설정 범주",
    "查找设置": "설정 찾기",
    "账户与关于": "계정 및 정보",
    "没有匹配的设置。": "일치하는 설정이 없습니다.",
    "正在读取设置…": "설정을 읽는 중…",
    "重试": "다시 시도",
    "内核托管": "커널 호스팅",
    "壁纸已更换": "배경을 변경했습니다",
    "外观已恢复默认": "모양을 기본값으로 복원했습니다",
    "名字最多 24 个字": "이름은 최대 24자입니다",
    "图片太大，未能保存": "이미지가 너무 커서 저장할 수 없습니다",
    "读不到这张图片": "이 이미지를 읽을 수 없습니다",
    "工作区目录已补齐": "작업 공간 폴더를 복원했습니다",
    "浏览器报告当前离线": "브라우저가 오프라인 상태입니다",
    "无法读取": "읽을 수 없음",
    "断开": "연결 끊기",
    "离线": "오프라인",
    "星河": "노을 진 금빛 산봉우리",
    "日落金山": "노을 진 금빛 산봉우리",
    "夜脊": "밤 능선",
    "部署时切给 NexlOS 的宿主目录，可直接在文件管理器里打开": "NexlOS에 할당된 호스트 폴더입니다. 파일 관리자에서 바로 열 수 있습니다.",
    "上传、写入与记忆树都按这条上限执行": "업로드, 쓰기, 메모리 트리 모두 이 한도를 따릅니다.",
    "设备名称、版本、NexlOS 目录与命令目录": "장치 이름, 버전, NexlOS 폴더, 명령 카탈로그",
    "此设备由浏览器提供输入，没有可配对的蓝牙适配器": "입력은 브라우저에서 제공됩니다. 페어링할 Bluetooth 어댑터가 없습니다.",
    "鼠标、键盘和笔": "마우스, 키보드 및 펜",
    "指针与键盘事件由本机浏览器转发到 NexlOS": "포인터와 키보드 이벤트는 로컬 브라우저가 NexlOS로 전달합니다.",
    "NexlOS 不直接管理打印队列": "NexlOS는 인쇄 대기열을 직접 관리하지 않습니다.",
    "设备页只报告真实可见的状态；没有的硬件不会伪造一个图标。": "이 페이지는 실제로 있는 것만 표시합니다. 없는 하드웨어를 아이콘으로 꾸미지 않습니다.",
    "已连接到 NexlOS 本机回环": "NexlOS 로컬 루프백에 연결됨",
    "浏览器网络可用；应用通过本机 HTTP 服务访问内核": "브라우저 네트워크를 사용할 수 있습니다. 앱은 로컬 HTTP 서비스를 통해 커널에 접근합니다.",
    "NexlOS 默认只监听本机回环": "NexlOS는 기본적으로 로컬 루프백에서만 수신합니다.",
    "不经过任何代理，数据留在本机": "프록시를 사용하지 않습니다. 데이터는 이 장치에 남습니다.",
    "NexlOS 是单机系统：没有云端账户，也没有远程同步。": "NexlOS는 독립 실행형 시스템입니다. 클라우드 계정과 원격 동기화가 없습니다.",
    "主题、背景与配色，让桌面成为你的创作空间": "테마, 배경, 색상으로 데스크톱을 창작 공간으로 만드세요.",
    "自由选择深浅配色与强调色": "밝은/어두운 색상과 강조 색을 자유롭게 선택하세요.",
    "经典桌面、立体边框与固定配色": "클래식 데스크톱, 입체 테두리, 고정 색상",
    "选择深浅配色与强调色，或换一张喜欢的背景。每套主题会记住自己的背景。": "밝은/어두운 색상과 강조 색을 고르거나 배경을 바꾸세요. 테마마다 배경을 기억합니다.",
    "标题栏、开关、选中项都会跟着变": "제목 표시줄, 스위치, 선택 항목이 강조 색을 따릅니다.",
    "深浅配色主题": "밝은/어두운 테마",
    "任务栏、开始菜单与窗口用浅色": "작업 표시줄, 시작 메뉴, 창에 밝은 색 사용",
    "外壳与系统应用切到深色": "셸과 시스템 앱이 어두운 색으로 전환",
    "窗口与开始菜单改用更短的过渡": "창과 시작 메뉴 전환을 더 짧게 합니다",
    "主题会立即作用于桌面外壳；第三方应用保留自己的配色。": "테마는 데스크톱 셸에 즉시 적용됩니다. 타사 앱은 자체 색상을 유지합니다.",
    "全部来自 NexlOS 应用清单": "모두 NexlOS 앱 카탈로그에서 가져옵니다.",
    "浏览 NexlOS 目录：空间、应用、库与日志。": "NexlOS 트리 찾아보기: 공간, 앱, 라이브러리, 로그.",
    "在宿主电脑上跑 shell：git、npm、构建脚本。": "호스트에서 셸 실행: git, npm, 빌드 스크립트.",
    "宿主工作区的记忆树：主题、观察与项目。": "호스트 작업 공간 메모리 트리: 주제, 관찰, 프로젝트.",
    "书目、正文、总纲、人物、任务与导出。": "서지, 본문, 개요, 인물, 작업, 내보내기.",
    "宋韵画笺：毛笔、水彩、蜡笔、画框、套索与拍立得，导出 PNG 到工作区。": "송 스타일 캔버스: 붓, 수채화, 크레용, 프레임, 올가미, 즉석 사진. PNG로 작업 공간에 내보냅니다.",
    "内容矿机：选题雷达、六步创作主线、剧集资产与交付包。": "콘텐츠 엔진: 주제 레이더, 6단계 창작 흐름, 에피소드 자산, 전달 패키지.",
    "NexlOS 的独立空库：只放这台系统的写作笔记，不读取原有知识库。": "이 시스템의 글쓰기 노트만 담는 독립 빈 보관소입니다. 기존 지식 베이스를 읽지 않습니다.",
    "本地或网络视频：拖入即播，支持画中画与全屏。": "로컬 또는 네트워크 비디오: 끌어다 놓으면 재생되며 PIP와 전체 화면을 지원합니다.",
    "曲库、环境音与后台播放：手机锁屏也能继续。": "라이브러리, 환경음, 백그라운드 재생. 잠금 화면에서도 계속됩니다.",
    "摄像头扫码：二维码、网址与 NexlOS 应用链接。": "카메라로 QR 코드, URL, NexlOS 앱 링크를 스캔합니다.",
    "主题、壁纸、颜色、应用与更新。": "테마, 배경, 색상, 앱, 업데이트.",
    "内核版本、命令目录与运行状态。": "커널 버전, 명령 카탈로그, 실행 상태.",
    "Web 浏览器、邮件、地图由本机浏览器提供": "웹 브라우저, 메일, 지도는 로컬 브라우저가 제공합니다",
    "命令目录与内核状态": "명령 카탈로그 및 커널 상태",
    "内置应用随 NexlOS 二进制发布；第三方应用在独立配置里运行。": "내장 앱은 NexlOS 바이너리에 포함됩니다. 타사 앱은 별도 구성에서 실행됩니다.",
    "NexlOS 没有内置 NTP 客户端，时间与区域直接跟随这台设备。": "NexlOS에는 NTP 클라이언트가 없습니다. 시간과 지역은 이 장치를 따릅니다.",
    "Xbox 游戏栏": "Xbox 게임 바",
    "NexlOS 不注入系统级覆盖层": "NexlOS는 시스템 전체 오버레이를 삽입하지 않습니다",
    "窗口与动画已经是轻量路径": "창과 애니메이션은 이미 가벼운 경로를 사용합니다",
    "需要录屏时使用本机浏览器或系统工具": "화면 녹화에는 로컬 브라우저 또는 시스템 도구를 사용하세요",
    "这一页保留 Win10 的分类位置，但只写 NexlOS 真实具备的能力。": "이 페이지는 Windows 10의 범주 위치를 유지하지만 NexlOS가 실제로 제공하는 기능만 설명합니다.",
    "位置、相机、麦克风、诊断": "위치, 카메라, 마이크, 진단",
    "NexlOS 不请求定位权限": "NexlOS는 위치 권한을 요청하지 않습니다",
    "应用无法访问摄像头": "앱은 카메라에 접근할 수 없습니다",
    "应用无法访问麦克风": "앱은 마이크에 접근할 수 없습니다",
    "只在本机记录内核命令耗时": "커널 명령 소요 시간만 로컬에 기록합니다",
    "关闭窗口即释放 iframe，不在后台常驻": "창을 닫으면 iframe을 해제하며 백그라운드에 남지 않습니다",
    "NexlOS 不向任何服务器上传数据。": "NexlOS는 어떤 서버에도 데이터를 업로드하지 않습니다.",
    "你使用的是最新版本": "최신 버전을 사용 중입니다",
    "NexlOS 以单个二进制发布，替换文件即完成更新": "NexlOS는 단일 바이너리로 배포됩니다. 파일을 교체하면 업데이트됩니다.",
    "主题、强调色、壁纸与时钟制式回到初始值": "테마, 강조 색, 배경, 시계 형식이 초기값으로 돌아갑니다",
    "把 NexlOS 目录整体复制走就是完整备份": "NexlOS 폴더 전체를 복사하면 완전한 백업이 됩니다",
    "命令目录、运行状态与空间清单": "명령 카탈로그, 실행 상태, 공간 목록",
    "更新与恢复都不会删除空间、应用与库。": "업데이트와 초기화는 공간, 앱, 라이브러리를 삭제하지 않습니다.",
    "应用和功能": "앱 및 기능",
    "观察": "관찰",
    "项目": "프로젝트",
    "星野": "NEXL"
  }
};

for (const code in EXTRA) {
  if (DICT[code]) Object.assign(DICT[code], EXTRA[code]);
}

const RELATIVE = {
  'zh-TW': { min: '{n} 分鐘前', hour: '{n} 小時前', just: '剛剛' },
  en: { min: '{n} min ago', hour: '{n} h ago', just: 'Just now' },
  es: { min: 'hace {n} min', hour: 'hace {n} h', just: 'Ahora mismo' },
  fr: { min: 'il y a {n} min', hour: 'il y a {n} h', just: "À l'instant" },
  de: { min: 'vor {n} Min.', hour: 'vor {n} Std.', just: 'Gerade eben' },
  ja: { min: '{n} 分前', hour: '{n} 時間前', just: 'たった今' },
  ko: { min: '{n}분 전', hour: '{n}시간 전', just: '방금' },
  ar: { min: 'قبل {n} دقيقة', hour: 'قبل {n} ساعة', just: 'الآن' },
  cs: { min: 'před {n} min', hour: 'před {n} h', just: 'Právě teď' },
  it: { min: '{n} min fa', hour: '{n} h fa', just: 'Adesso' },
  'pt-BR': { min: 'há {n} min', hour: 'há {n} h', just: 'Agora mesmo' },
  ru: { min: '{n} мин назад', hour: '{n} ч назад', just: 'Только что' },
  tr: { min: '{n} dk önce', hour: '{n} sa önce', just: 'Az önce' },
  vi: { min: '{n} phút trước', hour: '{n} giờ trước', just: 'Vừa xong' },
};

let current = 'en';

export function isLanguage(code) {
  return LANGUAGES.some(function (l) { return l.code === code; });
}

// 系统语言只做映射，不改写用户的显式选择：精确匹配 → 大小写不敏感 → 基础语言。
// 顺序与 navigator.languages 一致，zh-HK / zh-SG 这类变体收敛到 zh-CN。
// Chrome 72 兼容：不用可选链与 Array.prototype.at。
export function systemLanguage() {
  if (typeof navigator === 'undefined') return null;
  const candidates = Array.isArray(navigator.languages) && navigator.languages.length
    ? navigator.languages
    : [navigator.language];
  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    if (!candidate) continue;
    if (isLanguage(candidate)) return candidate;
    const lower = String(candidate).toLowerCase();
    for (let j = 0; j < LANGUAGES.length; j += 1) {
      if (LANGUAGES[j].code.toLowerCase() === lower) return LANGUAGES[j].code;
    }
    const base = lower.split('-')[0];
    if (!base) continue;
    if (base === 'zh') return 'zh-CN';
    // 我们只登记 pt-BR；pt-PT 等变体也收敛到它，避免检测不到语言。
    if (base === 'pt') return 'pt-BR';
    for (let k = 0; k < LANGUAGES.length; k += 1) {
      if (LANGUAGES[k].code.toLowerCase() === base) return LANGUAGES[k].code;
    }
  }
  return null;
}

export function getLanguage() { return current; }

export function setLanguage(code) {
  current = isLanguage(code) ? code : 'zh-CN';
  if (typeof document !== 'undefined' && document.documentElement) {
    const language = LANGUAGES.filter(function (item) { return item.code === current; })[0];
    document.documentElement.setAttribute('lang', current);
    document.documentElement.setAttribute('data-lang', current);
    // 阿拉伯语整体镜像；LTR 语言显式复位，避免切换后残留 rtl。
    document.documentElement.setAttribute('dir', language && language.dir === 'rtl' ? 'rtl' : 'ltr');
  }
  return current;
}

export function t(text) { return translate(text, current); }

// Exact UI messages and anchored templates only: never translate words inside
// arbitrary user text. Each supported locale has its own translations.
export function translate(text, language) {
  const code = isLanguage(language) ? language : current;
  if (typeof text !== 'string') return text;
  text = canonicalSource(text);
  if (code === 'zh-CN') return text;
  const dictionary = DICT[code] || {};
  const extra = EXTRA_TRANSLATIONS[code] || {};
  const overlay = OVERLAY_TRANSLATIONS[code] || {};
  if (Object.prototype.hasOwnProperty.call(overlay, text)) return overlay[text];
  if (Object.prototype.hasOwnProperty.call(extra, text)) return extra[text];
  if (Object.prototype.hasOwnProperty.call(dictionary, text)) return dictionary[text];
  const multipart = text.indexOf(' · ') >= 0;
  const dynamic = translatePattern(text, code, multipart);
  // A matching template can intentionally have identical traditional-Chinese
  // wording. Its captures still belong to the user and must not be split again.
  if (dynamic !== undefined) return dynamic;
  // 整行没有多段模板命中时，按「 · 」拆开逐段翻译：每段再走完整模板与词表，
  // 这样「平均值 235640 · 计数 10」不会被某个后缀模板整行吞掉。
  if (multipart) return text.split(' · ').map(part => translate(part, code)).join(' · ');
  const shortcut = text.match(/^(.+?)(\s*[（(][A-Za-z0-9+ /⌘←→↑↓-]+[)）])$/);
  if (shortcut) {
    const label = translate(shortcut[1].trim(), code);
    if (label !== shortcut[1].trim()) return label + shortcut[2];
  }
  // 该语言缺词条时先退到英文，再退到中文原文：非中文用户读英文比读中文有用。
  // code === 'en' 时不再递归，缺少英文就保持原文。
  if (code !== 'en' && code !== 'zh-CN') {
    const english = translate(text, 'en');
    if (english !== text) return english;
  }
  return text;
}

export function localeFor(code) {
  return {
    en: 'en-US', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', ja: 'ja-JP', ko: 'ko-KR',
    ar: 'ar-EG', cs: 'cs-CZ', it: 'it-IT', 'pt-BR': 'pt-BR', ru: 'ru-RU', tr: 'tr-TR', vi: 'vi-VN',
    'zh-CN': 'zh-CN', 'zh-TW': 'zh-TW',
  }[code || current] || 'zh-CN';
}
export function formatNumber(value, options) { return new Intl.NumberFormat(localeFor(current), options).format(value); }
export function formatDate(value, options) { return new Intl.DateTimeFormat(localeFor(current), options).format(value instanceof Date ? value : new Date(value)); }
// 时间与日期共用一套 locale：阿拉伯语里时间用拉丁数字、日期用阿拉伯数字会显得像两个系统。
export function formatTime(value, options) {
  return new Intl.DateTimeFormat(localeFor(current), Object.assign({ hour: '2-digit', minute: '2-digit' }, options || {}))
    .format(value instanceof Date ? value : new Date(value));
}
export function messageSources() { return Object.keys(Object.assign({}, DICT.en, EXTRA_TRANSLATIONS.en)); }
export function hasTranslation(text, code) {
  if (code === 'zh-CN') return true;
  return Object.prototype.hasOwnProperty.call(OVERLAY_TRANSLATIONS[code] || {}, text)
    || Object.prototype.hasOwnProperty.call(EXTRA_TRANSLATIONS[code] || {}, text)
    || Object.prototype.hasOwnProperty.call(DICT[code] || {}, text);
}

// 语言在设置里可不可选，由词条完整性决定，不由 LANGUAGES 里的注册顺序决定。
// 这就是 OpenScreen 的「缺一个命名空间就排除整个语言」：半翻译的界面比英文更糟。
const completeness = Object.create(null);

function catalogOf(code) {
  return Object.assign({}, DICT[code], EXTRA_TRANSLATIONS[code], OVERLAY_TRANSLATIONS[code]);
}

export function isCompleteLanguage(code) {
  if (code === 'zh-CN') return true;
  if (completeness[code] !== undefined) return completeness[code];
  const source = catalogOf('en');
  const target = catalogOf(code);
  let complete = true;
  for (const key in source) {
    const value = target[key];
    if (typeof value !== 'string' || !value.trim()) { complete = false; break; }
  }
  completeness[code] = complete;
  return complete;
}

export function availableLanguages() {
  return LANGUAGES.filter(function (language) { return isCompleteLanguage(language.code); });
}

// 动态文案：带数字与设备名的句子按完整模式替换，避免逐词翻译误伤正文。
const PATTERNS = {
  'zh-TW': [
    [/^时区 (.+)$/, '時區 $1'],
    [/^当前版本 (.+)$/, '目前版本 $1'],
    [/^应用和功能 · (\d+)$/, '應用程式與功能 · $1'],
    [/^主题 (\d+) · 观察 (\d+) · 项目 (\d+)$/, '主題 $1 · 觀察 $2 · 專案 $3'],
    [/^宿主工作区 · (.+)$/, '宿主工作區 · $1'],
    [/^NexlOS 占用 (.+)$/, 'NexlOS 佔用 $1'],
    [/^(\d+) 个文件$/, '$1 個檔案'],
    [/^(\d+) × (\d+) · 缩放 (\d+)%$/, '$1 × $2 · 縮放 $3%'],
    [/^(\d+) 个应用共用同一个本机内核$/, '$1 個應用程式共用同一個本機核心'],
    [/^(\d{1,2}:\d{2}(?::\d{2})?) 上午$/, '$1 上午'],
    [/^(\d{1,2}:\d{2}(?::\d{2})?) 下午$/, '$1 下午'],
  ],
  en: [
    [/^时区 (.+)$/, 'Time zone $1'],
    [/^当前版本 (.+)$/, 'Version $1'],
    [/^应用和功能 · (\d+)$/, 'Apps & features · $1'],
    [/^主题 (\d+) · 观察 (\d+) · 项目 (\d+)$/, 'Topics $1 · Observations $2 · Projects $3'],
    [/^宿主工作区 · (.+)$/, 'Host workspace · $1'],
    [/^NexlOS 占用 (.+)$/, 'NexlOS uses $1'],
    [/^1 个文件$/, '1 file'],
    [/^(\d+) 个文件$/, '$1 files'],
    [/^(\d+) × (\d+) · 缩放 (\d+)%$/, '$1 × $2 · Scale $3%'],
    [/^(\d+) 个应用共用同一个本机内核$/, '$1 apps share one local kernel'],
    [/^(\d{1,2}:\d{2}(?::\d{2})?) 上午$/, '$1 AM'],
    [/^(\d{1,2}:\d{2}(?::\d{2})?) 下午$/, '$1 PM'],
  ],
  es: [
    [/^时区 (.+)$/, 'Zona horaria $1'],
    [/^当前版本 (.+)$/, 'Versión $1'],
    [/^应用和功能 · (\d+)$/, 'Aplicaciones y características · $1'],
    [/^主题 (\d+) · 观察 (\d+) · 项目 (\d+)$/, 'Temas $1 · Observaciones $2 · Proyectos $3'],
    [/^宿主工作区 · (.+)$/, 'Espacio de trabajo del host · $1'],
    [/^NexlOS 占用 (.+)$/, 'NexlOS usa $1'],
    [/^1 个文件$/, '1 archivo'],
    [/^(\d+) 个文件$/, '$1 archivos'],
    [/^(\d+) × (\d+) · 缩放 (\d+)%$/, '$1 × $2 · Escala $3%'],
    [/^(\d+) 个应用共用同一个本机内核$/, '$1 aplicaciones comparten un kernel local'],
    [/^(\d{1,2}:\d{2}(?::\d{2})?) 上午$/, '$1 a. m.'],
    [/^(\d{1,2}:\d{2}(?::\d{2})?) 下午$/, '$1 p. m.'],
  ],
  fr: [
    [/^时区 (.+)$/, 'Fuseau horaire $1'],
    [/^当前版本 (.+)$/, 'Version $1'],
    [/^应用和功能 · (\d+)$/, 'Applications et fonctionnalités · $1'],
    [/^主题 (\d+) · 观察 (\d+) · 项目 (\d+)$/, 'Thèmes $1 · Observations $2 · Projets $3'],
    [/^宿主工作区 · (.+)$/, "Espace de travail hôte · $1"],
    [/^NexlOS 占用 (.+)$/, 'NexlOS utilise $1'],
    [/^1 个文件$/, '1 fichier'],
    [/^(\d+) 个文件$/, '$1 fichiers'],
    [/^(\d+) × (\d+) · 缩放 (\d+)%$/, '$1 × $2 · Échelle $3 %'],
    [/^(\d+) 个应用共用同一个本机内核$/, '$1 applications partagent un noyau local'],
    [/^(\d{1,2}:\d{2}(?::\d{2})?) 上午$/, '$1 AM'],
    [/^(\d{1,2}:\d{2}(?::\d{2})?) 下午$/, '$1 PM'],
  ],
  de: [
    [/^时区 (.+)$/, 'Zeitzone $1'],
    [/^当前版本 (.+)$/, 'Version $1'],
    [/^应用和功能 · (\d+)$/, 'Apps und Features · $1'],
    [/^主题 (\d+) · 观察 (\d+) · 项目 (\d+)$/, 'Themen $1 · Beobachtungen $2 · Projekte $3'],
    [/^宿主工作区 · (.+)$/, 'Host-Arbeitsbereich · $1'],
    [/^NexlOS 占用 (.+)$/, 'NexlOS belegt $1'],
    [/^1 个文件$/, '1 Datei'],
    [/^(\d+) 个文件$/, '$1 Dateien'],
    [/^(\d+) × (\d+) · 缩放 (\d+)%$/, '$1 × $2 · Skalierung $3 %'],
    [/^(\d+) 个应用共用同一个本机内核$/, '$1 Apps teilen einen lokalen Kernel'],
    [/^(\d{1,2}:\d{2}(?::\d{2})?) 上午$/, '$1 AM'],
    [/^(\d{1,2}:\d{2}(?::\d{2})?) 下午$/, '$1 PM'],
  ],
  ja: [
    [/^时区 (.+)$/, 'タイムゾーン $1'],
    [/^当前版本 (.+)$/, 'バージョン $1'],
    [/^应用和功能 · (\d+)$/, 'アプリと機能 · $1'],
    [/^主题 (\d+) · 观察 (\d+) · 项目 (\d+)$/, 'トピック $1 · 観察 $2 · プロジェクト $3'],
    [/^宿主工作区 · (.+)$/, 'ホスト ワークスペース · $1'],
    [/^NexlOS 占用 (.+)$/, 'NexlOS 使用量 $1'],
    [/^(\d+) 个文件$/, '$1 ファイル'],
    [/^(\d+) × (\d+) · 缩放 (\d+)%$/, '$1 × $2 · 拡大率 $3%'],
    [/^(\d+) 个应用共用同一个本机内核$/, '$1 個のアプリが 1 つのローカル カーネルを共有'],
    [/^(\d{1,2}:\d{2}(?::\d{2})?) 上午$/, '$1 午前'],
    [/^(\d{1,2}:\d{2}(?::\d{2})?) 下午$/, '$1 午後'],
  ],
  ko: [
    [/^时区 (.+)$/, '표준 시간대 $1'],
    [/^当前版本 (.+)$/, '버전 $1'],
    [/^应用和功能 · (\d+)$/, '앱 및 기능 · $1'],
    [/^主题 (\d+) · 观察 (\d+) · 项目 (\d+)$/, '주제 $1 · 관찰 $2 · 프로젝트 $3'],
    [/^宿主工作区 · (.+)$/, '호스트 작업 공간 · $1'],
    [/^NexlOS 占用 (.+)$/, 'NexlOS 사용량 $1'],
    [/^(\d+) 个文件$/, '$1개 파일'],
    [/^(\d+) × (\d+) · 缩放 (\d+)%$/, '$1 × $2 · 배율 $3%'],
    [/^(\d+) 个应用共用同一个本机内核$/, '$1개 앱이 하나의 로컬 커널을 공유'],
    [/^(\d{1,2}:\d{2}(?::\d{2})?) 上午$/, '$1 오전'],
    [/^(\d{1,2}:\d{2}(?::\d{2})?) 下午$/, '$1 오후'],
  ],
};

function applyPatterns(list, text) {
  for (let i = 0; i < list.length; i += 1) {
    const m = text.match(list[i][0]);
    if (m) {
      return list[i][1].replace(/\$(\d)/g, function (_, d) { return m[Number(d)] || ''; });
    }
  }
  return undefined;
}

// Canonical source recovery also handles callers that explicitly use t() before
// appending a DOM node. Otherwise those nodes get stuck in their first language.
const sourceByTranslation = new Map();
const registeredSources = new Set(Object.keys(Object.assign({}, DICT.en, EXTRA_TRANSLATIONS.en)));
for (const code of LANGUAGES.map(item => item.code).filter(code => code !== 'zh-CN')) {
  // This is a product name, not a translatable Windows-era marketing name.
  if (!DICT[code]) DICT[code] = {};
  DICT[code]['Windos2026'] = 'Windos2026';
  const dictionary = Object.assign({}, DICT[code], EXTRA_TRANSLATIONS[code], OVERLAY_TRANSLATIONS[code]);
  for (const source of Object.keys(dictionary)) {
    const value = dictionary[source];
    if (typeof value === 'string' && value !== source && value !== 'Windos2026' && !sourceByTranslation.has(value)) sourceByTranslation.set(value, source);
  }
}

function templateExpression(value) {
  const names = [];
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{(\d+)\\\}/g, (_, name) => {
    names.push(name);
    return '([\\s\\S]+?)';
  });
  return { expression: new RegExp('^' + escaped + '$'), names };
}
const compiledTemplates = MESSAGE_TEMPLATES.map(row => Object.assign({ row }, templateExpression(row[0])));
const LANGUAGE_INDEX = Object.create(null);
for (let index = 0; index < LANGUAGES.length; index += 1) LANGUAGE_INDEX[LANGUAGES[index].code] = index;
// 主词表用 8 列定长存放语言；扩展语言改用独立映射，避免列号与第 9 列 kind 冲突。
const overlayTemplateMaps = Object.create(null);
const extraCompiledTemplates = Object.create(null);
const templateSources = new Set(MESSAGE_TEMPLATES.map(row => row[0]));
for (const code of Object.keys(OVERLAY_TEMPLATES)) {
  const map = Object.create(null);
  const extra = [];
  for (const row of OVERLAY_TEMPLATES[code]) {
    map[row[0]] = row[1];
    // 覆盖层自带、主词表没有的模板需要单独编译匹配。
    if (!templateSources.has(row[0])) extra.push(Object.assign({ source: row[0], target: row[1] }, templateExpression(row[0])));
  }
  extra.sort((a, b) => b.source.length - a.source.length);
  overlayTemplateMaps[code] = map;
  extraCompiledTemplates[code] = extra;
}
function templateTarget(row, code) {
  const index = LANGUAGE_INDEX[code];
  if (index > 0 && index < 8) return row[index];
  const map = overlayTemplateMaps[code];
  return map ? map[row[0]] : undefined;
}
const translatedTemplates = [];
for (const row of MESSAGE_TEMPLATES) {
  for (let index = 1; index < 8; index += 1) {
    if (row[index] !== row[0]) translatedTemplates.push(Object.assign({ source: row[0], kind: row[8] }, templateExpression(row[index])));
  }
}
for (const code of Object.keys(OVERLAY_TEMPLATES)) {
  for (const row of OVERLAY_TEMPLATES[code]) {
    if (row[1] !== row[0]) translatedTemplates.push(Object.assign({ source: row[0] }, templateExpression(row[1])));
  }
}
// 长模板优先，避免短译文抢先匹配掉更具体的整句。
translatedTemplates.sort((a, b) => b.source.length - a.source.length);

// 便捷办公的词表只作用于它自己的 iframe：办公里的「应用」是 Apply，
// 与桌面外壳的「应用」（App）同名不同义，不能并进全局词表。
const officeDict = new Map();
for (const row of OFFICE_ROWS) {
  if (row.length !== 2 || typeof row[0] !== 'string' || !row[0].trim() || typeof row[1] !== 'string' || !row[1].trim()) {
    throw new Error('Invalid office row: ' + row[0]);
  }
  officeDict.set(row[0], row[1]);
}
const officeTemplates = OFFICE_TEMPLATES
  .map(row => Object.assign({ source: row[0], target: row[1] }, templateExpression(row[0])))
  .sort((a, b) => b.source.length - a.source.length);

function translateOffice(text, language) {
  const code = isLanguage(language) ? language : current;
  if (typeof text !== 'string' || code === 'zh-CN') return text;
  const exact = officeDict.get(text) || officeDict.get(canonicalSource(text));
  if (exact !== undefined) return exact;
  const source = canonicalSource(text);
  for (const template of officeTemplates) {
    const match = template.expression.exec(source);
    if (!match) continue;
    return template.target.replace(/\{(\d+)\}/g, (_, name) => match[template.names.indexOf(name) + 1] || '');
  }
  return translate(text, code);
}

// 同源内的独立应用（目前是便捷办公）由自己的词表翻译；其余文档仍走主词表。
function translatorFor(doc) {
  try {
    const view = doc && doc.defaultView;
    const path = view && view.location && view.location.pathname;
    if (path && path.indexOf('/a/office') === 0) return translateOffice;
  } catch (e) { /* 跨源文档读不到 location，按主词表处理 */ }
  return translate;
}


function canonicalSource(text) {
  if (registeredSources.has(text) || text === 'Windos2026') return text;
  if (sourceByTranslation.has(text)) return sourceByTranslation.get(text);
  for (const template of translatedTemplates) {
    const match = template.expression.exec(text);
    if (!match) continue;
    return template.source.replace(/\{(\d+)\}/g, (_, name) => {
      const captured = match[template.names.indexOf(name) + 1] || '';
      return template.kind === 'ui' ? canonicalSource(captured) : captured;
    });
  }
  return text;
}

function translatePattern(text, code, multipartOnly) {
  if (code === 'zh-CN') return text;
  for (const template of compiledTemplates) {
    // 先只让本身带「 · 」的模板匹配整行；否则「{0} 字节」会把
    // 「5.04 bits/byte · 共 242 字节」的前半段吞进槽位，整行只译后缀。
    if (multipartOnly && template.row[0].indexOf(' · ') < 0) continue;
    const match = template.expression.exec(text);
    if (!match) continue;
    const value = templateTarget(template.row, code);
    if (typeof value !== 'string') continue;
    return value.replace(/\{(\d+)\}/g, (_, name) => {
      const captured = match[template.names.indexOf(name) + 1] || '';
      return ['error', 'ui'].includes(template.row[8]) ? translate(captured, code) : captured;
    });
  }
  const extra = extraCompiledTemplates[code];
  if (extra) {
    for (const template of extra) {
      if (multipartOnly && template.source.indexOf(' · ') < 0) continue;
      const match = template.expression.exec(text);
      if (!match) continue;
      return template.target.replace(/\{(\d+)\}/g, (_, name) => match[template.names.indexOf(name) + 1] || '');
    }
  }
  const rel = RELATIVE[code];
  if (rel) {
    if (text === '刚刚') return rel.just;
    let m = text.match(/^(\d+)\s*分钟前$/);
    if (m) return rel.min.replace('{n}', m[1]);
    m = text.match(/^(\d+)\s*小时前$/);
    if (m) return rel.hour.replace('{n}', m[1]);
  }
  return PATTERNS[code] ? applyPatterns(PATTERNS[code], text) : undefined;
}

const ATTRS = ['title', 'aria-label', 'aria-description', 'placeholder', 'alt', 'data-i18n-content'];
const USER_CONTENT = '[data-i18n-skip], [translate="no"], [contenteditable]:not([contenteditable="false"]), .mm-editor, .xp-note-body, .xp-name-text, .xp-tile-name, .book-body b, .chapter-title, .ag-craft-name, .ag-layer-name, .ag-list-name, .export-preview, .os-line-arg, .os-line-x, .os-line-args, .os-line-out, .os-agent-label, .os-agent-result , .os-space-answer-body, .os-report-md';

function protectedElement(el, text) {
  if (!el || !el.closest) return false;
  if (el.closest(USER_CONTENT)) return true;
  if (text && el.closest('script, style, code, pre, textarea, input')) return true;
  if (text && el.tagName === 'OPTION' && isLanguage(el.getAttribute('value'))) return true;
  return false;
}

function languageForDoc(doc) {
  const code = doc.documentElement && doc.documentElement.getAttribute('data-lang');
  return isLanguage(code) ? code : current;
}

function localizeTextNode(node, language, tr) {
  const parent = node.parentElement || node.parentNode;
  if (!parent || protectedElement(parent, true)) return;
  const raw = node.nodeValue;
  if (!raw) return;
  const match = raw.match(/^(\s*)([\s\S]*?)(\s*)$/);
  if (!match || !match[2]) return;
  // Even a forced language switch must retain fresh application updates.
  const declaredSource = parent.getAttribute && parent.getAttribute('data-i18n-key');
  let source = declaredSource || node.__nexlosI18nSource;
  let edge = node.__nexlosI18nEdge;
  if (!declaredSource && (source === undefined || raw !== node.__nexlosI18nOut)) {
    source = match[2];
    edge = [match[1], match[3]];
  }
  // 译文自身可能带前导/尾随空格（例如意大利语「本」→「 libri」）。
  // 始终用首次识别到的原文边距拼接；若改用当前文本的边距，每轮回写都会多一个空格，
  // MutationObserver 会被自己的写入反复唤醒，最终把文本撑成上千个空格。
  if (!edge) edge = [match[1], match[3]];
  const translateText = tr || translate;
  const next = edge[0] + translateText(source, language) + edge[1];
  node.__nexlosI18nSource = source;
  node.__nexlosI18nEdge = edge;
  node.__nexlosI18nOut = next;
  if (next !== raw) node.nodeValue = next;
}

function localizeElement(el, language, tr) {
  if (!el || el.nodeType !== 1 || protectedElement(el, false)) return;
  const translateText = tr || translate;
  for (const name of ATTRS) {
    const raw = el.getAttribute(name);
    if (raw === null || raw === '') continue;
    const sources = el.__nexlosI18nAttrs || (el.__nexlosI18nAttrs = {});
    const outputs = el.__nexlosI18nAttrOut || (el.__nexlosI18nAttrOut = {});
    if (sources[name] === undefined || raw !== outputs[name]) sources[name] = raw;
    // 多行 tooltip 逐行翻译：文件名/路径这类专有名词保持原样，类型词仍然本地化。
    const source = sources[name];
    const out = source.indexOf('\n') >= 0
      ? source.split('\n').map(line => translateText(line, language)).join('\n')
      : translateText(source, language);
    outputs[name] = out;
    if (out !== raw) el.setAttribute(name, out);
  }
}

function localizeSubtree(scope, doc, language, tr) {
  if (!scope) return;
  if (scope.nodeType === 3) { localizeTextNode(scope, language, tr); return; }
  if (scope.nodeType === 1) localizeElement(scope, language, tr);
  const walker = doc.createTreeWalker(scope, 4, null, false);
  const nodes = [];
  let node = walker.nextNode();
  while (node) { nodes.push(node); node = walker.nextNode(); }
  for (const text of nodes) localizeTextNode(text, language, tr);
  const elements = scope.querySelectorAll ? scope.querySelectorAll('*') : [];
  for (const element of elements) localizeElement(element, language, tr);
}

// 同源子应用可以在运行时调用 window.__nexlosTranslate(text)：
// 输入框的值、属性与拼出来的完整句子都不经过 DOM 遍历，需要这条即时通道。
function installTranslator(root, tr) {
  root.__nexlosTranslator = tr;
  try {
    if (root.defaultView) {
      root.defaultView.__nexlosTranslate = function (text) { return tr(text, current); };
    }
  } catch (e) { /* 跨源文档没有可写的 window */ }
}

function localizeTitle(root, language, tr) {
  if (!root.title) return;
  const raw = root.title;
  if (root.__nexlosTitleSource === undefined || raw !== root.__nexlosTitleOut) root.__nexlosTitleSource = raw;
  root.__nexlosTitleOut = (tr || translate)(root.__nexlosTitleSource, language || current);
  if (raw !== root.__nexlosTitleOut) root.title = root.__nexlosTitleOut;
}

export function localizeDoc(doc, force) {
  const root = doc || document;
  if (!root || !root.createTreeWalker) return;
  const language = current;
  const tr = translatorFor(root);
  if (root.documentElement) {
    root.documentElement.setAttribute('lang', language);
    root.documentElement.setAttribute('data-lang', language);
  }
  installTranslator(root, tr);
  localizeSubtree(root.body || root.documentElement || root, root, language, tr);
  localizeTitle(root, language, tr);
  observeDoc(root);
}

function localizableFrame(frame) {
  if (!frame || frame.hasAttribute('data-i18n-skip') || frame.classList.contains('os-deskclock-frame')) return false;
  if (frame.getAttribute('data-i18n-app') === 'true') return true;
  try {
    const url = new URL(frame.getAttribute('src') || '', frame.ownerDocument.baseURI);
    if (url.origin !== frame.ownerDocument.location.origin) return false;
    if (url.pathname === '/a/draw/board.html') return true;
    // 便捷办公的离线工具页（二维码 / 公众号 / X 线程）也走办公词表。
    if (url.pathname.indexOf('/a/office/tools/') === 0) return true;
    return (url.pathname === '/' || url.pathname === '/index.html') && /^#\/(?:pc|settings|memory|term|shelf|system|apps|b|draw|music|video|scan|minesweeper)(?:\/|$)/.test(url.hash);
  } catch (e) { return false; }
}

function localizeFrame(frame, doc, force) {
  if (!localizableFrame(frame)) return;
  try {
    const child = frame.contentDocument;
    if (child && child.body) {
      const language = languageForDoc(doc);
      const tr = translatorFor(child);
      child.documentElement.setAttribute('lang', language);
      child.documentElement.setAttribute('data-lang', language);
      installTranslator(child, tr);
      localizeSubtree(child.body, child, language, tr);
      // 办公等子应用的自有标题也要跟着界面语言；外壳窗口标题用的是应用清单。
      localizeTitle(child, language, tr);
      observeDoc(child);
      localizeFrames(child, force);
    }
  } catch (e) { /* Third-party/cross-origin content owns its own language. */ }
}

export function localizeFrames(doc, force) {
  const root = doc || document;
  if (!root || !root.querySelectorAll) return;
  const frames = root.querySelectorAll('iframe');
  for (const frame of frames) {
    if (!frame.__nexlosI18nLoad) {
      frame.__nexlosI18nLoad = () => localizeFrame(frame, root, true);
      frame.addEventListener('load', frame.__nexlosI18nLoad);
    }
    localizeFrame(frame, root, force);
  }
}

export function observeDoc(doc) {
  const root = doc || document;
  if (!root || !root.body || root.__nexlosI18nObserver) return;
  const Observer = root.defaultView && root.defaultView.MutationObserver;
  if (!Observer) return;
  const obs = new Observer(records => {
    const language = languageForDoc(root);
    const tr = root.__nexlosTranslator || translate;
    let framesChanged = false;
    for (const record of records) {
      if (record.type === 'characterData') localizeTextNode(record.target, language, tr);
      else if (record.type === 'attributes') {
        localizeElement(record.target, language, tr);
        if (record.attributeName === 'src') framesChanged = true;
      } else {
        for (const node of record.addedNodes) {
          localizeSubtree(node, root, language, tr);
          if (node.nodeType === 1 && (node.tagName === 'IFRAME' || node.querySelector('iframe'))) framesChanged = true;
        }
      }
    }
    if (framesChanged) localizeFrames(root);
  });
  obs.observe(root.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS.concat(['src']) });
  root.__nexlosI18nObserver = obs;
  localizeFrames(root);
}
