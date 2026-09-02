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

const v74ChooseType=chooseType;
chooseType=function(v,isRetry=false){
  if(v&&v.entryType==="listeningQuestionStem")return "choice";
  return v74ChooseType(v,isRetry);
};
function v75DisplayWord(v){return v.displayWord||v.word}
function v75AudioLabel(v,again=false){return `英単語 ${v75DisplayWord(v)} の発音を${again?"もう一度":""}再生`}
function v75UpdateQuickSpeakLabel(){
  const b=$("quickSpeak");if(!b)return;
  if(currentQuestion&&currentQuestion.v){
    if(currentQuestion.v.entryType==="listeningQuestionStem"){b.style.visibility="hidden";b.disabled=true;return}
    b.style.visibility="visible";b.disabled=false;
    b.setAttribute("aria-label",v75AudioLabel(currentQuestion.v,false));
    b.title=`${v75DisplayWord(currentQuestion.v)} の発音を聞く`;
  }else{
    b.style.visibility="visible";b.disabled=false;
    b.setAttribute("aria-label","音声テスト");b.title="音声テスト";
  }
}
function v75ChoiceObjects(v){
  if(Array.isArray(currentQuestion.choiceIds)&&currentQuestion.choiceIds.length){
    return currentQuestion.choiceIds.map(id=>VOCAB_BY_ID.get(id)).filter(Boolean);
  }
  const choices=shuffle([v,...getDistractors(v)]);
  currentQuestion.choiceIds=choices.map(x=>x.id);
  return choices;
}
renderChoice=function(v){
  const audio=v.entryType==="listeningQuestionStem"?"":`<button class="icon-btn" style="margin-top:12px" onclick="speakWord('${v.id}')" aria-label="${esc(v75AudioLabel(v))}" title="${esc(v75DisplayWord(v))} の発音を聞く">🔊</button>`;
  $("promptArea").innerHTML=`<div class="word">${esc(v75DisplayWord(v))}</div>${audio}<div class="small muted" style="margin-top:8px">最も適切な意味を選ぶ</div>`;
  const choices=v75ChoiceObjects(v);
  $("responseArea").innerHTML='<div class="answer-grid">'+choices.map(x=>`<button class="answer-btn" data-choice="${x.id}">${esc(x.meaning)}</button>`).join("")+"</div>";
  document.querySelectorAll("[data-choice]").forEach(b=>b.addEventListener("click",()=>resolveChoice(b.dataset.choice)));
};
renderReverseChoice=function(v){
  $("promptArea").innerHTML=`<div class="meaning-big">${esc(v.meaning)}</div><div class="small muted" style="margin-top:9px">対応する英語を選ぶ</div>`;
  const choices=v75ChoiceObjects(v);
  $("responseArea").innerHTML='<div class="answer-grid">'+choices.map(x=>`<button class="answer-btn" data-choice="${x.id}">${esc(v75DisplayWord(x))}</button>`).join("")+"</div>";
  document.querySelectorAll("[data-choice]").forEach(b=>b.addEventListener("click",()=>resolveChoice(b.dataset.choice)));
};
renderAudioChoice=function(v){
  $("promptArea").innerHTML=`<button class="audio-orb" onclick="speakWord('${v.id}')" aria-label="${esc(v75AudioLabel(v))}" title="${esc(v75DisplayWord(v))} の発音を聞く">🔊</button><div class="small muted">音声を聞いて意味を選ぶ</div>`;
  const choices=v75ChoiceObjects(v);
  $("responseArea").innerHTML='<div class="answer-grid">'+choices.map(x=>`<button class="answer-btn" data-choice="${x.id}">${esc(x.meaning)}</button>`).join("")+"</div>";
  document.querySelectorAll("[data-choice]").forEach(b=>b.addEventListener("click",()=>resolveChoice(b.dataset.choice)));
  if(!v75RestoringQuestion)setTimeout(()=>speakWord(v.id),250);
};
renderReverse=function(v){
  $("promptArea").innerHTML=`<div class="meaning-big">${esc(v.meaning)}</div><div class="small muted" style="margin-top:10px">見出し語を英語で入力</div>`;
  renderTypeBox(v);
};
renderAudio=function(v){
  $("promptArea").innerHTML=`<button class="audio-orb" onclick="speakWord('${v.id}')" aria-label="${esc(v75AudioLabel(v))}" title="${esc(v75DisplayWord(v))} の発音を聞く">🔊</button><div class="small muted">音声を聞いて英語で入力</div>`;
  renderTypeBox(v);
  if(!v75RestoringQuestion)setTimeout(()=>speakWord(v.id),250);
};
renderCloze=function(v){
  $("promptArea").innerHTML=`<div class="cloze">${esc(CLOZE[v.word]||"_____")}</div><div class="small muted" style="margin-top:10px">空所に入る見出し語を入力</div>`;
  renderTypeBox(v);
};
renderTypeBox=function(v){
  $("responseArea").innerHTML=`<div class="typebox"><input type="text" id="typedAnswer" autocomplete="off" autocapitalize="none" spellcheck="false" enterkeyhint="done"><button class="primary" id="submitTyped">判定</button></div><div id="typedError" class="small" role="alert" style="color:var(--bad);margin-top:7px;min-height:20px"></div>`;
  const inp=$("typedAnswer");inp.value=currentQuestion&&currentQuestion.draft||"";inp.focus();
  $("submitTyped").addEventListener("click",()=>resolveTyped(v));
  inp.addEventListener("keydown",e=>{if(e.key==="Enter")resolveTyped(v)});
  inp.addEventListener("input",()=>{
    if(currentQuestion)currentQuestion.draft=inp.value;
    $("typedError").textContent="";
    clearTimeout(v75DraftTimer);v75DraftTimer=setTimeout(persistActiveSession,350);
  });
};
resolveChoice=function(id){
  if(questionResolved)return;
  const target=currentQuestion.v,ok=id===target.id;
  currentQuestion.selectedChoiceId=id;
  document.querySelectorAll("[data-choice]").forEach(b=>{
    b.disabled=true;
    if(b.dataset.choice===target.id)b.classList.add("correct");
    else if(b.dataset.choice===id)b.classList.add("wrong");
  });
  applyOutcome(target,ok?"got":"miss");
  showFeedback(target,ok);
};
resolveTyped=function(v){
  if(questionResolved)return;
  const inp=$("typedAnswer"),raw=inp.value,ans=normalizeAnswer(raw);
  if(!ans){$("typedError").textContent="答えを入力してください";inp.focus();return}
  const accepted=[normalizeAnswer(v.word)];
  if(v.word==="cannot")accepted.push("can not","can't");
  const ok=accepted.includes(ans);
  currentQuestion.draft=raw;
  currentQuestion.userAnswer=ans;
  inp.disabled=true;$("submitTyped").disabled=true;$("typedError").textContent="";
  applyOutcome(v,ok?"got":"miss");
  showFeedback(v,ok,ans);
};

applyOutcome=function(v,outcome){
  if(questionResolved||!session||!currentQuestion)return;
  questionResolved=true;
  const p=getProgress(v.id);
  const pending={
    questionInstanceId:currentQuestion.questionInstanceId,
    wordId:v.id,
    outcome,
    qType:currentQuestion.type||"choice",
    isRetry:!!currentQuestion.isRetry,
    oldMastery:Number(p.mastery)||0,
    oldWeak:isWeakProgress(p),
    userAnswer:currentQuestion.userAnswer||currentQuestion.draft||"",
    selectedChoiceId:currentQuestion.selectedChoiceId||null
  };
  session.pendingOutcome=pending;
  persistActiveSession();
  v75CommitPendingOutcome(pending);
  v75UpdateSessionBar(false);
};

function v75SelectedYear(){return session&&session.active?session.year:(state.settings.year||"all")}
