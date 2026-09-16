
function v75ChallengeScore(v){
  const p=getProgress(v.id),t=now();
  return WASEDA_PLANNING_POLICY.challengeScore(v,p,t);
}
function v75FoundationReason(v){
  const p=getProgress(v.id),t=now();
  return WASEDA_PLANNING_POLICY.foundationReason(v,p,t);
}
function buildChallengeSessionPlan(year,requested){
  const y=year==="all"?null:Number(year),t=now();
  const challenge=VOCAB.filter(v=>(v.studyLayer||"core")==="challenge"&&(!y||v.years.includes(y)));
  if(!challenge.length)return {baseQueueIds:[],actualSessionSize:0,challengeCount:0,baseReasons:{}};
  const desired=requested||challenge.length;
  const required=Math.ceil(desired*.8);
  if(challenge.length<required){
    const n=Math.min(desired,challenge.length);
    const picked=v75WeightedWithoutReplacement(challenge,n,v75ChallengeScore);
    return {baseQueueIds:picked.map(v=>v.id),actualSessionSize:picked.length,challengeCount:picked.length,baseReasons:{}};
  }
  const nonChallenge=VOCAB.filter(v=>{
    const layer=v.studyLayer||"core";if(layer==="reference"||layer==="challenge")return false;
    if(y&&!v.years.includes(y))return false;
    const p=getProgress(v.id);
    const due=p.nextReview&&new Date(p.nextReview).getTime()<=t;
    const recent=p.recentMistakeUntil&&new Date(p.recentMistakeUntil).getTime()>t;
    return isWeakProgress(p)||due||recent;
  });
  const exceptionCap=Math.floor(desired*.2);
  const exceptions=v75WeightedWithoutReplacement(nonChallenge,Math.min(exceptionCap,nonChallenge.length),v=>schedulerScore(v,"recommended"));
  const challengeN=Math.min(challenge.length,desired-exceptions.length);
  const challengePicked=v75WeightedWithoutReplacement(challenge,challengeN,v75ChallengeScore);
  const combined=shuffle([...challengePicked,...exceptions]).slice(0,desired);
  const baseReasons={};exceptions.forEach(v=>baseReasons[v.id]=v75FoundationReason(v));
  return {baseQueueIds:combined.map(v=>v.id),actualSessionSize:combined.length,challengeCount:combined.filter(v=>(v.studyLayer||"core")==="challenge").length,baseReasons};
}
function buildSessionPlan(mode,year,size){
  const pool=filterPool(mode,year);
  if(size===0)return {unlimited:true,candidatePoolIds:pool.map(v=>v.id),baseQueueIds:[],actualSessionSize:0};
  if(mode==="75")return Object.assign({unlimited:false,candidatePoolIds:[]},buildChallengeSessionPlan(year,size));
  const n=Math.min(size,pool.length);
  const picked=mode==="random"?shuffle(pool).slice(0,n):v75WeightedWithoutReplacement(pool,n,v=>schedulerScore(v,mode));
  return {unlimited:false,candidatePoolIds:[],baseQueueIds:picked.map(v=>v.id),actualSessionSize:picked.length,challengeCount:picked.filter(v=>(v.studyLayer||"core")==="challenge").length,baseReasons:{}};
}
function v75DueRetry(){
  return session.retryQueue.filter(r=>r.dueAfterTotal<=session.totalAnswered&&!session.blockedIds.has(r.wordId)).sort((a,b)=>a.dueAfterTotal-b.dueAfterTotal)[0]||null;
}
function v75PickUnlimitedBase(){
  let pool=session.candidatePoolIds.map(id=>VOCAB_BY_ID.get(id)).filter(Boolean).filter(v=>!session.blockedIds.has(v.id));
  if(session.mode==="75")pool=pool.filter(v=>(v.studyLayer||"core")==="challenge");
  if(!pool.length)return null;
  const recent=new Set(session.recentIds.slice(-6));
  let candidates=pool.filter(v=>!recent.has(v.id));if(!candidates.length)candidates=pool;
  const weights=candidates.map(v=>session.mode==="75"?v75ChallengeScore(v):schedulerScore(v,session.mode));
  return weightedChoice(candidates,weights);
}
function v75NextSessionItem(){
  const due=v75DueRetry();
  if(due){
    session.retryQueue=session.retryQueue.filter(r=>r!==due);
    session.retryCounts[due.wordId]=(session.retryCounts[due.wordId]||0)+1;
    return {v:VOCAB_BY_ID.get(due.wordId),isRetry:true};
  }
  if(session.unlimited){
    const v=v75PickUnlimitedBase();
    if(v){session.generatedBaseIds.push(v.id);return {v,isRetry:false}}
    return null;
  }
  if(session.baseCursor<session.baseQueueIds.length){
    const id=session.baseQueueIds[session.baseCursor++];
    return {v:VOCAB_BY_ID.get(id),isRetry:false,reason:session.baseReasons&&session.baseReasons[id]||""};
  }
  // A retry that has not reached its 6/8-answer spacing is deferred to nextReview.
  return null;
}
