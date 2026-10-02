(()=>{
'use strict';

const KEY_NS=String.fromCharCode(119,97,115,101,115,104,105,98,117);
const API_DEFAULT=`https://${KEY_NS}-progress-api.fyam8.workers.dev`;
const APP_ID='vocab';
const STORAGE_KEY=KEY_NS+'_vocab_state';
const SYNC_DB=KEY_NS+'-progress-sync';
const SYNC_DB_VERSION=7;
function apiBase(){
  const override=window[`__${KEY_NS.toUpperCase()}_PROGRESS_API__`];
  return String(override||API_DEFAULT).replace(/\/+$/,'');
}
function canonicalize(v){if(Array.isArray(v))return v.map(canonicalize);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonicalize(v[k])]));return v;}
const canonicalJson=v=>JSON.stringify(canonicalize(v));
function loadState(){try{const x=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');return x&&typeof x==='object'?x:null;}catch{return null;}}
function validIso(v){return typeof v==='string'&&Number.isFinite(Date.parse(v))&&Date.parse(v)>0?v:null;}
function localStudyDate(now=new Date()){const y=now.getFullYear(),m=String(now.getMonth()+1).padStart(2,'0'),d=String(now.getDate()).padStart(2,'0');return `${y}-${m}-${d}`;}
function safeId(v,max=120){return String(v||'unknown').replace(/[^A-Za-z0-9._:-]/g,'_').slice(0,max)||'unknown';}
function wordRows(s){return Object.entries(s?.words&&typeof s.words==='object'?s.words:{}).map(([id,row])=>({id,...(row&&typeof row==='object'?row:{})}));}
function attempted(row){return Math.max(0,Number(row?.correct)||0)+Math.max(0,Number(row?.incorrect)||0);}
function lastLearningAt(s){const xs=wordRows(s).map(x=>validIso(x.lastStudied)).filter(Boolean).sort();return xs.at(-1)||null;}
function counts(s){const rows=wordRows(s),attemptedRows=rows.filter(x=>attempted(x)>0),mastered=attemptedRows.filter(x=>Number(x.mastery)>=4),stable=attemptedRows.filter(x=>Number(x.mastery)>=2),correct=rows.reduce((n,x)=>n+Math.max(0,Number(x.correct)||0),0),incorrect=rows.reduce((n,x)=>n+Math.max(0,Number(x.incorrect)||0),0);return{rows,attemptedRows,mastered,stable,correct,incorrect,totalAnswers:correct+incorrect};}
function buildOccurrenceRecords(s){if(!s)return[];const records=[];for(const row of wordRows(s)){const at=validIso(row.lastStudied);if(!at||attempted(row)<=0)continue;records.push({sourceRecordId:`word:${safeId(row.id,100)}`,eventType:'vocab_word_state',occurredAt:at,payload:{kind:`mastery-${Math.max(0,Math.min(4,Number(row.mastery)||0))}`,completed:Number(row.mastery)>=4,lastLearningAt:at}});}return records;}
function occurrenceSignature(s){return canonicalJson(wordRows(s).filter(x=>attempted(x)>0).map(x=>[x.id,x.correct,x.incorrect,x.mastery,x.lastStudied,x.nextReview]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));}
function buildStateRecords(s=loadState()){if(!s)return[];const now=new Date().toISOString(),c=counts(s),last=lastLearningAt(s),today=localStudyDate();const todayCount=s?.stats?.todayKey===today?Math.max(0,Number(s?.stats?.todayCount)||0):0;const sessionSize=Math.max(1,Number(s?.settings?.sessionSize)||20);const due=c.attemptedRows.filter(x=>validIso(x.nextReview)&&Date.parse(x.nextReview)<=Date.now()).length;const mode=String(s?.settings?.mode||'recommended').slice(0,40);return[{sourceRecordId:'state:summary',eventType:'progress_state',occurredAt:now,payload:{total:c.totalAnswers,correct:c.correct,kind:`vocab-${mode}`,completed:false,...(last?{lastLearningAt:last}:{})}},{sourceRecordId:'state:mastery',eventType:'mastery_state',occurredAt:now,payload:{total:c.attemptedRows.length,correct:c.mastered.length,kind:`stable-${c.stable.length}`,completed:c.attemptedRows.length>0&&c.mastered.length===c.attemptedRows.length}},{sourceRecordId:'state:retention',eventType:'retention_state',occurredAt:now,payload:{total:c.attemptedRows.length,correct:Math.max(0,c.attemptedRows.length-due),kind:`due-${due}`,completed:c.attemptedRows.length>0&&due===0}},{sourceRecordId:'state:today',eventType:'daily_state',occurredAt:now,payload:{total:sessionSize,correct:Math.min(sessionSize,todayCount),kind:'vocab-daily-session',completed:todayCount>=sessionSize}}];}
function buildBaseline(s){const c=counts(s),payload={baseline:true,eventCount:c.totalAnswers,scoredEventCount:c.totalAnswers,scoreTotal:c.correct,eventsByYear:{},capturedAt:new Date().toISOString(),progressLabel:'vocab mastery',completedCount:c.mastered.length,totalCount:c.attemptedRows.length};return payload;}

// Cloud failures never write to local learning state; studying remains local-first.
if(!window.SHARED_PROGRESS_TRANSPORT)return;
const transport=window.SHARED_PROGRESS_TRANSPORT.createTransport({schoolId:KEY_NS,legacyEndpoint:API_DEFAULT,appId:APP_ID,dbName:SYNC_DB,dbVersion:SYNC_DB_VERSION,endpoint:apiBase,loadState,buildStateRecords,buildOccurrenceRecords,occurrenceSignature,buildBaseline});
const reconcile=()=>transport.sync();
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>transport.start(),{once:true});else transport.start();
window.VocabProgressCloudSync={reconcile,buildStateRecords,buildOccurrenceRecords};
})();
