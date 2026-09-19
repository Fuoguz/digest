import { chromium } from 'playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { policy } from '../fixtures/real-model-cases.mjs';
const a=JSON.parse(await readFile(process.env.DIGEST_QA_ACCESS||'.vercel/qa-access.json','utf8'));
const out='qa-artifacts/preview';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const ctx=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true,reducedMotion:'reduce'});
let page=await ctx.newPage();const checks=[],errors=[],failedResources=[];
page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()===404)failedResources.push(new URL(r.url()).pathname)});
page.setDefaultTimeout(15000);
const pass=s=>{checks.push(s);console.log('PASS',s)};
let taskURL,completedURL;
try{
 await page.goto(a.base+'/?_vercel_share='+encodeURIComponent(a.share),{timeout:60000});
 for(const path of ['/','/app','/app/library','/app/courses','/app/review','/app/graph']){await page.goto(a.base+path);assert.equal(await page.locator('body').count(),1)}
 assert.equal(await page.evaluate(async()=>{const r=await fetch('/vendor/pdfjs/pdf.mjs');return r.status}),200);
 pass('Public routes and PDF.js resource load');
 await page.goto(a.base+'/app/courses');
 await page.getByLabel('课程名称',{exact:true}).fill('AI政策阅读 · 真实Preview验收');
 await page.getByRole('button',{name:'创建课程',exact:true}).click();await page.waitForURL('**/app/courses/*');const courseURL=page.url();
 await page.getByRole('button',{name:'导入资料',exact:false}).click();await page.locator('#import-title').fill('生成式人工智能服务管理暂行办法第二、三条');await page.locator('#import-content').fill(policy);await page.getByRole('button',{name:'保存到资料库',exact:true}).click();await page.waitForURL('**/app/library');
 await page.goto(courseURL);await page.getByRole('checkbox',{name:'生成式人工智能服务管理暂行办法第二、三条'}).check();await page.getByRole('button',{name:'保存课程',exact:true}).click();
 await page.getByLabel('任务名称',{exact:true}).fill('内部大学研究是否适用');await page.getByLabel('需要回答的问题',{exact:true}).fill('根据第二条说明，仅在大学内部研发、不向境内公众提供服务时，本办法是否适用？解释关键条件。');await page.getByRole('button',{name:'创建任务',exact:true}).click();await page.waitForURL('**/app/tasks/*');taskURL=page.url();
 const original='大学在境内，所以只要使用生成式人工智能就一定适用本办法。';
 const real=process.env.DIGEST_REAL_UI==='1';
 if(real){
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:900});await page.goto(taskURL+'?attempt=new');await page.getByLabel('先写下你自己的答案',{exact:true}).fill(original);await page.getByRole('button',{name:'保存答案并获取反馈',exact:true}).click();
   if(width===1440){await page.getByLabel('试用码',{exact:true}).fill(a.code);await page.getByRole('button',{name:'验证并继续',exact:true}).click();}
   await page.getByRole('heading',{name:'具体缺口',exact:true}).waitFor({timeout:180000});completedURL=page.url();
   await page.screenshot({path:out+'/feedback-'+width+'.png',fullPage:true});await page.getByRole('link',{name:/查看课程依据/}).first().click();await page.locator('mark').first().waitFor();
   await page.getByRole('link',{name:'← 返回学习任务'}).click();await page.getByLabel('根据反馈修订答案',{exact:true}).fill('根据第二条，关键是向境内公众提供服务。题设仅在大学内部研发且不面向境内公众，属于条文明确的不适用情况，不能只以大学在境内作判断。');await page.getByLabel('你本次主要修正了什么？',{exact:true}).fill('补上面向公众的适用条件，纠正按机构所在地直接判断。');await page.getByRole('button',{name:'保存修订并完成本次练习',exact:true}).click();await page.getByRole('heading',{name:'本次修订已完成'}).waitFor();
   await page.reload();await page.getByRole('heading',{name:'本次修订已完成'}).waitFor();assert.equal(await page.locator('.training-feedback > .training-prose').first().innerText(),original);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:out+'/complete-'+width+'.png',fullPage:true});pass(width+' real answer → feedback → evidence → revision → reload');
  }
  const reopen=await ctx.newPage();await reopen.goto(completedURL);await reopen.getByRole('heading',{name:'本次修订已完成'}).waitFor();await reopen.close();pass('Reopened page preserves completed Attempt');
 }
 // Failure injection is explicitly browser simulated, never claimed as model acceptance.
 for(const mode of ['400','429','500','503','504','network','malformed','missing','empty']){
  await page.route('**/api/digest',route=>mode==='network'?route.abort('failed'):route.fulfill({status:/^\d/.test(mode)?Number(mode):200,contentType:'application/json',body:JSON.stringify(/^\d/.test(mode)?{message:'验收模拟错误'}:{text:mode==='malformed'?'not-json':mode==='empty'?'':'{}'})}));
  await page.goto(taskURL+'?attempt=new');await page.getByLabel('先写下你自己的答案',{exact:true}).fill('公网故障验收 '+mode);await page.getByRole('button',{name:'保存答案并获取反馈',exact:true}).click();await page.locator('.inline-feedback.is-error').waitFor();await page.getByRole('button',{name:'获取反馈 / 重试',exact:true}).waitFor();await page.reload();await page.getByText('公网故障验收 '+mode,{exact:true}).waitFor();assert.equal(await page.getByRole('heading',{name:'反馈',exact:true}).count(),0);await page.unroute('**/api/digest');pass('Simulated '+mode+' preserves input and retry');
 }
 await page.route('**/api/digest',()=>{});await page.goto(taskURL+'?attempt=new');await page.getByLabel('先写下你自己的答案',{exact:true}).fill('取消不丢答案');await page.getByRole('button',{name:'保存答案并获取反馈',exact:true}).click();await page.getByRole('button',{name:'取消反馈',exact:true}).click();await page.getByText('已取消，首次答案与已有反馈保留。',{exact:true}).waitFor();await page.reload();await page.getByText('取消不丢答案',{exact:true}).waitFor();await page.unroute('**/api/digest');pass('Slow request cancellation persists input');
 if(completedURL){await page.goto(completedURL);await page.getByRole('heading',{name:'本次修订已完成'}).waitFor();pass('Old successful Feedback remains after later failures')}
 for(const width of [1440,390]){await page.setViewportSize({width,height:900});for(const path of ['/','/app','/app/library','/app/review']){await page.goto(a.base+path);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));} }pass('Desktop/mobile public routes have no overflow');
 assert.deepEqual(errors,[]);assert.deepEqual(failedResources,[]);pass('No uncaught JS errors or resource 404s');
}catch(e){console.log('FAIL',e.message);errors.push(e.message);await page.screenshot({path:out+'/failure.png',fullPage:true});process.exitCode=1;
}finally{await writeFile(out+'/'+(process.env.DIGEST_REAL_UI==='1'?'real':'failure')+'-results.json',JSON.stringify({base:a.base,date:new Date().toISOString(),checks,errors,failedResources},null,2));await browser.close();}
