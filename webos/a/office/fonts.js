/* 字体目录：分组填充所有字体下拉框。
   字体文件都在 ui/fonts/，许可为 SIL OFL 1.1（可商用、可随应用再分发）。 */
(function (global) {
  'use strict';

  // [value, 显示名]；value 同时是 CSS font-family 与 DOCX/PPTX 里写的字体名。
  var GROUPS = [
    ['中文', [
      ['Noto Sans SC', '思源黑体'],
      ['Noto Serif SC', '思源宋体'],
      ['LXGW WenKai', '霞鹜文楷'],
      ['LXGW Neo ZhiSong', '霞鹜新致宋'],
      ['Smiley Sans Oblique', '得意黑']
    ]],
    ['西文无衬线', [
      ['Inter', 'Inter'],
      ['Roboto Condensed', 'Roboto Condensed'],
      ['Poppins', 'Poppins'],
      ['Josefin Sans', 'Josefin Sans'],
      ['Exo 2', 'Exo 2'],
      ['Archivo Black', 'Archivo Black'],
      ['Anton', 'Anton'],
      ['Alfa Slab One', 'Alfa Slab One'],
      ['Lilita One', 'Lilita One'],
      ['Righteous', 'Righteous']
    ]],
    ['西文衬线', [
      ['EB Garamond', 'EB Garamond'],
      ['Libre Baskerville', 'Libre Baskerville'],
      ['Cormorant Garamond', 'Cormorant Garamond'],
      ['Playfair Display', 'Playfair Display'],
      ['Cinzel', 'Cinzel'],
      ['Marcellus', 'Marcellus'],
      ['IM FELL English', 'IM FELL English'],
      ['CMU Serif', 'CMU Serif']
    ]],
    ['手写与装饰', [
      ['Caveat', 'Caveat'],
      ['Kalam', 'Kalam'],
      ['Gochi Hand', 'Gochi Hand'],
      ['Bangers', 'Bangers'],
      ['Rye', 'Rye'],
      ['UnifrakturMaguntia', 'Unifraktur'],
      ['Press Start 2P', 'Press Start 2P']
    ]],
    ['等宽', [
      ['JetBrains Mono', 'JetBrains Mono'],
      ['Source Code Pro', 'Source Code Pro']
    ]],
    ['系统字体', [
      ['PingFang SC', '苹方'],
      ['Songti SC', '宋体'],
      ['Heiti SC', '黑体'],
      ['Kaiti SC', '楷体'],
      ['Microsoft YaHei', '微软雅黑'],
      ['Arial', 'Arial'],
      ['Georgia', 'Georgia'],
      ['Times New Roman', 'Times New Roman'],
      ['Consolas', 'Consolas']
    ]]
  ];

  function build(select, keepValue) {
    if (!select) return;
    var current = keepValue === undefined ? select.value : keepValue;
    while (select.firstChild) select.removeChild(select.firstChild);

    var def = document.createElement('option');
    def.value = '';
    def.textContent = '默认字体';
    select.appendChild(def);

    for (var i = 0; i < GROUPS.length; i++) {
      var group = document.createElement('optgroup');
      // optgroup 的分组名是属性而不是文本节点，DOM 本地化器扫不到，这里现查一次。
      group.label = OT(GROUPS[i][0]);
      var fonts = GROUPS[i][1];
      for (var j = 0; j < fonts.length; j++) {
        var opt = document.createElement('option');
        opt.value = fonts[j][0];
        opt.textContent = fonts[j][1];
        // 支持自定义 option 字体的浏览器会在下拉里直接给出字形预览。
        opt.style.fontFamily = fonts[j][0];
        group.appendChild(opt);
      }
      select.appendChild(group);
    }

    var exists = false;
    for (var k = 0; k < select.options.length; k++) {
      if (select.options[k].value === current) { exists = true; break; }
    }
    select.value = exists ? current : '';
  }

  function sync(select) { if (select) build(select, select.value); }

  global.Fonts = {
    groups: GROUPS,
    build: build,
    sync: sync,
    count: (function () {
      var n = 0;
      for (var i = 0; i < GROUPS.length; i++) n += GROUPS[i][1].length;
      return n;
    })()
  };

  // 脚本在 </body> 前加载，三个下拉框此时已经存在。
  build(document.getElementById('docFont'));
  build(document.getElementById('sheetFont'));
  build(document.getElementById('elemFont'));
})(window);
