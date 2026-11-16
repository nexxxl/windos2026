/* 小型电子表格公式引擎：词法 → 递归下降 → 求值。
   支持四则、幂、百分号、比较、& 连接、区域和常用函数。
   公式在浏览器里算，服务端只存原文，避免两套求值结果打架。 */
(function (global) {
  'use strict';

  function isErr(v) { return typeof v === 'string' && v.charAt(0) === '#'; }
  function toNum(v) {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'string') {
      var s = v.trim();
      if (s === '') return 0;
      if (/^-?[0-9]+(\.[0-9]+)?([eE][-+]?[0-9]+)?$/.test(s)) return parseFloat(s);
      return NaN;
    }
    return NaN;
  }
  function fmt(n) {
    if (!isFinite(n)) return '#NUM!';
    if (Math.abs(n) < 1e-12) n = 0;
    var s = String(Math.round(n * 1e10) / 1e10);
    return s;
  }
  function flatten(args) {
    var out = [];
    for (var i = 0; i < args.length; i++) {
      var a = args[i];
      if (Array.isArray(a)) {
        for (var j = 0; j < a.length; j++) out.push(a[j]);
      } else {
        out.push(a);
      }
    }
    return out;
  }
  function firstErr(vals) {
    for (var i = 0; i < vals.length; i++) if (isErr(vals[i])) return vals[i];
    return null;
  }

  /* ---------------- 词法 ---------------- */
  function tokenize(src) {
    var toks = [];
    var i = 0;
    var n = src.length;
    while (i < n) {
      var c = src.charAt(i);
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
      if (c >= '0' && c <= '9') {
        var start = i;
        while (i < n && /[0-9.]/.test(src.charAt(i))) i++;
        if (i < n && /[eE]/.test(src.charAt(i))) {
          i++;
          if (i < n && /[+-]/.test(src.charAt(i))) i++;
          while (i < n && /[0-9]/.test(src.charAt(i))) i++;
        }
        toks.push({ t: 'num', v: parseFloat(src.slice(start, i)) });
        continue;
      }
      if (c === '"') {
        i++;
        var buf = '';
        while (i < n) {
          if (src.charAt(i) === '"') {
            if (src.charAt(i + 1) === '"') { buf += '"'; i += 2; continue; }
            i++; break;
          }
          buf += src.charAt(i++);
        }
        toks.push({ t: 'str', v: buf });
        continue;
      }
      if (c === "'") {
        i++;
        var sheet = '';
        while (i < n) {
          if (src.charAt(i) === "'") {
            if (src.charAt(i + 1) === "'") { sheet += "'"; i += 2; continue; }
            i++; break;
          }
          sheet += src.charAt(i++);
        }
        if (src.charAt(i) === '!') i++;
        var qref = readRef(src, i);
        if (!qref) return null;
        toks.push({ t: 'ref', sheet: sheet, col: qref.col, row: qref.row });
        i = qref.end;
        continue;
      }
      if (/[A-Za-z_]/.test(c)) {
        var s0 = i;
        while (i < n && /[A-Za-z0-9_.]/.test(src.charAt(i))) i++;
        var word = src.slice(s0, i);
        if (src.charAt(i) === '!') {
          i++;
          var rr = readRef(src, i);
          if (!rr) return null;
          toks.push({ t: 'ref', sheet: word, col: rr.col, row: rr.row });
          i = rr.end;
          continue;
        }
        if (/^[A-Za-z]{1,3}[0-9]{1,7}$/.test(word)) {
          toks.push({ t: 'ref', sheet: '', col: word.replace(/[0-9]/g, '').toUpperCase(), row: parseInt(word.replace(/[^0-9]/g, ''), 10) });
        } else {
          toks.push({ t: 'id', v: word.toUpperCase() });
        }
        continue;
      }
      var two = src.substr(i, 2);
      if (two === '<=' || two === '>=' || two === '<>') {
        toks.push({ t: 'op', v: two }); i += 2; continue;
      }
      if ('+-*/^%&=<>'.indexOf(c) >= 0) {
        toks.push({ t: 'op', v: c }); i++; continue;
      }
      if (c === '(' || c === ')' || c === ',' || c === ':') {
        toks.push({ t: c, v: c }); i++; continue;
      }
      return null;
    }
    return toks;
  }

  function readRef(src, i) {
    var m = /^\$?([A-Za-z]{1,3})\$?([0-9]{1,7})/.exec(src.slice(i));
    if (!m) return null;
    return { col: m[1].toUpperCase(), row: parseInt(m[2], 10), end: i + m[0].length };
  }

  /* ---------------- 语法 ---------------- */
  function parse(toks) {
    var pos = 0;
    function peek() { return toks[pos]; }
    function eat(t) {
      var tk = toks[pos];
      if (!tk || tk.t !== t) return null;
      pos++;
      return tk;
    }
    function parseCmp() {
      var left = parseCat();
      var tk = peek();
      while (tk && tk.t === 'op' && (tk.v === '=' || tk.v === '<>' || tk.v === '<' || tk.v === '>' || tk.v === '<=' || tk.v === '>=')) {
        pos++;
        left = { k: 'bin', op: tk.v, a: left, b: parseCat() };
        tk = peek();
      }
      return left;
    }
    function parseCat() {
      var left = parseAdd();
      while (peek() && peek().t === 'op' && peek().v === '&') {
        pos++;
        left = { k: 'bin', op: '&', a: left, b: parseAdd() };
      }
      return left;
    }
    function parseAdd() {
      var left = parseMul();
      while (peek() && peek().t === 'op' && (peek().v === '+' || peek().v === '-')) {
        pos++;
        left = { k: 'bin', op: toks[pos - 1].v, a: left, b: parseMul() };
      }
      return left;
    }
    function parseMul() {
      var left = parsePow();
      while (peek() && peek().t === 'op' && (peek().v === '*' || peek().v === '/')) {
        pos++;
        left = { k: 'bin', op: toks[pos - 1].v, a: left, b: parsePow() };
      }
      return left;
    }
    function parsePow() {
      var left = parseUnary();
      while (peek() && peek().t === 'op' && peek().v === '^') {
        pos++;
        left = { k: 'bin', op: '^', a: left, b: parseUnary() };
      }
      return left;
    }
    function parseUnary() {
      var tk = peek();
      if (tk && tk.t === 'op' && (tk.v === '-' || tk.v === '+')) {
        pos++;
        return { k: 'un', op: tk.v, a: parseUnary() };
      }
      return parsePostfix();
    }
    function parsePostfix() {
      var node = parsePrimary();
      while (peek() && peek().t === 'op' && peek().v === '%') {
        pos++;
        node = { k: 'pct', a: node };
      }
      return node;
    }
    function parsePrimary() {
      var tk = peek();
      if (!tk) return null;
      if (tk.t === 'num') { pos++; return { k: 'num', v: tk.v }; }
      if (tk.t === 'str') { pos++; return { k: 'str', v: tk.v }; }
      if (tk.t === 'ref') {
        pos++;
        var node = { k: 'ref', sheet: tk.sheet, col: tk.col, row: tk.row };
        if (peek() && peek().t === ':') {
          pos++;
          var b = peek();
          if (!b || b.t !== 'ref') return null;
          pos++;
          node = { k: 'range', a: node, b: { k: 'ref', sheet: b.sheet || tk.sheet, col: b.col, row: b.row } };
        }
        return node;
      }
      if (tk.t === 'id') {
        pos++;
        if (tk.v === 'TRUE') return { k: 'bool', v: true };
        if (tk.v === 'FALSE') return { k: 'bool', v: false };
        if (eat('(')) {
          var args = [];
          if (!eat(')')) {
            while (true) {
              args.push(parseCmp());
              if (eat(',')) continue;
              if (!eat(')')) return null;
              break;
            }
          }
          return { k: 'call', name: tk.v, args: args };
        }
        return { k: 'name', v: tk.v };
      }
      if (tk.t === '(') {
        pos++;
        var inner = parseCmp();
        if (!eat(')')) return null;
        return inner;
      }
      return null;
    }
    var ast = parseCmp();
    if (!ast || pos !== toks.length) return null;
    return ast;
  }

  /* ---------------- 求值 ---------------- */
  function evalNode(node, ctx, depth) {
    if (!node) return '#ERR!';
    switch (node.k) {
      case 'num': return node.v;
      case 'str': return node.v;
      case 'bool': return node.v;
      case 'name': return '#' + node.v + '?';
      case 'ref': {
        if (depth > 40) return '#REF!';
        return ctx.cell(node.sheet, node.col + node.row, depth + 1);
      }
      case 'range': {
        if (depth > 40) return '#REF!';
        return ctx.range(node.a.sheet || node.b.sheet, node.a, node.b, depth + 1);
      }
      case 'pct': {
        var pv = evalNode(node.a, ctx, depth);
        if (isErr(pv)) return pv;
        return toNum(pv) / 100;
      }
      case 'un': {
        var uv = evalNode(node.a, ctx, depth);
        if (isErr(uv)) return uv;
        var un = toNum(uv);
        if (isNaN(un)) return '#VALUE!';
        return node.op === '-' ? -un : un;
      }
      case 'bin': {
        var a = evalNode(node.a, ctx, depth);
        var b = evalNode(node.b, ctx, depth);
        if (isErr(a)) return a;
        if (isErr(b)) return b;
        if (node.op === '&') return String(a === null ? '' : a) + String(b === null ? '' : b);
        if (node.op === '=') return looseEq(a, b);
        if (node.op === '<>') return !looseEq(a, b);
        if (node.op === '<' || node.op === '>' || node.op === '<=' || node.op === '>=') {
          var an = toNum(a), bn = toNum(b);
          if (isNaN(an) || isNaN(bn)) {
            var as = String(a), bs = String(b);
            if (node.op === '<') return as < bs;
            if (node.op === '>') return as > bs;
            if (node.op === '<=') return as <= bs;
            return as >= bs;
          }
          if (node.op === '<') return an < bn;
          if (node.op === '>') return an > bn;
          if (node.op === '<=') return an <= bn;
          return an >= bn;
        }
        var x = toNum(a), y = toNum(b);
        if (isNaN(x) || isNaN(y)) return '#VALUE!';
        if (node.op === '+') return x + y;
        if (node.op === '-') return x - y;
        if (node.op === '*') return x * y;
        if (node.op === '/') return y === 0 ? '#DIV/0!' : x / y;
        if (node.op === '^') return Math.pow(x, y);
        return '#ERR!';
      }
      case 'call': return callFn(node.name, node, ctx, depth);
    }
    return '#ERR!';
  }

  function looseEq(a, b) {
    if (typeof a === 'number' || typeof b === 'number' || typeof a === 'boolean' || typeof b === 'boolean') {
      var x = toNum(a), y = toNum(b);
      if (!isNaN(x) && !isNaN(y)) return x === y;
    }
    return String(a === null || a === undefined ? '' : a).toLowerCase() === String(b === null || b === undefined ? '' : b).toLowerCase();
  }

  function numsOf(args, fnName) {
    var flat = flatten(args);
    var err = firstErr(flat);
    if (err) return { err: err };
    var nums = [];
    for (var i = 0; i < flat.length; i++) {
      var v = flat[i];
      if (v === null || v === undefined || v === '') continue;
      if (typeof v === 'boolean') { nums.push(v ? 1 : 0); continue; }
      var n = toNum(v);
      if (!isNaN(n)) nums.push(n);
    }
    return { nums: nums };
  }

  var FNS = {
    SUM: function (args) { var r = numsOf(args); return r.err || r.nums.reduce(function (a, b) { return a + b; }, 0); },
    AVERAGE: function (args) { var r = numsOf(args); if (r.err) return r.err; return r.nums.length ? r.nums.reduce(function (a, b) { return a + b; }, 0) / r.nums.length : '#DIV/0!'; },
    AVG: function (args) { return FNS.AVERAGE(args); },
    MIN: function (args) { var r = numsOf(args); if (r.err) return r.err; return r.nums.length ? Math.min.apply(null, r.nums) : 0; },
    MAX: function (args) { var r = numsOf(args); if (r.err) return r.err; return r.nums.length ? Math.max.apply(null, r.nums) : 0; },
    COUNT: function (args) { var r = numsOf(args); return r.err || r.nums.length; },
    COUNTA: function (args) {
      var flat = flatten(args), c = 0;
      for (var i = 0; i < flat.length; i++) if (flat[i] !== null && flat[i] !== undefined && flat[i] !== '') c++;
      return c;
    },
    IF: function (args, ctx, depth, node) {
      var cond = evalNode(node.args[0], ctx, depth);
      if (isErr(cond)) return cond;
      var truthy = typeof cond === 'string' ? cond !== '' : !!cond;
      if (truthy) return node.args.length > 1 ? evalNode(node.args[1], ctx, depth) : true;
      return node.args.length > 2 ? evalNode(node.args[2], ctx, depth) : false;
    },
    AND: function (args) { var v = flatten(args); var e = firstErr(v); if (e) return e; return v.every(function (x) { return !!x; }); },
    OR: function (args) { var v = flatten(args); var e = firstErr(v); if (e) return e; return v.some(function (x) { return !!x; }); },
    NOT: function (args) { var v = args[0]; return !v; },
    ROUND: function (args) { var n = toNum(args[0]), d = args.length > 1 ? toNum(args[1]) : 0; if (isNaN(n) || isNaN(d)) return '#VALUE!'; var f = Math.pow(10, d); return Math.round(n * f) / f; },
    ABS: function (args) { var n = toNum(args[0]); return isNaN(n) ? '#VALUE!' : Math.abs(n); },
    INT: function (args) { var n = toNum(args[0]); return isNaN(n) ? '#VALUE!' : Math.floor(n); },
    LEN: function (args) { return String(args[0] === null || args[0] === undefined ? '' : args[0]).length; },
    UPPER: function (args) { return String(args[0] || '').toUpperCase(); },
    LOWER: function (args) { return String(args[0] || '').toLowerCase(); },
    TRIM: function (args) { return String(args[0] || '').replace(/^\s+|\s+$/g, ''); },
    CONCATENATE: function (args) { return flatten(args).join(''); },
    CONCAT: function (args) { return flatten(args).join(''); },
    LEFT: function (args) { return String(args[0] || '').slice(0, args.length > 1 ? toNum(args[1]) : 1); },
    RIGHT: function (args) { var s = String(args[0] || ''); var n = args.length > 1 ? toNum(args[1]) : 1; return n <= 0 ? '' : s.slice(-n); },
    MID: function (args) { return String(args[0] || '').substr(toNum(args[1]) - 1, toNum(args[2])); },
    IFERROR: function (args, ctx, depth, node) {
      var v = evalNode(node.args[0], ctx, depth);
      return isErr(v) ? evalNode(node.args[1], ctx, depth) : v;
    },
    TODAY: function () { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); },
    NOW: function () { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  };

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function callFn(name, node, ctx, depth) {
    var fn = FNS[name];
    if (!fn) return '#NAME?';
    if (name === 'IF' || name === 'IFERROR') return fn(null, ctx, depth + 1, node);
    var args = [];
    for (var i = 0; i < node.args.length; i++) args.push(evalNode(node.args[i], ctx, depth + 1));
    var err = firstErr(args);
    if (err) return err;
    return fn(args, ctx, depth, node);
  }

  var Formula = {
    /* 返回 { value: 任意, error: '#...' 或 null, display: 字符串 } */
    evaluate: function (src, ctx) {
      var text = String(src || '').trim();
      if (text.charAt(0) === '=') text = text.slice(1);
      var toks = tokenize(text);
      if (!toks) return { value: '#ERR!', error: '#ERR!', display: '#ERR!' };
      var ast = parse(toks);
      if (!ast) return { value: '#ERR!', error: '#ERR!', display: '#ERR!' };
      var out = evalNode(ast, ctx, 0);
      if (isErr(out)) return { value: out, error: out, display: out };
      if (Array.isArray(out)) {
        var fl = flatten([out]);
        return { value: fl[0], error: null, display: fl.length ? displayValue(fl[0]) : '' };
      }
      return { value: out, error: null, display: displayValue(out) };
    },
    display: displayValue
  };

  function displayValue(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return fmt(v);
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    return String(v);
  }

  global.Formula = Formula;
})(window);
