const test = require("node:test");
const assert = require("node:assert/strict");
const ImgPick = require("../lib/parse.js");

const GIF_1X1 =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const BASE = "https://example.com/post/";

test("parseSrcset picks candidates and keeps commas inside data urls", () => {
  const parsed = ImgPick.parseSrcset(
    "small.jpg 100w, big.jpg 2000w, data:image/png;base64,iVBORw0KGgo= 1x"
  );
  assert.equal(parsed.length, 3);
  assert.deepEqual(
    parsed.map((item) => item.url),
    ["small.jpg", "big.jpg", "data:image/png;base64,iVBORw0KGgo="]
  );
  assert.equal(parsed[0].unit, "w");
  assert.equal(parsed[0].value, 100);
  assert.equal(ImgPick.bestSrcset("small.jpg 100w, big.jpg 2000w").url, "big.jpg");
  assert.equal(ImgPick.bestSrcset("a.jpg 1x, b.jpg 2x").url, "b.jpg");
  assert.equal(ImgPick.bestSrcset("only.jpg").url, "only.jpg");
  assert.deepEqual(
    ImgPick.parseSrcset("a.jpg,b.jpg").map((item) => item.url),
    ["a.jpg", "b.jpg"]
  );
});

test("extractCssUrls reads quoted and bare urls and ignores gradients", () => {
  assert.deepEqual(ImgPick.extractCssUrls("none"), []);
  assert.deepEqual(ImgPick.extractCssUrls("linear-gradient(red, blue)"), []);
  assert.deepEqual(
    ImgPick.extractCssUrls('linear-gradient(red, blue), url("https://cdn.example.com/a.png"), url(\'b.jpg\')'),
    ["https://cdn.example.com/a.png", "b.jpg"]
  );
  assert.deepEqual(ImgPick.extractCssUrls("url(./c.webp)"), ["./c.webp"]);
});

test("chooseDisplayedUrl prefers the visible url, then lazy and srcset", () => {
  assert.equal(
    ImgPick.chooseDisplayedUrl({
      base: BASE,
      currentSrc: "https://cdn.example.com/shown.jpg",
      src: "https://cdn.example.com/shown.jpg",
      naturalWidth: 800,
    }),
    "https://cdn.example.com/shown.jpg"
  );

  assert.equal(
    ImgPick.chooseDisplayedUrl({
      base: BASE,
      currentSrc: GIF_1X1,
      src: GIF_1X1,
      naturalWidth: 1,
      lazy: [{ name: "data-src", value: "/photos/real.jpg" }],
    }),
    "https://example.com/photos/real.jpg"
  );

  assert.equal(
    ImgPick.chooseDisplayedUrl({
      base: BASE,
      currentSrc: "https://cdn.example.com/thumb.jpg",
      src: "https://cdn.example.com/thumb.jpg",
      naturalWidth: 640,
      lazy: [{ name: "data-original", value: "https://cdn.example.com/original.jpg" }],
    }),
    "https://cdn.example.com/original.jpg"
  );

  assert.equal(
    ImgPick.chooseDisplayedUrl({
      base: BASE,
      currentSrc: "",
      src: "",
      srcset: "small.jpg 400w, large.jpg 1600w",
    }),
    "https://example.com/post/large.jpg"
  );

  assert.equal(
    ImgPick.chooseDisplayedUrl({
      base: BASE,
      pictureSources: [
        { mediaMatches: false, srcset: "https://example.com/dark.jpg 1x" },
        { mediaMatches: true, srcset: "https://example.com/small.jpg 400w, https://example.com/large.jpg 1600w" },
      ],
    }),
    "https://example.com/large.jpg"
  );

  assert.equal(
    ImgPick.chooseDisplayedUrl({
      base: BASE,
      src: "javascript:alert(1)",
      currentSrc: "",
    }),
    ""
  );

  assert.equal(ImgPick.isPlaceholder(GIF_1X1), true);
  assert.equal(ImgPick.isPlaceholder("https://example.com/blank.gif"), true);
  assert.equal(ImgPick.isPlaceholder("https://example.com/photo.jpg"), false);
  assert.equal(ImgPick.isAcceptable("javascript:alert(1)"), false);
});

test("buildFilename sanitizes paths and keeps image extensions", () => {
  assert.equal(ImgPick.buildFilename("https://cdn.example.com/photos/cat.jpg?size=1", 1), "cat.jpg");
  assert.equal(ImgPick.buildFilename("https://cdn.example.com/download?id=1", 3), "download.jpg");
  assert.equal(ImgPick.buildFilename("data:image/webp;base64,AAAA", 2), "image-2.webp");
  assert.equal(ImgPick.buildFilename("https://cdn.example.com/a/my:file.png", 1), "my_file.png");
  assert.equal(ImgPick.looksLikeImagePath("https://example.com/icon.svg"), true);
  assert.equal(ImgPick.looksLikeImagePath("https://example.com/file.pdf"), false);
});
