// Offer local OCR when a PDF has no text layer. Everything runs in this browser.
import { el, button, message, icon } from "./components.js";
import { getLocale } from "./i18n.js";
import { ocrPdfFile, OCR_MAX_PAGES } from "../importers/ocr.js";

const l = (zh, en) => (getLocale() === "en" ? en : zh);

export function ocrOffer(file, pageCount, { onResult, register = () => {} }) {
  const box = el("section", "ocr-offer");
  box.setAttribute("aria-label", l("识别扫描件文字", "Recognise scanned text"));
  box.append(
    el("p", "ocr-title", l("这是扫描版 PDF，可以在浏览器里识别文字", "This looks like a scanned PDF. Text can be recognised in your browser")),
    el(
      "p",
      "reader-muted",
      l(
        "文件不会上传。第一次使用需下载约 9 MB 识别数据，之后每页约几秒；识别出的文字可能有错，保存前请核对。",
        "Nothing is uploaded. The first use downloads about 9 MB of recognition data; each page then takes a few seconds. Recognised text can contain errors, so check it before saving.",
      ),
    ),
  );
  const range = el("div", "ocr-range");
  const fromLabel = el("label", "", l("从第", "From page")),
    toLabel = el("label", "", l("到第", "to page"));
  const from = el("input", "core-input"),
    to = el("input", "core-input");
  for (const input of [from, to]) {
    input.type = "number";
    input.min = 1;
    input.max = pageCount;
  }
  from.value = 1;
  to.value = Math.min(pageCount, 20);
  fromLabel.append(from);
  toLabel.append(to);
  range.append(fromLabel, toLabel, el("span", "reader-muted", l("页（共 ", "(of ") + pageCount + l(" 页，单次最多 ", "; up to ") + OCR_MAX_PAGES + l(" 页）", " per run)")));
  const status = el("p");
  const start = button(l("开始识别", "Recognise text"), run, "primary-action btn-sm");
  start.prepend(icon("quote"));
  const actions = el("div", "ocr-actions");
  actions.append(start);
  box.append(range, actions, status);
  let controller = null;
  async function run() {
    const a = Math.round(Number(from.value)),
      b = Math.round(Number(to.value));
    if (!(a >= 1 && b <= pageCount && a <= b)) {
      message(status, l("请填写有效的页码范围。", "Enter a valid page range."), true);
      return;
    }
    if (b - a + 1 > OCR_MAX_PAGES) {
      message(status, l("单次最多识别 " + OCR_MAX_PAGES + " 页，请缩小范围。", "Up to " + OCR_MAX_PAGES + " pages per run. Narrow the range."), true);
      return;
    }
    controller = new AbortController();
    const local = controller;
    register(() => local.abort());
    start.disabled = from.disabled = to.disabled = true;
    const cancel = button(l("取消识别", "Cancel"), () => local.abort(), "secondary-action btn-sm");
    actions.append(cancel);
    const began = performance.now();
    try {
      const result = await ocrPdfFile(file, {
        from: a,
        to: b,
        signal: local.signal,
        onProgress: ({ phase, page, total }) =>
          message(
            status,
            phase === "engine"
              ? l("正在准备识别引擎…", "Preparing the recognition engine…")
              : l("正在识别第 " + page + " / " + total + " 页…", "Recognising page " + page + " of " + total + "…"),
            false,
            true,
          ),
      });
      const seconds = Math.round((performance.now() - began) / 1000);
      const confidence = result.metadata.ocr.confidence;
      message(
        status,
        l("已识别 ", "Recognised ") +
          (b - a + 1) +
          l(" 页，用时 ", " pages in ") +
          seconds +
          l(" 秒。", " s. ") +
          (confidence < 70
            ? l("识别把握较低（" + confidence + "），请仔细核对正文。", "Low confidence (" + confidence + "); check the text carefully.")
            : l("请核对正文后保存。", "Check the text before saving.")),
        confidence < 70,
      );
      onResult(result);
    } catch (e) {
      message(
        status,
        e.name === "AbortError" || local.signal.aborted
          ? l("已取消识别。", "Recognition cancelled.")
          : e.message || l("识别失败，请重试。", "Recognition failed. Please retry."),
        !(e.name === "AbortError" || local.signal.aborted),
      );
    } finally {
      cancel.remove();
      start.disabled = from.disabled = to.disabled = false;
      controller = null;
    }
  }
  return box;
}
