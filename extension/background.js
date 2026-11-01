const objectUrls = new Map();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;

  if (msg.type === "images-updated" && sender.tab && sender.tab.id != null) {
    const total = msg.state && msg.state.total ? msg.state.total : 0;
    const text = total > 0 ? String(total > 999 ? "999+" : total) : "";
    chrome.action.setBadgeText({ tabId: sender.tab.id, text });
    chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: "#2563eb" });
    return;
  }

  if (msg.type === "download-batch") {
    downloadBatch(msg.files || [], msg.referrer || "")
      .then((results) => sendResponse({ results }))
      .catch((err) => {
        sendResponse({
          results: [
            {
              ok: false,
              filename: "",
              error: err && err.message ? err.message : String(err),
            },
          ],
        });
      });
    return true;
  }
});

chrome.downloads.onChanged.addListener((delta) => {
  if (!delta.state) return;
  const done = delta.state.current === "complete" || delta.state.current === "interrupted";
  if (!done) return;
  const url = objectUrls.get(delta.id);
  if (!url) return;
  URL.revokeObjectURL(url);
  objectUrls.delete(delta.id);
});

async function downloadBatch(files, referrer) {
  const results = new Array(files.length);
  let cursor = 0;

  async function worker() {
    while (cursor < files.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await downloadOne(files[index], referrer);
    }
  }

  const workers = Math.min(3, files.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

async function downloadOne(file, referrer) {
  const filename = file.filename;
  try {
    const blob = await fetchImage(file.url, referrer);
    const id = await saveBlob(blob, filename, false);
    return { ok: true, id, filename };
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    if (message.includes("服务器没有返回图片")) {
      return { ok: false, filename, error: "服务器没有返回图片（可能有防盗链）" };
    }
    try {
      const id = await downloadUrl({
        url: file.url,
        filename,
        conflictAction: "uniquify",
        saveAs: false,
      });
      return { ok: true, id, filename };
    } catch (fallbackErr) {
      const fallbackMessage = fallbackErr && fallbackErr.message ? fallbackErr.message : message;
      return { ok: false, filename, error: fallbackMessage };
    }
  }
}

async function fetchImage(url, referrer) {
  const attempts = [];
  if (referrer) {
    attempts.push({
      credentials: "include",
      referrer,
      referrerPolicy: "strict-origin-when-cross-origin",
    });
  }
  attempts.push({ credentials: "include" });
  attempts.push({ credentials: "omit" });

  let lastError = null;
  for (const init of attempts) {
    try {
      const response = await fetch(url, init);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const type = response.headers.get("content-type") || "";
      if (/text\/html|application\/json|text\/plain/i.test(type)) {
        throw new Error("服务器没有返回图片");
      }
      const blob = await response.blob();
      if (!blob || !blob.size) throw new Error("空文件");
      return blob;
    } catch (err) {
      lastError = err;
      if (String(err && err.message).includes("服务器没有返回图片")) throw err;
    }
  }
  throw lastError || new Error("下载失败");
}

async function saveBlob(blob, filename, retried) {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const id = await downloadUrl({
      url: objectUrl,
      filename,
      conflictAction: "uniquify",
      saveAs: false,
    });
    objectUrls.set(id, objectUrl);
    setTimeout(() => {
      if (!objectUrls.has(id)) return;
      URL.revokeObjectURL(objectUrl);
      objectUrls.delete(id);
    }, 60000);
    return id;
  } catch (err) {
    URL.revokeObjectURL(objectUrl);
    if (!retried) {
      const ascii = filename
        .replace(/[^\x20-\x7E]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+/, "");
      if (ascii && ascii !== filename) return saveBlob(blob, ascii, true);
    }
    throw err;
  }
}

function downloadUrl(options) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download(options, (id) => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve(id);
    });
  });
}
