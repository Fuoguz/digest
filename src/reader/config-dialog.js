import { el, button } from './dom.js';
import { readDeveloperConfig, saveDeveloperConfig } from '../ai/developer-transport.js';

export function openAIConfiguration(onSave) {
  const config = readDeveloperConfig();
  const dialog = el('dialog', 'developer-dialog');
  const form = el('form', 'developer-form');
  const head = el('div', 'dialog-head');
  head.append(el('h2', '', 'Developer AI Service'), button('关闭', () => dialog.close()));
  form.append(head, el('p', 'developer-note', '仅供开发者自带服务使用。浏览器直接调用你填写的 endpoint；分析时会向该服务发送当前资料正文。Key 保存在当前浏览器的 localStorage 中。'));
  const fields = {};
  for (const [name, label, placeholder] of [
    ['endpoint', 'Chat Completions 地址', 'https://your-provider.example/v1'],
    ['model', '模型名称', '服务提供商的模型 ID'],
    ['key', 'API Key', config.key ? '已保存；留空保留现有 Key' : '填写你的 Key']
  ]) {
    const field = el('label', 'field', label);
    const input = el('input');
    input.name = name; input.type = name === 'key' ? 'password' : 'text';
    input.autocomplete = 'off'; input.placeholder = placeholder;
    input.value = name === 'key' ? '' : config[name];
    if (name !== 'key') input.required = true;
    field.append(input); form.append(field); fields[name] = input;
  }
  const error = el('p', 'reader-error-text'); error.setAttribute('role', 'alert');
  const actions = el('div', 'dialog-actions');
  const save = el('button', 'primary-action', '保存配置'); save.type = 'submit';
  actions.append(button('取消', () => dialog.close(), 'secondary-action'), save);
  form.append(error, actions);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      saveDeveloperConfig(Object.fromEntries(Object.entries(fields).map(([name, input]) => [name, input.value.trim()])));
      dialog.close(); onSave?.();
    } catch (problem) { error.textContent = problem.message; }
  });
  dialog.append(form); document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  dialog.showModal();
}
