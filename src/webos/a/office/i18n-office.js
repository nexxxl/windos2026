/* 便捷办公的即时翻译通道。
 * 文本节点由宿主 i18n 的观察器自动翻译；输入框的值、拼好的整句
 * （例如另存为的「（副本）」后缀）不经过 DOM 遍历，用 OT() 现查一次。
 * 嵌在外壳或便捷办公里时等宿主注入 __nexlosTranslate；单独打开时自己
 * 载入同一份 /a/i18n.js，按第一版发布要求默认英文。 */
(function (global) {
  'use strict';

  function hostTranslate(text) {
    var fn = global.__nexlosTranslate;
    return typeof fn === 'function' ? fn(text) : null;
  }

  function fill(template, args) {
    if (!args.length) return template;
    return template.replace(/\{(\d+)\}/g, function (all, index) {
      var value = args[Number(index)];
      return value === undefined ? all : String(value);
    });
  }

  function OT(text, a, b) {
    var out = hostTranslate(text);
    if (out === null) out = text;
    return fill(out, Array.prototype.slice.call(arguments, 1));
  }
  global.OT = OT;

  // 顶层文档没有宿主：工具页单独双击或「在新窗口打开」时走这条路径。
  // 嵌在 iframe 里时不抢语言，等宿主 load 时注入翻译器。
  if (global.parent !== global) return;
  if (typeof global.__nexlosTranslate === 'function') return;

  var script = document.currentScript;
  var i18nUrl = '/a/i18n.js';
  try {
    if (script && script.src) i18nUrl = new URL('../i18n.js', script.src).href;
  } catch (e) { /* 读不到脚本地址时退回站点根路径 */ }

  import(i18nUrl).then(function (mod) {
    if (typeof global.__nexlosTranslate === 'function') return;
    mod.setLanguage('en');
    mod.localizeDoc(document, true);
  }).catch(function () { /* 语言包不可用时保留中文原文 */ });
})(window);
