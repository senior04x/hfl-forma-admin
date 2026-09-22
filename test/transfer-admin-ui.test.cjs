const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');

test('admin UI: guarded single update, failures, immutable team decisions and pagination',async()=>{
 const root=path.resolve(__dirname,'../admin');
 const fixture=path.join(root,`.transfer-ui-test-${process.pid}.html`);
 const {createServer}=await import(pathToFileURL(path.join(root,'node_modules/vite/dist/node/index.js')).href);
 let server,browser;
 try {
  fs.writeFileSync(fixture,`<html><body><div id="root"></div><script type="module">
   import React from 'react'; import {createRoot} from 'react-dom/client';
   import Transfers from '/src/pages/Transfers.jsx';
   createRoot(document.getElementById('root')).render(React.createElement(Transfers));
   </script></body></html>`);
  server=await createServer({root,configFile:false,logLevel:'error',server:{host:'127.0.0.1',port:0}});
  await server.listen();
  browser=await chromium.launch({headless:true,...(process.env.TRANSFER_BROWSER_PATH?{executablePath:process.env.TRANSFER_BROWSER_PATH}:{})});
  const page=await browser.newPage();const errors=[],dialogs=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{dialogs.push(d.message());await d.accept();});
  await page.addInitScript(()=>{
   window.mock={writes:[],reads:[],failWrite:true,records:Array.from({length:32},(_,i)=>({
    id:String(i),organization_id:7,player_name:'Player '+i,player_photo:'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
    old_team_name:'Old',new_team_name:'New',reason:'Reason',status:'pending',requested_by_team_id:'team',
    created_at:'2026-09-22T00:00:00Z'}))};
  });
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.hostname!=='127.0.0.1')return route.abort();
   if(url.pathname.startsWith('/src/context/OrgContext')) return route.fulfill({contentType:'text/javascript',body:
    `export const useOrg=()=>({orgId:7,currentOrg:{name:'Test'}});`});
   if(url.pathname.startsWith('/src/supabaseClient'))return route.fulfill({contentType:'text/javascript',body:`
    export const supabase={from(table){
     let changes,op='read',filters={},start=0,end=30,columns;
     const q={select(c){columns=c;return q;},eq(k,v){filters[k]=v;return q;},order(){return q;},
      range(a,b){start=a;end=b;return q;},single(){return q;},update(v){op='update';changes=v;return q;},
      delete(){op='delete';return q;},then(resolve){return (async()=>{
       if(table==='organizations')return {data:{transfer_window_open:true},error:null};
       if(table!=='transfers')throw Error('Unexpected table '+table);
       const matching=window.mock.records.filter(r=>Object.entries(filters).every(([k,v])=>r[k]===v));
       if(op==='read'){window.mock.reads.push({filters,start,end,columns});return {data:matching.slice(start,end+1),error:null};}
       window.mock.writes.push({table,op,filters,changes});
       await new Promise(r=>setTimeout(r,100));
       if(window.mock.failWrite)return {data:null,error:{message:'private database error'}};
       if(!matching.length)return {data:null,error:{code:'PGRST116'}};
       if(op==='update')Object.assign(matching[0],changes);
       return {data:{id:matching[0].id},error:null};
      })().then(resolve);}};return q;}};`});
   return route.continue();
  });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/${path.basename(fixture)}`);
  await page.waitForSelector('.transfer-card:not(.skeleton-card)');
  assert.equal(await page.locator('.transfer-card').count(),30);
  await page.locator('.action-btn.approve').first().evaluate(b=>{b.click();b.click();});
  await page.waitForFunction(()=>window.mock.writes.length===1);
  await page.waitForFunction(()=>!document.querySelector('.action-btn.approve').disabled);
  assert.equal(dialogs.length,1);assert.ok(!dialogs[0].includes('private database'));
  assert.equal(await page.locator('.transfer-card.pending').count(),30);
  await page.evaluate(()=>{window.mock.failWrite=false;});
  await page.locator('.action-btn.approve').first().evaluate(b=>{b.click();b.click();});
  await page.waitForFunction(()=>window.mock.records[0].status==='approved');
  await page.waitForFunction(()=>!document.querySelector('.skeleton-card')&&!document.querySelector('.transfers-grid').textContent.includes('Player 0'));
  assert.equal(await page.evaluate(()=>window.mock.writes.length),2);
  const write=await page.evaluate(()=>window.mock.writes[1]);
  assert.deepEqual(write.filters,{id:'0',organization_id:7,status:'pending'});
  assert.deepEqual(write.changes,{status:'approved'});
  await page.getByRole('button',{name:'Keyingi',exact:true}).click();
  await page.waitForFunction(()=>window.mock.reads.at(-1).start===30);
  await page.waitForFunction(()=>document.querySelectorAll('.transfer-card:not(.skeleton-card)').length===1);
  await page.locator('.filter-dropdown-trigger').click();
  await page.locator('.filter-dropdown-item').filter({hasText:'Tasdiqlangan'}).click();
  await page.waitForSelector('.transfer-card.approved');
  assert.equal(await page.locator('.transfer-card .action-btn').count(),0); // No reopening a team decision.
  await page.locator('.card-edit-btn:not(.card-delete-btn)').click();
  assert.equal(await page.locator('.transfer-edit-modal select').isDisabled(),true);
  assert.equal(await page.locator('.transfer-edit-modal input[readonly]').count(),2);
  await page.locator('.modal-close-btn').click();
  await page.locator('.filter-dropdown-trigger').click();
  await page.locator('.filter-dropdown-item').filter({hasText:'Kutilmoqda'}).click();
  await page.waitForSelector('.transfer-card.pending');
  await page.locator('.card-edit-btn').first().click();
  await page.locator('.transfer-edit-modal select').selectOption('rejected');
  await page.locator('.btn-save').click();
  await page.waitForSelector('.transfer-edit-modal',{state:'detached'});
  assert.equal(await page.evaluate(()=>window.mock.writes.at(-1).changes.status),'rejected');
  assert.ok((await page.evaluate(()=>window.mock.reads)).every(r=>r.filters.organization_id===7&&r.end-r.start===30&&!r.columns.includes('*')));
  assert.deepEqual(errors,[]);
 } finally {
  if(browser)await browser.close();if(server)await server.close();
  if(fs.existsSync(fixture))fs.unlinkSync(fixture);
 }
});
