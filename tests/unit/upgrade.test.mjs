import test from "node:test";
import assert from "node:assert/strict";
import { readingChunks, retrieveContext, evidenceExcerpts } from "../../src/domain/context.js";
import { DigestAIService } from "../../src/ai/service.js";
import { createDocument } from "../../src/domain/documents.js";
import {
  documentSnapshot,
  validateEvidence,
} from "../../src/domain/evidence.js";
import { outputFor } from "../fixtures/reading-output.mjs";
import {
  parseFeedback,
  feedbackMessages,
  prepareFeedbackContext,
  generateFeedback,
} from "../../src/domain/training.js";
import { IDBFactory } from "fake-indexeddb";
import {
  openDatabase,
  saveDocument,
  getSetting,
  putSetting,
} from "../../src/data/db.js";
import { ReadingRepository } from "../../src/data/reading-repository.js";
import { AnalysisSession } from "../../src/ai/analysis-session.js";
import { exportBackup, restoreBackup } from "../../src/data/backup.js";

async function source() {
  return documentSnapshot(
    createDocument({
      rawContent:
        "Alpha source statement. ".repeat(650) +
        "\n\nBeta concluding statement. ".repeat(350),
    }),
  );
}
function fixture(messages) {
  const prompt = JSON.parse(messages.find((m) => m.role === "user").content);
  if (prompt.claims)
    return JSON.stringify({
      summary: "Synthesis based on both sections.",
      points: [
        {
          text: "Check the two related claims.",
          claimIds: prompt.claims.slice(0, 2).map((c) => c.id),
        },
      ],
    });
  return JSON.stringify(
    outputFor({ ...prompt.document, readingMode: prompt.readingMode }),
  );
}
test("chunking preserves every character including an oversized paragraph and original indices", async () => {
  const s = await source(),
    chunks = readingChunks(s.paragraphs);
  assert.ok(chunks.length > 1);
  assert.ok(
    chunks.every((c) => c.reduce((n, p) => n + p.text.length, 0) <= 10000),
  );
  for (const p of s.paragraphs)
    assert.equal(
      chunks
        .flat()
        .filter((x) => x.paragraphIndex === p.paragraphIndex)
        .map((x) => x.text)
        .join(""),
      p.text,
    );
});
test("evidence ambiguity is checked against the full paragraph, not just a retrieval window", async () => {
  const s = await source();
  const p = readingChunks(s.paragraphs)[0][0];
  assert.equal(
    validateEvidence(
      { paragraphIndex: p.paragraphIndex, quote: "Alpha source statement." },
      s,
      "a",
    ).validationStatus,
    "ambiguous",
  );
});
test("failed second section resumes from persisted checkpoint, with globally unique ids and synthesis", async () => {
  const s = await source();
  let checkpoint,
    calls = 0;
  const first = new DigestAIService({
    request: async (m) => {
      if (++calls === 2) throw Error("network");
      return fixture(m);
    },
  });
  first.options = {
    load: async () => checkpoint,
    save: async (v) => (checkpoint = structuredClone(v)),
  };
  await assert.rejects(first.analyze(s, { requestId: "first" }), /network/);
  assert.equal(checkpoint.parts.length, 1);
  const retry = new DigestAIService({
    request: async (m) => {
      calls++;
      return fixture(m);
    },
  });
  retry.options = first.options;
  const result = await retry.analyze(s, { requestId: "retry" });
  const claims = Object.values(result.result.sections).flatMap((s) => s.items);
  assert.equal(result.result.scope.partial, false);
  assert.ok(result.result.overview.summary);
  assert.equal(new Set(claims.map((c) => c.id)).size, claims.length);
  assert.equal(
    new Set(result.anchors.map((a) => a.id)).size,
    result.anchors.length,
  );
  assert.equal(calls, readingChunks(s.paragraphs).length + 2);
});
test("checkpoint invalidates on source revision, range or output language changes", async () => {
  const s = await source();
  let checkpoint;
  const requests = [];
  const run = async (opts) => {
    const service = new DigestAIService({
      request: async (m) => {
        requests.push(m);
        return fixture(m);
      },
    });
    service.options = {
      load: async () => checkpoint,
      save: async (v) => (checkpoint = structuredClone(v)),
      ...opts,
    };
    return service.analyze(s, { requestId: crypto.randomUUID() });
  };
  await run({ start: 1, end: 1, language: "en" });
  const n = requests.length;
  const result = await run({ start: 0, end: 0, language: "zh-CN" });
  assert.ok(requests.length > n);
  assert.equal(result.result.scope.partial, true);
  const user = JSON.parse(
    requests.at(-1).find((m) => m.role === "user").content,
  );
  assert.equal(user.outputLanguage, "zh-CN");
  s.sourceRevision = "changed";
  const before = requests.length;
  await run({ start: 0, end: 0, language: "zh-CN" });
  assert.ok(requests.length > before);
});
test("cancellation cannot save ignored transport response to checkpoint", async () => {
  const s = await source(),
    controller = new AbortController();
  let saves = 0;
  const service = new DigestAIService({
    request: async (m) => {
      controller.abort();
      return fixture(m);
    },
  });
  service.options = { save: async () => saves++ };
  await assert.rejects(
    service.analyze(s, { requestId: "cancel", signal: controller.signal }),
    { name: "AbortError" },
  );
  assert.equal(saves, 0);
});
test("oversized full reading is bounded before any model request", async () => {
  const s = await documentSnapshot(
    createDocument({ rawContent: "a".repeat(130001) }),
  );
  let calls = 0;
  await assert.rejects(
    new DigestAIService({ request: () => calls++ }).analyze(s, {
      requestId: "huge",
    }),
    /12/,
  );
  assert.equal(calls, 0);
});
test("lexical retrieval reaches relevant late paragraphs and exposes limited scope", async () => {
  const s = await documentSnapshot(
    createDocument({
      rawContent: Array.from({ length: 40 }, (_, i) =>
        i === 39
          ? "Authenticity depends on sponsorship disclosure."
          : "Background story " + i + " unrelated material.".repeat(150),
      ).join("\n\n"),
    }),
  );
  const r = retrieveContext([s], "authenticity sponsorship disclosure", 6000);
  assert.ok(r.documents[0].paragraphs.some((p) => p.paragraphIndex === 39));
  assert.ok(r.scope.partial);
  assert.ok(r.scope.selectedCharacters <= 6000);
  assert.equal(s.paragraphs.length, 40);
});
test("chunked reading persists and survives backup restore with evidence identities intact", async () => {
  const db = await openDatabase(new IDBFactory());
  const doc = createDocument({
    rawContent:
      "First unique statement.\n\n" +
      "Very long context. ".repeat(700) +
      "\n\nFinal unique conclusion.",
  });
  await saveDocument(doc, db);
  const s = await documentSnapshot(doc);
  const service = new DigestAIService({ request: async (m) => fixture(m) });
  service.options = {
    save: (v) => putSetting("reading-progress:" + doc.id, v, db),
    load: () => getSetting("reading-progress:" + doc.id, db),
  };
  const result = await new AnalysisSession(new ReadingRepository(db)).run(
    s,
    service,
  );
  const backup = await exportBackup(db);
  const target = await openDatabase(new IDBFactory());
  await restoreBackup(target, backup);
  const restored = await new ReadingRepository(target).load(s);
  assert.deepEqual(restored.result.scope, result.result.scope);
  assert.deepEqual(restored.result.overview, result.result.overview);
  assert.equal(restored.anchors.length, result.anchors.length);
  db.close();
  target.close();
});
test("feedback request declares requested language and retrieved scope", async () => {
  const doc = createDocument({ rawContent: "One genuine course statement." });
  const context = await prepareFeedbackContext(
    { documentIds: [doc.id], prompt: "Explain this statement" },
    { id: "c", title: "Course" },
    [doc],
    "My own answer",
  );
  context.outputLanguage = "en";
  const prompt = JSON.parse(feedbackMessages(context)[1].content);
  assert.equal(prompt.outputLanguage, "en");
  assert.equal(prompt.retrievalScope.partial, false);
  assert.throws(() => parseFeedback({ overall: "Incomplete" }));
});

test("excerpt identities stay unique across windows and retain exact PDF whitespace", () => {
  const paragraph = { paragraphIndex: 3, text: "A\nPDF  sentence. ".repeat(1200) };
  const windows = readingChunks([paragraph]).flat();
  const excerpts = windows.flatMap(evidenceExcerpts);
  assert.equal(new Set(excerpts.map(e => e.id)).size, excerpts.length);
  for (const e of excerpts) {
    const offset = Number(e.id.split('-s')[1]);
    assert.equal(paragraph.text.slice(offset, offset + e.quote.length), e.quote);
  }
});

test("feedback accepts genuine excerpt ids and rejects forged or mismatched paragraph ids", async () => {
  const doc = createDocument({ rawContent: "The first paragraph contains exact\nPDF whitespace.\n\nA distinct second paragraph." });
  const context = await prepareFeedbackContext({documentIds:[doc.id],prompt:'Explain'}, {id:'c'}, [doc], 'My answer.');
  const excerpt = evidenceExcerpts(context.retrieval.documents[0].paragraphs[0])[0];
  const item = {type:'gap',userAnswerQuote:'My answer.',explanation:'Check this',support:'supported',suggestedAction:'Revise',evidenceCandidates:[]};
  for (const [paragraphIndex, quoteId, valid] of [[0,excerpt.id,true],[0,'p0-s999999',false],[1,excerpt.id,false]]) {
    const result = await generateFeedback(context, {request:async()=>JSON.stringify({overall:'Check',strengths:[],gaps:[{...item,evidenceCandidates:[{documentId:doc.id,paragraphIndex,quoteId}]}],suggestedNextStep:'Revise'})},'f');
    assert.equal(result.anchors[0].validationStatus === 'matched', valid);
    assert.equal(result.feedback.gaps[0].support, valid ? 'supported' : 'no_evidence');
  }
});

test("stale and cancelled requests cannot replace a newer reading checkpoint", async () => {
  const db = await openDatabase(new IDBFactory());
  const doc = createDocument({rawContent:'A unique source statement.'});
  await saveDocument(doc,db);
  const snapshot = await documentSnapshot(doc), repo = new ReadingRepository(db);
  const key = 'reading-progress:'+doc.id;
  await repo.begin(snapshot,'old');
  await repo.begin(snapshot,'new');
  await repo.saveCheckpoint(snapshot,key,{parts:['new']},'new');
  await assert.rejects(repo.saveCheckpoint(snapshot,key,{parts:['old']},'old'));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(repo.saveCheckpoint(snapshot,key,{parts:['cancelled']},'new',controller.signal));
  assert.deepEqual((await getSetting(key,db)).parts,['new']);
  db.close();
});
