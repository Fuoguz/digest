// Explicit QA fixture; injected only by mock-ai-server with ?qaStorage=1.
const original = IDBDatabase.prototype.transaction;
let failNext = false;
IDBDatabase.prototype.transaction = function (...args) {
  if (failNext && args[1] === 'readwrite') {
    failNext = false;
    throw new DOMException('QA 模拟：本地存储空间不足', 'QuotaExceededError');
  }
  return original.apply(this, args);
};
const trigger = document.createElement('button');
trigger.textContent = 'QA：下一次写入失败';
trigger.style.cssText = 'position:fixed;top:0;right:0;z-index:9999;background:#ffe48c;';
trigger.addEventListener('click', () => { failNext = true; trigger.textContent = 'QA：已准备写入失败'; });
document.body.append(trigger);
