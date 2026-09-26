import { t, installLanguageControl } from './workspace/i18n.js';
// This landing page contains authored examples only, never user documents.
const walk=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
while(walk.nextNode()) {const n=walk.currentNode;if(!['SCRIPT','STYLE'].includes(n.parentElement?.tagName))n.textContent=t(n.textContent);}
for(const node of document.querySelectorAll('[aria-label]'))node.setAttribute('aria-label',t(node.getAttribute('aria-label')));
document.title=t(document.title);
const description=document.querySelector('meta[name="description"]');if(description)description.content=t(description.content);
installLanguageControl(document.querySelector('header nav') || document.querySelector('header'));
document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener('click', (event) => {
    const target = document.querySelector(link.getAttribute('href'));
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});
