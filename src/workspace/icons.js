// One stroke icon set for the whole workspace. Icons are decorative; text labels carry meaning.
const paths = {
  home: '<path d="M4 11.5 12 5l8 6.5"/><path d="M6.5 10v9h11v-9"/><path d="M10 19v-5h4v5"/>',
  course: '<path d="M4 5.5C6.5 4.5 9.5 4.5 12 6c2.5-1.5 5.5-1.5 8-.5V19c-2.5-1-5.5-1-8 .5-2.5-1.5-5.5-1.5-8-.5z"/><path d="M12 6v13.5"/>',
  library: '<path d="M5 4h4v16H5zM10 4h4v16h-4z"/><path d="m15.5 5.2 3.8-1 3 15.5-3.8.9z"/>',
  review: '<path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.7"/><path d="M20 4v4.7h-4.7"/><path d="M20 12a8 8 0 0 1-13.7 5.6L4 15.3"/><path d="M4 20v-4.7h4.7"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/>',
  graph: '<circle cx="6" cy="7" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="15" cy="18" r="2.5"/><path d="m8.5 7 7-1M7.5 9l6 7M17.5 8.5 16 15.5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.5 1A8 8 0 0 0 15 6l-.4-2.7h-4L10 6a7 7 0 0 0-1.5.9L6 6 4 9.4 6.1 11a7 7 0 0 0 0 2L4 14.6 6 18l2.5-1a7 7 0 0 0 1.5.9l.5 2.7h4L15 18a7 7 0 0 0 1.5-.9l2.5 1 2-3.4-2.1-1.6a7 7 0 0 0 .1-1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  arrowDown: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  alert: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17.2v.3"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>',
  pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  quote: '<path d="M6 4.5h9l4 4v11H6z"/><path d="M15 4.5V9h4M9 13h7M9 16.5h5"/>',
  ai: '<path d="M12 3.5 13.8 9 19.5 10.8 13.8 12.6 12 18.2 10.2 12.6 4.5 10.8 10.2 9z"/><path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
  user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 19.5c1-3.5 3.8-5 7-5s6 1.5 7 5"/>',
  flag: '<path d="M6 21V4M6 4.5h11l-2.2 4 2.2 4H6"/>',
  repeat: '<path d="M17 3.5 20 6.5l-3 3"/><path d="M4 11.5v-1a4 4 0 0 1 4-4h12"/><path d="m7 20.5-3-3 3-3"/><path d="M20 12.5v1a4 4 0 0 1-4 4H4"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  external: '<path d="M14 5h5v5M19 5l-8 8"/><path d="M17 14v5H5V7h5"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M5 15v4h14v-4"/>',
  more: '<circle cx="5.5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18.5" cy="12" r="1.2"/>',
  circle: '<circle cx="12" cy="12" r="7.5"/>',
  minus: '<path d="M6 12h12"/>',
};

export function iconHTML(name, className = "icon") {
  return (
    '<svg class="' +
    className +
    '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    (paths[name] || "") +
    "</svg>"
  );
}

export function icon(name, className) {
  const template = document.createElement("template");
  template.innerHTML = iconHTML(name, className);
  return template.content.firstChild;
}
