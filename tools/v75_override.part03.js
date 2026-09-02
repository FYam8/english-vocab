examExampleHTML=function(v){
  const ex=EXAM_EXAMPLES[v.id];
  if(!ex)return `<div class="exam-example"><div class="exam-example-head">例文監査エラー</div><div class="exam-example-note">この項目の出典表示レコードが未登録です。固定ID: ${esc(v.id)}</div></div>`;
  const selected=v75SelectedYear();
  const src=`${ex.year}年度 ${ex.source}${ex.page?`・PDF p.${ex.page}`:""}`;
  const highlight=(raw,form)=>{
    const s=String(raw||""),f=String(form||"");if(!f)return esc(s);
    const i=s.toLowerCase().indexOf(f.toLowerCase());
    return i>=0?esc(s.slice(0,i))+`<b>${esc(s.slice(i,i+f.length))}</b>`+esc(s.slice(i+f.length)):esc(s);
  };
  const ja=String(ex.ja||"").trim();
  const jaHTML=ja?`<div class="exam-example-ja"><span class="exam-example-ja-label">和訳</span>${esc(ja)}</div>`:`<div class="exam-example-ja"><span class="exam-example-ja-label">和訳監査エラー</span>この項目の和訳が未登録です。固定ID: ${esc(v.id)}</div>`;
  const mismatch=selected!=="all"&&Number(selected)!==Number(ex.year)&&Array.isArray(v.years)&&v.years.includes(Number(selected));
  const yearNote=mismatch?`<div class="exam-example-note">この語は${esc(selected)}年度にも確認されています。表示例文は${ex.year}年度のものです。</div>`:"";
  if(!ex.sentence){
    const fragment=String(ex.fragment||ex.matchedForm||v75DisplayWord(v));
    const note=ex.note||"過去問では単独語・選択肢として出現し、この語を含む完成英文は資料内から確認できません。";
    return `<div class="exam-example"><div class="exam-example-head">過去問での出題例 · ${esc(src)}</div><div class="exam-example-sentence">${highlight(fragment,ex.matchedForm||v.word)}</div>${jaHTML}<div class="exam-example-note">${esc(note)}</div>${yearNote}</div>`;
  }
  const modeNote=ex.mode==="completed"?(ex.note||"問題の空所・整序を公式解答で補完した完成文"):(ex.note||"");
  return `<div class="exam-example"><div class="exam-example-head">過去問例文 · ${esc(src)}</div><div class="exam-example-sentence">${highlight(ex.sentence,ex.matchedForm||v.word)}</div>${jaHTML}${modeNote?`<div class="exam-example-note">${esc(modeNote)}</div>`:""}${yearNote}</div>`;
};
function v75EvidenceFlags(v){
  const directVocab=(v.directVocabYears||v.directYears||[]).length;
  const order=(v.directOrderYears||[]).length;
  const answer=(v.directAnswerYears||[]).length;
  return {directVocab,order,answer,total:directVocab+order+answer};
}
function v75CompactEvidence(v){
  const sf=Number(v.surfaceFrequency)||0,sy=(v.surfaceYears||[]).length,registered=(v.years||[]).length,f=v75EvidenceFlags(v);
  const parts=[`本文・音声：${sf}回${sy?` / ${sy}年度`:""}`,`登録年度：${registered}年度`];
  if(f.total)parts.push(`直接出題：${f.total}年度`);
  if(v.evidenceType==="compoundOnly")parts.push("複合語内で確認");
  return parts.join("<br>");
}
function v75EvidenceDetail(v){
  const f=v75EvidenceFlags(v),rows=[];
  rows.push(`<div class="row between setting-row"><span>本文・音声出現</span><b>${Number(v.surfaceFrequency)||0}回 / ${(v.surfaceYears||[]).length}年度</b></div>`);
  rows.push(`<div class="row between setting-row"><span>登録年度</span><b>${yearsText(v.years||[])}</b></div>`);
  if(f.directVocab)rows.push(`<div class="row between setting-row"><span>直接語彙</span><b>${yearsText(v.directVocabYears||v.directYears)}</b></div>`);
  if(f.order)rows.push(`<div class="row between setting-row"><span>語句整序</span><b>${yearsText(v.directOrderYears)}</b></div>`);
  if(f.answer)rows.push(`<div class="row between setting-row"><span>本文等の一語解答</span><b>${yearsText(v.directAnswerYears)}</b></div>`);
  if((v.compoundForms||[]).length)rows.push(`<div class="row between setting-row"><span>複合形</span><b>${(v.compoundForms||[]).map(x=>esc(typeof x==="string"?x:x.form)).join("・")}</b></div>`);
  return rows.join("");
}
function v75EntryNote(v){
  const notes=[];
  if(v.entryType==="listeningQuestionStem")notes.push("リスニング設問表現：通常の単語・熟語とは別に、設問の読み取り用表現として学習します。");
  if(v.evidenceType==="compoundOnly")notes.push("関連学習語：単独出現は0回です。2026年度では short-term / long-term の一部として確認されています。");
  if(v.challengeReason)notes.push(v.challengeReason);
  return notes.map(x=>`<div class="small muted" style="margin-top:7px">${esc(x)}</div>`).join("");
}
function v75HasNextNow(){
  if(!session)return false;
  if(v75DueRetry())return true;
  if(session.unlimited)return true;
  return session.baseCursor<session.baseQueueIds.length;
}
showFeedback=function(v,ok,userAns=""){
  const p=getProgress(v.id),cat=v.categories.map(c=>CATEGORY_JP[c]||c).join("・")||"過去問";
  const audio=v.entryType==="listeningQuestionStem"?"":`<button class="icon-btn" style="min-height:38px;min-width:38px;padding:5px" onclick="speakWord('${v.id}')" aria-label="${esc(v75AudioLabel(v,true))}" title="${esc(v75DisplayWord(v))} の発音をもう一度聞く">🔊</button>`;
  const reason=currentQuestion&&currentQuestion.reason?`<div class="small" style="margin-top:7px;color:var(--accent2);font-weight:650">${esc(currentQuestion.reason)}</div>`:"";
  $("feedback").innerHTML=`<div class="correctline">${ok?"✓ ":""}${esc(v75DisplayWord(v))} ${audio}</div>
  <div style="font-size:17px;font-weight:650;margin-top:4px">${esc(v.meaning)}</div>
  ${!ok&&userAns?`<div class="small" style="color:var(--bad);margin-top:6px">入力：${esc(userAns)}</div>`:""}
  ${reason}${v75EntryNote(v)}${examExampleHTML(v)}
  <div class="small muted" style="margin-top:8px">${esc(v.note||"")} ${v.note?"· ":""}${v75CompactEvidence(v).replace(/<br>/g," · ")} · ${esc(cat)}</div>
  <div class="row between" style="margin-top:8px"><span class="tiny muted">客観判定 ${p.mastery} ${MASTER_LABEL[p.mastery]}${isWeakProgress(p)?" ・ 苦手判定":""}</span>${masteryDots(p.mastery)}</div>`;
  $("feedback").classList.add("show");
  $("nextArea").innerHTML=`<button class="primary full" id="nextBtn" style="margin-top:14px">${v75HasNextNow()?"次へ":"結果を見る"}</button>`;
  $("nextBtn").addEventListener("click",nextQuestion);
  if(currentQuestion){currentQuestion.submitted=true;currentQuestion.outcomeApplied=true;currentQuestion.ok=!!ok;currentQuestion.userAnswer=userAns||currentQuestion.userAnswer||""}
  v75UpsertQuestionHistory();persistActiveSession();
};

function v75UpdateSessionBar(showCurrent=true){
  if(!session)return;
  const total=session.actualSessionSize||0;
  if(session.unlimited){
    $("sessionCount").textContent=`基本 ${session.baseAnswered}問 / 再確認 ${session.retryAnswered}問`;
  }else if(currentQuestion&&currentQuestion.isRetry&&showCurrent){
    $("sessionCount").textContent=`${session.baseAnswered}/${total} ・ 再確認`;
  }else{
    const n=showCurrent&&currentQuestion&&!currentQuestion.isRetry&&!questionResolved?Math.min(session.baseAnswered+1,total):session.baseAnswered;
    $("sessionCount").textContent=`${n}/${total}${session.retryAnswered?` ・ 再確認 ${session.retryAnswered}`:""}`;
  }
  $("sessionScore").textContent=`正解 ${session.correct} / 不正解 ${session.wrong}`;
}
function v75RenderCurrentQuestion(){
  const v=currentQuestion.v,type=currentQuestion.type;
  $("qBadges").innerHTML=badgeHTML(v);
  $("feedback").className="feedback";$("feedback").innerHTML="";$("nextArea").innerHTML="";
  const p=getProgress(v.id),labels={choice:"選択式・英→日",reverseChoice:"選択式・日→英",reverse:"日→英・入力",audioChoice:"音声→意味選択",audio:"音声→英語",cloze:"穴埋め"};
  $("qTypeLabel").textContent=`${labels[type]}${currentQuestion.isRetry?"・再確認":""} ・ ${MASTER_LABEL[p.mastery]}`;
  v75RestoringQuestion=true;
  if(type==="choice")renderChoice(v);
  else if(type==="reverseChoice")renderReverseChoice(v);
  else if(type==="audioChoice")renderAudioChoice(v);
  else if(type==="reverse")renderReverse(v);
  else if(type==="audio")renderAudio(v);
  else renderCloze(v);
  v75RestoringQuestion=false;
  v75UpdateQuickSpeakLabel();
  if(currentQuestion.submitted){
    questionResolved=true;
    if(["choice","reverseChoice","audioChoice"].includes(type)){
      document.querySelectorAll("[data-choice]").forEach(b=>{
        b.disabled=true;
        if(b.dataset.choice===v.id)b.classList.add("correct");
        else if(b.dataset.choice===currentQuestion.selectedChoiceId)b.classList.add("wrong");
      });
    }else{
      const inp=$("typedAnswer"),btn=$("submitTyped");
      if(inp){inp.value=currentQuestion.draft||currentQuestion.userAnswer||"";inp.disabled=true}
      if(btn)btn.disabled=true;
    }
    showFeedback(v,!!currentQuestion.ok,currentQuestion.userAnswer||"");
  }else questionResolved=false;
  v75UpdateSessionBar(true);
}
renderQuestion=function(){
  clearToast();
  const item=v75NextSessionItem();
  if(!item||!item.v){endSession(false);return}
  currentQuestion={
    v:item.v,type:chooseType(item.v,item.isRetry),isRetry:item.isRetry,
    questionInstanceId:`${session.sessionId}:q-${session.questionHistory.length+1}-${Math.random().toString(36).slice(2,7)}`,
    submitted:false,outcomeApplied:false,draft:"",choiceIds:[],selectedChoiceId:null,userAnswer:"",ok:null,reason:item.reason||""
  };
  questionResolved=false;
  session.recentIds.push(item.v.id);if(session.recentIds.length>14)session.recentIds.shift();
  $("learnSetup").style.display="none";$("quizArea").style.display="block";$("sessionBar").classList.add("show");
  $("headerTitle").textContent=v75SessionLabel();
  v75RenderCurrentQuestion();
  persistActiveSession();
};
nextQuestion=function(){
  if(!session||!session.active)return;
  v75UpsertQuestionHistory();persistActiveSession();
  renderQuestion();
};

const v74CloseSheet=closeSheet;
closeSheet=function(){v74CloseSheet();if(!v75RestorePromptOpen)clearToast()};

function v75NextReviewText(s){
  const ids=[...s.missed];
  const dates=ids.map(id=>getProgress(id).nextReview).filter(Boolean).map(x=>new Date(x)).filter(d=>!Number.isNaN(d.getTime())).sort((a,b)=>a-b);
  return dates.length?formatDate(dates[0].toISOString()):"—";
}
startSession=function(){
  const mode=$("modeSelect").value,year=$("learnYearSelect").value,size=Number($("sessionSizeSelect").value);
  const plan=buildSessionPlan(mode,year,size);
  if(size!==0&&!plan.baseQueueIds.length){
    showToast(mode==="review"?"現在、復習対象の語はありません。":"この条件に該当する語がありません",{kind:"info"});return;
  }
  if(size===0&&!plan.candidatePoolIds.length){showToast("この条件に該当する語がありません",{kind:"info"});return}
  state.settings.mode=mode;state.settings.year=year;state.settings.sessionSize=size;markSettingsUpdated();saveState();
  session={
    active:true,sessionId:v75MakeId("session"),createdAt:v75IsoNow(),mode,year,
    requestedSessionSize:size,actualSessionSize:plan.actualSessionSize||0,unlimited:!!plan.unlimited,
    candidatePoolIds:plan.candidatePoolIds||[],generatedBaseIds:[],baseQueueIds:plan.baseQueueIds||[],baseCursor:0,
    baseAnswered:0,retryAnswered:0,totalAnswered:0,correct:0,wrong:0,masteryUps:0,
    questionHistory:[],recentIds:[],retryQueue:[],retryCounts:{},blockedIds:new Set(),missed:new Set(),weak:new Set(),newFixed:new Set(),pendingOutcome:null,
    challengeBaseCount:Number(plan.challengeCount)||0,baseReasons:plan.baseReasons||{}
  };
  currentQuestion=null;questionResolved=false;
  $("learnSetup").style.display="none";$("quizArea").style.display="block";$("sessionBar").classList.add("show");
  $("headerTitle").textContent=v75SessionLabel();
  persistActiveSession();renderQuestion();
  if(size!==0&&plan.actualSessionSize<size){
    const label=mode==="review"?"復習対象":mode==="75"?"75点挑戦対象":"この条件の対象";
    showToast(`${label}は${plan.actualSessionSize}語です。今回は${plan.actualSessionSize}問で開始します。`,{kind:"info",duration:4500});
  }
};
endSession=function(silent=false,options={}){
  clearToast();
  if(!session)return;
  const s=session;if(!s.active&&options.force!==true)return;
  s.active=false;
