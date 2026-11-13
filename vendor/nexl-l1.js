"use strict";
var NEXL_L1 = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // nexl-browser-entry.ts
  var nexl_browser_entry_exports = {};
  __export(nexl_browser_entry_exports, {
    ActionMask: () => ActionMask,
    NexlStateStack: () => NexlStateStack,
    NodeRole: () => NodeRole,
    extractBytecode: () => extractBytecode,
    serializeDom: () => serializeDom
  });

  // src/constants.ts
  var NodeRole = /* @__PURE__ */ ((NodeRole2) => {
    NodeRole2[NodeRole2["VOID"] = 0] = "VOID";
    NodeRole2[NodeRole2["ACTION"] = 1] = "ACTION";
    NodeRole2[NodeRole2["INPUT"] = 2] = "INPUT";
    NodeRole2[NodeRole2["NAVIGATION"] = 3] = "NAVIGATION";
    NodeRole2[NodeRole2["CONTENT"] = 4] = "CONTENT";
    NodeRole2[NodeRole2["CONTAINER"] = 5] = "CONTAINER";
    NodeRole2[NodeRole2["DIALOG"] = 6] = "DIALOG";
    NodeRole2[NodeRole2["MEDIA"] = 7] = "MEDIA";
    NodeRole2[NodeRole2["CROSS_REF"] = 8] = "CROSS_REF";
    NodeRole2[NodeRole2["SIGNATURE"] = 9] = "SIGNATURE";
    NodeRole2[NodeRole2["TERMINATOR"] = 255] = "TERMINATOR";
    return NodeRole2;
  })(NodeRole || {});
  var ActionMask = /* @__PURE__ */ ((ActionMask2) => {
    ActionMask2[ActionMask2["NONE"] = 0] = "NONE";
    ActionMask2[ActionMask2["CLICK"] = 1] = "CLICK";
    ActionMask2[ActionMask2["FOCUS"] = 2] = "FOCUS";
    ActionMask2[ActionMask2["INPUT"] = 4] = "INPUT";
    ActionMask2[ActionMask2["SUBMIT"] = 8] = "SUBMIT";
    ActionMask2[ActionMask2["NAVIGATE"] = 16] = "NAVIGATE";
    ActionMask2[ActionMask2["SCROLL"] = 32] = "SCROLL";
    ActionMask2[ActionMask2["DRAG"] = 64] = "DRAG";
    ActionMask2[ActionMask2["CUSTOM"] = 128] = "CUSTOM";
    return ActionMask2;
  })(ActionMask || {});
  var MAGIC = new Uint8Array([78, 88, 67, 49]);
  var VERSION = 1;
  var NODE_SIZE = 32;
  var HEADER_SIZE = 16;
  var DATA_LENGTH_PREFIX = 4;

  // src/serialized-dom.ts
  var STATE_VISIBLE = 1 << 0;
  var STATE_DISABLED = 1 << 1;
  var STATE_CHECKED = 1 << 2;
  var STATE_EXPANDED = 1 << 3;
  var TAG_ROLE = {
    button: 1 /* ACTION */,
    a: 3 /* NAVIGATION */,
    area: 3 /* NAVIGATION */,
    input: 2 /* INPUT */,
    select: 2 /* INPUT */,
    textarea: 2 /* INPUT */,
    form: 5 /* CONTAINER */,
    nav: 5 /* CONTAINER */,
    main: 5 /* CONTAINER */,
    aside: 5 /* CONTAINER */,
    section: 5 /* CONTAINER */,
    header: 5 /* CONTAINER */,
    footer: 5 /* CONTAINER */,
    // W4-10 续 · body 是文档主容器，缺失会导致 body 下新增节点无法成为 dirtyRoot
    // → delta 路径不激活（B1 场景：body 末尾新增按钮 → dirty 为空）
    body: 5 /* CONTAINER */,
    // W4-10 · ul/ol/li 是语义列表容器，缺失会导致 D1 判 VOID → convertNode 折叠
    // → baseline stableIds 丢失列表节点 → delta changedStableIds 0% 命中
    ul: 5 /* CONTAINER */,
    ol: 5 /* CONTAINER */,
    li: 5 /* CONTAINER */,
    article: 4 /* CONTENT */,
    p: 4 /* CONTENT */,
    h1: 4 /* CONTENT */,
    h2: 4 /* CONTENT */,
    h3: 4 /* CONTENT */,
    h4: 4 /* CONTENT */,
    h5: 4 /* CONTENT */,
    h6: 4 /* CONTENT */,
    img: 4 /* CONTENT */,
    figure: 4 /* CONTENT */,
    blockquote: 4 /* CONTENT */,
    pre: 4 /* CONTENT */,
    dialog: 6 /* DIALOG */,
    video: 7 /* MEDIA */,
    audio: 7 /* MEDIA */,
    canvas: 7 /* MEDIA */,
    iframe: 8 /* CROSS_REF */,
    link: 8 /* CROSS_REF */,
    meta: 8 /* CROSS_REF */
  };
  var ARIA_ROLE = {
    button: 1 /* ACTION */,
    link: 3 /* NAVIGATION */,
    navigation: 5 /* CONTAINER */,
    main: 5 /* CONTAINER */,
    complementary: 5 /* CONTAINER */,
    region: 5 /* CONTAINER */,
    banner: 5 /* CONTAINER */,
    contentinfo: 5 /* CONTAINER */,
    // W4-10 · list/listitem 对齐 TAG_ROLE，否则 role=list 的 ul 仍判 VOID
    list: 5 /* CONTAINER */,
    listitem: 5 /* CONTAINER */,
    article: 4 /* CONTENT */,
    heading: 4 /* CONTENT */,
    // W4-10 续 · 补全动态内容 role，否则 progressbar/status/alert/note 判 VOID
    // → convertNode 折叠 → baseline 丢节点 → markDirty 拿不到 stableId → delta 路径不激活
    progressbar: 4 /* CONTENT */,
    status: 4 /* CONTENT */,
    alert: 4 /* CONTENT */,
    note: 4 /* CONTENT */,
    dialog: 6 /* DIALOG */,
    alertdialog: 6 /* DIALOG */
  };
  function deriveRole(el) {
    const ariaRole = el.getAttribute("role");
    if (ariaRole && ARIA_ROLE[ariaRole]) {
      return ARIA_ROLE[ariaRole];
    }
    const tag = el.tagName.toLowerCase();
    if (TAG_ROLE[tag]) {
      return TAG_ROLE[tag];
    }
    return 0 /* VOID */;
  }
  function deriveActionMask(el, role) {
    let mask = 0 /* NONE */;
    const tag = el.tagName.toLowerCase();
    if (tag === "button" || el.hasAttribute("onclick") || el.getAttribute("role") === "button") {
      mask |= 1 /* CLICK */;
    }
    if (tag === "a" || tag === "area") {
      mask |= 1 /* CLICK */;
    }
    if (el.hasAttribute("tabindex") || tag === "button" || tag === "a" || tag === "input" || tag === "select" || tag === "textarea") {
      mask |= 2 /* FOCUS */;
    }
    if (tag === "input" || tag === "select" || tag === "textarea") {
      mask |= 4 /* INPUT */;
    }
    if (tag === "form") {
      mask |= 8 /* SUBMIT */;
    }
    if ((tag === "button" || tag === "input") && el.getAttribute("type")?.toLowerCase() === "submit") {
      mask |= 8 /* SUBMIT */;
      mask |= 1 /* CLICK */;
    }
    if (tag === "a" || tag === "area") {
      mask |= 16 /* NAVIGATE */;
    }
    if (el.hasAttribute("data-nexl-scroll")) {
      mask |= 32 /* SCROLL */;
    }
    if (el.draggable) {
      mask |= 64 /* DRAG */;
    }
    if (el.hasAttribute("data-nexl-action")) {
      mask |= 128 /* CUSTOM */;
    }
    return mask;
  }
  function deriveState(el) {
    let state = 0;
    if (!el.hasAttribute("hidden")) {
      state |= STATE_VISIBLE;
    }
    if (el instanceof HTMLElement && el.disabled || el.getAttribute("aria-disabled") === "true") {
      state |= STATE_DISABLED;
    }
    if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio") && el.checked || el.getAttribute("aria-checked") === "true") {
      state |= STATE_CHECKED;
    }
    if (el.getAttribute("aria-expanded") === "true" || el instanceof HTMLDetailsElement && el.open) {
      state |= STATE_EXPANDED;
    }
    return state;
  }
  function deriveData(el, role) {
    const tag = el.tagName.toLowerCase();
    const data = {};
    const ariaLabelAttr = el.getAttribute("aria-label");
    if (ariaLabelAttr) {
      data.extras = [["aria-label", ariaLabelAttr]];
    }
    switch (role) {
      case 2 /* INPUT */: {
        if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
          if (el.name) data.name = el.name;
        }
        const label = el.getAttribute("aria-label");
        if (label) data.label = label;
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          if (el.value) data.value = el.value;
        }
        break;
      }
      case 1 /* ACTION */: {
        const label = el.getAttribute("aria-label") || el.textContent?.trim();
        if (label) data.label = label;
        break;
      }
      case 3 /* NAVIGATION */: {
        if (el instanceof HTMLAnchorElement || el instanceof HTMLAreaElement) {
          if (el.href) data.name = el.href;
        }
        const label = el.getAttribute("aria-label") || el.textContent?.trim();
        if (label) data.label = label;
        break;
      }
      case 4 /* CONTENT */: {
        const alt = el.getAttribute("alt");
        if (alt) {
          data.label = alt;
        } else if (el.textContent && el.textContent.trim()) {
          data.label = el.textContent.trim().slice(0, 256);
        }
        break;
      }
      case 8 /* CROSS_REF */: {
        if (el instanceof HTMLIFrameElement) {
          if (el.src) data.name = el.src;
        } else if (el instanceof HTMLLinkElement) {
          if (el.href) data.name = el.href;
        }
        break;
      }
      default:
        break;
    }
    if (data.name === void 0 && data.label === void 0 && data.value === void 0 && data.extras === void 0) {
      return void 0;
    }
    return data;
  }
  function shouldKeep(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === "script" || tag === "style" || tag === "noscript" || tag === "template") {
      return false;
    }
    return true;
  }
  function serializeNode(el) {
    const role = deriveRole(el);
    const actionMask = deriveActionMask(el, role);
    const state = deriveState(el);
    const data = deriveData(el, role);
    const children = [];
    for (let i = 0; i < el.children.length; i++) {
      const child = el.children[i];
      if (shouldKeep(child)) {
        children.push(serializeNode(child));
      }
    }
    return {
      role,
      actionMask,
      state,
      tagName: el.tagName.toLowerCase(),
      data,
      children
    };
  }
  function countNodesWithTerminators(node) {
    let count = 1;
    for (const child of node.children) {
      count += countNodesWithTerminators(child);
    }
    if (node.children.length > 0) {
      count += 1;
    }
    return count;
  }
  function serializeDom(root, url) {
    const capturedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    const serialized = serializeNode(root);
    const nodeCount = countNodesWithTerminators(serialized);
    return {
      url,
      capturedAt,
      root: serialized,
      nodeCount
    };
  }

  // src/nexl-bytecode-encoder.ts
  var BytecodeWriter = class {
    /** 输出缓冲区（动态扩容） */
    buffer;
    /** 当前写入偏移 */
    writeOffset = 0;
    /** 节点计数（不含 TERMINATOR） */
    nodeCount = 0;
    /** TERMINATOR 计数 */
    terminatorCount = 0;
    /** 待回填 DataOffset 的节点列表 */
    pendingDataList = [];
    /** 文件头是否已写入 */
    headerWritten = false;
    /** 文件头在 buffer 中的偏移（用于回填 NodeCount） */
    headerOffset = 0;
    constructor(initialCapacity = 1024 * 1024) {
      this.buffer = new Uint8Array(initialCapacity);
    }
    /**
     * 写入文件头（16 字节）。
     *
     * 必须在写任何节点之前调用。
     */
    writeHeader(flags = 0 /* NONE */) {
      if (this.headerWritten) {
        throw new Error("NEXL-Bytecode: header already written");
      }
      this.headerWritten = true;
      this.headerOffset = this.writeOffset;
      this.ensureCapacity(HEADER_SIZE);
      const view = this.dataView();
      this.buffer[this.writeOffset + 0] = MAGIC[0];
      this.buffer[this.writeOffset + 1] = MAGIC[1];
      this.buffer[this.writeOffset + 2] = MAGIC[2];
      this.buffer[this.writeOffset + 3] = MAGIC[3];
      this.buffer[this.writeOffset + 4] = VERSION;
      this.buffer[this.writeOffset + 5] = flags;
      view.setUint32(this.writeOffset + 6, 0, true);
      view.setUint32(this.writeOffset + 10, 0, true);
      view.setUint16(this.writeOffset + 14, 0, true);
      this.writeOffset += HEADER_SIZE;
    }
    /**
     * 写入一个节点头（32 字节定长）。
     *
     * DataOffset 暂时填 0，由 finalize() 回填。
     * Data 段在所有节点之后统一写入。
     *
     * @param node 节点数据
     * @param ref 可选，D2 阶段分配的 a11y 快照 ref（DFS 序，页面内全局唯一）。
     *            D4 traverseSubgraph 必须传入——Agent 用 ref + getByRole 定位元素。
     *            写入节点头 Reserved 字段（offset 28-31，spec v0.1 预留扩展位）。
     *            原 traverse 路径不传，Reserved 保持 0（向后兼容）。
     */
    writeNode(node, ref) {
      if (!this.headerWritten) {
        throw new Error("NEXL-Bytecode: header not written");
      }
      this.ensureCapacity(NODE_SIZE);
      const offset = this.writeOffset;
      const view = this.dataView();
      this.buffer[offset + 0] = node.role;
      this.buffer[offset + 1] = node.actionMask;
      view.setUint16(offset + 2, node.state, true);
      const nameHash = fnv1a64(node.tagName);
      view.setBigUint64(offset + 4, nameHash, true);
      view.setBigUint64(offset + 12, 0n, true);
      view.setUint32(offset + 20, node.children.length, true);
      view.setUint32(offset + 24, 0, true);
      view.setUint32(offset + 28, ref ?? 0, true);
      this.writeOffset += NODE_SIZE;
      this.nodeCount += 1;
      if (node.data !== void 0) {
        this.pendingDataList.push({
          nodeOffset: offset,
          data: node.data
        });
      }
    }
    /**
     * 写入 TERMINATOR 标记（状态栈 pop 的字节级体现）。
     *
     * 32 字节定长，Role=0xFF，其余字段为 0。
     */
    writeTerminator() {
      if (!this.headerWritten) {
        throw new Error("NEXL-Bytecode: header not written");
      }
      this.ensureCapacity(NODE_SIZE);
      const offset = this.writeOffset;
      const view = this.dataView();
      this.buffer[offset + 0] = 255 /* TERMINATOR */;
      this.buffer[offset + 1] = 0;
      view.setUint16(offset + 2, 0, true);
      view.setBigUint64(offset + 4, 0n, true);
      view.setBigUint64(offset + 12, 0n, true);
      view.setUint32(offset + 20, 0, true);
      view.setUint32(offset + 24, 0, true);
      view.setUint32(offset + 28, 0, true);
      this.writeOffset += NODE_SIZE;
      this.terminatorCount += 1;
    }
    /**
     * 完成编码——写 Data 段、回填 DataOffset、回填 NodeCount。
     *
     * 返回最终的 NEXL-Bytecode 字节流（subarray，零拷贝）。
     */
    finalize() {
      if (!this.headerWritten) {
        throw new Error("NEXL-Bytecode: header not written");
      }
      for (const pending of this.pendingDataList) {
        const dataOffset = this.writeOffset;
        const payload = encodeDataPayload(pending.data);
        this.ensureCapacity(payload.length);
        this.buffer.set(payload, this.writeOffset);
        this.writeOffset += payload.length;
        const view = this.dataView();
        view.setBigUint64(pending.nodeOffset + 12, BigInt(dataOffset), true);
      }
      const totalNodes = this.nodeCount + this.terminatorCount;
      this.dataView().setUint32(this.headerOffset + 6, totalNodes, true);
      return this.buffer.subarray(0, this.writeOffset);
    }
    /** 当前已写入的字节数 */
    get bytesWritten() {
      return this.writeOffset;
    }
    /** 节点数（不含 TERMINATOR） */
    get nodesWritten() {
      return this.nodeCount;
    }
    /** TERMINATOR 数 */
    get terminatorsWritten() {
      return this.terminatorCount;
    }
    // ====== 内部工具 ======
    dataView() {
      return new DataView(this.buffer.buffer, this.buffer.byteOffset, this.buffer.byteLength);
    }
    ensureCapacity(needed) {
      const required = this.writeOffset + needed;
      if (required <= this.buffer.length) {
        return;
      }
      let newCapacity = this.buffer.length;
      while (newCapacity < required) {
        newCapacity *= 2;
      }
      const newBuffer = new Uint8Array(newCapacity);
      newBuffer.set(this.buffer);
      this.buffer = newBuffer;
    }
  };
  function encodeDataPayload(data) {
    if (data === void 0) {
      return new Uint8Array(0);
    }
    const parts = [];
    const sep = new Uint8Array([0]);
    if (data.name !== void 0) {
      parts.push(utf8Encode(data.name), sep);
    }
    if (data.label !== void 0) {
      parts.push(utf8Encode(data.label), sep);
    }
    if (data.value !== void 0) {
      parts.push(utf8Encode(data.value), sep);
    }
    if (data.extras !== void 0) {
      for (const [k, v] of data.extras) {
        parts.push(utf8Encode(k), sep, utf8Encode(v), sep);
      }
    }
    const bodyLength = parts.reduce((sum, p) => sum + p.length, 0);
    const body = new Uint8Array(bodyLength);
    let offset = 0;
    for (const part of parts) {
      body.set(part, offset);
      offset += part.length;
    }
    const result = new Uint8Array(DATA_LENGTH_PREFIX + bodyLength);
    new DataView(result.buffer).setUint32(0, bodyLength, true);
    result.set(body, DATA_LENGTH_PREFIX);
    return result;
  }
  function utf8Encode(s) {
    if (typeof TextEncoder !== "undefined") {
      return new TextEncoder().encode(s);
    }
    const bytes = [];
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c < 128) {
        bytes.push(c);
      } else if (c < 2048) {
        bytes.push(192 | c >> 6, 128 | c & 63);
      } else {
        bytes.push(224 | c >> 12, 128 | c >> 6 & 63, 128 | c & 63);
      }
    }
    return new Uint8Array(bytes);
  }
  function fnv1a64(input) {
    const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
    const FNV_PRIME = 0x100000001b3n;
    const MASK = (1n << 64n) - 1n;
    let hash = FNV_OFFSET_BASIS;
    for (let i = 0; i < input.length; i++) {
      hash ^= BigInt(input.charCodeAt(i));
      hash = hash * FNV_PRIME & MASK;
    }
    return hash;
  }

  // src/nexl-statestack.ts
  var NexlStateStack = class {
    writer;
    stack = [];
    constructor(initialBufferCapacity = 1024 * 1024) {
      this.writer = new BytecodeWriter(initialBufferCapacity);
    }
    /**
     * 遍历快照，产出 NEXL-Bytecode 字节流。
     *
     * 调用后本实例不可复用（writer 已 finalize）。
     * 如需多次遍历，请新建实例。
     */
    traverse(snapshot) {
      this.writer.writeHeader(0 /* NONE */);
      this.runTraversal(snapshot.root);
      return this.writer.finalize();
    }
    /**
     * 遍历单个节点（用于子树提取场景 / 单元测试）。
     *
     * 与 traverse 一样写 header + finalize，返回完整字节流。
     * 调用后本实例不可复用。
     */
    traverseNode(node) {
      this.writer.writeHeader(0 /* NONE */);
      this.runTraversal(node);
      return this.writer.finalize();
    }
    /**
     * 遍历核心循环（显式栈，避免递归导致的栈溢出）。
     *
     * 这是 NEXL-StateStack 的性能心脏——零回调、零派发，
     * 所有字节写入都是直接的 buffer 操作。
     */
    runTraversal(root) {
      this.pushFrame(root, 0);
      while (this.stack.length > 0) {
        const top = this.stack[this.stack.length - 1];
        if (top.childIndex < top.childCount) {
          const child = top.node.children[top.childIndex];
          top.childIndex += 1;
          this.pushFrame(child, top.depth + 1);
        } else {
          this.popFrame();
        }
      }
    }
    /** 压栈：写节点头 + 推入栈帧 */
    pushFrame(node, depth) {
      this.writer.writeNode(node);
      this.stack.push({
        node,
        childIndex: 0,
        childCount: node.children.length,
        depth
      });
    }
    /** 弹栈：写 TERMINATOR + 移除栈帧 */
    popFrame() {
      const frame = this.stack[this.stack.length - 1];
      if (frame.childCount > 0) {
        this.writer.writeTerminator();
      }
      this.stack.pop();
    }
    // ====== D4 · traverseSubgraph（子图 → NEXL-Bytecode） ======
    /**
     * 遍历 D3 蒸馏后的子图，产出 NEXL-Bytecode 字节流。
     *
     * 与 traverse 的区别：
     * - traverse 接受 SerializableDomSnapshot（D1 输出，全树）
     * - traverseSubgraph 接受 DistilledSubgraph（D3 输出，任务相关子图）
     *
     * W4-9 · 统一标识体系：
     * AriaSnapshotNode 同时携带 ref（DFS 序，页面内全局）和 stableId（xxHash32，跨快照稳定）。
     * 优先把 stableId 编码进节点头 Reserved 字段（offset 28-31）；
     * stableId 缺失时回退到 ref（向后兼容旧 baseline）。
     * Agent 优先用 stableId 定位（queryByStableId），ref 保留向后兼容。
     *
     * 调用后本实例不可复用（writer 已 finalize）。
     *
     * @see specs/L1-DOM-JIT/nexl-t1-distiller-v0.1.md §3.5
     */
    traverseSubgraph(subgraph) {
      this.writer.writeHeader(0 /* NONE */);
      this.runSubgraphTraversal(subgraph.nodes);
      return this.writer.finalize();
    }
    /**
     * 子图遍历核心循环（独立于 runTraversal，用本地栈）。
     *
     * 多根节点顺序遍历——每个根的子树独立 push/pop，
     * 根之间无 TERMINATOR 分隔（spec §3.6 多根语义）。
     */
    runSubgraphTraversal(roots) {
      const localStack = [];
      for (const root of roots) {
        this.pushAriaFrame(root, 0, localStack);
        while (localStack.length > 0) {
          const top = localStack[localStack.length - 1];
          if (top.childIndex < top.childCount) {
            const child = top.node.children[top.childIndex];
            top.childIndex += 1;
            this.pushAriaFrame(child, top.depth + 1, localStack);
          } else {
            this.popAriaFrame(localStack);
          }
        }
      }
    }
    /** 压栈：适配 AriaSnapshotNode → SerializableNode + 写 Reserved 字段 */
    pushAriaFrame(node, depth, stack) {
      const serializable = ariaNodeToSerializableNode(node);
      const reserved = node.stableId !== void 0 ? node.stableId : node.ref;
      this.writer.writeNode(serializable, reserved);
      stack.push({
        node,
        childIndex: 0,
        childCount: node.children.length,
        depth
      });
    }
    /** 弹栈：写 TERMINATOR（仅非叶子节点） */
    popAriaFrame(stack) {
      const frame = stack[stack.length - 1];
      if (frame.childCount > 0) {
        this.writer.writeTerminator();
      }
      stack.pop();
    }
    // ====== 调试 / 观测接口（不影响性能主路径） ======
    /** 当前栈深度（调试用） */
    get currentDepth() {
      return this.stack.length === 0 ? 0 : this.stack[this.stack.length - 1].depth;
    }
    /** 已写入的节点数（不含 TERMINATOR） */
    get nodesWritten() {
      return this.writer.nodesWritten;
    }
    /** 已写入的 TERMINATOR 数 */
    get terminatorsWritten() {
      return this.writer.terminatorsWritten;
    }
  };
  var STUB_NODE = {
    role: 0 /* VOID */,
    actionMask: 0 /* NONE */,
    state: 0,
    tagName: "",
    children: []
  };
  function ariaNodeToSerializableNode(node) {
    const stubChildren = [];
    for (let i = 0; i < node.children.length; i++) {
      stubChildren.push(STUB_NODE);
    }
    return {
      role: ariaRoleToNodeRole(node.role),
      actionMask: ariaRoleToActionMask(node.role),
      state: ariaStateToBitmask(node.state),
      tagName: node.role,
      data: node.name !== "" ? { label: node.name } : void 0,
      children: stubChildren
    };
  }
  function ariaRoleToNodeRole(role) {
    switch (role) {
      case "button":
        return 1 /* ACTION */;
      case "textbox":
      case "combobox":
        return 2 /* INPUT */;
      case "link":
      case "menuitem":
      case "tab":
        return 3 /* NAVIGATION */;
      case "article":
      case "img":
      case "figure":
      case "blockquote":
      case "codeblock":
      case "heading":
      case "text":
        return 4 /* CONTENT */;
      case "form":
      case "navigation":
      case "main":
      case "banner":
      case "contentinfo":
      case "complementary":
      case "region":
      case "list":
      case "listitem":
      case "generic":
      case "menu":
        return 5 /* CONTAINER */;
      case "dialog":
        return 6 /* DIALOG */;
      case "video":
      case "audio":
      case "canvas":
        return 7 /* MEDIA */;
      case "iframe":
        return 8 /* CROSS_REF */;
      default:
        return 4 /* CONTENT */;
    }
  }
  function ariaRoleToActionMask(role) {
    switch (role) {
      case "button":
        return 1 /* CLICK */ | 2 /* FOCUS */;
      case "textbox":
      case "combobox":
        return 2 /* FOCUS */ | 4 /* INPUT */;
      case "link":
      case "menuitem":
      case "tab":
        return 1 /* CLICK */ | 2 /* FOCUS */ | 16 /* NAVIGATE */;
      case "form":
        return 8 /* SUBMIT */;
      default:
        return 0 /* NONE */;
    }
  }
  var STATE_VISIBLE_BIT = 1 << 0;
  var STATE_DISABLED_BIT = 1 << 1;
  var STATE_CHECKED_BIT = 1 << 2;
  var STATE_EXPANDED_BIT = 1 << 3;
  function ariaStateToBitmask(state) {
    let bits = 0;
    if (state?.visible !== false) bits |= STATE_VISIBLE_BIT;
    if (state?.disabled) bits |= STATE_DISABLED_BIT;
    if (state?.checked) bits |= STATE_CHECKED_BIT;
    if (state?.expanded) bits |= STATE_EXPANDED_BIT;
    return bits;
  }
  function extractBytecode(snapshot) {
    const stack = new NexlStateStack();
    return stack.traverse(snapshot);
  }
  return __toCommonJS(nexl_browser_entry_exports);
})();
