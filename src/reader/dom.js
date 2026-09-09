export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
}
export function button(text, action, className = "reader-link") {
  const node = el("button", className, text);
  node.type = "button";
  node.addEventListener("click", action);
  return node;
}
export function highlightQuote(paragraphNode, text, anchor) {
  paragraphNode.replaceChildren();
  const start = anchor?.paragraphStartOffset,
    end = anchor?.paragraphEndOffset;
  if (
    !anchor ||
    anchor.validationStatus !== "matched" ||
    text.slice(start, end) !== anchor.quote
  ) {
    paragraphNode.textContent = text;
    return null;
  }
  const mark = el("mark", "evidence-highlight", text.slice(start, end));
  paragraphNode.append(
    document.createTextNode(text.slice(0, start)),
    mark,
    document.createTextNode(text.slice(end)),
  );
  return mark;
}
