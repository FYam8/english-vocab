import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const BASE=process.env.V75_TEST_URL||'http://127.0.0.1:4173/index.html';
const label=process.env.V75_PASS||'CONTENT-PASS';
const browser=await chromium.launch({headless:true});
const context=await browser.newContext();
const page=await context.newPage();
const pageErrors=[],consoleErrors=[];
page.on('pageerror',e=>pageErrors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});
try{
 await page.goto(BASE,{waitUntil:'domcontentloaded'});
 await page.waitForSelector('#startBtn');
 const check=await page.evaluate(()=>{
   function sample(id,year){
     state.settings.year=String(year);
     const v=VOCAB_BY_ID.get(id);
     const selected=selectExamExample(v,String(year));
     const html=examExampleHTML(v);
     return {
       year:selected.example&&selected.example.year,
       mode:selected.example&&selected.example.mode,
       matched:selected.example&&selected.example.matchedForm,
       sentence:selected.example&&selected.example.sentence,
       html
     };
   }
   const silent=[];
   for(const v of VOCAB){
     for(const y of (v.years||[])){
       state.settings.year=String(y);
       const selected=selectExamExample(v,String(y));
       const html=examExampleHTML(v);
       if(!selected.example){silent.push(`${v.id}:${y}:missing`);continue}
       if(Number(selected.example.year)!==Number(y)){
         if(!html.includes(`${y}年度にも確認されています`)||!html.includes(`代表例として${selected.example.year}年度`))silent.push(`${v.id}:${y}:silent-fallback`);
       }
     }
   }
   return {
     believe:sample('w3032116916',2019),
     lot:sample('w1094248838',2026),
     close:sample('w1284177306',2024),
     silent,
     translations:{
       help:EXAM_EXAMPLES['p3099442518'].ja,
       dry:EXAM_EXAMPLES['p4217966614'].ja,
       effort:EXAM_EXAMPLES['w1688387771'].ja,
       difference:EXAM_EXAMPLES['w2780795386'].ja,
       participation:EXAM_EXAMPLES['w91071520037954'].ja,
       disappear:EXAM_EXAMPLES['w2106363633'],
       environment:EXAM_EXAMPLES['w0288940764'],
       magpie:EXAM_EXAMPLES['w1452406406']
     }
   };
 });
 assert.equal(check.believe.year,2019);assert.equal(check.believe.sentence,'Who would believe such a stupid story?');
 assert.equal(check.lot.year,2026);assert.match(check.lot.sentence,/a lot of people/);
 assert.equal(check.close.year,2024);assert.equal(check.close.matched,'closely');assert.match(check.close.html,/派生形 closely/);
 assert.deepEqual(check.silent,[],'silent selected-year fallback exists');
 assert.equal(check.translations.help,'私は歴史で一番助けが必要です。');
 assert.match(check.translations.dry,/雨の降らない天気/);assert.ok(!check.translations.dry.includes('晴天'));
 assert.equal(check.translations.effort,'「あなたが努力しても何も変わりません。」');
 assert.equal(check.translations.difference,'「あなたが努力しても何も変わりません。」');
 assert.equal(check.translations.participation,'「参加を妨げるものはすべて取り除くべきです。」');
 assert.equal(check.translations.disappear.mode,'completed');assert.match(check.translations.disappear.note,/公式解答 bass/);assert.match(check.translations.disappear.sentence,/losing the bass/);
 assert.equal(check.translations.environment.mode,'completed');assert.match(check.translations.environment.sentence,/worried.*have a hard time.*warmer environment/);
 assert.equal(check.translations.magpie.mode,'completed');assert.match(check.translations.magpie.sentence,/was helping out another magpie/);
 assert.deepEqual(pageErrors,[]);assert.deepEqual(consoleErrors,[]);
 console.log(`${label}: CONTENT CLEAN`);
} finally {await browser.close();}
