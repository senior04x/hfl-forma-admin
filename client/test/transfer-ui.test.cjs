const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
test('captain transfer page: login, search, single submit, status and mobile layout',async()=>{
 const root=path.resolve(__dirname,'..');
 const allowed={'/transfers.html':'text/html','/css/transfers.css':'text/css',
   '/js/transfers.mjs':'text/javascript','/js/transfer-api.mjs':'text/javascript','/favicon.svg':'image/svg+xml'};
 const server=http.createServer((req,res)=>{
   const pathname=new URL(req.url,'http://localhost').pathname;
   if(!allowed[pathname]){res.writeHead(404);res.end();return;}
   res.setHeader('Content-Type',allowed[pathname]);res.end(fs.readFileSync(path.join(root,pathname)));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,...(process.env.TRANSFER_BROWSER_PATH?{executablePath:process.env.TRANSFER_BROWSER_PATH}:{})});
 try{
   const page=await browser.newPage({viewport:{width:1366,height:960}});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   let submitted=0,windowOpen=true,expired=false,chooseTeam=true;
   const records=[];
   const player={id:'00000000-0000-4000-8000-000000000040',first_name:'Ali',last_name:'Valiyev',team_name:'Bunyodkor',has_pending:false};
   await page.route('**/*',async route=>{
     const url=route.request().url();
     if(url.startsWith('http://127.0.0.1:')) return route.continue();
     if(!url.startsWith('https://xzzyhfyazwohdqqbjiiy.supabase.co/functions/v1/')) return route.abort();
     const body=route.request().postDataJSON();let data,status=200;
     if(url.endsWith('/verify-otp')){
       if(chooseTeam&&!body.team_id){status=409;data={error:'Select your captain team',teams:[{id:'team',name:'Paxtakor'}]};}
       else data={sessionToken:'a'.repeat(64),expiresAt:new Date(Date.now()+86400000).toISOString(),team:{id:'team',name:'Paxtakor'}};
     }else{
       assert.equal(route.request().headers().authorization,'Bearer '+'a'.repeat(64));
       if(expired){status=401;data={error:'Invalid session'};}
       else if(url.endsWith('/request-transfer')){
         submitted++;assert.deepEqual(body,{player_id:player.id,reason:'Hujum chizig‘ini kuchaytirish'});
         records.unshift({id:'request',player_name:'Ali Valiyev',old_team_name:'Bunyodkor',status:'pending',created_at:new Date().toISOString(),reason:body.reason});
         await new Promise(resolve=>setTimeout(resolve,80));data={success:true,transfer:records[0]};
       }else if(body.action==='context') data={team:{id:'team',name:'Paxtakor'},transfer_window_open:windowOpen};
       else if(body.action==='players') data={items:[{...player,has_pending:submitted>0},
         {id:'hostile',first_name:'<img src=x onerror=alert(1)>',last_name:'Test',team_name:'X',has_pending:true}],next_cursor:null};
       else if(body.action==='history')data={items:records,next_cursor:null};
       else data={success:true};
     }
     await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data),headers:{'Access-Control-Allow-Origin':'*'}});
   });
   const url=`http://127.0.0.1:${server.address().port}/transfers.html`;
   await page.goto(url);
   await page.fill('#phone','+998 90 123 45 67');await page.fill('#otp','1234');
   await page.click('#login-submit');await page.waitForSelector('#team-choice:not([hidden])');
   await page.click('#login-submit');await page.waitForSelector('#workspace:not([hidden])');
   await page.waitForFunction(()=>document.querySelector('#history-status').textContent.includes('Hozircha'));
   await page.fill('#player-query','Al');await page.waitForSelector('#players button');
   assert.equal(await page.locator('#players img').count(),0);
   await page.locator('#players button').first().click();await page.fill('#reason','Hujum chizig‘ini kuchaytirish');
   await page.locator('#request-form').evaluate(form=>{form.requestSubmit();form.requestSubmit();});
   await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('Ariza yuborildi'));
   assert.equal(submitted,1);
   await page.waitForSelector('#history li');
   assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);
   const out=process.env.TRANSFER_SCREENSHOT_DIR;
   if(out){fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,'transfers-desktop.png'),fullPage:true});}
   records[0].status='approved';await page.click('#refresh-history');
   await page.waitForFunction(()=>document.querySelector('#history').textContent.includes('Tasdiqlangan'));
   windowOpen=false;await page.click('#refresh-history');
   await page.waitForFunction(()=>document.querySelector('#window-status').textContent.includes('yopiq'));
   assert.equal(await page.locator('#players button').first().isDisabled(),true);
   await page.setViewportSize({width:390,height:844});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   if(out)await page.screenshot({path:path.join(out,'transfers-mobile.png'),fullPage:true});
   expired=true;await page.click('#refresh-history');await page.waitForSelector('#login-panel:not([hidden])');
   assert.equal(await page.locator('#workspace').isVisible(),false);
   if(out)await page.screenshot({path:path.join(out,'transfers-login.png'),fullPage:true});
   assert.deepEqual(errors,[]);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
