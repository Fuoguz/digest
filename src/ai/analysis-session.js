import { makeId } from '../domain/documents.js';

export class AnalysisSession {
  constructor(repository) { this.repository = repository; this.current = null; }
  cancel() { this.current?.controller.abort(); this.current = null; }
  async run(snapshot, service) {
    this.cancel();
    const job = { controller: new AbortController(), requestId: makeId('reading') };
    this.current = job;
    const signal = job.controller.signal;
    try {
      await this.repository.begin(snapshot, job.requestId, signal);
      const payload = await service.analyze(snapshot, { signal, requestId: job.requestId });
      signal.throwIfAborted();
      if (this.current !== job) throw new DOMException('Superseded', 'AbortError');
      await this.repository.commit(snapshot, payload, signal);
      signal.throwIfAborted();
      return payload;
    } finally { if (this.current === job) this.current = null; }
  }
}
