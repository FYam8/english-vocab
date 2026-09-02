/* V76_MEMORY_CURVE_SCHEDULER_START */
/*
 * v7.6 adaptive forgetting-curve scheduler.
 * Backward-compatible with schemaVersion 7 and waseshibu_vocab_state.
 * Existing words are NOT migrated on load. A memoryModel is initialized only
 * when that word receives its next scored answer.
 */
const V76_DATA_VERSION="2019-2026-v7.6-memory-curve-scheduler";
const V76_MEMORY_MODEL_VERSION=1;
const V76_DAY_MS=86400000;
const V76_MINUTE_MS=60000;
META.dataVersion=V76_DATA_VERSION;
state.dataVersion=V76_DATA_VERSION;

function v76Clamp(x,lo,hi){return Math.max(lo,Math.min(hi,Number(x)))}
function v76StrongRecallType(type){return ["reverse","audio","cloze"].includes(type)}
function v76SeedStability(mastery){const i=Math.max(0,Math.min(4,Math.round(Number(mastery)||0)));return [0.75,1.5,4,14,30][i]}
function v76ExistingScheduledDays(p){
  if(!p||!p.lastStudied||!p.nextReview||p.lastRating==="miss")return null;
  const a=new Date(p.lastStudied).getTime(),b=new Date(p.nextReview).getTime();
  if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a)return null;
  const d=(b-a)/V76_DAY_MS;
  return d>=0.5?d:null;
}
function v76InferMemoryModel(p){
  const attempts=attemptCount(p),errors=Number(p.incorrect)||0;
  const scheduled=v76ExistingScheduledDays(p);
  const stability=v76Clamp(scheduled??v76SeedStability(p.mastery),0.25,60);
  const errorRate=attempts?errors/attempts:0;
  const difficulty=v76Clamp(4.5+errorRate*3.2+(p.mastery===0?.5:0)-Math.min(1,Number(p.correct||0)*.04),1,10);
  return {
    version:V76_MEMORY_MODEL_VERSION,
    stabilityDays:stability,
    difficulty,
    lastReviewAt:p.lastStudied||null,
    reviews:attempts,
    lapses:errors,
    lastRetrievability:null,
    lastIntervalDays:scheduled,
    targetRetention:null,
    updatedAt:null
  };
}
function v76EnsureMemoryModel(p){
  if(!p.memoryModel||Number(p.memoryModel.version)!==V76_MEMORY_MODEL_VERSION){
    p.memoryModel=v76InferMemoryModel(p);
  }
  const m=p.memoryModel;
  m.stabilityDays=v76Clamp(m.stabilityDays||v76SeedStability(p.mastery),0.25,180);
  m.difficulty=v76Clamp(m.difficulty||5,1,10);
  m.reviews=Math.max(0,Number(m.reviews)||0);
  m.lapses=Math.max(0,Number(m.lapses)||0);
  return m;
}
function v76ElapsedDays(lastReviewAt,atMs=now()){
  if(!lastReviewAt)return 0;
  const t=new Date(lastReviewAt).getTime();
  if(!Number.isFinite(t))return 0;
  return Math.max(0,(atMs-t)/V76_DAY_MS);
}
function v76Retrievability(model,atMs=now()){
  if(!model||!model.lastReviewAt)return 1;
  const s=Math.max(.05,Number(model.stabilityDays)||.05);
  return v76Clamp(Math.pow(.9,v76ElapsedDays(model.lastReviewAt,atMs)/s),0,1);
}
function v76TargetRetention(v,p){
  const s=v&&v.priority==="S",w=!!(p&&isWeakProgress(p));
  if(s&&w)return .93;
  if(s||w)return .92;
  return .90;
}
function v76IntervalForTarget(stabilityDays,targetRetention){
  const s=Math.max(.05,Number(stabilityDays)||.05);
  const t=v76Clamp(targetRetention,.80,.97);
  return s*Math.log(t)/Math.log(.9);
}
function v76ExamDaysLeft(){
  const raw=state&&state.settings&&state.settings.examDate;
  if(!raw)return null;
  const d=new Date(String(raw)+"T23:59:59");
  const ms=d.getTime();
  if(!Number.isFinite(ms))return null;
  return (ms-now())/V76_DAY_MS;
}
function v76CorrectGrowth(model,retrievability,strong,elapsedDays,sameSession){
  const s=Math.max(.25,Number(model.stabilityDays)||.75);
  if(sameSession){return s*(strong?1.08:1.04)}
  const challenge=v76Clamp(.80+(1-retrievability)*1.7,.80,1.55);
  const strength=strong?1.20:.72;
  const difficultyFactor=v76Clamp(1.25-(model.difficulty-5)*.055,.85,1.5);
  const saturation=1+Math.log2(1+s)*.18;
  const growth=1+(strength*challenge*difficultyFactor)/saturation;
  return s*growth;
}
function v76LapseStability(model,retrievability){
  const s=Math.max(.25,Number(model.stabilityDays)||.75);
  return Math.max(.5,s*(.35+.15*v76Clamp(retrievability,0,1)));
}
function v76ReviewIntervalDays(v,p,model){
  return v76Clamp(v76IntervalForTarget(model.stabilityDays,v76TargetRetention(v,p)),.75,60);
}
function v76UpdateMemoryAfterOutcome(v,p,pending,ctx){
  const m=ctx.model;
  const ok=pending.outcome==="got";
  const strong=v76StrongRecallType(pending.qType||"choice");
  const sameSession=!!pending.isRetry||ctx.elapsedDays<.5;
  if(ok){
    if(pending.isRetry){
      m.stabilityDays=Math.max(1,Math.min(1.5,m.stabilityDays*1.15));
    }else{
      m.stabilityDays=v76Clamp(v76CorrectGrowth(m,ctx.retrievability,strong,ctx.elapsedDays,sameSession),.5,180);
      if((v.studyLayer||"core")==="diagnostic"&&ctx.attemptsBefore===0&&p.incorrect===0){
        m.stabilityDays=Math.max(m.stabilityDays,v76SeedStability(p.mastery));
      }
    }
    m.difficulty=v76Clamp(m.difficulty-(strong?.25:.12)-(ctx.retrievability<.85?.08:0),1,10);
  }else{
    m.stabilityDays=v76Clamp(v76LapseStability(m,ctx.retrievability),.5,180);
    m.difficulty=v76Clamp(m.difficulty+(strong?.8:.65),1,10);
    m.lapses++;
  }
  m.reviews++;
  m.lastRetrievability=ctx.retrievability;
  m.lastReviewAt=ctx.nowIso;
  m.updatedAt=ctx.nowIso;
  m.targetRetention=v76TargetRetention(v,p);
  if(ok){
    const days=pending.isRetry?1:v76ReviewIntervalDays(v,p,m);
    m.lastIntervalDays=days;
    p.nextReview=new Date(ctx.nowMs+days*V76_DAY_MS).toISOString();
  }else{
    m.lastIntervalDays=15*V76_MINUTE_MS/V76_DAY_MS;
    p.nextReview=new Date(ctx.nowMs+15*V76_MINUTE_MS).toISOString();
  }
}

v75ApplyMainOutcome=function(v,pending){
  const p=getProgress(v.id);
  const attemptsBefore=attemptCount(p);
  const model=v76EnsureMemoryModel(p);
  const nowMs=now(),nowIso=new Date(nowMs).toISOString();
  const elapsedDays=v76ElapsedDays(model.lastReviewAt,nowMs);
  const retrievability=v76Retrievability(model,nowMs);
  const ok=pending.outcome==="got",qType=pending.qType||"choice";

  p.lastStudied=nowIso;
  p.lastRating=ok?"got":"miss";
  if(ok){
    p.correct++;p.streak++;
    recordObjectiveResult(p,true,qType);
    const rr=p.recentResults[p.recentResults.length-1];if(rr)rr.questionInstanceId=pending.questionInstanceId;
    if((v.studyLayer||"core")==="diagnostic"&&p.incorrect===0){
      p.evidence=Math.max(Number(p.evidence)||0,5);
      p.mastery=Math.max(p.mastery,2);
    }
    p.recentMistakeUntil=null;
  }else{
    p.incorrect++;p.streak=0;
    recordObjectiveResult(p,false,qType);
    const rr=p.recentResults[p.recentResults.length-1];if(rr)rr.questionInstanceId=pending.questionInstanceId;
    p.recentMistakeUntil=reviewISO(3*V76_DAY_MS);
  }
  v76UpdateMemoryAfterOutcome(v,p,pending,{model,attemptsBefore,elapsedDays,retrievability,nowMs,nowIso});
  syncToday();
  state.stats.todayCount++;
  state.stats.totalAnswers++;
  saveState();
  return p;
};

const v75SchedulerScoreForV76=schedulerScore;
schedulerScore=function(v,mode){
  const base=v75SchedulerScoreForV76(v,mode);
  if(mode==="random")return base;
  const p=getProgress(v.id),m=p.memoryModel;
  let extra=0;
  if(m&&Number(m.version)===V76_MEMORY_MODEL_VERSION){
    const r=v76Retrievability(m),target=v76TargetRetention(v,p);
    if(r<target)extra+=(target-r)*900+90;
  }
  const days=v76ExamDaysLeft();
  if(days!=null&&days>=0&&days<=30){
    const urgency=(30-days)/30;
    if(v.priority==="S")extra+=80*urgency;
    if(isWeakProgress(p))extra+=100*urgency;
    if(m){
      const r=v76Retrievability(m),target=v76TargetRetention(v,p);
      extra+=Math.max(0,target-r)*300*urgency;
    }
  }
  return base+extra;
};
const v75ChallengeScoreForV76=v75ChallengeScore;
v75ChallengeScore=function(v){
  let score=v75ChallengeScoreForV76(v);
  const p=getProgress(v.id),m=p.memoryModel;
  if(m){
    const r=v76Retrievability(m),target=v76TargetRetention(v,p);
    if(r<target)score+=(target-r)*700+70;
  }
  return score;
};

const v75MergeImportedForV76=mergeImported;
mergeImported=function(raw){
  const before={};
  for(const [id,p] of Object.entries(state.words||{})){
    if(p&&p.memoryModel)before[id]=JSON.parse(JSON.stringify(p.memoryModel));
  }
  v75MergeImportedForV76(raw);
  let changed=false;
  for(const [id,oldModel] of Object.entries(before)){
    const p=state.words&&state.words[id];if(!p)continue;
    const cur=p.memoryModel;
    const ot=oldModel.lastReviewAt?new Date(oldModel.lastReviewAt).getTime():0;
    const ct=cur&&cur.lastReviewAt?new Date(cur.lastReviewAt).getTime():0;
    if(!cur||ot>ct){p.memoryModel=oldModel;changed=true}
  }
  if(changed)saveState();
  v76HydrateExtraSettings();
};

function v76MemoryDetailHTML(v,p){
  const m=p&&p.memoryModel;
  if(!m||Number(m.version)!==V76_MEMORY_MODEL_VERSION){
    return `<div class="section-title">記憶定着モデル</div><div class="small muted">この語は次回の回答時から、既存履歴を保持したまま忘却曲線ベースの復習間隔へ移行します。</div>`;
  }
  const r=Math.round(v76Retrievability(m)*100),target=Math.round(v76TargetRetention(v,p)*100);
  return `<div class="section-title">記憶定着モデル</div><div class="small">推定想起率 <b>${r}%</b> / 目標 ${target}%<br>記憶安定度 ${Number(m.stabilityDays).toFixed(1)}日<br>難易度 ${Number(m.difficulty).toFixed(1)} / 10<br>次回復習 ${formatDate(p.nextReview)}</div>`;
}
const v75OpenDetailForV76=openDetail;
openDetail=function(id){
  v75OpenDetailForV76(id);
  const v=VOCAB_BY_ID.get(id),p=getProgress(id),box=$("sheetContent");
  if(v&&box)box.insertAdjacentHTML("beforeend",v76MemoryDetailHTML(v,p));
};

function v76HydrateExtraSettings(){
  const input=document.getElementById("examDateInput");
  if(input)input.value=state.settings.examDate||"";
}
function v76EnsureMemorySettings(){
  if(document.getElementById("memoryScheduleSettings"))return;
  const view=$("view-settings");if(!view)return;
  const backup=[...view.querySelectorAll(".card")].find(c=>c.querySelector("#exportBtn"));
  if(!backup)return;
  const card=document.createElement("div");
  card.className="card";card.id="memoryScheduleSettings";
  card.innerHTML=`<h2>記憶定着・復習</h2><p class="small muted">固定日数ではなく、各単語の記憶安定度・難易度・推定想起率から nextReview を決めます。通常は想起率90%、Sランク・苦手語は92〜93%を目安に再出題します。</p><div class="setting-row field"><label>入試日（任意）</label><input type="date" id="examDateInput"><div class="tiny muted" style="margin-top:6px">設定すると直前期の「今日やること」で、想起率の低いSランク・苦手語を優先します。復習日を一律に試験前へ強制移動はしません。</div></div>`;
  backup.parentElement.insertBefore(card,backup);
  const input=$("examDateInput");
  input.value=state.settings.examDate||"";
  input.addEventListener("change",()=>{
    state.settings.examDate=input.value||"";
    markSettingsUpdated();saveState();renderLearnHome();
  });
}
const v75HydrateUiForV76=hydrateUiFromState;
hydrateUiFromState=function(){v75HydrateUiForV76();v76HydrateExtraSettings()};
const v75InitForV76=init;
init=function(){
  v75InitForV76();
  v76EnsureMemorySettings();
  v76HydrateExtraSettings();
};
/* V76_MEMORY_CURVE_SCHEDULER_END */