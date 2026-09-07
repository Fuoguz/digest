import { writeFile } from 'node:fs/promises';

const output = process.argv[2];
if (!output) throw new Error('Output path is required');
const stream = 'BT\n/F1 18 Tf\n72 720 Td\n(Digest PDF import test.) Tj\n0 -28 Td\n(Second source paragraph for evidence.) Tj\nET';
const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  '<< /Length ' + Buffer.byteLength(stream) + ' >>\nstream\n' + stream + '\nendstream'
];
let pdf = '%PDF-1.4\n';
const offsets = [0];
objects.forEach((object, index) => {
  offsets.push(Buffer.byteLength(pdf));
  pdf += String(index + 1) + ' 0 obj\n' + object + '\nendobj\n';
});
const xref = Buffer.byteLength(pdf);
pdf += 'xref\n0 ' + String(objects.length + 1) + '\n0000000000 65535 f \n';
for (const offset of offsets.slice(1)) pdf += String(offset).padStart(10, '0') + ' 00000 n \n';
pdf += 'trailer\n<< /Size ' + String(objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + String(xref) + '\n%%EOF\n';
await writeFile(output, pdf, 'binary');
