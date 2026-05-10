export function createExportActions(deps) {
  const { refs, buildMarkdownFromCards } = deps;

  async function downloadPoster() {
    if (typeof html2canvas === "undefined") {
      alert("海报导出功能暂不可用，请稍后重试");
      return;
    }

    const clone = refs.posterArea.cloneNode(true);
    clone.style.position = "absolute";
    clone.style.left = "-9999px";
    clone.style.top = "0";
    clone.style.width = "600px";
    clone.style.maxWidth = "600px";
    clone.style.minWidth = "600px";
    clone.style.padding = "18px";
    clone.style.background = "#FAFAFA";
    clone.style.borderRadius = "18px";
    clone.style.boxShadow = "none";
    clone.style.border = "1px solid #E6E6E6";

    clone.style.setProperty("background", "#FAFAFA", "important");
    clone.style.setProperty("color", "#1A1A1A", "important");
    clone.style.setProperty("box-shadow", "none", "important");
    clone.style.setProperty("border-color", "#E6E6E6", "important");

    clone.querySelectorAll("h2").forEach((title) => {
      title.style.setProperty("color", "#1A1A1A", "important");
    });

    const signature = document.createElement("div");
    signature.textContent = "由 Digest · AI 知识内化工具生成";
    signature.style.marginTop = "14px";
    signature.style.textAlign = "center";
    signature.style.color = "#666666";
    signature.style.fontSize = "12px";
    signature.style.lineHeight = "1.4";
    clone.appendChild(signature);

    const cloneElements = clone.querySelectorAll("*");
    cloneElements.forEach((el) => {
      el.style.setProperty("opacity", "1", "important");
      el.style.setProperty("filter", "none", "important");
      el.style.setProperty("animation", "none", "important");
      el.style.setProperty("transition", "none", "important");
      el.style.setProperty("transform", "none", "important");
      el.style.setProperty("text-shadow", "none", "important");
      el.style.setProperty("background-image", "none", "important");
    });

    clone.querySelectorAll(".card").forEach((card) => {
      card.style.setProperty("background", "#FFFFFF", "important");
      card.style.setProperty("box-shadow", "none", "important");
      card.style.setProperty("border", "1px solid #E8E8E8", "important");
    });

    clone.querySelectorAll(".card h3").forEach((title) => {
      title.style.setProperty("color", "#1A1A1A", "important");
    });

    clone.querySelectorAll(".card p, .card li").forEach((text) => {
      text.style.setProperty("color", "#666666", "important");
    });

    clone.querySelectorAll(".card .copy-btn").forEach((button) => {
      button.style.setProperty("color", "#666666", "important");
      button.style.setProperty("border-color", "transparent", "important");
      button.style.setProperty("background", "transparent", "important");
    });

    document.body.appendChild(clone);

    try {
      const canvas = await html2canvas(clone, {
        scale: 2,
        backgroundColor: "#FAFAFA",
        useCORS: true,
        logging: false
      });
      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/png");
      link.download = "digest-poster.png";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error("海报生成失败:", error);
      alert("海报生成失败，请稍后重试");
    } finally {
      clone.remove();
    }
  }

  async function exportMarkdown() {
    const markdown = buildMarkdownFromCards(refs);
    if (!markdown) {
      alert("暂无可导出的内容，请先完成一次内化拆解");
      return;
    }

    const originalText = refs.exportMdBtn.textContent;
    try {
      await navigator.clipboard.writeText(markdown);
      refs.exportMdBtn.textContent = "✅ 已复制到剪贴板！";
      setTimeout(() => {
        refs.exportMdBtn.textContent = originalText;
      }, 2000);
    } catch (error) {
      console.error("Markdown 复制失败:", error);
      alert("复制失败，请检查浏览器剪贴板权限");
    }
  }

  return {
    downloadPoster,
    exportMarkdown
  };
}
