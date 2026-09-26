// Keep original paragraph identities and offsets even when a paragraph needs windows.
export function evidenceExcerpts(paragraph) {
  const excerpts = [];
  // Exact substrings only: never normalize PDF whitespace or punctuation.
  for (let start = 0; start < paragraph.text.length; ) {
    const window = paragraph.text.slice(start, start + 360);
    const boundary = window.search(/[.!?。！？](?:\s|$)/u);
    const length = boundary >= 40 ? boundary + 1 : window.length;
    const quote = paragraph.text.slice(start, start + length);
    if (quote.trim())
      excerpts.push({
        id:
          "p" +
          paragraph.paragraphIndex +
          "-s" +
          ((paragraph.segmentStart || 0) + start),
        quote,
      });
    start += length;
  }
  return excerpts;
}

export function readingChunks(paragraphs, size = 10000) {
  const chunks = [];
  let chunk = [],
    length = 0;
  for (const paragraph of paragraphs) {
    for (let start = 0; start < paragraph.text.length; start += size) {
      const part = {
        ...paragraph,
        segmentStart: (paragraph.segmentStart || 0) + start,
        text: paragraph.text.slice(start, start + size),
      };
      if (length + part.text.length > size && chunk.length) {
        chunks.push(chunk);
        chunk = [];
        length = 0;
      }
      chunk.push(part);
      length += part.text.length;
    }
  }
  if (chunk.length) chunks.push(chunk);
  return chunks;
}

function terms(text) {
  const lower = text.toLowerCase();
  return [
    ...new Set([
      ...(lower.match(/[a-z0-9]{3,}/g) || []),
      ...(lower.match(/[\p{Script=Han}]{2,}/gu) || []).flatMap((s) =>
        Array.from({ length: s.length - 1 }, (_, i) => s.slice(i, i + 2)),
      ),
    ]),
  ];
}

// Bounded lexical retrieval, not a claim that the unselected material has been checked.
export function retrieveContext(snapshots, query, budget = 24000) {
  const all = snapshots.flatMap((s) =>
    s.paragraphs.flatMap((p) =>
      readingChunks([p], 5000)
        .flat()
        .map((part) => ({ documentId: s.documentId, ...part })),
    ),
  );
  const tokens = terms(query).slice(0, 600);
  const ranked = all
    .map((p, index) => ({
      p,
      index,
      score: tokens.reduce(
        (n, t) => n + (p.text.toLowerCase().includes(t) ? 1 : 0),
        0,
      ),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const picked = new Set();
  let used = 0;
  for (const row of ranked) {
    if (picked.has(row.index)) continue;
    if (used + row.p.text.length > budget) continue;
    picked.add(row.index);
    used += row.p.text.length;
    for (const i of [row.index - 1, row.index + 1]) {
      const p = all[i];
      if (
        p &&
        p.documentId === row.p.documentId &&
        !picked.has(i) &&
        used + p.text.length <= budget
      ) {
        picked.add(i);
        used += p.text.length;
      }
    }
  }
  return {
    documents: snapshots.map((s) => ({
      documentId: s.documentId,
      title: s.title,
      paragraphs: all.filter(
        (p, i) => p.documentId === s.documentId && picked.has(i),
      ),
    })),
    scope: {
      method: "lexical-v1",
      selectedCharacters: used,
      totalCharacters: snapshots.reduce((n, s) => n + s.source.length, 0),
      partial: picked.size < all.length,
    },
  };
}
