// Anchored shell status messages. Captures retain user names, paths and content.
export const templates = `{0} 运行中|{0} 執行中|{0} running|{0} en ejecución|{0} en cours|{0} aktiv|{0} 件実行中|{0}개 실행 중
{0} 后台继续|{0} 在背景繼續|{0} continuing in background|{0} continúan en segundo plano|{0} continuent en arrière-plan|{0} laufen im Hintergrund weiter|{0} 件バックグラウンドで続行中|{0}개 백그라운드에서 계속 실행
{0} 个子代理|{0} 個子代理|{0} subagents|{0} subagentes|{0} sous-agents|{0} Unteragenten|{0} 個のサブエージェント|하위 에이전트 {0}개
{0} 步|{0} 步|{0} steps|{0} pasos|{0} étapes|{0} Schritte|{0} ステップ|{0}단계
工作区还不可读：{0}|工作區尚無法讀取：{0}|Workspace is not readable yet: {0}|Aún no se puede leer el espacio de trabajo: {0}|L’espace de travail n’est pas encore lisible : {0}|Arbeitsbereich ist noch nicht lesbar: {0}|ワークスペースをまだ読み取れません：{0}|아직 작업 공간을 읽을 수 없습니다: {0}|error
{0} 个技能|{0} 個技能|{0} skills|{0} habilidades|{0} compétences|{0} Fähigkeiten|{0} 個のスキル|스킬 {0}개
{0} 分钟|{0} 分鐘|{0} minutes|{0} minutos|{0} minutes|{0} Minuten|{0} 分|{0}분
下次 {0}|下次 {0}|Next {0}|Próxima: {0}|Prochaine : {0}|Nächste: {0}|次回 {0}|다음 {0}
{0} 篇笔记|{0} 篇筆記|{0} notes|{0} notas|{0} notes|{0} Notizen|{0} 件のノート|노트 {0}개
用时 {0}s|耗時 {0}s|Took {0}s|Duración: {0}s|Durée : {0}s|Dauer: {0}s|所要時間 {0}秒|소요 시간 {0}초
没有找到应用：{0}|找不到應用程式：{0}|App not found: {0}|No se encontró la aplicación: {0}|Application introuvable : {0}|App nicht gefunden: {0}|アプリが見つかりません：{0}|앱을 찾을 수 없습니다: {0}
打开 {0}|開啟 {0}|Open {0}|Abrir {0}|Ouvrir {0}|{0} öffnen|{0} を開く|{0} 열기
{0} 个子代理仍在后台运行；本轮汇报只覆盖主代理的这一步。|{0} 個子代理仍在背景執行；本輪報告僅涵蓋主代理的這一步。|{0} subagents are still running in the background; this report covers only the main agent’s current step.|{0} subagentes siguen en segundo plano; este informe solo cubre el paso actual del agente principal.|{0} sous-agents travaillent encore en arrière-plan ; ce rapport couvre uniquement l’étape actuelle de l’agent principal.|{0} Unteragenten laufen noch im Hintergrund; dieser Bericht umfasst nur den aktuellen Schritt des Hauptagenten.|{0} 個のサブエージェントがバックグラウンドで実行中です。今回のレポートはメインエージェントの現在のステップのみを対象としています。|하위 에이전트 {0}개가 아직 백그라운드에서 실행 중입니다. 이번 보고서에는 주 에이전트의 현재 단계만 포함됩니다.
失败 · {0}s · 点开看汇报|失敗 · {0}s · 點選查看報告|Failed · {0}s · Open to view report|Falló · {0}s · Abrir para ver el informe|Échec · {0}s · Ouvrir pour voir le rapport|Fehlgeschlagen · {0}s · Öffnen, um den Bericht zu sehen|失敗 · {0}秒 · 開いてレポートを表示|실패 · {0}초 · 열어서 보고서 보기
命令失败 · {0}s|命令失敗 · {0}s|Command failed · {0}s|Error del comando · {0}s|Échec de la commande · {0}s|Befehl fehlgeschlagen · {0}s|コマンドが失敗しました · {0}秒|명령 실패 · {0}초
完成 · {0}s · 点开看汇报|已完成 · {0}s · 點選查看報告|Completed · {0}s · Open to view report|Completado · {0}s · Abrir para ver el informe|Terminé · {0}s · Ouvrir pour voir le rapport|Abgeschlossen · {0}s · Öffnen, um den Bericht zu sehen|完了 · {0}秒 · 開いてレポートを表示|완료 · {0}초 · 열어서 보고서 보기
完成 · {0}s · {1}|已完成 · {0}s · {1}|Completed · {0}s · {1}|Completado · {0}s · {1}|Terminé · {0}s · {1}|Abgeschlossen · {0}s · {1}|完了 · {0}秒 · {1}|완료 · {0}초 · {1}
完成 · {0}s|已完成 · {0}s|Completed · {0}s|Completado · {0}s|Terminé · {0}s|Abgeschlossen · {0}s|完了 · {0}秒|완료 · {0}초`.split('\n').map(line => line.split('|'));
