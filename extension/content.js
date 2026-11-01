(function () {
  if (globalThis.__imgpickInstalled) return;
  if (!globalThis.ImgPick) return;
  globalThis.__imgpickInstalled = true;

  const P = globalThis.ImgPick;
  const LAZY_ATTRS = P.FULL_LAZY.concat(P.NORMAL_LAZY, ["data-srcset", "data-lazy-srcset"]);
  const BG_LAZY = ["data-bg", "data-background", "data-background-image", "data-bg-src", "data-lazy-bg"];
  const WATCH_ATTRS = [
    "src",
    "srcset",
    "poster",
    "href",
    "data",
    "type",
    "style",
    "class",
    "xlink:href",
  ].concat(LAZY_ATTRS, BG_LAZY);
  const SKIP = new Set([
    "script",
    "style",
    "noscript",
    "template",
    "meta",
    "link",
    "title",
    "base",
    "br",
    "wbr",
  ]);
  const KIND_RANK = { img: 6, original: 6, svg: 5, object: 4, poster: 3, lazy: 2, background: 1 };
  const KIND_LABEL = {
    img: "图片",
    original: "原图",
    svg: "SVG",
    object: "嵌入图片",
    poster: "视频封面",
    lazy: "懒加载",
    background: "背景图",
  };

  const selected = new Set();
  const styleCache = new WeakMap();
  const boxes = new WeakMap();
  const observedDocs = new WeakSet();
  const frameLoadBound = new WeakSet();
  let urlOrder = [];
  let urlMeta = new Map();
  let byEl = new Map();
  let selectMode = false;
  let panelVisible = false;
  let activated = false;
  let styleEpoch = 1;
  let scanTimer = 0;
  let wantFast = false;
  let scanning = false;
  let scanAgain = false;
  let safetyTimer = 0;
  let lastSig = "";
  let downloading = false;
  let raf = 0;
  let els = {};

  function isOurs(node) {
    if (!node) return false;
    const el = node.nodeType === 1 ? node : node.parentElement;
    if (!el || !el.closest) return false;
    if (el.id === "imgpick-root" || el.id === "imgpick-panel" || el.id === "imgpick-launcher") return true;
    return Boolean(el.closest("#imgpick-root, #imgpick-panel, #imgpick-launcher"));
  }

  function ensureUi() {
    if (
      document.getElementById("imgpick-panel") &&
      document.getElementById("imgpick-root") &&
      document.getElementById("imgpick-launcher")
    ) {
      return;
    }
    const oldRoot = document.getElementById("imgpick-root");
    const oldPanel = document.getElementById("imgpick-panel");
    const oldLauncher = document.getElementById("imgpick-launcher");
    if (oldRoot) oldRoot.remove();
    if (oldPanel) oldPanel.remove();
    if (oldLauncher) oldLauncher.remove();

    const root = document.createElement("div");
    root.id = "imgpick-root";
    root.hidden = true;

    const panel = document.createElement("aside");
    panel.id = "imgpick-panel";
    panel.hidden = true;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "网页图片收集");

    const head = document.createElement("div");
    head.className = "imgpick-head";
    const title = document.createElement("strong");
    title.textContent = "网页图片收集";
    const collapse = document.createElement("button");
    collapse.type = "button";
    collapse.className = "ghost";
    collapse.id = "imgpick-collapse";
    collapse.textContent = "收起";
    head.append(title, collapse);

    const desc = document.createElement("p");
    desc.className = "imgpick-desc";
    desc.textContent = "点图片可选中或取消。页面上新出现的图片会自动加入列表。";

    const modeLabel = document.createElement("label");
    modeLabel.className = "imgpick-mode";
    const modeInput = document.createElement("input");
    modeInput.type = "checkbox";
    modeInput.id = "imgpick-mode";
    modeLabel.append(modeInput, document.createTextNode(" 点选模式"));

    const count = document.createElement("p");
    count.className = "imgpick-count";
    count.id = "imgpick-count";

    const actions = document.createElement("div");
    actions.className = "imgpick-actions";
    const allBtn = button("imgpick-all", "全选", false);
    const noneBtn = button("imgpick-none", "取消全选", false);
    const dlSel = button("imgpick-dl-sel", "下载选中", true);
    const dlAll = button("imgpick-dl-all", "下载全部", false);
    actions.append(allBtn, noneBtn, dlSel, dlAll);

    const status = document.createElement("p");
    status.className = "imgpick-status";
    status.id = "imgpick-status";
    status.setAttribute("aria-live", "polite");

    panel.append(head, desc, modeLabel, count, actions, status);

    const launcher = document.createElement("button");
    launcher.type = "button";
    launcher.id = "imgpick-launcher";
    launcher.hidden = true;
    launcher.textContent = "图片";

    document.documentElement.append(root, panel, launcher);
    els = { root, panel, launcher, modeInput, count, status };

    collapse.addEventListener("click", () => {
      panelVisible = false;
      selectMode = false;
      syncSafety();
      updatePanel();
      renderOverlays();
      publish();
    });
    launcher.addEventListener("click", () => activate(true));
    modeInput.addEventListener("change", () => {
      selectMode = modeInput.checked;
      if (selectMode) panelVisible = true;
      syncSafety();
      updatePanel();
      renderOverlays();
      publish();
    });
    allBtn.addEventListener("click", () => {
      for (const url of urlOrder) selected.add(url);
      afterSelectionChange();
    });
    noneBtn.addEventListener("click", () => {
      selected.clear();
      afterSelectionChange();
    });
    dlSel.addEventListener("click", () => downloadImages("selected"));
    dlAll.addEventListener("click", () => downloadImages("all"));
  }

  function button(id, text, primary) {
    const el = document.createElement("button");
    el.type = "button";
    el.id = id;
    el.textContent = text;
    if (primary) el.className = "primary";
    return el;
  }

  function selectedCount() {
    let count = 0;
    for (const url of urlOrder) if (selected.has(url)) count += 1;
    return count;
  }

  function updatePanel() {
    ensureUi();
    els.modeInput.checked = selectMode;
    els.count.textContent = `共 ${urlOrder.length} 张 · 已选 ${selectedCount()} 张`;
    els.panel.hidden = !panelVisible;
    els.launcher.hidden = !(activated && !panelVisible);
    els.launcher.textContent = `图片 ${urlOrder.length}`;
  }

  function setStatus(text) {
    ensureUi();
    els.status.textContent = text || "";
  }

  function activate(forceSelect) {
    activated = true;
    panelVisible = true;
    if (forceSelect) selectMode = true;
    syncSafety();
    ensureUi();
    updatePanel();
    renderOverlays();
    publish();
  }

  function syncSafety() {
    clearInterval(safetyTimer);
    safetyTimer = 0;
    if (!panelVisible && !selectMode) return;
    safetyTimer = setInterval(() => scan(), 3000);
  }

  function scheduleScan(fast) {
    if (fast) wantFast = true;
    clearTimeout(scanTimer);
    const delay = wantFast ? 150 : 450;
    scanTimer = setTimeout(() => {
      scanTimer = 0;
      wantFast = false;
      scan();
    }, delay);
  }

  function watchMutations(doc) {
    if (!doc || !doc.documentElement || observedDocs.has(doc)) return;
    observedDocs.add(doc);
    const observer = new MutationObserver(onMutations);
    observer.observe(doc.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: WATCH_ATTRS,
    });
    doc.addEventListener("scroll", onViewportChange, true);
    doc.addEventListener("click", onSelectClick, true);
    if (doc.defaultView) {
      doc.defaultView.addEventListener("resize", () => {
        styleEpoch += 1;
        onViewportChange();
        scheduleScan(false);
      });
      doc.defaultView.addEventListener("keydown", onKeydown, true);
    }
  }

  function onMutations(mutations) {
    let relevant = false;
    let fast = false;
    for (const mutation of mutations) {
      if (isOurs(mutation.target)) continue;
      if (mutation.type === "childList") {
        const nodes = [];
        mutation.addedNodes.forEach((node) => nodes.push(node));
        mutation.removedNodes.forEach((node) => nodes.push(node));
        if (!nodes.length || nodes.every(isOurs)) continue;
        relevant = true;
        fast = true;
      } else if (mutation.type === "attributes") {
        relevant = true;
        const name = mutation.attributeName || "";
        if (name === "class" || name === "style") styleEpoch += 1;
        else fast = true;
      }
    }
    if (relevant) scheduleScan(fast);
  }

  function onViewportChange() {
    if (!selectMode) return;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      renderOverlays();
    });
  }

  function scan() {
    if (scanning) {
      scanAgain = true;
      return;
    }
    scanning = true;
    try {
      doScan();
      ensureUi();
      updatePanel();
      renderOverlays();
      publish();
    } finally {
      scanning = false;
      if (scanAgain) {
        scanAgain = false;
        scheduleScan(true);
      }
    }
  }

  function doScan() {
    const nextOrder = [];
    const nextMeta = new Map();
    const nextByEl = new Map();

    function add(el, url, kind) {
      if (!el || !url || !P.isAcceptable(url) || P.isPlaceholder(url)) return;
      if (url.startsWith("data:") && url.length > 300000) return;
      if (isTinyTracker(el, url)) return;

      let rec = nextByEl.get(el);
      if (!rec) {
        rec = { urls: [], kind: kind || "background" };
        nextByEl.set(el, rec);
      }
      if (rec.urls.includes(url)) return;
      rec.urls.push(url);
      if ((KIND_RANK[kind] || 0) >= (KIND_RANK[rec.kind] || 0)) rec.kind = kind;

      let meta = nextMeta.get(url);
      if (!meta) {
        meta = { url, kind, alt: "", w: 0, h: 0, count: 0 };
        nextMeta.set(url, meta);
        nextOrder.push(url);
      } else if ((KIND_RANK[kind] || 0) > (KIND_RANK[meta.kind] || 0)) {
        meta.kind = kind;
      }
      meta.count += 1;
      const alt = altOf(el);
      if (alt && !meta.alt) meta.alt = alt;
      const size = sizeOf(el);
      if (size.w * size.h >= meta.w * meta.h) {
        meta.w = size.w;
        meta.h = size.h;
      }
    }

    function walk(root) {
      if (!root || !root.querySelectorAll) return;
      const doc = root.nodeType === 9 ? root : root.ownerDocument;
      if (doc) watchMutations(doc);
      const elements = root.querySelectorAll("*");
      for (const el of elements) {
        if (isOurs(el) || SKIP.has(el.localName)) continue;
        inspect(el, add);
        if (el.shadowRoot) walk(el.shadowRoot);
        if (el.localName === "iframe" || el.localName === "frame") {
          if (!frameLoadBound.has(el)) {
            frameLoadBound.add(el);
            el.addEventListener("load", () => scheduleScan(true));
          }
          try {
            if (el.contentDocument) walk(el.contentDocument);
          } catch (err) {
            /* Cross-origin frames are not readable. */
          }
        }
      }
    }

    if (document.documentElement) walk(document);
    for (const [el, rec] of nextByEl) rec.skipOverlay = shouldSkipOverlay(el, rec.kind);

    urlOrder = nextOrder;
    urlMeta = nextMeta;
    byEl = nextByEl;
  }

  function inspect(el, add) {
    const tag = el.localName;
    const base = el.baseURI || location.href;
    if (tag === "img") addImg(el, add);
    else if (tag === "image") add(el, P.resolveUrl(svgHref(el), base), "svg");
    else if (tag === "input" && String(el.type || "").toLowerCase() === "image") {
      add(el, P.resolveUrl(el.getAttribute("src") || el.src, base), "img");
    } else if (tag === "video") {
      const poster = el.getAttribute("poster");
      if (poster) add(el, P.resolveUrl(poster, base), "poster");
    } else if (tag === "object" || tag === "embed") {
      const type = (el.getAttribute("type") || "").toLowerCase();
      const raw = el.getAttribute("data") || el.getAttribute("src") || "";
      const url = P.resolveUrl(raw, base);
      if (url && (type.startsWith("image/") || P.looksLikeImagePath(url))) add(el, url, "object");
    }
    addBackgrounds(el, add);
  }

  function addImg(el, add) {
    const base = el.baseURI || location.href;
    const pictureSources = [];
    const parent = el.parentElement;
    if (parent && parent.localName === "picture") {
      parent.querySelectorAll("source").forEach((source) => {
        let mediaMatches = true;
        const media = source.getAttribute("media");
        if (media) {
          try {
            mediaMatches = window.matchMedia(media).matches;
          } catch (err) {
            mediaMatches = true;
          }
        }
        pictureSources.push({
          mediaMatches,
          srcset: source.getAttribute("srcset") || "",
          src: source.getAttribute("src") || "",
        });
      });
    }
    const lazy = [];
    for (const name of LAZY_ATTRS) {
      const value = el.getAttribute(name);
      if (value) lazy.push({ name, value });
    }
    const url = P.chooseDisplayedUrl({
      base,
      currentSrc: el.currentSrc || "",
      src: el.getAttribute("src") || "",
      srcset: el.getAttribute("srcset") || "",
      naturalWidth: el.naturalWidth || 0,
      pictureSources,
      lazy,
    });
    const current = P.resolveUrl(el.currentSrc || "", base);
    let kind = "img";
    if (url && current && url !== current) {
      const fromOriginal = P.FULL_LAZY.some((name) => {
        const value = el.getAttribute(name);
        return value && P.resolveUrl(value, base) === url;
      });
      kind = fromOriginal ? "original" : "lazy";
    }
    add(el, url, kind);
  }

  function addBackgrounds(el, add) {
    const cached = styleCache.get(el);
    let raws;
    if (cached && cached.epoch === styleEpoch) {
      raws = cached.urls;
    } else {
      raws = [];
      try {
        collectStyleUrls(getComputedStyle(el), raws);
        collectStyleUrls(getComputedStyle(el, "::before"), raws);
        collectStyleUrls(getComputedStyle(el, "::after"), raws);
      } catch (err) {
        /* Some elements refuse computed style. */
      }
      styleCache.set(el, { epoch: styleEpoch, urls: raws });
    }
    const base = el.baseURI || location.href;
    for (const raw of raws) add(el, P.resolveUrl(raw, base), "background");
    for (const attr of BG_LAZY) {
      const value = el.getAttribute(attr);
      if (!value) continue;
      if (/url\(/i.test(value)) {
        for (const raw of P.extractCssUrls(value)) add(el, P.resolveUrl(raw, base), "background");
      } else {
        add(el, P.resolveUrl(value, base), "background");
      }
    }
  }

  function collectStyleUrls(style, raws) {
    if (!style) return;
    P.extractCssUrls(style.backgroundImage).forEach((url) => raws.push(url));
    P.extractCssUrls(style.listStyleImage).forEach((url) => raws.push(url));
    if (style.content && style.content.includes("url(")) {
      P.extractCssUrls(style.content).forEach((url) => raws.push(url));
    }
  }

  function svgHref(el) {
    return (
      el.getAttribute("href") ||
      el.getAttribute("xlink:href") ||
      (el.getAttributeNS && el.getAttributeNS("http://www.w3.org/1999/xlink", "href")) ||
      ""
    );
  }

  function altOf(el) {
    return el.getAttribute("alt") || el.getAttribute("aria-label") || el.getAttribute("title") || "";
  }

  function sizeOf(el) {
    const naturalW = el.naturalWidth || el.videoWidth || 0;
    const naturalH = el.naturalHeight || el.videoHeight || 0;
    if (naturalW && naturalH) return { w: naturalW, h: naturalH };
    const rect = el.getBoundingClientRect();
    return { w: Math.round(rect.width) || 0, h: Math.round(rect.height) || 0 };
  }

  function isTinyTracker(el, url) {
    const rect = el.getBoundingClientRect();
    const naturalW = el.naturalWidth || 0;
    const naturalH = el.naturalHeight || 0;
    if (rect.width > 8 || rect.height > 8 || naturalW > 8 || naturalH > 8) return false;
    const layoutTiny = rect.width > 0 && rect.height > 0 && rect.width <= 2 && rect.height <= 2;
    const naturalTiny = naturalW > 0 && naturalH > 0 && naturalW <= 2 && naturalH <= 2;
    if (!layoutTiny && !naturalTiny) return false;
    const displayed = P.resolveUrl(el.currentSrc || "", el.baseURI || location.href);
    if (url && displayed && url !== displayed && !P.isPlaceholder(url) && P.isPlaceholder(displayed)) return false;
    return true;
  }

  function shouldSkipOverlay(el, kind) {
    const tag = el.localName;
    if (tag === "html" || tag === "body") return true;
    if (kind === "img" || kind === "original" || kind === "svg" || kind === "object" || kind === "poster" || kind === "lazy") return false;
    const rect = rectInTop(el);
    const vw = window.innerWidth || 1;
    const vh = window.innerHeight || 1;
    return rect.width >= vw * 0.85 && rect.height >= vh * 0.85;
  }

  function rectInTop(el) {
    const rect = el.getBoundingClientRect();
    let left = rect.left;
    let top = rect.top;
    let view = el.ownerDocument && el.ownerDocument.defaultView;
    while (view && view !== window) {
      const frame = view.frameElement;
      if (!frame) break;
      const frameRect = frame.getBoundingClientRect();
      left += frameRect.left;
      top += frameRect.top;
      view = frame.ownerDocument && frame.ownerDocument.defaultView;
    }
    return {
      left,
      top,
      width: rect.width,
      height: rect.height,
      right: left + rect.width,
      bottom: top + rect.height,
    };
  }

  function renderOverlays() {
    ensureUi();
    els.root.hidden = !selectMode;
    document.documentElement.classList.toggle("imgpick-selecting", selectMode);
    if (!selectMode) return;

    const seen = new Set();
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;
    for (const [el, rec] of byEl) {
      if (!rec || rec.skipOverlay || !rec.urls.length || !el.isConnected) continue;
      const rect = rectInTop(el);
      if (rect.width < 8 || rect.height < 8) continue;
      if (rect.bottom < 0 || rect.top > viewH || rect.right < 0 || rect.left > viewW) continue;
      const box = boxFor(el);
      box.style.left = `${Math.round(rect.left)}px`;
      box.style.top = `${Math.round(rect.top)}px`;
      box.style.width = `${Math.round(rect.width)}px`;
      box.style.height = `${Math.round(rect.height)}px`;
      const on = rec.urls.filter((url) => selected.has(url)).length;
      box.classList.toggle("is-selected", on > 0 && on === rec.urls.length);
      box.classList.toggle("is-partial", on > 0 && on < rec.urls.length);
      const badge = box.querySelector(".imgpick-badge");
      badge.textContent = on === rec.urls.length ? "已选" : on > 0 ? "部分" : "选择";
      seen.add(box);
    }
    els.root.querySelectorAll(".imgpick-box").forEach((box) => {
      if (!seen.has(box)) box.remove();
    });
  }

  function boxFor(el) {
    let box = boxes.get(el);
    if (!box || !box.isConnected) {
      box = document.createElement("div");
      box.className = "imgpick-box";
      const badge = document.createElement("span");
      badge.className = "imgpick-badge";
      badge.textContent = "选择";
      box.appendChild(badge);
      boxes.set(el, box);
      els.root.appendChild(box);
    }
    return box;
  }

  function onSelectClick(event) {
    if (!selectMode) return;
    if (event.button !== 0) return;
    const target = event.target;
    if (target && target.closest && target.closest("#imgpick-panel, #imgpick-launcher")) return;
    const el = findOccurrence(event);
    if (!el) return;
    event.preventDefault();
    event.stopPropagation();
    toggleElement(el);
  }

  function onKeydown(event) {
    if (event.key !== "Escape" || !selectMode) return;
    selectMode = false;
    syncSafety();
    updatePanel();
    renderOverlays();
    publish();
  }

  function elementFromPointDeep(root, x, y) {
    if (!root || !root.elementFromPoint) return null;
    let el = root.elementFromPoint(x, y);
    const seen = new Set();
    while (el && el.shadowRoot && !seen.has(el)) {
      seen.add(el);
      const inner = el.shadowRoot.elementFromPoint(x, y);
      if (!inner || inner === el) break;
      el = inner;
    }
    return el;
  }

  function findOccurrence(event) {
    const chain = [];
    const seen = new Set();
    const pushChain = (start) => {
      let el = start;
      while (el && el.nodeType === 1 && !seen.has(el)) {
        seen.add(el);
        chain.push(el);
        const parent = el.parentElement;
        if (parent) {
          el = parent;
          continue;
        }
        const rootNode = el.parentNode;
        el = rootNode && rootNode.nodeType === 11 ? rootNode.host : null;
      }
    };

    if (event.composedPath) {
      event.composedPath().forEach((node) => {
        if (node && node.nodeType === 1) pushChain(node);
      });
    }
    const owner = event.target && event.target.ownerDocument;
    const deep = owner ? elementFromPointDeep(owner, event.clientX, event.clientY) : null;
    if (deep) pushChain(deep);

    for (const node of chain) {
      if (!byEl.has(node)) continue;
      const rec = byEl.get(node);
      if (!rec || rec.skipOverlay) continue;
      return node;
    }
    return null;
  }

  function toggleElement(el) {
    const rec = byEl.get(el);
    if (!rec || rec.skipOverlay) return;
    const allOn = rec.urls.every((url) => selected.has(url));
    for (const url of rec.urls) {
      if (allOn) selected.delete(url);
      else selected.add(url);
    }
    afterSelectionChange();
  }

  function afterSelectionChange() {
    updatePanel();
    renderOverlays();
    publish();
  }

  function snapshot() {
    return {
      ok: true,
      selectMode,
      panelVisible,
      total: urlOrder.length,
      selectedCount: selectedCount(),
      images: urlOrder.map((url) => {
        const meta = urlMeta.get(url);
        return {
          url,
          selected: selected.has(url),
          kind: meta.kind,
          label: KIND_LABEL[meta.kind] || "图片",
          alt: meta.alt,
          w: meta.w,
          h: meta.h,
          count: meta.count,
        };
      }),
    };
  }

  function publish() {
    const state = snapshot();
    const sig = JSON.stringify(state);
    if (sig === lastSig) return;
    lastSig = sig;
    chrome.runtime.sendMessage({ type: "images-updated", state }).catch(() => {});
  }

  function filesFor(urls) {
    const host = (location.hostname || "local-file").replace(/[^a-zA-Z0-9._-]+/g, "_") || "page";
    const used = new Set();
    return urls.map((url, index) => {
      const name = P.buildFilename(url, index + 1);
      const dot = name.lastIndexOf(".");
      const stem = dot > 0 ? name.slice(0, dot) : name;
      const ext = dot > 0 ? name.slice(dot) : "";
      let finalName = name;
      let n = 2;
      while (used.has(finalName.toLowerCase())) {
        finalName = `${stem}-${n}${ext}`;
        n += 1;
      }
      used.add(finalName.toLowerCase());
      const prefix = String(index + 1).padStart(3, "0");
      return { url, filename: `网页图片/${host}/${prefix}-${finalName}` };
    });
  }

  async function downloadImages(mode) {
    if (downloading) return { ok: false, message: "正在下载，请稍候" };
    const urls = mode === "all" ? urlOrder.slice() : urlOrder.filter((url) => selected.has(url));
    if (!urls.length) {
      const message = mode === "all" ? "没有可下载的图片" : "请先选择图片";
      setStatus(message);
      return { ok: false, message };
    }
    downloading = true;
    setStatus(`准备下载 ${urls.length} 张…`);
    try {
      const files = filesFor(urls);
      const direct = files.filter((file) => !file.url.startsWith("blob:"));
      const blobs = files.filter((file) => file.url.startsWith("blob:"));
      let results = [];
      if (direct.length) {
        const response = await chrome.runtime.sendMessage({
          type: "download-batch",
          files: direct,
          referrer: location.href,
        });
        results = results.concat((response && response.results) || []);
      }
      for (const file of blobs) {
        try {
          await anchorDownload(file.url, file.filename.split("/").pop());
          results.push({ ok: true, filename: file.filename });
        } catch (err) {
          results.push({
            ok: false,
            filename: file.filename,
            error: err && err.message ? err.message : "无法保存页面内图片",
          });
        }
      }
      const failed = results.filter((item) => !item.ok);
      const started = results.filter((item) => item.ok).length;
      let message = `已开始下载 ${started} 张`;
      if (failed.length) {
        const detail = failed[0].error ? `（${failed[0].error}）` : "";
        message += `，失败 ${failed.length} 张${detail}`;
      }
      if (blobs.length) message += "。页面生成的图片由浏览器逐张保存，可能会询问是否允许多个下载";
      setStatus(message);
      return { ok: failed.length === 0, message, started, failed: failed.length };
    } catch (err) {
      const message = err && err.message ? err.message : "下载失败";
      setStatus(message);
      return { ok: false, message };
    } finally {
      downloading = false;
    }
  }

  async function anchorDownload(url, filename) {
    const response = await fetch(url);
    if (!response.ok) throw new Error("无法读取页面内图片");
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename || "image";
    link.rel = "noopener";
    els.panel.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
  }

  document.addEventListener(
    "load",
    (event) => {
      const target = event.target;
      if (!target || !target.localName) return;
      if (target.localName === "img" || target.localName === "image" || target.localName === "video") {
        scheduleScan(true);
      } else if (target.localName === "link" || target.localName === "style") {
        styleEpoch += 1;
        scheduleScan(false);
      }
    },
    true
  );

  window.addEventListener("load", () => scheduleScan(true));

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || !msg.type) return;
    if (msg.type === "ping") {
      sendResponse({ ok: true });
      return;
    }
    if (msg.type === "get-state") {
      sendResponse(snapshot());
      return;
    }
    if (msg.type === "activate") {
      const first = !activated;
      activate(first);
      sendResponse(snapshot());
      return;
    }
    if (msg.type === "set-select-mode") {
      selectMode = Boolean(msg.value);
      if (selectMode) {
        activated = true;
        panelVisible = true;
      }
      syncSafety();
      updatePanel();
      renderOverlays();
      publish();
      sendResponse(snapshot());
      return;
    }
    if (msg.type === "toggle-url") {
      if (!msg.url) {
        sendResponse(snapshot());
        return;
      }
      if (typeof msg.selected === "boolean") {
        if (msg.selected) selected.add(msg.url);
        else selected.delete(msg.url);
      } else if (selected.has(msg.url)) selected.delete(msg.url);
      else selected.add(msg.url);
      afterSelectionChange();
      sendResponse(snapshot());
      return;
    }
    if (msg.type === "select-all") {
      for (const url of urlOrder) selected.add(url);
      afterSelectionChange();
      sendResponse(snapshot());
      return;
    }
    if (msg.type === "clear-selection") {
      selected.clear();
      afterSelectionChange();
      sendResponse(snapshot());
      return;
    }
    if (msg.type === "rescan") {
      styleEpoch += 1;
      scan();
      sendResponse(snapshot());
      return;
    }
    if (msg.type === "download") {
      downloadImages(msg.mode).then(sendResponse);
      return true;
    }
  });

  ensureUi();
  watchMutations(document);
  scan();
})();
