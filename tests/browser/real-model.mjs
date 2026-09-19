import { chromium } from 'playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createDocument } from '../../src/domain/documents.js';
import { documentSnapshot } from '../../src/domain/evidence.js';
import { DigestAIService } from '../../src/ai/service.js';
import { prepareFeedbackContext, generateFeedback } from '../../src/domain/training.js';
import { cases } from '../fixtures/real-model-cases.mjs';
// Secrets are supplied in an ignored local file, never in reports or source.
const access=JSON.parse(await readFile(process.env.DIGEST_QA_ACCESS || '.vercel/qa-access.json','utf8'));
const out='qa-artifacts/real-model'; await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext(); const page=await context.newPage();
const results=[];
try {
 await page.goto(access.base+'/?_vercel_share='+encodeURIComponent(access.share),{timeout:60000});
 await page.goto(access.base+'/app/');
 const login=await page.evaluate(async code=>{const r=await fetch('/api/access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})});return {status:r.status,body:await r.text()};},access.code);
 console.log('Pilot access HTTP',login.status); if(login.status!==200)throw Error('Pilot access failed '+login.status);
 let calls=0;
 const transport={async request(messages){calls++; const start=Date.now(); const r=await page.evaluate(async messages=>{try{const r=await fetch('/api/digest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages}),signal:AbortSignal.timeout(175000)});return {status:r.status,body:await r.json()};}catch(e){return {status:0,body:{error:e.message}};}},messages); console.log('Model request',calls,'HTTP',r.status,'ms',Date.now()-start); if(r.status!==200)throw Error(JSON.stringify(r));return r.body.text;}};
 for(const c of cases.filter(c=>!process.env.DIGEST_CASE || c.id===process.env.DIGEST_CASE)){
  const start=Date.now();const doc=createDocument({id:'source-'+c.id,title:c.title||c.id,rawContent:c.source,readingMode:c.mode,sourceUrl:c.sourceUrl});
  try{let output;if(c.mode){output=await new DigestAIService(transport).analyze(await documentSnapshot(doc),{requestId:'acceptance-'+c.id});}else{const task={id:'task-'+c.id,prompt:c.prompt,documentIds:[doc.id]},course={id:'course',title:'公开材料课程验收',description:'只按所给节选评价，允许有依据的不同观点。'};output=await generateFeedback(await prepareFeedbackContext(task,course,[doc],c.answer),transport,'feedback-'+c.id);}
   results.push({id:c.id,expected:c.expected,elapsedMs:Date.now()-start,output});console.log(c.id,'STRUCTURE PASS');
  }catch(e){results.push({id:c.id,expected:c.expected,elapsedMs:Date.now()-start,error:e.message});console.log(c.id,'FAIL',e.message);}
  await writeFile(out+'/'+(process.env.DIGEST_CASE||'results')+'.json',JSON.stringify({base:access.base,date:new Date().toISOString(),calls,results},null,2));
  // Avoid spending on an unavailable upstream. Remaining cases must be marked unexecuted.
  if(results.length>=2 && results.slice(-2).every(x=>x.error))break;
 }
}finally{await browser.close();}
