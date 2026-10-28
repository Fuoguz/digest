// Offsets use JavaScript UTF-16 units, the same units as String.slice and DOM text.
export function sourceSignature(document) {
  return JSON.stringify([
    document.rawContent,
    document.readingMode,
    document.paragraphs || [],
  ]);
}

export async function documentSnapshot(document) {
  const source = String(document.rawContent || "");
  const paragraphs = [];
  const expression = /[^\r\n](?:[\s\S]*?)(?=\n\s*\n|$)/g;
  for (const match of source.matchAll(expression)) {
    const text = match[0];
    if (!text.trim()) continue;
    const index = paragraphs.length;
    const original = document.paragraphs?.[index];
    // Imported structure is trusted only while it still lines up with the source text.
    const aligned = original?.startOffset === match.index;
    const pageNumber =
      aligned &&
      Number.isInteger(original.pageNumber) &&
      original.pageNumber > 0
        ? original.pageNumber
        : null;
    const paragraph = {
      paragraphIndex: index,
      text,
      startOffset: match.index,
      endOffset: match.index + text.length,
      pageNumber,
    };
    if (aligned && Number.isInteger(original.heading) && original.heading >= 1 && original.heading <= 6)
      paragraph.heading = original.heading;
    if (aligned && Number.isInteger(original.chapter) && original.chapter >= 0)
      paragraph.chapter = original.chapter;
    paragraphs.push(paragraph);
  }
  const signature = sourceSignature(document);
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(signature),
  );
  const sourceRevision = Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return {
    documentId: document.id,
    title: document.title,
    readingMode: document.readingMode,
    source,
    paragraphs,
    sourceRevision,
    signature,
  };
}

export function validateEvidence(proposal, snapshot, id) {
  const paragraph = snapshot.paragraphs.find(
    (item) => item.paragraphIndex === proposal?.paragraphIndex,
  );
  const quote = typeof proposal?.quote === "string" ? proposal.quote : "";
  const anchor = {
    id,
    documentId: snapshot.documentId,
    sourceRevision: snapshot.sourceRevision,
    paragraphIndex: Number.isInteger(proposal?.paragraphIndex)
      ? proposal.paragraphIndex
      : null,
    pageNumber: paragraph?.pageNumber || null,
    quote,
    startOffset: null,
    endOffset: null,
    paragraphStartOffset: null,
    paragraphEndOffset: null,
    validationStatus: "invalid",
  };
  if (!paragraph || !quote.trim()) return anchor;
  const offset = paragraph.text.indexOf(quote);
  if (offset < 0) return anchor;
  if (paragraph.text.indexOf(quote, offset + 1) !== -1)
    return { ...anchor, validationStatus: "ambiguous" };
  const startOffset = paragraph.startOffset + offset;
  if (snapshot.source.slice(startOffset, startOffset + quote.length) !== quote)
    return anchor;
  return {
    ...anchor,
    startOffset,
    endOffset: startOffset + quote.length,
    paragraphStartOffset: offset,
    paragraphEndOffset: offset + quote.length,
    validationStatus: "matched",
  };
}

// A passage the reader selected: paragraph-relative offsets plus the exact text.
// Paragraph breaks inside a selection are joined with a blank line.
export const MAX_FOCUS_CHARS = 3000;
export function selectionText(paragraphs, focus) {
  const parts = [];
  for (let i = focus.start.paragraphIndex; i <= focus.end.paragraphIndex; i++) {
    const paragraph = paragraphs.find((p) => p.paragraphIndex === i);
    if (!paragraph) return null;
    const from = i === focus.start.paragraphIndex ? focus.start.offset : 0;
    const to = i === focus.end.paragraphIndex ? focus.end.offset : paragraph.text.length;
    if (from < 0 || to > paragraph.text.length || from > to) return null;
    parts.push(paragraph.text.slice(from, to));
  }
  return parts.join("\n\n");
}
export function validFocus(focus, paragraphs) {
  const point = (p) =>
    p && Number.isInteger(p.paragraphIndex) && Number.isInteger(p.offset);
  if (
    !focus ||
    typeof focus.text !== "string" ||
    !point(focus.start) ||
    !point(focus.end) ||
    focus.start.paragraphIndex > focus.end.paragraphIndex ||
    (focus.start.paragraphIndex === focus.end.paragraphIndex &&
      focus.start.offset >= focus.end.offset) ||
    focus.text.trim().length < 2 ||
    focus.text.length > MAX_FOCUS_CHARS
  )
    return false;
  return selectionText(paragraphs, focus) === focus.text;
}
// Whether a matched evidence anchor lies inside the selected passage.
export function anchorInFocus(anchor, focus) {
  if (!focus || anchor.validationStatus !== "matched") return false;
  const i = anchor.paragraphIndex;
  if (i < focus.start.paragraphIndex || i > focus.end.paragraphIndex) return false;
  const from = i === focus.start.paragraphIndex ? focus.start.offset : 0;
  const to = i === focus.end.paragraphIndex ? focus.end.offset : Infinity;
  return anchor.paragraphStartOffset < to && anchor.paragraphEndOffset > from;
}

export function restoreAnchor(anchor, snapshot) {
  if (
    anchor.documentId !== snapshot.documentId ||
    anchor.sourceRevision !== snapshot.sourceRevision
  ) {
    return { ...anchor, validationStatus: "stale" };
  }
  return validateEvidence(anchor, snapshot, anchor.id);
}
