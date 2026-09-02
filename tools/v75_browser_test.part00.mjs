import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const BASE = process.env.V75_TEST_URL || 'http://127.0.0.1:4173/index.html';
const browser = await chromium.launch({headless:true});
const context = await browser.newContext();
const page = await context.newPage();
const pageErrors=[];
const consoleErrors=[];
page.on('pageerror', e=>pageErrors.push(String(e)));
page.on('console', m=>{ if(m.type()==='error') consoleErrors.push(m.text()); });

async function openFresh(){
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>{
    localStorage.removeItem('waseshibu_vocab_state');
    localStorage.removeItem('waseshibu_vocab_active_session_v1');
  });
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForSelector('#startBtn');
  const overlay=page.locator('#sheetOverlay.show');
  if(await overlay.count()){
    const finish=page.locator('#finishActiveBtn');
    if(await finish.count()) await finish.click();
  }
}
async function start(mode='recommended',size='10',year='all'){
  await page.selectOption('#modeSelect',mode);
  await page.selectOption('#sessionSizeSelect',size);
  await page.selectOption('#learnYearSelect',year);
  await page.click('#startBtn');
  await page.waitForFunction(()=>session&&session.active&&currentQuestion);
}
async function answerCorrect(){
  await page.evaluate(()=>{
    if(!currentQuestion||questionResolved)return;
    const v=currentQuestion.v;
    currentQuestion.selectedChoiceId=v.id;
    applyOutcome(v,'got');
    showFeedback(v,true);
  });
}
async function next(){ await page.evaluate(()=>nextQuestion()); }
async function resumeAfterReload(){
  await page.waitForSelector('#resumeActiveBtn',{timeout:5000});
  await page.click('#resumeActiveBtn');
  await page.waitForFunction(()=>session&&session.active&&currentQuestion);
}
function backupBuffer(obj){return Buffer.from(JSON.stringify(obj,null,2),'utf8')}

try{
  // Static/runtime invariants.
  await openFresh();
  const invariants=await page.evaluate(()=>({
    vocab:VOCAB.length,
    learnable:VOCAB.filter(v=>(v.studyLayer||'core')!=='reference').length,
    reference:VOCAB.filter(v=>(v.studyLayer||'core')==='reference').length,
    schema:SCHEMA_VERSION,
    data:META.dataVersion,
    duplicateIds:VOCAB.length-new Set(VOCAB.map(v=>v.id)).size,
    storageKey:STORAGE_KEY
  }));
  assert.deepEqual(invariants,{vocab:680,learnable:634,reference:46,schema:7,data:'2019-2026-v7.5-user-test-remediation',duplicateIds:0,storageKey:'waseshibu_vocab_state'});

  // VOC-01: fresh 75-point challenge, two independent sets.
  for(let i=0;i<2;i++){
    await openFresh();
    await start('75','10','all');
    const plan=await page.evaluate(()=>{
      const layers=session.baseQueueIds.map(id=>(VOCAB_BY_ID.get(id).studyLayer||'core'));
      return {n:layers.length,challenge:layers.filter(x=>x==='challenge').length,reference:layers.filter(x=>x==='reference').length};
    });
    assert.equal(plan.n,10);
    assert.ok(plan.challenge>=8,`challenge ratio too low: ${plan.challenge}/${plan.n}`);
    assert.equal(plan.reference,0);
    await page.evaluate(()=>endSession(true));
  }

  // VOC-01: existing history may inject at most 20% explicit foundation checks.
  await openFresh();
  await page.evaluate(()=>{
    const core=VOCAB.filter(v=>(v.studyLayer||'core')==='core').slice(0,2);
    core.forEach(v=>{const p=getProgress(v.id);p.nextReview=new Date(Date.now()-60000).toISOString();p.recentMistakeUntil=new Date(Date.now()+86400000).toISOString();});
    saveState();
  });
  await start('75','10','all');
  const existingPlan=await page.evaluate(()=>{
    const layers=session.baseQueueIds.map(id=>(VOCAB_BY_ID.get(id).studyLayer||'core'));
    const exceptions=session.baseQueueIds.filter(id=>(VOCAB_BY_ID.get(id).studyLayer||'core')!=='challenge');
    return {challenge:layers.filter(x=>x==='challenge').length,n:layers.length,exceptions,reasons:exceptions.map(id=>session.baseReasons[id]||'')};
  });
  assert.ok(existingPlan.challenge/existingPlan.n>=0.8);
  assert.ok(existingPlan.exceptions.length<=2);
  assert.ok(existingPlan.reasons.every(Boolean));
  if(existingPlan.exceptions.length){
    await page.evaluate(()=>{
      const id=Object.keys(session.baseReasons)[0];
      currentQuestion.reason=session.baseReasons[id];
      v75RenderCurrentQuestion();
    });
    assert.match(await page.locator('#qTypeLabel').textContent(),/挑戦前の基礎確認/);
  }
  await page.evaluate(()=>endSession(true));

  // 75-point year filters: ratio remains >=80%, or session shrinks rather than water-filling.
  for(const year of ['2019','2020','2021','2022','2023','2024','2025','2026']){
    await openFresh();
    await start('75','10',year);
    const p=await page.evaluate(()=>({
      n:session.baseQueueIds.length,
      c:session.baseQueueIds.filter(id=>(VOCAB_BY_ID.get(id).studyLayer||'core')==='challenge').length,
      refs:session.baseQueueIds.filter(id=>(VOCAB_BY_ID.get(id).studyLayer||'core')==='reference').length
    }));
    assert.ok(p.n>0,`no challenge candidates for ${year}`);
    assert.ok(p.c/p.n>=0.8,`${year}: ${p.c}/${p.n}`);
    assert.equal(p.refs,0);
    await page.evaluate(()=>endSession(true));
  }

  // VOC-03: review candidate shortage becomes a normal four-base-question session.
  await openFresh();
  const dueIds=await page.evaluate(()=>{
    const ids=VOCAB.filter(v=>(v.studyLayer||'core')!=='reference').slice(0,4).map(v=>v.id);
    state.words={};
    ids.forEach(id=>{const p=getProgress(id);p.nextReview=new Date(Date.now()-60000).toISOString();});
    saveState();return ids;
  });
  await start('review','10','all');
  const shortage=await page.evaluate(()=>({actual:session.actualSessionSize,queue:session.baseQueueIds.slice()}));
  assert.equal(shortage.actual,4);
  assert.equal(shortage.queue.length,4);
  assert.deepEqual(new Set(shortage.queue),new Set(dueIds));
  for(let i=0;i<4;i++){
    await answerCorrect();
    await next();
    if(i<3) await page.waitForFunction(()=>session&&currentQuestion&&!questionResolved);
  }
  await page.waitForFunction(()=>session===null);
  assert.match(await page.locator('#sheetContent').textContent(),/セッション結果/);
  assert.match(await page.locator('#sheetContent').textContent(),/基本問題/);
