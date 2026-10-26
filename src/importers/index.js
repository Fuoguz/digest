import { extractTextFile, fileExtension } from "./text.js";
import { extractPdfFile } from "./pdf.js";
import { extractEpubFile } from "./epub.js";
import { extractOfficeFile } from "./office.js";

export const ACCEPTED_FILES =
  ".pdf,.docx,.pptx,.doc,.ppt,.epub,.txt,.md,.markdown,text/plain,text/markdown,application/pdf,application/epub+zip,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation";

// One entry point for every supported file type; parsing stays in the browser.
export function extractFile(file) {
  const extension = fileExtension(file.name);
  if (extension === "pdf" || file.type === "application/pdf") return extractPdfFile(file);
  if (extension === "epub" || file.type === "application/epub+zip") return extractEpubFile(file);
  if (["docx", "pptx", "doc", "ppt"].includes(extension)) return extractOfficeFile(file);
  return extractTextFile(file);
}
