(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module && module.exports) {
    module.exports = api;
  } else {
    root.ImgPick = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const FULL_LAZY = [
    "data-original",
    "data-original-src",
    "data-full-src",
    "data-hi-res-src",
    "data-actualsrc",
  ];
  const NORMAL_LAZY = [
    "data-src",
    "data-lazy-src",
    "data-lazyload",
    "data-lazyload-src",
    "data-lazy",
    "data-ks-lazyload",
    "data-url",
    "data-image",
    "data-img",
    "data-defer-src",
    "data-echo",
    "data-thumb",
  ];

  function isSpace(ch) {
    return ch === " " || ch === "\n" || ch === "\t" || ch === "\r" || ch === "\f";
  }

  function parseSrcset(input) {
    const srcset = String(input || "").trim();
    if (!srcset) return [];
    const out = [];
    let i = 0;
    const len = srcset.length;

    while (i < len) {
      while (i < len && (isSpace(srcset[i]) || srcset[i] === ",")) i += 1;
      if (i >= len) break;

      let url = "";
      if (srcset.slice(i, i + 5).toLowerCase() === "data:") {
        const start = i;
        while (i < len && !isSpace(srcset[i])) i += 1;
        url = srcset.slice(start, i);
      } else {
        const start = i;
        while (i < len && !isSpace(srcset[i]) && srcset[i] !== ",") i += 1;
        url = srcset.slice(start, i);
      }

      let value = 1;
      let unit = "x";
      while (i < len && isSpace(srcset[i])) i += 1;
      if (i < len && srcset[i] !== ",") {
        const descStart = i;
        while (i < len && !isSpace(srcset[i]) && srcset[i] !== ",") i += 1;
        const desc = srcset.slice(descStart, i);
        const match = desc.match(/^([0-9]*\.?[0-9]+)([wx])$/i);
        if (match) {
          const parsed = parseFloat(match[1]);
          if (!Number.isNaN(parsed)) {
            value = parsed;
            unit = match[2].toLowerCase();
          }
        } else {
          i = descStart;
        }
      }

      if (url) out.push({ url, value, unit });
    }
    return out;
  }

  function bestSrcset(input) {
    const items = parseSrcset(input).filter((item) => item.url);
    if (!items.length) return null;
    const widths = items.filter((item) => item.unit === "w");
    const pool = widths.length ? widths : items;
    return pool.reduce((best, item) => (item.value > best.value ? item : best));
  }

  function resolveUrl(raw, base) {
    if (raw == null) return "";
    const text = String(raw).trim().replace(/^['"]|['"]$/g, "");
    if (!text || text.startsWith("#")) return "";
    if (/^(javascript|vbscript):/i.test(text)) return "";
    try {
      return new URL(text, base || undefined).href;
    } catch (err) {
      return "";
    }
  }

  function isAcceptable(url) {
    if (!url) return false;
    let protocol = "";
    try {
      protocol = new URL(url).protocol;
    } catch (err) {
      return false;
    }
    if (protocol === "http:" || protocol === "https:" || protocol === "file:" || protocol === "blob:") {
      return true;
    }
    return protocol === "data:" && url.slice(0, 11).toLowerCase() === "data:image/";
  }

  function isPlaceholder(url) {
    if (!url) return true;
    const lower = String(url).toLowerCase();
    if (lower.startsWith("data:image/")) {
      const comma = url.indexOf(",");
      const payload = comma >= 0 ? url.slice(comma + 1) : "";
      if (payload.length > 0 && payload.length < 140) return true;
      if (lower.includes("placeholder") || lower.includes("spacer") || lower.includes("1x1")) return true;
      return false;
    }
    if (/\/(blank|spacer|pixel|placeholder|transparent|empty|clear)\.(gif|png|svg|jpe?g|webp)(\?|#|$)/i.test(lower)) {
      return true;
    }
    return false;
  }

  function extractCssUrls(value) {
    if (!value || value === "none") return [];
    const urls = [];
    const re = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)"'\s]*))\s*\)/gi;
    let match;
    while ((match = re.exec(String(value)))) {
      const raw = (match[1] != null ? match[1] : match[2] != null ? match[2] : match[3] || "").trim();
      if (raw) urls.push(raw);
    }
    return urls;
  }

  function looksLikeImagePath(url) {
    if (!url) return false;
    if (url.startsWith("data:image/") || url.startsWith("blob:")) return true;
    try {
      const path = decodeURIComponent(new URL(url).pathname);
      return /\.(png|jpe?g|gif|webp|avif|bmp|ico|svg|tiff?|jfif|apng)$/i.test(path);
    } catch (err) {
      return false;
    }
  }

  function acceptableResolved(raw, base) {
    const url = resolveUrl(raw, base);
    if (!url || !isAcceptable(url)) return "";
    return url;
  }

  function firstNamedLazy(lazy, names, base) {
    if (!lazy || !lazy.length) return "";
    const wanted = new Set(names);
    for (const item of lazy) {
      if (!wanted.has(String(item.name || "").toLowerCase())) continue;
      if (/srcset/i.test(item.name || "")) continue;
      const url = acceptableResolved(item.value, base);
      if (url && !isPlaceholder(url)) return url;
    }
    return "";
  }

  function lazyFromSrcset(lazy, base) {
    if (!lazy) return "";
    for (const item of lazy) {
      if (!/srcset/i.test(item.name || "")) continue;
      const best = bestSrcset(item.value || "");
      if (!best) continue;
      const url = acceptableResolved(best.url, base);
      if (url && !isPlaceholder(url)) return url;
    }
    return "";
  }

  function matchingPictureUrl(spec, base) {
    for (const source of spec.pictureSources || []) {
      if (!source.mediaMatches) continue;
      const best = bestSrcset(source.srcset || "");
      if (best) {
        const url = acceptableResolved(best.url, base);
        if (url && !isPlaceholder(url)) return url;
      }
      const src = acceptableResolved(source.src, base);
      if (src && !isPlaceholder(src)) return src;
    }
    return "";
  }

  function chooseDisplayedUrl(spec) {
    const base = spec.base;
    const full = firstNamedLazy(spec.lazy, FULL_LAZY, base);
    if (full) return full;

    const current = acceptableResolved(spec.currentSrc, base);
    const src = acceptableResolved(spec.src, base);
    const lazy = firstNamedLazy(spec.lazy, NORMAL_LAZY, base) || lazyFromSrcset(spec.lazy, base);
    const fromPicture = matchingPictureUrl(spec, base);
    const fromSrcset = spec.srcset ? acceptableResolved((bestSrcset(spec.srcset) || {}).url, base) : "";

    const currentReal = Boolean(current && !isPlaceholder(current));
    const srcIsPlaceholder = !src || isPlaceholder(src);
    const naturalWidth = Number(spec.naturalWidth) || 0;
    const lazyBetter = Boolean(lazy && !isPlaceholder(lazy) && lazy !== current);

    if (currentReal) {
      if (lazyBetter && (srcIsPlaceholder || naturalWidth === 0 || naturalWidth <= 80)) return lazy;
      return current;
    }
    if (lazy && !isPlaceholder(lazy)) return lazy;
    if (fromPicture && !isPlaceholder(fromPicture)) return fromPicture;
    if (fromSrcset && !isPlaceholder(fromSrcset)) return fromSrcset;
    if (src && !isPlaceholder(src)) return src;
    return "";
  }

  function extensionFor(url) {
    const map = {
      "image/jpeg": "jpg",
      "image/jpg": "jpg",
      "image/png": "png",
      "image/gif": "gif",
      "image/webp": "webp",
      "image/avif": "avif",
      "image/svg+xml": "svg",
      "image/bmp": "bmp",
      "image/x-icon": "ico",
      "image/vnd.microsoft.icon": "ico",
      "image/tiff": "tiff",
      "image/apng": "png",
    };
    if (url && url.startsWith("data:")) {
      const mime = (url.slice(5).split(/[;,]/)[0] || "").toLowerCase();
      return map[mime] || "png";
    }
    return "jpg";
  }

  function buildFilename(url, index) {
    const n = index || 1;
    const fallbackExt = extensionFor(url);
    let stem = `image-${n}`;
    let ext = fallbackExt;
    if (url && !url.startsWith("data:") && !url.startsWith("blob:")) {
      try {
        const path = decodeURIComponent(new URL(url).pathname);
        const base = path.split("/").filter(Boolean).pop() || "";
        const match = base.match(/^(.*?)(?:\.([a-z0-9]{2,5}))?$/i);
        if (match && match[1]) stem = match[1];
        if (match && match[2] && /^(png|jpe?g|gif|webp|avif|bmp|ico|svg|tiff?|jfif|apng)$/i.test(match[2])) {
          ext = match[2].toLowerCase();
        }
      } catch (err) {
        stem = `image-${n}`;
      }
    }
    if (ext === "jpeg") ext = "jpg";
    if (ext === "tif") ext = "tiff";
    stem = stem.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/^\.+/, "").trim();
    stem = stem.slice(0, 80);
    if (!stem) stem = `image-${n}`;
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem)) stem = `_${stem}`;
    return `${stem}.${ext}`;
  }

  return {
    FULL_LAZY,
    NORMAL_LAZY,
    parseSrcset,
    bestSrcset,
    resolveUrl,
    isAcceptable,
    isPlaceholder,
    extractCssUrls,
    looksLikeImagePath,
    chooseDisplayedUrl,
    buildFilename,
  };
});
