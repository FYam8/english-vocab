
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
