function loadActiveSession(){
  try{
    const raw=localStorage.getItem(V75_ACTIVE_SESSION_KEY);
    if(!raw)return null;
    const x=JSON.parse(raw);
    return validateActiveSession(x)?x:null;
  }catch(e){console.warn("Active session load failed",e);return null}
}
function validateActiveSession(x){
  if(!x||typeof x!=="object"||Number(x.sessionFormatVersion)!==V75_SESSION_FORMAT_VERSION)return false;
  if(typeof x.sessionId!=="string"||typeof x.mode!=="string")return false;
  const ids=[...(x.baseQueueIds||[]),...(x.candidatePoolIds||[])];
  if(ids.some(id=>!VOCAB_BY_ID.has(id)||(VOCAB_BY_ID.get(id).studyLayer||"core")==="reference"))return false;
  if(x.currentQuestion&&(!x.currentQuestion.wordId||!VOCAB_BY_ID.has(x.currentQuestion.wordId)))return false;
  return true;
}
function v75RestoreSessionObject(raw){
  session={
    active:true,
    sessionId:raw.sessionId,
    createdAt:raw.createdAt||v75IsoNow(),
    mode:raw.mode,
    year:raw.year||"all",
    requestedSessionSize:Number(raw.requestedSessionSize)||0,
    actualSessionSize:Number(raw.actualSessionSize)||0,
    unlimited:!!raw.unlimited,
    candidatePoolIds:Array.isArray(raw.candidatePoolIds)?raw.candidatePoolIds:[],
    generatedBaseIds:Array.isArray(raw.generatedBaseIds)?raw.generatedBaseIds:[],
    baseQueueIds:Array.isArray(raw.baseQueueIds)?raw.baseQueueIds:[],
    baseCursor:Number(raw.baseCursor)||0,
    baseAnswered:Number(raw.baseAnswered)||0,
    retryAnswered:Number(raw.retryAnswered)||0,
    totalAnswered:Number(raw.totalAnswered)||0,
    correct:Number(raw.correct)||0,
    wrong:Number(raw.wrong)||0,
    masteryUps:Number(raw.masteryUps)||0,
    questionHistory:Array.isArray(raw.questionHistory)?raw.questionHistory:[],
    recentIds:Array.isArray(raw.recentIds)?raw.recentIds:[],
    retryQueue:Array.isArray(raw.retryQueue)?raw.retryQueue:[],
    retryCounts:raw.retryCounts||{},
    blockedIds:v75ToSet(raw.blockedIds),
    missed:v75ToSet(raw.missedIds),
    weak:v75ToSet(raw.weakIds),
    newFixed:v75ToSet(raw.newFixedIds),
    pendingOutcome:raw.pendingOutcome||null,
    challengeBaseCount:Number(raw.challengeBaseCount)||0,
    baseReasons:raw.baseReasons||{}
  };
  const cq=raw.currentQuestion;
  currentQuestion=cq?Object.assign({},cq,{v:VOCAB_BY_ID.get(cq.wordId)}):null;
  questionResolved=!!(currentQuestion&&currentQuestion.submitted);
}
function v75OutcomeAlreadyApplied(wordId,qid){
  const p=getProgress(wordId);
  return (p.recentResults||[]).some(r=>r&&r.questionInstanceId===qid);
}
function v75RemoveRetry(wordId){
  session.retryQueue=session.retryQueue.filter(r=>r.wordId!==wordId);
}
function v75ApplyMainOutcome(v,pending){
  const p=getProgress(v.id),ok=pending.outcome==="got",qType=pending.qType||"choice";
  p.lastStudied=v75IsoNow();
  p.lastRating=ok?"got":"miss";
  if(ok){
    p.correct++;p.streak++;
    recordObjectiveResult(p,true,qType);
    const rr=p.recentResults[p.recentResults.length-1];if(rr)rr.questionInstanceId=pending.questionInstanceId;
    if((v.studyLayer||"core")==="diagnostic"&&p.incorrect===0){
      p.evidence=Math.max(Number(p.evidence)||0,5);
      p.mastery=Math.max(p.mastery,2);
      p.nextReview=reviewISO(60*86400000);
    }else{
      const days=[0,1,4,14,45][p.mastery];
      p.nextReview=reviewISO(days===0?10*60*1000:days*86400000);
    }
    p.recentMistakeUntil=null;
  }else{
    p.incorrect++;p.streak=0;
    recordObjectiveResult(p,false,qType);
    const rr=p.recentResults[p.recentResults.length-1];if(rr)rr.questionInstanceId=pending.questionInstanceId;
    p.nextReview=reviewISO(10*60*1000);
    p.recentMistakeUntil=reviewISO(3*86400000);
  }
  syncToday();
  state.stats.todayCount++;
  state.stats.totalAnswers++;
  saveState();
  return p;
}
function v75ApplySessionOutcome(v,pending,p){
  const ok=pending.outcome==="got";
  if(pending.isRetry)session.retryAnswered++;else session.baseAnswered++;
  session.totalAnswered++;
  if(ok){
    session.correct++;
    v75RemoveRetry(v.id);
    session.blockedIds.delete(v.id);
    if(Number(p.mastery)>Number(pending.oldMastery))session.masteryUps++;
    if(Number(pending.oldMastery)<4&&p.mastery===4)session.newFixed.add(v.id);
  }else{
    session.wrong++;
    session.missed.add(v.id);
    if(isWeakProgress(p))session.weak.add(v.id);
    if(!pending.isRetry&&(session.retryCounts[v.id]||0)===0){
      const gap=(v.priority==="S"||v.level===60)?6:8;
      session.retryQueue.push({wordId:v.id,dueAfterTotal:session.totalAnswered+gap});
    }else if(pending.isRetry){
      v75RemoveRetry(v.id);
      session.blockedIds.add(v.id);
    }
  }
  if(pending.oldWeak&&!isWeakProgress(p))session.weak.delete(v.id);
}
function v75CommitPendingOutcome(pending){
  const v=VOCAB_BY_ID.get(pending.wordId);if(!v)return;
  let p=getProgress(v.id);
  if(!v75OutcomeAlreadyApplied(v.id,pending.questionInstanceId))p=v75ApplyMainOutcome(v,pending);
  v75ApplySessionOutcome(v,pending,p);
  if(currentQuestion&&currentQuestion.questionInstanceId===pending.questionInstanceId){
    currentQuestion.submitted=true;
    currentQuestion.outcomeApplied=true;
    currentQuestion.ok=pending.outcome==="got";
    currentQuestion.userAnswer=pending.userAnswer||currentQuestion.userAnswer||"";
    currentQuestion.selectedChoiceId=pending.selectedChoiceId||currentQuestion.selectedChoiceId||null;
  }
  session.pendingOutcome=null;
  v75UpsertQuestionHistory();
  persistActiveSession();
}
function recoverPendingOutcome(){
  if(!session||!session.pendingOutcome)return;
  v75CommitPendingOutcome(session.pendingOutcome);
}
function v75QuestionSnapshot(){
  const q=v75SerializeCurrentQuestion();
  if(!q)return null;
  return {
    questionInstanceId:q.questionInstanceId,wordId:q.wordId,type:q.type,isRetry:q.isRetry,
    submitted:q.submitted,answer:q.selectedChoiceId||q.userAnswer||"",correct:q.ok,outcomeApplied:q.outcomeApplied
  };
}
function v75UpsertQuestionHistory(){
  if(!session||!currentQuestion)return;
  const snap=v75QuestionSnapshot();if(!snap)return;
  const i=session.questionHistory.findIndex(x=>x.questionInstanceId===snap.questionInstanceId);
  if(i>=0)session.questionHistory[i]=snap;else session.questionHistory.push(snap);
}

function v75WeightedWithoutReplacement(pool,count,scoreFn){
  const remaining=[...pool],out=[];
  while(remaining.length&&out.length<count){
    const weights=remaining.map(v=>Math.max(.1,scoreFn(v))*(.92+Math.random()*.16));
    const picked=weightedChoice(remaining,weights);
    out.push(picked);
    remaining.splice(remaining.findIndex(v=>v.id===picked.id),1);
  }
  return out;
}
function v75ChallengeScore(v){
  const p=getProgress(v.id),t=now();
  let score=(PRIORITY_SCORE[v.priority]||0)+(v.yearCount||0)*8+Math.sqrt(effectiveFrequency(v))*4+[80,110,65,25,4][p.mastery];
  if(p.nextReview&&new Date(p.nextReview).getTime()<=t)score+=115;
  if(p.recentMistakeUntil&&new Date(p.recentMistakeUntil).getTime()>t)score+=80;
  if(isWeakProgress(p))score+=95;
  if(p.mastery===4&&!(p.nextReview&&new Date(p.nextReview).getTime()<=t))score*=.12;
  return score;
}
function v75FoundationReason(v){
  const p=getProgress(v.id),t=now();
  if(isWeakProgress(p))return "挑戦前の基礎確認：最近の正誤履歴で苦手判定となっている重要語です。";
  if(p.recentMistakeUntil&&new Date(p.recentMistakeUntil).getTime()>t)return "挑戦前の基礎確認：最近間違えた重要語のため再確認します。";
  if(p.nextReview&&new Date(p.nextReview).getTime()<=t)return "挑戦前の基礎確認：復習期限を迎えた重要語です。";
  return "挑戦前の基礎確認：75点挑戦を支える基礎語を再確認します。";
}
function buildChallengeSessionPlan(year,requested){
  const y=year==="all"?null:Number(year),t=now();
  const challenge=VOCAB.filter(v=>(v.studyLayer||"core")==="challenge"&&(!y||v.years.includes(y)));
  if(!challenge.length)return {baseQueueIds:[],actualSessionSize:0,challengeCount:0,baseReasons:{}};
  const desired=requested||challenge.length;
  const required=Math.ceil(desired*.8);
