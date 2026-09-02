import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const BASE = process.env.V76_TEST_URL || 'http://127.0.0.1:4173/index.html';
const PASS = process.env.V76_PASS || 'V76-PASS';
const MAIN_KEY = 'waseshibu_vocab_state';
const ACTIVE_KEY = 'waseshibu_vocab_active_session_v1';
const browser = await chromium.launch({headless:true});
const context = await browser.newContext();
const page = await context.newPage();
const pageErrors=[];
const consoleErrors=[];
page.on('pageerror', e=>pageErrors.push(String(e)));
page.on('console', m=>{ if(m.type()==='error') consoleErrors.push(m.text()); });

const now0 = Date.now();
const iso = ms => new Date(ms).toISOString();
const baseState = {
  schemaVersion:7,
  dataVersion:'2019-2026-v7.5-user-test-remediation',
  words:{
    w90545631866000:{
      mastery:2,correct:2,incorrect:0,streak:2,
      lastStudied:iso(now0-1*86400000),nextReview:iso(now0+3*86400000),
      recentMistakeUntil:null,lastRating:'got',evidence:6,
      recentResults:[{ok:true,type:'choice',at:iso(now0-4*86400000)},{ok:true,type:'reverse',at:iso(now0-1*86400000)}]
    },
    w3032116916:{
      mastery:3,correct:4,incorrect:1,streak:2,
      lastStudied:iso(now0-14*86400000),nextReview:iso(now0),
      recentMistakeUntil:null,lastRating:'got',evidence:10,
      recentResults:[{ok:true,type:'reverse',at:iso(now0-30*86400000)},{ok:true,type:'cloze',at:iso(now0-14*86400000)}]
    }
  },
  stats:{todayKey:'2000-01-01',todayCount:7,totalAnswers:11,totalSessions:3},
  settings:{mode:'recommended',sessionSize:20,year:'all',accent:'auto',voiceURI:'',theme:'auto'}
};

async function loadWithState(obj){
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await page.evaluate(({key,active,value})=>{
    localStorage.setItem(key,value);
    localStorage.removeItem(active);
  },{key:MAIN_KEY,active:ACTIVE_KEY,value:JSON.stringify(obj)});
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForSelector('#startBtn');
}

try{
  await loadWithState(baseState);

  const rawExpected=JSON.stringify(baseState);
  const boot=await page.evaluate((key)=>({
    raw:localStorage.getItem(key),
    schema:SCHEMA_VERSION,
    data:META.dataVersion,
    storageKey:STORAGE_KEY,
    aHasModel:!!state.words.w90545631866000.memoryModel,
    bHasModel:!!state.words.w3032116916.memoryModel,
    examUi:!!document.getElementById('examDateInput')
  }),MAIN_KEY);
  assert.equal(boot.raw,rawExpected,'opening v7.6 rewrote existing localStorage');
  assert.equal(boot.schema,7);
  assert.equal(boot.data,'2019-2026-v7.6-memory-curve-scheduler');
  assert.equal(boot.storageKey,MAIN_KEY);
  assert.equal(boot.aHasModel,false,'memory model must be lazy-initialized');
  assert.equal(boot.bHasModel,false,'memory model must be lazy-initialized');
  assert.equal(boot.examUi,true,'optional exam-date UI missing');

  const first=await page.evaluate(()=>{
    const id='w90545631866000',v=VOCAB_BY_ID.get(id),p=getProgress(id);
    const before={correct:p.correct,incorrect:p.incorrect,total:state.stats.totalAnswers};
    v75ApplyMainOutcome(v,{questionInstanceId:'v76-first',wordId:id,outcome:'got',qType:'reverse',isRetry:false});
    const q=getProgress(id),m=q.memoryModel;
    return {before,after:{correct:q.correct,incorrect:q.incorrect,total:state.stats.totalAnswers,mastery:q.mastery,evidence:q.evidence,nextReview:q.nextReview},m,otherModel:!!state.words.w3032116916.memoryModel};
  });
  assert.equal(first.after.correct,first.before.correct+1);
  assert.equal(first.after.incorrect,first.before.incorrect);
  assert.equal(first.after.total,first.before.total+1);
  assert.ok(first.after.mastery>=1);
  assert.ok(first.after.evidence>=6);
  assert.equal(first.m.version,1);
  assert.ok(first.m.stabilityDays>0);
  assert.ok(first.m.difficulty>=1&&first.m.difficulty<=10);
  assert.equal(first.otherModel,false,'answering one word initialized unrelated words');
  assert.ok(new Date(first.after.nextReview).getTime()>Date.now()+18*3600000,'correct answer scheduled too soon');

  const strength=await page.evaluate(()=>{
    const candidates=VOCAB.filter(v=>(v.studyLayer||'core')==='core'&&v.entryType!=='listeningQuestionStem');
    let pair=null;
    for(const p of ['S','A','B','C']){
      const xs=candidates.filter(v=>v.priority===p);
      if(xs.length>=2){pair=xs.slice(0,2);break}
    }
    if(!pair)throw new Error('no same-priority pair');
    const [a,b]=pair,stamp=new Date(Date.now()-4*86400000).toISOString();
    for(const v of [a,b]){
      state.words[v.id]={mastery:2,correct:3,incorrect:0,streak:2,lastStudied:stamp,nextReview:new Date(Date.now()).toISOString(),recentMistakeUntil:null,lastRating:'got',evidence:6,recentResults:[{ok:true,type:'choice',at:stamp}],memoryModel:{version:1,stabilityDays:4,difficulty:5,lastReviewAt:stamp,reviews:3,lapses:0,lastRetrievability:null,lastIntervalDays:4,targetRetention:.9,updatedAt:stamp}};
    }
    v75ApplyMainOutcome(a,{questionInstanceId:'v76-weak',wordId:a.id,outcome:'got',qType:'choice',isRetry:false});
    v75ApplyMainOutcome(b,{questionInstanceId:'v76-strong',wordId:b.id,outcome:'got',qType:'reverse',isRetry:false});
    const pa=getProgress(a.id),pb=getProgress(b.id);
    return {weakS:pa.memoryModel.stabilityDays,strongS:pb.memoryModel.stabilityDays,weakDue:new Date(pa.nextReview).getTime(),strongDue:new Date(pb.nextReview).getTime()};
  });
  assert.ok(strength.strongS>strength.weakS,`strong recall did not grow stability more: ${strength.strongS} <= ${strength.weakS}`);
  assert.ok(strength.strongDue>strength.weakDue,'strong recall did not schedule later than recognition');

  const lapse=await page.evaluate(()=>{
    const id='w3032116916',v=VOCAB_BY_ID.get(id),p=getProgress(id),stamp=new Date(Date.now()-14*86400000).toISOString();
    p.memoryModel={version:1,stabilityDays:14,difficulty:5,lastReviewAt:stamp,reviews:6,lapses:1,lastRetrievability:null,lastIntervalDays:14,targetRetention:.9,updatedAt:stamp};
    p.lastStudied=stamp;p.nextReview=new Date().toISOString();
    const before={correct:p.correct,incorrect:p.incorrect};
    const t=Date.now();
    v75ApplyMainOutcome(v,{questionInstanceId:'v76-lapse',wordId:id,outcome:'miss',qType:'reverse',isRetry:false});
    const q=getProgress(id);
    return {before,after:{correct:q.correct,incorrect:q.incorrect,nextReview:q.nextReview,stability:q.memoryModel.stabilityDays,difficulty:q.memoryModel.difficulty,lapses:q.memoryModel.lapses},deltaMin:(new Date(q.nextReview).getTime()-t)/60000};
  });
  assert.equal(lapse.after.correct,lapse.before.correct);
  assert.equal(lapse.after.incorrect,lapse.before.incorrect+1);
  assert.ok(lapse.after.stability>=5&&lapse.after.stability<8,`unexpected lapse stability ${lapse.after.stability}`);
  assert.ok(lapse.after.difficulty>5);
  assert.ok(lapse.deltaMin>=14&&lapse.deltaMin<=16,`lapse review not ~15min: ${lapse.deltaMin}`);

  const retry=await page.evaluate(()=>{
    const id='w3032116916',v=VOCAB_BY_ID.get(id),t=Date.now();
    v75ApplyMainOutcome(v,{questionInstanceId:'v76-retry',wordId:id,outcome:'got',qType:'reverseChoice',isRetry:true});
    const p=getProgress(id);
    return {deltaHours:(new Date(p.nextReview).getTime()-t)/3600000,stability:p.memoryModel.stabilityDays};
  });
  assert.ok(retry.deltaHours>=23.5&&retry.deltaHours<=24.5,`retry nextReview not ~1 day: ${retry.deltaHours}`);
  assert.ok(retry.stability>=1&&retry.stability<=1.5,`retry stability too large: ${retry.stability}`);

  const targets=await page.evaluate(()=>{
    const normal=VOCAB.find(v=>v.priority!=='S'&&(v.studyLayer||'core')!=='reference');
    const s=VOCAB.find(v=>v.priority==='S'&&(v.studyLayer||'core')!=='reference');
    const clean=defaultProgress();clean.correct=1;clean.recentResults=[{ok:true,type:'choice',at:new Date().toISOString()}];
    const weak=defaultProgress();weak.correct=1;weak.incorrect=2;weak.recentResults=[{ok:false,type:'choice',at:new Date().toISOString()},{ok:false,type:'choice',at:new Date().toISOString()}];
    return {normal:v76TargetRetention(normal,clean),s:v76TargetRetention(s,clean),weak:v76TargetRetention(normal,weak),both:v76TargetRetention(s,weak)};
  });
  assert.deepEqual(targets,{normal:.9,s:.92,weak:.92,both:.93});

  const setting=await page.evaluate((key)=>{
    const before=Object.keys(state.words).length;
    const input=document.getElementById('examDateInput');
    input.value='2027-01-15';input.dispatchEvent(new Event('change',{bubbles:true}));
    const saved=JSON.parse(localStorage.getItem(key));
    return {exam:state.settings.examDate,savedExam:saved.settings.examDate,wordsBefore:before,wordsAfter:Object.keys(state.words).length,schema:saved.schemaVersion};
  },MAIN_KEY);
  assert.equal(setting.exam,'2027-01-15');
  assert.equal(setting.savedExam,'2027-01-15');
  assert.equal(setting.wordsAfter,setting.wordsBefore);
  assert.equal(setting.schema,7);

  const merge=await page.evaluate(()=>{
    const id='w3032116916',before=JSON.stringify(getProgress(id).memoryModel);
    const backup={app:'早稲渋 Vocabulary Coach',schemaVersion:7,state:{schemaVersion:7,dataVersion:'2019-2026-v7.5-user-test-remediation',words:{[id]:{mastery:3,correct:99,incorrect:1,streak:2,lastStudied:new Date(Date.now()+1000).toISOString(),nextReview:new Date(Date.now()+86400000).toISOString(),recentMistakeUntil:null,lastRating:'got',evidence:10,recentResults:[]}},stats:{todayKey:'2000-01-01',todayCount:0,totalAnswers:99,totalSessions:4},settings:{mode:'recommended',sessionSize:20,year:'all',accent:'auto',voiceURI:'',theme:'auto'}}};
    mergeImported(backup);
    return {before,after:JSON.stringify(getProgress(id).memoryModel),correct:getProgress(id).correct};
  });
  assert.equal(merge.after,merge.before,'older backup erased or changed existing memoryModel');
  assert.equal(merge.correct,99,'normal import merge behavior regressed');

  assert.deepEqual(pageErrors,[],`page errors: ${pageErrors.join(' | ')}`);
  assert.deepEqual(consoleErrors,[],`console errors: ${consoleErrors.join(' | ')}`);
  console.log(`${PASS}: MEMORY CURVE CLEAN`);
} finally {
  await browser.close();
}
