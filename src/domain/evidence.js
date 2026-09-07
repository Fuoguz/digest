// Offsets use JavaScript UTF-16 units, the same units as String.slice and DOM text.
export function sourceSignature(document) {
  return JSON.stringify([document.rawContent, document.readingMode, document.paragraphs || []]);
}

export async function documentSnapshot(document) {
  const source = String(document.rawContent || '');
  const paragraphs = [];
  const expression = /[^\r\n](?:[\s\S]*?)(?=\n\s*\n|$)/g;
  for (const match of source.matchAll(expression)) {
    const text = match[0];
    if (!text.trim()) continue;
    const index = paragraphs.length;
    const original = document.paragraphs?.[index];
    const pageNumber = original?.startOffset === match.index && Number.isInteger(original.pageNumber) && original.pageNumber > 0
      ? original.pageNumber : null;
    paragraphs.push({ paragraphIndex: index, text, startOffset: match.index, endOffset: match.index + text.length, pageNumber });
  }
  const signature = sourceSignature(document);
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(signature));
  const sourceRevision = Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return { documentId: document.id, title: document.title, readingMode: document.readingMode, source, paragraphs, sourceRevision, signature };
}

export function validateEvidence(proposal, snapshot, id) {
  const paragraph = snapshot.paragraphs.find((item) => item.paragraphIndex === proposal?.paragraphIndex);
  const quote = typeof proposal?.quote === 'string' ? proposal.quote : '';
  const anchor = {
    id, documentId: snapshot.documentId, sourceRevision: snapshot.sourceRevision,
    paragraphIndex: Number.isInteger(proposal?.paragraphIndex) ? proposal.paragraphIndex : null,
    pageNumber: paragraph?.pageNumber || null, quote,
    startOffset: null, endOffset: null, paragraphStartOffset: null, paragraphEndOffset: null,
    validationStatus: 'invalid'
  };
  if (!paragraph || !quote.trim()) return anchor;
  const offset = paragraph.text.indexOf(quote);
  if (offset < 0) return anchor;
  if (paragraph.text.indexOf(quote, offset + 1) !== -1) return { ...anchor, validationStatus: 'ambiguous' };
  const startOffset = paragraph.startOffset + offset;
  if (snapshot.source.slice(startOffset, startOffset + quote.length) !== quote) return anchor;
  return { ...anchor, startOffset, endOffset: startOffset + quote.length,
    paragraphStartOffset: offset, paragraphEndOffset: offset + quote.length, validationStatus: 'matched' };
}

export function restoreAnchor(anchor, snapshot) {
  if (anchor.documentId !== snapshot.documentId || anchor.sourceRevision !== snapshot.sourceRevision) {
    return { ...anchor, validationStatus: 'stale' };
  }
  return validateEvidence(anchor, snapshot, anchor.id);
}
