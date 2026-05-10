export function createSourceActions(deps) {
  const { refs, htmlToPlainText, writeSourceToMainInput, setSourceStatus, extractSelectionText } = deps;

  async function fetchTextFromUrl(rawUrl) {
    const normalizedUrl = String(rawUrl || "").trim();
    if (!normalizedUrl) {
      throw new Error("请输入有效的网页 URL");
    }

    let url;
    try {
      url = new URL(normalizedUrl);
    } catch (error) {
      throw new Error("URL 格式不正确，请补全 http:// 或 https://");
    }

    const directResponse = await fetch(url.toString(), { method: "GET" });
    if (directResponse.ok) {
      const contentType = directResponse.headers.get("content-type") || "";
      const directText = await directResponse.text();

      if (/text\/html|text\/plain|application\/xhtml\+xml/i.test(contentType) || directText.length > 0) {
        return directText;
      }
    }

    const jinaUrl = `https://r.jina.ai/http://${url.toString().replace(/^https?:\/\//i, "")}`;
    const jinaResponse = await fetch(jinaUrl, { method: "GET" });
    if (!jinaResponse.ok) {
      throw new Error(`网页抓取失败: ${jinaResponse.status}`);
    }

    return jinaResponse.text();
  }

  async function importUrlSource() {
    const rawUrl = refs.sourceUrlInput?.value || "";
    const normalizedUrl = String(rawUrl || "").trim();

    if (!normalizedUrl) {
      setSourceStatus(refs, "请输入网页 URL 后再导入。", true);
      return;
    }

    setSourceStatus(refs, "正在抓取网页正文...");
    if (refs.importUrlBtn) {
      refs.importUrlBtn.disabled = true;
    }

    try {
      const text = await fetchTextFromUrl(normalizedUrl);
      const cleanedText = htmlToPlainText(text);

      if (!cleanedText) {
        throw new Error("网页未提取到可用文本");
      }

      if (writeSourceToMainInput(refs, cleanedText)) {
        setSourceStatus(refs, "网页正文已导入内化区", false);
      }
    } catch (error) {
      console.error("网页导入失败:", error);
      setSourceStatus(refs, error.message || "网页导入失败，请检查链接或网络", true);
    } finally {
      if (refs.importUrlBtn) {
        refs.importUrlBtn.disabled = false;
      }
    }
  }

  function importSelectionSource() {
    const selectionText = extractSelectionText();
    if (!selectionText) {
      setSourceStatus(refs, "没有检测到选区，请先在当前页面选中一段文本", true);
      return;
    }

    if (writeSourceToMainInput(refs, selectionText)) {
      setSourceStatus(refs, "当前选区已写入内化区", false);
    }
  }

  return {
    importUrlSource,
    importSelectionSource
  };
}
