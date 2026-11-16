/**
 * Deterministic app specs and template registry for the NexlOS app generator.
 * These templates are intentionally dependency-free, complete HTML, sandbox
 * safe, and use window.nexlOS.storage (not localStorage) when persistence is
 * available. The LLM is only used for apps outside this registry.
 */

const THEMES = {
  'warm-minimal': {
    paper: '#f8f2e8', card: '#fffaf1', ink: '#1f2430', muted: '#84796c',
    accent: '#df4a35', accentSoft: '#f8dfd7', line: '#eaded0',
  },
  'cool-focus': {
    paper: '#eef3f8', card: '#ffffff', ink: '#162033', muted: '#6e7b8c',
    accent: '#2f6fed', accentSoft: '#e3ecff', line: '#dbe4ef',
  },
  'terminal': {
    paper: '#0d1117', card: '#161b22', ink: '#e6edf3', muted: '#8b949e',
    accent: '#3fb950', accentSoft: '#17351f', line: '#30363d',
  },
}

const TITLES = {
  pomodoro: '番茄钟', timer: '计时器', todo: '待办清单',
  calculator: '计算器', dashboard: '数据看板',
}

export function compileAppSpec(prompt) {
  const text = String(prompt || '')
  let kind = 'generic'
  if (/番茄|pomodoro|专注计时/iu.test(text)) kind = 'pomodoro'
  else if (/秒表|stopwatch|计时器|timer/iu.test(text)) kind = 'timer'
  else if (/待办|todo|任务清单|清单应用/iu.test(text)) kind = 'todo'
  else if (/计算器|calculator/iu.test(text)) kind = 'calculator'
  else if (/仪表盘|数据看板|dashboard|统计看板/iu.test(text)) kind = 'dashboard'
  const palette = /终端|terminal|黑客|命令行/iu.test(text) ? 'terminal'
    : /蓝|blue|冷静|科技/iu.test(text) ? 'cool-focus' : 'warm-minimal'
  return {
    version: 1,
    kind,
    title: TITLES[kind] || '生成应用',
    palette,
    features: [],
    capabilities: ['storage'],
    sourcePrompt: text.slice(0, 500),
  }
}

function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/gu, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]))
}

function baseCss(theme) {
  return `:root{--paper:${theme.paper};--card:${theme.card};--ink:${theme.ink};--muted:${theme.muted};--accent:${theme.accent};--accent-soft:${theme.accentSoft};--line:${theme.line}}*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:var(--paper);color:var(--ink);font-family:"PingFang SC","Microsoft YaHei",system-ui,sans-serif}body{display:grid;place-items:center;padding:24px}.app{width:min(760px,100%);background:var(--card);border:1px solid var(--line);border-radius:26px;padding:26px 30px;box-shadow:0 24px 70px rgba(20,30,45,.12)}h1{font-size:20px;margin:0}.sub{color:var(--muted);font-size:12px;line-height:1.6}.btn{border:1px solid var(--line);background:transparent;color:var(--ink);border-radius:10px;padding:9px 14px;font:inherit;cursor:pointer}.btn.primary{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:700}.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}`
}

function storageHelpers() {
  return `function localDate(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function appGet(key,fallback){try{if(!window.nexlOS||!window.nexlOS.storage)return Promise.resolve(fallback);return window.nexlOS.storage.get(key).then(function(v){return v==null?fallback:v}).catch(function(){return fallback})}catch(_){return Promise.resolve(fallback)}}
function appSet(key,value){try{if(window.nexlOS&&window.nexlOS.storage)return window.nexlOS.storage.set(key,value).catch(function(){});}catch(_){}return Promise.resolve()}`
}

function pomodoro(theme) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>番茄钟</title><style>${baseCss(theme)}
header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--line);padding-bottom:14px;gap:10px}.brand{display:flex;align-items:center;gap:9px;font-weight:800}.pip{width:12px;height:12px;border-radius:50%;background:var(--accent)}
.modes{display:flex;justify-content:center;gap:8px;margin:20px 0}.mode{border:1px solid var(--line);background:transparent;color:var(--muted);border-radius:999px;padding:7px 14px;font:inherit;font-size:12px;cursor:pointer}.mode.active{background:var(--accent-soft);color:var(--accent);border-color:var(--accent);font-weight:700}
.stage{display:grid;grid-template-columns:1fr 190px;gap:20px;align-items:center}.ring{position:relative;width:min(320px,100%);aspect-ratio:1;margin:auto}.ring svg{width:100%;height:100%;transform:rotate(-90deg)}.ring .bg{fill:none;stroke:var(--line);stroke-width:10}.ring .fg{fill:none;stroke:var(--accent);stroke-width:10;stroke-linecap:round}.center{position:absolute;inset:0;display:grid;place-content:center;text-align:center}.time{font-size:clamp(44px,8vw,64px);font-weight:800;font-variant-numeric:tabular-nums;letter-spacing:-.05em}.state{font-size:12px;color:var(--muted)}.controls{display:flex;justify-content:center;gap:9px;margin-top:16px}.stats{display:grid;gap:10px}.stat{border:1px solid var(--line);border-radius:14px;padding:12px 14px}.stat b{display:block;font-size:24px;color:var(--accent)}.stat span{color:var(--muted);font-size:11px}@media(max-width:600px){.stage{grid-template-columns:1fr}.stats{grid-template-columns:1fr 1fr}}</style></head><body><main class="app">
<header><div class="brand"><span class="pip"></span>番茄钟</div><span class="sub">专注 25 分钟 · 休息 5 分钟</span></header>
<div class="modes"><button class="mode active" data-mode="focus">专注 25</button><button class="mode" data-mode="short">短休 5</button><button class="mode" data-mode="long">长休 15</button></div>
<div class="stage"><section class="ring"><svg viewBox="0 0 220 220"><circle class="bg" cx="110" cy="110" r="96"></circle><circle id="ringFg" class="fg" cx="110" cy="110" r="96"></circle></svg><div class="center"><div class="time" id="time" data-testid="time">25:00</div><div class="state" id="state">准备专注</div></div></section><aside class="stats"><div class="stat"><b id="done" data-testid="done">0</b><span>今日完成 · 个番茄</span></div><div class="stat"><b id="minutes">0</b><span>累计专注 · 分钟</span></div></aside></div>
<div class="controls"><button class="btn primary" id="toggle" data-testid="toggle">开始</button><button class="btn" id="reset" data-testid="reset">重置</button></div>
<p class="sub" style="text-align:center;margin-top:14px">空格开始暂停 · R 重置 · 专注结束后自动进入休息</p>
</main><script>
(function(){${storageHelpers()}
var durations={focus:1500,short:300,long:900},labels={focus:'准备专注',short:'短休息',long:'长休息'};var mode='focus',remaining=durations.focus,running=false,timer=0,done=0,minutes=0,rounds=0;
var timeEl=document.getElementById('time'),stateEl=document.getElementById('state'),toggleEl=document.getElementById('toggle'),ring=document.getElementById('ringFg'),doneEl=document.getElementById('done'),minutesEl=document.getElementById('minutes');ring.style.strokeDasharray=String(2*Math.PI*96);
function render(){timeEl.textContent=String(Math.floor(remaining/60)).padStart(2,'0')+':'+String(remaining%60).padStart(2,'0');stateEl.textContent=running?(mode==='focus'?'专注中':'休息中'):labels[mode];toggleEl.textContent=running?'暂停':'开始';doneEl.textContent=done;minutesEl.textContent=minutes;ring.style.strokeDashoffset=String(2*Math.PI*96*(1-remaining/durations[mode]));document.querySelectorAll('.mode').forEach(function(b){b.classList.toggle('active',b.dataset.mode===mode)})}
function save(){appSet('stats',{done:done,minutes:minutes,date:localDate()})}
function load(){appGet('stats',null).then(function(v){if(v&&v.date===localDate()){done=Number(v.done)||0;minutes=Number(v.minutes)||0;render()}})}
function stop(){if(timer){clearInterval(timer);timer=0}running=false;render()}
function switchMode(next){stop();mode=next;remaining=durations[mode];render()}
function complete(){stop();if(mode==='focus'){done+=1;minutes+=25;rounds+=1;save();switchMode(rounds%4===0?'long':'short')}else switchMode('focus')}
function tick(){if(remaining<=0){complete();return}remaining-=1;if(remaining<=0)complete();else render()}
function toggle(){if(running){stop();return}running=true;timer=setInterval(tick,1000);render()}
document.getElementById('toggle').addEventListener('click',toggle);document.getElementById('reset').addEventListener('click',function(){remaining=durations[mode];stop();render()});document.querySelectorAll('.mode').forEach(function(b){b.addEventListener('click',function(){switchMode(b.dataset.mode)})});document.addEventListener('keydown',function(e){if(e.code==='Space'&&e.target.tagName!=='INPUT'){e.preventDefault();toggle()}if(e.key==='r'||e.key==='R'){remaining=durations[mode];stop();render()}});render();load()})();
</script></body></html>`
}

function timer(theme) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>计时器</title><style>${baseCss(theme)}
.app{text-align:center}.clock{font-size:clamp(58px,12vw,96px);font-weight:800;letter-spacing:-.06em;font-variant-numeric:tabular-nums;margin:52px 0 14px}.status{color:var(--muted);font-size:12px}.controls{display:flex;justify-content:center;gap:10px;margin-top:22px}.btn{min-width:100px}.laps{max-width:420px;margin:24px auto 0;text-align:left;border-top:1px solid var(--line);padding-top:12px}.lap{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px dashed var(--line);font-size:12px;color:var(--muted)}</style></head><body><main class="app"><h1>计时器</h1><p class="sub">精确到 10ms 的秒表</p><div class="clock" id="clock" data-testid="timer">00:00.00</div><div class="status" id="status" data-testid="status">准备就绪</div><div class="controls"><button class="btn primary" id="start" data-testid="start">开始</button><button class="btn" id="reset" data-testid="reset">重置</button><button class="btn" id="lap">计次</button></div><div class="laps" id="laps"></div></main><script>
(function(){var elapsed=0,startedAt=0,running=false,tick=0,laps=[];var clock=document.getElementById('clock'),status=document.getElementById('status'),start=document.getElementById('start'),lapsEl=document.getElementById('laps');function fmt(ms){var cs=Math.floor(ms/10)%100,total=Math.floor(ms/1000),m=Math.floor(total/60),s=total%60;return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0')+'.'+String(cs).padStart(2,'0')}function render(){clock.textContent=fmt(running?elapsed+Date.now()-startedAt:elapsed);status.textContent=running?'计时中':'已暂停'}function startTimer(){if(running)return;running=true;startedAt=Date.now();start.textContent='暂停';tick=setInterval(render,40);render()}function pause(){if(!running)return;elapsed+=Date.now()-startedAt;running=false;clearInterval(tick);start.textContent='开始';render()}start.addEventListener('click',function(){running?pause():startTimer()});document.getElementById('reset').addEventListener('click',function(){pause();elapsed=0;laps=[];lapsEl.innerHTML='';render()});document.getElementById('lap').addEventListener('click',function(){if(!running)return;laps.push(clock.textContent);lapsEl.innerHTML=laps.slice(-8).map(function(v,i){return '<div class="lap"><span>计次 '+(laps.length-laps.slice(-8).length+i+1)+'</span><b>'+v+'</b></div>'}).join('')});render()})();
</script></body></html>`
}

function todo(theme) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>待办清单</title><style>${baseCss(theme)}
header{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;border-bottom:1px solid var(--line);padding-bottom:14px}.count{color:var(--muted);font-size:12px}.add{display:flex;gap:7px;margin:18px 0}.add input{flex:1;border:1px solid var(--line);background:transparent;color:var(--ink);border-radius:10px;padding:10px 12px;font:inherit;outline:none}.add input:focus{border-color:var(--accent)}.list{display:grid;gap:7px}.item{display:flex;align-items:center;gap:10px;border:1px solid var(--line);border-radius:11px;padding:10px 12px;font-size:13px}.item.done{opacity:.55;text-decoration:line-through}.item button{margin-left:auto;border:0;background:transparent;color:var(--muted);cursor:pointer}.empty{color:var(--muted);text-align:center;padding:30px;font-size:12px}</style></head><body><main class="app"><header><div><h1>待办清单</h1><p class="sub">专注当下，一件一件完成</p></div><span class="count" id="count" data-testid="count">0 项</span></header><div class="add"><input id="input" data-testid="todo-input" placeholder="添加一个任务…" maxlength="120"><button class="btn primary" id="add" data-testid="todo-add">添加</button></div><div class="list" id="list" data-testid="todo-list"></div></main><script>
(function(){${storageHelpers()}function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]})}var items=[],list=document.getElementById('list'),count=document.getElementById('count'),input=document.getElementById('input');function save(){appSet('todos',items)}function render(){count.textContent=items.filter(function(x){return !x.done}).length+' 项待完成';list.innerHTML=items.length?items.map(function(item,index){return '<div class="item '+(item.done?'done':'')+'"><input type="checkbox" '+(item.done?'checked':'')+' data-index="'+index+'"><span>'+esc(item.text)+'</span><button data-del="'+index+'" aria-label="删除">✕</button></div>'}).join(''):'<div class="empty">还没有待办，先加一件小事。</div>';list.querySelectorAll('input[type=checkbox]').forEach(function(box){box.addEventListener('change',function(){items[Number(box.dataset.index)].done=box.checked;save();render()})});list.querySelectorAll('[data-del]').forEach(function(btn){btn.addEventListener('click',function(){items.splice(Number(btn.dataset.del),1);save();render()})})}function add(){var value=input.value.trim();if(!value)return;items.push({text:value,done:false});input.value='';save();render()}document.getElementById('add').addEventListener('click',add);input.addEventListener('keydown',function(e){if(e.key==='Enter')add()});appGet('todos',[]).then(function(v){items=Array.isArray(v)?v:[];render()});render()})();
</script></body></html>`
}

function calculator(theme) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>计算器</title><style>${baseCss(theme)}
.app{max-width:440px}.display{text-align:right;border:1px solid var(--line);border-radius:16px;padding:22px 18px;margin:18px 0 14px;min-height:92px;display:flex;flex-direction:column;justify-content:flex-end}.expr{color:var(--muted);font-size:12px;min-height:17px}.value{font-size:44px;font-weight:800;letter-spacing:-.04em;font-variant-numeric:tabular-nums;overflow:hidden}.keys{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.key{border:1px solid var(--line);border-radius:11px;background:transparent;color:var(--ink);font:inherit;font-size:17px;padding:15px 0;cursor:pointer}.key.op{color:var(--accent)}.key.equal{background:var(--accent);border-color:var(--accent);color:#fff}.key:hover{filter:brightness(.97)}</style></head><body><main class="app"><h1>计算器</h1><p class="sub">键盘输入也支持</p><div class="display"><div class="expr" id="expr" data-testid="calc-expr"></div><div class="value" id="value" data-testid="calc-display">0</div></div><div class="keys" data-testid="calc-keys"><button class="key" data-k="C">C</button><button class="key" data-k="(">(</button><button class="key" data-k=")">)</button><button class="key op" data-k="/">÷</button><button class="key" data-k="7">7</button><button class="key" data-k="8">8</button><button class="key" data-k="9">9</button><button class="key op" data-k="*">×</button><button class="key" data-k="4">4</button><button class="key" data-k="5">5</button><button class="key" data-k="6">6</button><button class="key op" data-k="-">−</button><button class="key" data-k="1">1</button><button class="key" data-k="2">2</button><button class="key" data-k="3">3</button><button class="key op" data-k="+">+</button><button class="key" data-k="0">0</button><button class="key" data-k=".">.</button><button class="key op" data-k="%">%</button><button class="key equal" data-k="=">=</button></div></main><script>
(function(){var expr='',last='';var exprEl=document.getElementById('expr'),valueEl=document.getElementById('value');function safeEval(raw){if(!/^[0-9+\\-*/().%\\s]+$/.test(raw))throw new Error('invalid');var js=raw.replace(/%/g,'/100');try{var out=Function('"use strict";return ('+js+')')();if(!Number.isFinite(out))throw new Error('invalid');return out}catch(e){throw new Error('表达式不支持')}}function render(){valueEl.textContent=last||'0';exprEl.textContent=expr}function press(k){if(k==='C'){expr='';last='';render();return}if(k==='='){try{var out=safeEval(expr);last=String(Math.round(out*1e10)/1e10);expr='';}catch(e){last='';exprEl.textContent=e.message}render();return}if(k==='%'){expr+='%';last='';render();return}expr+=k;last='';render()}document.querySelectorAll('[data-k]').forEach(function(b){b.addEventListener('click',function(){press(b.dataset.k)})});document.addEventListener('keydown',function(e){if(/^[0-9+\\-*/().%]$/.test(e.key))press(e.key);else if(e.key==='Enter')press('=');else if(e.key==='Escape')press('C')});render()})();
</script></body></html>`
}

function dashboard(theme) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>数据看板</title><style>${baseCss(theme)}
.app{width:min(860px,100%)}header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:1px solid var(--line);padding-bottom:14px}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:18px 0}.card{border:1px solid var(--line);border-radius:15px;padding:14px}.card span{color:var(--muted);font-size:11px}.card b{display:block;font-size:28px;margin-top:5px;letter-spacing:-.04em}.chart{height:220px;display:flex;align-items:flex-end;gap:9px;border:1px solid var(--line);border-radius:15px;padding:18px;background:linear-gradient(180deg,transparent,rgba(223,74,53,.045))}.bar{flex:1;background:var(--accent);border-radius:6px 6px 2px 2px;min-height:5px;position:relative}.bar span{position:absolute;bottom:-20px;left:50%;transform:translateX(-50%);font-size:9px;color:var(--muted)}.legend{color:var(--muted);font-size:11px;margin-top:28px;text-align:right}@media(max-width:620px){.cards{grid-template-columns:1fr}.app{padding:20px}.chart{gap:5px}}</style></head><body><main class="app"><header><div><h1>数据看板</h1><p class="sub">本周专注与完成概览</p></div><span class="sub" id="date"></span></header><section class="cards"><div class="card"><span>本周专注</span><b id="hours">18.5h</b></div><div class="card"><span>完成番茄</span><b id="tomatos">42</b></div><div class="card"><span>完成率</span><b>87%</b></div></section><div class="chart" id="chart" data-testid="dashboard"></div><p class="legend">示例数据 · 接入 nexlOS.storage 后可替换为真实统计</p></main><script>
(function(){var values=[12,18,9,22,16,27,20],days=['一','二','三','四','五','六','日'];var chart=document.getElementById('chart');chart.innerHTML=values.map(function(v,i){return '<div class="bar" style="height:'+Math.round(v/30*180)+'px"><span>'+days[i]+'</span></div>'}).join('');document.getElementById('date').textContent=new Date().toLocaleDateString('zh-CN')})();
</script></body></html>`
}

export function renderAppTemplate(spec) {
  const theme = THEMES[spec && spec.palette] || THEMES['warm-minimal']
  if (!spec || !spec.kind) throw new Error('missing app spec')
  if (spec.kind === 'pomodoro') return pomodoro(theme)
  if (spec.kind === 'timer') return timer(theme)
  if (spec.kind === 'todo') return todo(theme)
  if (spec.kind === 'calculator') return calculator(theme)
  if (spec.kind === 'dashboard') return dashboard(theme)
  throw new Error('no template for kind: ' + spec.kind)
}

export function validateGeneratedHtml(html) {
  const text = String(html || '')
  if (!/<!doctype html|<html/iu.test(text) || !/<\/html>\s*$/iu.test(text.trim())) throw new Error('应用 HTML 不完整')
  if (!/<title[^>]*>[\s\S]*?<\/title>/iu.test(text)) throw new Error('应用缺少 title')
  if (/window\.parent|parent\.document/iu.test(text)) throw new Error('生成应用不能访问父窗口')
  if (/(?:src|href)\s*=\s*["']https?:\/\//iu.test(text)) throw new Error('生成应用不能依赖外部资源')
  return true
}
