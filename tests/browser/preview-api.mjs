import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const a=JSON.parse(await readFile(process.env.DIGEST_QA_ACCESS||'.vercel/qa-access.json','utf8'));
await mkdir('qa-artifacts/preview',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const ctx=await browser.newContext();const page=await ctx.newPage();const checks=[];
try{
 await page.goto(a.base+'/?_vercel_share='+encodeURIComponent(a.share));await page.goto(a.base+'/app/');
 const statuses=await page.evaluate(async code=>{
  const post=async(path,body)=>(await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).status;
  return {anonymous:await post('/api/digest',{messages:[]}),login:await post('/api/access',{code}),invalid:await post('/api/digest',{messages:[]}),get:(await fetch('/api/digest')).status};
 },a.code);
 assert.deepEqual(statuses,{anonymous:401,login:200,invalid:400,get:405});checks.push({actualServerStatuses:statuses});
 await page.route('**/api/digest',()=>{});
 const deadline=await page.evaluate(async()=>{const {ProxyTransport}=await import('/src/ai/proxy-transport.js');const start=performance.now();try{await new ProxyTransport('digest',{timeoutMs:50}).request([{role:'user',content:'deadline test; intercepted, never sent upstream'}]);return {error:false};}catch(e){return {error:true,code:e.code,message:e.message,elapsed:performance.now()-start}}});
 assert.equal(deadline.error,true);assert.ok(deadline.elapsed<3000);checks.push({deployedClientDeadlineWithInjected50ms:deadline});
 await writeFile('qa-artifacts/preview/api-results.json',JSON.stringify(checks,null,2));console.log(JSON.stringify(checks));
}finally{await browser.close();}
