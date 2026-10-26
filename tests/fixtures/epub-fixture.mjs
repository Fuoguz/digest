// Builds a small, valid EPUB (ZIP) in memory for importer tests. Authored sample text only.
const table = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
async function deflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function buildZip(files) {
  const encoder = new TextEncoder();
  const locals = [], centrals = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const raw = typeof file.content === "string" ? encoder.encode(file.content) : file.content;
    const method = file.store ? 0 : 8;
    const data = method ? await deflateRaw(raw) : raw;
    const crc = crc32(raw);
    const local = new Uint8Array(30 + name.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(8, method, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(data, 30 + name.length);
    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(10, method, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const centralSize = centrals.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + centralSize + 22);
  let cursor = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}

const chapter = (title, body) =>
  `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${title}</title><style>p{color:red}</style></head><body>${body}</body></html>`;

export function sampleEpubFiles({ encrypted = false } = {}) {
  const files = [
    { name: "mimetype", content: "application/epub+zip", store: true },
    {
      name: "META-INF/container.xml",
      content: '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    },
    {
      name: "OEBPS/content.opf",
      content: `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>传播学导论 &amp; 案例</dc:title></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item media-type="application/xhtml+xml" href="text/ch2.xhtml" id="c2"/><item id="c1" href="text/ch1.xhtml" media-type="application/xhtml+xml"/><item id="img" href="images/cover.jpg" media-type="image/jpeg"/></manifest><spine><itemref idref="nav"/><itemref idref="c1"/><itemref idref="c2"/></spine></package>`,
    },
    { name: "OEBPS/nav.xhtml", content: chapter("目录", '<nav epub:type="toc"><ol><li><a href="text/ch1.xhtml">目录：议程设置</a></li><li><a href="text/ch2.xhtml#s1">目录：框架理论</a></li></ol></nav>') },
    {
      name: "OEBPS/text/ch1.xhtml",
      content: chapter(
        "第一章",
        "<h1>第一章 议程设置</h1><p>媒体影响公众认为<em>哪些</em>议题重要&#xff0c;但不直接决定态度。</p><p>报道数量&nbsp;不能证明支持。<ruby>框架<rt>kuàngjià</rt></ruby>另行讨论。</p><script>alert(1)</script>",
      ),
    },
    {
      name: "OEBPS/text/ch2.xhtml",
      content: chapter("第二章", "<h2>第二章 框架</h2><div><p>框架影响解释角度。<br/>同一议题可有不同框架。</p></div>"),
    },
  ];
  if (encrypted)
    files.push({
      name: "META-INF/encryption.xml",
      content: '<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><EncryptedData xmlns="http://www.w3.org/2001/04/xmlenc#"><EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes128-cbc"/></EncryptedData></encryption>',
    });
  return files;
}
