// Continue validation from an actual public-browser download; no additional AI spend.
import { chromium } from 'playwright';
import { readFile,writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { assertRestoredStores } from './restore-check.mjs';
const access=JSON.parse(await readFile('.vercel/qa-access.json','utf8'));
const out=process.env.DIGEST_QA_OUT||'qa-artifacts/pilot-20260922/public';
const path=out+'/public-backup.json',backup=JSON.parse(await readFile(path,'utf8'));
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:390,height:900},acceptDownloads:true});
const page=await context.newPage(),errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()===404)errors.push('404 '+new URL(r.url()).pathname)});
try{
 await page.goto(access.base+'/?_vercel_share='+encodeURIComponent(access.share));await page.goto(access.base+'/app/settings');
 await page.getByLabel('选择 Digest JSON 备份').setInputFiles(path);await page.getByText(/已恢复 1 份资料/).waitFor();
 const attempt=backup.stores.attempts.find(a=>a.status==='completed');assert.ok(attempt);
 const taskURL=access.base+'/app/tasks/'+attempt.taskId+'?attempt='+attempt.id;
 await page.goto(taskURL);await page.getByRole('heading',{name:'本次修订已完成'}).waitFor();
 await page.getByRole('link',{name:/查看课程依据/}).first().click();await page.locator('mark').first().waitFor();await page.getByRole('link',{name:'← 返回学习任务'}).click();await page.getByRole('heading',{name:'本次修订已完成'}).waitFor();
 await page.goto(access.base+'/app/settings');const download=page.waitForEvent('download');await page.getByRole('button',{name:'导出完整 JSON 备份',exact:true}).click();const restoredPath=out+'/public-restored-verified.json';await (await download).saveAs(restoredPath);assertRestoredStores(backup,JSON.parse(await readFile(restoredPath,'utf8')));checks.push('Downloaded public backup → fresh empty browser → upload → Evidence/Revision → re-download: all learning fields identical, transient request IDs cleared');
 for(const width of [1440,390]){await page.setViewportSize({width,height:900});for(const route of ['/','/app','/app/library','/app/review','/app/graph','/app/courses/'+attempt.courseId,'/app/tasks/'+attempt.taskId+'?attempt='+attempt.id]){await page.goto(access.base+route);await page.locator('body').waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),width+' '+route);}}checks.push('Public desktop/mobile routes no overflow after restore');
 assert.deepEqual(errors,[]);checks.push('No uncaught JS errors or resource 404s');console.log(checks.join('\n'));
}catch(e){errors.push(e.message);process.exitCode=1;console.log(e.message);}finally{await writeFile(out+'/restore-results.json',JSON.stringify({date:new Date().toISOString(),checks,errors},null,2));await browser.close();}
