// Minimal valid .docx and .pptx archives for importer tests. Authored sample text only.
import { buildZip } from "./epub-fixture.mjs";

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const para = (text, style) =>
  `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

export function docxFiles() {
  return [
    { name: "[Content_Types].xml", content: '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>' },
    { name: "docProps/core.xml", content: '<cp:coreProperties xmlns:cp="x" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>心理学导论讲义</dc:title></cp:coreProperties>' },
    {
      name: "word/styles.xml",
      content: `<w:styles ${W}><w:style w:type="paragraph" w:styleId="1"><w:name w:val="heading 1"/></w:style><w:style w:type="paragraph" w:styleId="2"><w:name w:val="heading 2"/></w:style><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`,
    },
    {
      name: "word/document.xml",
      content: `<w:document ${W}><w:body>
        ${para("第一章 认知失调", "1")}
        ${para("当行为与态度不一致时，人会感到不适，并倾向于调整态度。")}
        <w:p><w:r><w:t>被删除的旧句子</w:t></w:r></w:p>
        <w:p><w:del><w:r><w:delText>修订中删掉的内容</w:delText></w:r></w:del><w:r><w:t>经典实验</w:t></w:r><w:r><w:tab/><w:t>报酬越少，态度改变越大。</w:t></w:r></w:p>
        ${para("1.1 实验设计", "2")}
        <w:tbl><w:tr><w:tc>${para("组别")}</w:tc><w:tc>${para("报酬")}</w:tc></w:tr></w:tbl>
        <w:p/>
        ${para("第二章 社会认同", "1")}
        ${para("人们通过所属群体界定自我。")}
      </w:body></w:document>`,
    },
  ];
}

const P = 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const slide = (title, bullets) =>
  `<p:sld ${P}><p:cSld><p:spTree>${title ? `<p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>${title}</a:t></a:r></a:p></p:txBody></p:sp>` : ""}<p:sp><p:txBody>${bullets.map((b) => `<a:p><a:r><a:t>${b}</a:t></a:r></a:p>`).join("")}<a:p></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;

export function pptxFiles({ sections = true } = {}) {
  return [
    { name: "[Content_Types].xml", content: '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>' },
    {
      name: "ppt/presentation.xml",
      content: `<p:presentation ${P} xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main"><p:sldIdLst><p:sldId id="256" r:id="rId3"/><p:sldId id="257" r:id="rId2"/><p:sldId id="258" r:id="rId4"/></p:sldIdLst>${
        sections
          ? '<p:extLst><p:ext><p14:sectionLst><p14:section name="现象学基础" id="{A}"><p14:sldIdLst><p14:sldId id="256"/><p14:sldId id="257"/></p14:sldIdLst></p14:section><p14:section name="存在主义" id="{B}"><p14:sldIdLst><p14:sldId id="258"/></p14:sldIdLst></p14:section></p14:sectionLst></p:ext></p:extLst>'
          : ""
      }</p:presentation>`,
    },
    {
      name: "ppt/_rels/presentation.xml.rels",
      content: '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Target="slides/slide2.xml"/><Relationship Id="rId3" Target="slides/slide1.xml"/><Relationship Id="rId4" Target="slides/slide3.xml"/></Relationships>',
    },
    { name: "ppt/slides/slide1.xml", content: slide("什么是现象学", ["回到事情本身", "悬置自然态度"]) },
    { name: "ppt/slides/slide2.xml", content: slide("", ["意向性：意识总是关于某物的意识"]) },
    { name: "ppt/slides/slide3.xml", content: slide("存在先于本质", ["人首先存在，然后通过选择界定自己"]) },
  ];
}

export { buildZip };
