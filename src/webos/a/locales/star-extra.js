// Star ask and system-language suggestion. Columns: zh-TW, en, es, fr, de, ja, ko.
// The GitHub URL and the counters stay in the Go kernel; only the copy lives here.
export const rows = [
  ['如果 NexlOS 对你有用，可以在 GitHub 上点一颗星。', '如果 NexlOS 對你有用，可以在 GitHub 上點一顆星。', 'If NexlOS is useful to you, you can star it on GitHub.', 'Si NexlOS te resulta útil, puedes darle una estrella en GitHub.', 'Si NexlOS vous est utile, vous pouvez lui donner une étoile sur GitHub.', 'Wenn NexlOS für dich nützlich ist, kannst du ihm auf GitHub einen Stern geben.', 'NexlOS が役に立つなら、GitHub でスターを付けられます。', 'NexlOS가 유용하다면 GitHub에서 별을 눌러 주세요.'],
  ['在 GitHub 上点星标', '在 GitHub 上點星標', 'Star on GitHub', 'Dar una estrella en GitHub', 'Ajouter une étoile sur GitHub', 'Auf GitHub mit Stern markieren', 'GitHub でスターを付ける', 'GitHub에서 별표하기'],
  ['不用了，谢谢', '不用了，謝謝', 'No thanks', 'No, gracias', 'Non merci', 'Nein, danke', 'いいえ、結構です', '아니요, 괜찮습니다'],
  ['打开项目主页', '開啟專案首頁', 'Open the project page', 'Abrir la página del proyecto', 'Ouvrir la page du projet', 'Projektseite öffnen', 'プロジェクトページを開く', '프로젝트 페이지 열기'],
];

export const templates = `检测到系统语言：{0}。点此切换。|偵測到系統語言：{0}。點此切換。|System language detected: {0}. Click to switch.|Idioma del sistema detectado: {0}. Haz clic para cambiar.|Langue du système détectée : {0}. Cliquez pour changer.|Systemsprache erkannt: {0}. Zum Wechseln klicken.|システム言語を検出しました：{0}。クリックして切り替えます。|시스템 언어 감지됨: {0}. 클릭하여 전환하세요.`.split('\n').map(line => line.split('|'));
