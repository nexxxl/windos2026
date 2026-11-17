/* windos2026 site i18n
   中文原文做 key，DOM 本地化器 + 8 种内置语言切换。
   与 NexlOS 的界面语言表保持一致：zh-CN / zh-TW / en / es / fr / de / ja / ko。 */
(function () {
  "use strict";

  var DATA = window.NEXLOS_I18N_DATA || { langs: [], dict: {}, meta: {}, html: {} };
  var STORE_KEY = "nexlos.site.lang";
  var LANGS = DATA.langs;
  var DICT = DATA.dict;
  var META = DATA.meta;
  var HTML = DATA.html || {};
  var current = "zh-CN";

  var TEXT_ORIGINALS = new WeakMap();
  var ATTR_ORIGINALS = new WeakMap();
  var HTML_ORIGINALS = new WeakMap();
  var ATTRS = ["placeholder", "aria-label", "title", "alt"];
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, CODE: 1, PRE: 1, KBD: 1, SAMP: 1, SVG: 1, TEXTAREA: 1 };
  var SPACED = { en: 1, es: 1, fr: 1, de: 1 };
  var initialTitle = document.title;
  var initialDesc = (document.querySelector('meta[name="description"]') || {}).content || "";

  function normalize(value) {
    return String(value == null ? "" : value).replace(/\s+/gu, " ").trim();
  }

  function decode(value) {
    return String(value)
      .replace(/&amp;/gu, "&")
      .replace(/&lt;/gu, "<")
      .replace(/&gt;/gu, ">")
      .replace(/&quot;/gu, '"')
      .replace(/&#39;/gu, "'");
  }

  /* 汉字 + 中日韩标点 + 全角符号：像 "grok、claude、codex，" 这种只带标点的
     片段也要走词典，否则英文页会残留中文顿号和逗号。 */
  function hasCJK(value) {
    return /[\u3001-\u303f\u3400-\u9fff\uf900-\ufaff\uff01-\uff60]/u.test(value);
  }

  function normalizeLang(code) {
    if (!code) return null;
    var raw = String(code).toLowerCase();
    if (raw === "zh" || raw === "zh-cn" || raw === "zh-hans" || raw === "zh-sg") return "zh-CN";
    if (raw === "zh-tw" || raw === "zh-hk" || raw === "zh-mo" || raw === "zh-hant") return "zh-TW";
    var base = raw.split("-")[0];
    var map = { en: "en", es: "es", fr: "fr", de: "de", ja: "ja", ko: "ko" };
    return map[base] || null;
  }

  function dictFor(lang) {
    return lang === "zh-CN" ? null : DICT[lang] || null;
  }

  function translateValue(source, lang) {
    var dict = dictFor(lang);
    if (!dict) return source;
    var hit = dict[source];
    return hit ? decode(hit) : source;
  }

  function shouldSkip(element) {
    if (!element) return false;
    if (SKIP_TAGS[element.tagName]) return true;
    if (element.closest && element.closest("[data-i18n-html][data-i18n-active]")) return true;
    return Boolean(element.closest && element.closest("[data-i18n-ignore]"));
  }

  /* 西文语言里，相邻行内节点之间需要补一个空格：
     "inside" + "your DSH" -> "inside your DSH"；"One desktop," + "six things" 同理。 */
  function previousText(node) {
    var sibling = node.previousSibling;
    while (sibling) {
      if (sibling.nodeType === 3 && /\S/u.test(sibling.nodeValue)) return sibling.nodeValue;
      if (sibling.nodeType === 1) {
        var text = sibling.textContent;
        if (text && /\S/u.test(text)) return text;
      }
      sibling = sibling.previousSibling;
    }
    return "";
  }

  function applyWordGap(node) {
    if (!SPACED[current]) return;
    var value = node.nodeValue;
    var lead = (value.match(/^\s*/u) || [""])[0];
    var core = value.slice(lead.length);
    if (!core || lead) return;
    var prev = previousText(node);
    if (!prev) return;
    if (/[A-Za-z0-9,;:.]$/u.test(prev) && /^[A-Za-z0-9\u00c0-\u024f(“"']/u.test(core)) {
      node.nodeValue = " " + value;
    }
  }

  /* 标题这类分行排版在每种语言里断行位置不同，用整段 HTML 覆盖，避免碎片拼接。 */
  function translateHtmlBlocks() {
    var blocks = document.querySelectorAll("[data-i18n-html]");
    for (var i = 0; i < blocks.length; i += 1) {
      var element = blocks[i];
      var key = element.getAttribute("data-i18n-html");
      if (!HTML_ORIGINALS.has(element)) HTML_ORIGINALS.set(element, element.innerHTML);
      var pack = HTML[current] || null;
      var markup = pack && pack[key];
      if (markup) {
        element.innerHTML = markup;
        element.setAttribute("data-i18n-active", "1");
      } else {
        element.innerHTML = HTML_ORIGINALS.get(element);
        element.removeAttribute("data-i18n-active");
      }
    }
  }

  /* 源文记在 WeakMap 里，切换语言一律从源文翻。
     不能先用「当前文本里有没有中文」做闸门：切到英文之后节点已经是英文，
     再切日文或切回中文时就会被自己的闸门挡住，永远停在英文。
     源文两侧的空白一并记住：西文语言会补词间空格，若不记住，来回切几次就会多出空格。 */
  function sourceOf(node, raw) {
    var stored = TEXT_ORIGINALS.get(node);
    if (stored === undefined) {
      var key = normalize(raw);
      if (!key || !hasCJK(key)) return null;
      stored = {
        source: key,
        lead: (raw.match(/^\s*/u) || [""])[0],
        trail: (raw.match(/\s*$/u) || [""])[0],
      };
      TEXT_ORIGINALS.set(node, stored);
    }
    return stored && hasCJK(stored.source) ? stored : null;
  }

  function translateTextNode(node) {
    if (!node || node.nodeType !== 3) return;
    var parent = node.parentElement;
    if (shouldSkip(parent)) return;
    var info = sourceOf(node, node.nodeValue);
    if (!info) return;
    node.nodeValue = info.lead + translateValue(info.source, current) + info.trail;
    applyWordGap(node);
  }

  function translateAttributes(element) {
    if (!element || element.nodeType !== 1 || shouldSkip(element)) return;
    var store = ATTR_ORIGINALS.get(element);
    if (!store) {
      store = {};
      ATTR_ORIGINALS.set(element, store);
    }
    for (var i = 0; i < ATTRS.length; i += 1) {
      var name = ATTRS[i];
      var value = element.getAttribute(name);
      if (!value) continue;
      if (!Object.prototype.hasOwnProperty.call(store, name)) {
        if (!hasCJK(value)) continue;
        store[name] = value;
      }
      var source = normalize(store[name]);
      if (!source || !hasCJK(source)) continue;
      element.setAttribute(name, translateValue(source, current));
    }
  }

  function walk(root, visit) {
    if (!root) return;
    if (root.nodeType === 3) {
      visit.text && visit.text(root);
      return;
    }
    if (root.nodeType !== 1 && root.nodeType !== 9) return;
    if (root.nodeType === 1) {
      if (shouldSkip(root)) return;
      visit.element && visit.element(root);
    }
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        if (node.nodeType === 1 && shouldSkip(node)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    var node = walker.nextNode();
    while (node) {
      if (node.nodeType === 3) visit.text && visit.text(node);
      else visit.element && visit.element(node);
      node = walker.nextNode();
    }
  }

  function translatePage() {
    if (!document.body) return;
    translateHtmlBlocks();
    walk(document.body, { text: translateTextNode, element: translateAttributes });
    translateMeta();
    document.documentElement.lang = current === "zh-TW" ? "zh-Hant" : current === "zh-CN" ? "zh-Hans" : current;
  }

  function translateMeta() {
    var page = document.documentElement.getAttribute("data-page") || "home";
    var pack = (META[current] || {})[page] || null;
    document.title = pack && pack.title ? pack.title : initialTitle;
    var desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute("content", pack && pack.desc ? pack.desc : initialDesc);
    var ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute("content", document.title);
    var ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute("content", pack && pack.desc ? pack.desc : initialDesc);
  }

  function labelOf(code) {
    for (var i = 0; i < LANGS.length; i += 1) if (LANGS[i].code === code) return LANGS[i];
    return LANGS[0];
  }

  function updateChrome() {
    var short = document.querySelector("[data-lang-current]");
    if (short) short.textContent = labelOf(current).short;
    var buttons = document.querySelectorAll("[data-lang]");
    for (var i = 0; i < buttons.length; i += 1) {
      buttons[i].setAttribute("aria-checked", buttons[i].getAttribute("data-lang") === current ? "true" : "false");
    }
    document.documentElement.setAttribute("lang", current === "zh-TW" ? "zh-Hant" : current === "zh-CN" ? "zh-Hans" : current);
  }

  function setLang(code, options) {
    var next = normalizeLang(code) || "zh-CN";
    current = next;
    try {
      localStorage.setItem(STORE_KEY, current);
    } catch (_error) {
      /* localStorage may be unavailable in private or embedded contexts */
    }
    if (!options || options.url !== false) {
      try {
        var url = new URL(location.href);
        if (current === "zh-CN") url.searchParams.delete("lang");
        else url.searchParams.set("lang", current);
        history.replaceState(null, "", url);
      } catch (_error) {
        /* ignore */
      }
    }
    updateChrome();
    translatePage();
    document.dispatchEvent(new CustomEvent("nexlos:lang", { detail: { lang: current } }));
  }

  function buildSwitch() {
    var actions = document.querySelector(".top-actions");
    if (!actions || actions.querySelector(".lang-switch")) return;
    var wrap = document.createElement("div");
    wrap.className = "lang-switch";
    wrap.setAttribute("data-i18n-ignore", "true");
    var items = LANGS.map(function (lang) {
      return (
        '<button type="button" role="menuitemradio" data-lang="' +
        lang.code +
        '" aria-checked="' +
        (lang.code === current ? "true" : "false") +
        '"><span>' +
        lang.label +
        "</span><em>" +
        lang.code +
        "</em></button>"
      );
    }).join("");
    wrap.innerHTML =
      '<button class="lang-toggle" type="button" aria-expanded="false" aria-controls="langMenu" aria-label="切换语言 / Change language">' +
      '<span class="lang-globe" aria-hidden="true">◎</span><span data-lang-current>' +
      labelOf(current).short +
      '</span><span class="lang-caret" aria-hidden="true">▾</span></button>' +
      '<div class="lang-menu" id="langMenu" role="menu" hidden>' +
      items +
      "</div>";
    actions.insertBefore(wrap, actions.firstChild);

    var toggle = wrap.querySelector(".lang-toggle");
    var menu = wrap.querySelector(".lang-menu");
    var close = function () {
      menu.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
    };
    toggle.addEventListener("click", function (event) {
      event.stopPropagation();
      var open = menu.hidden;
      menu.hidden = !open;
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    menu.addEventListener("click", function (event) {
      var button = event.target.closest("[data-lang]");
      if (!button) return;
      setLang(button.getAttribute("data-lang"));
      close();
      toggle.focus();
    });
    document.addEventListener("click", function (event) {
      if (!wrap.contains(event.target)) close();
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        close();
        toggle.focus();
      }
    });
  }

  function initialLang() {
    var params = new URLSearchParams(location.search);
    var fromUrl = normalizeLang(params.get("lang"));
    if (fromUrl) return fromUrl;
    try {
      var stored = normalizeLang(localStorage.getItem(STORE_KEY));
      if (stored) return stored;
    } catch (_error) {
      /* ignore */
    }
    return "zh-CN";
  }

  function start() {
    current = initialLang();
    buildSwitch();
    updateChrome();
    translatePage();
    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i += 1) {
        var added = mutations[i].addedNodes;
        for (var j = 0; j < added.length; j += 1) {
          var node = added[j];
          if (node.nodeType === 3) translateTextNode(node);
          else if (node.nodeType === 1) {
            translateAttributes(node);
            var text = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
            var item = text.nextNode();
            while (item) {
              translateTextNode(item);
              item = text.nextNode();
            }
            var els = node.querySelectorAll ? node.querySelectorAll("*") : [];
            for (var k = 0; k < els.length; k += 1) translateAttributes(els[k]);
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.NEXLOS_SITE_I18N = {
      lang: function () {
        return current;
      },
      set: setLang,
      refresh: translatePage,
      languages: LANGS,
    };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
