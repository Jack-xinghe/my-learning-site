const KIND_LABEL = {
  img: "图片",
  original: "原图",
  svg: "SVG",
  object: "嵌入图片",
  poster: "视频封面",
  lazy: "懒加载",
  background: "背景图",
};

const statusEl = document.getElementById("status");
const syncEl = document.getElementById("sync");
const messageEl = document.getElementById("message");
const listEl = document.getElementById("list");
const selectModeEl = document.getElementById("select-mode");
const downloadSelectedBtn = document.getElementById("download-selected");
const downloadAllBtn = document.getElementById("download-all");

let tabId = 0;
let lastKey = "";
let busy = false;

document.getElementById("select-all").addEventListener("click", () => send({ type: "select-all" }));
document.getElementById("clear").addEventListener("click", () => send({ type: "clear-selection" }));
document.getElementById("rescan").addEventListener("click", () => send({ type: "rescan" }));
selectModeEl.addEventListener("change", () => {
  send({ type: "set-select-mode", value: selectModeEl.checked });
});
downloadSelectedBtn.addEventListener("click", () => download("selected"));
downloadAllBtn.addEventListener("click", () => download("all"));

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.type !== "images-updated") return;
  if (!sender.tab || sender.tab.id !== tabId) return;
  render(msg.state);
});

init();

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id == null || !/^https?:/i.test(tab.url || "")) {
    showFatal("当前页面不能使用这个插件。请打开一个普通网页再试。");
    return;
  }
  tabId = tab.id;
  try {
    await ensureContentScript(tabId);
    const state = await chrome.tabs.sendMessage(tabId, { type: "activate" });
    render(state);
  } catch (err) {
    showFatal("无法连接页面，请刷新网页后再打开插件。");
  }
}

async function ensureContentScript(id) {
  try {
    const ping = await chrome.tabs.sendMessage(id, { type: "ping" });
    if (ping && ping.ok) return;
  } catch (err) {
    /* The page script is not ready yet. */
  }
  await chrome.scripting.executeScript({
    target: { tabId: id },
    files: ["lib/parse.js", "content.js"],
  });
  try {
    await chrome.scripting.insertCSS({ target: { tabId: id }, files: ["content.css"] });
  } catch (err) {
    /* The manifest may already have inserted the stylesheet. */
  }
}

async function send(message) {
  if (!tabId || busy) return null;
  try {
    const state = await chrome.tabs.sendMessage(tabId, message);
    if (state && state.images) render(state);
    return state;
  } catch (err) {
    showFatal("无法连接页面，请刷新网页后再打开插件。");
    return null;
  }
}

async function download(mode) {
  if (!tabId || busy) return;
  busy = true;
  downloadSelectedBtn.disabled = true;
  downloadAllBtn.disabled = true;
  messageEl.textContent = "正在准备下载…";
  try {
    const result = await chrome.tabs.sendMessage(tabId, { type: "download", mode });
    messageEl.textContent = result && result.message ? result.message : "下载已结束";
  } catch (err) {
    messageEl.textContent = "下载失败，请重试。";
  } finally {
    busy = false;
    downloadSelectedBtn.disabled = false;
    downloadAllBtn.disabled = false;
  }
}

function render(state) {
  if (!state || !state.ok) return;
  const total = state.total || 0;
  const selectedCount = state.selectedCount || 0;
  statusEl.textContent = `共 ${total} 张 · 已选 ${selectedCount} 张`;
  syncEl.textContent = "列表会随页面变化自动更新。";
  selectModeEl.checked = Boolean(state.selectMode);
  const key = (state.images || [])
    .map((image) => [image.url, image.kind, image.count, image.w, image.h, image.alt].join("\t"))
    .join("\n");
  if (key !== lastKey) {
    lastKey = key;
    paintList(state.images || []);
  } else {
    const boxes = listEl.querySelectorAll('input[type="checkbox"]');
    (state.images || []).forEach((image, index) => {
      if (boxes[index]) boxes[index].checked = Boolean(image.selected);
    });
  }
}

function paintList(images) {
  listEl.replaceChildren();
  if (!images.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "这一页还没有发现图片。若图片稍后才出现，列表会自动更新。";
    listEl.appendChild(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  images.forEach((image) => {
    const row = document.createElement("label");
    row.className = "row";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = Boolean(image.selected);
    checkbox.addEventListener("change", () => {
      send({ type: "toggle-url", url: image.url, selected: checkbox.checked });
    });

    const thumb = document.createElement("div");
    thumb.className = "thumb";
    if (canPreview(image.url)) {
      const img = document.createElement("img");
      img.alt = "";
      img.referrerPolicy = "no-referrer";
      img.src = image.url;
      img.addEventListener("error", () => {
        thumb.textContent = "无预览";
        img.remove();
      });
      thumb.appendChild(img);
    } else {
      thumb.textContent = "无预览";
    }

    const meta = document.createElement("div");
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = displayName(image);
    name.title = image.url.startsWith("data:") ? "内嵌图片" : image.url;
    const sub = document.createElement("div");
    sub.className = "sub";
    const bits = [image.label || KIND_LABEL[image.kind] || "图片"];
    if (image.w && image.h) bits.push(`${image.w}×${image.h}`);
    if (image.count > 1) bits.push(`${image.count} 处`);
    sub.textContent = bits.join(" · ");
    meta.append(name, sub);
    row.append(checkbox, thumb, meta);
    fragment.appendChild(row);
  });
  listEl.appendChild(fragment);
}

function canPreview(url) {
  if (!url) return false;
  if (url.startsWith("https://") || url.startsWith("http://")) return true;
  return url.startsWith("data:image/") && url.length < 80000;
}

function displayName(image) {
  if (image.alt) return image.alt;
  try {
    const parsed = new URL(image.url);
    if (parsed.protocol === "data:") return "内嵌图片";
    if (parsed.protocol === "blob:") return "页面生成的图片";
    return decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || parsed.hostname);
  } catch (err) {
    return "图片";
  }
}

function showFatal(text) {
  statusEl.textContent = "无法使用";
  syncEl.textContent = "";
  listEl.replaceChildren();
  const error = document.createElement("p");
  error.className = "error";
  error.textContent = text;
  listEl.appendChild(error);
  document.querySelectorAll("button, input").forEach((el) => {
    el.disabled = true;
  });
}
