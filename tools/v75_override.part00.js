/* Vocabulary Coach v7.5 user-test remediation compatibility layer.
 * Injected immediately before init() by tools/apply_v75_patch.py.
 * Keep schemaVersion 7 and the existing waseshibu_vocab_state intact.
 */
const V75_DATA_VERSION="2019-2026-v7.5-user-test-remediation";
const V75_ACTIVE_SESSION_KEY="waseshibu_vocab_active_session_v1";
const V75_SESSION_FORMAT_VERSION=1;
let v75DraftTimer=null;
let v75RestorableSession=null;
let v75RestorePromptOpen=false;
let v75RestoringQuestion=false;

META.dataVersion=V75_DATA_VERSION;
if(EXAM_EXAMPLES["w90545631866000"]){
  EXAM_EXAMPLES["w90545631866000"].ja="うん、その理科のテストは私にも難しかったです。";
}
const v75QuestionStem=VOCAB_BY_ID.get("p2681140134");
if(v75QuestionStem){
  v75QuestionStem.entryType="listeningQuestionStem";
  v75QuestionStem.displayWord="What will ... probably say next?";
}
delete CLOZE["probably say next"];
const v75Term=VOCAB_BY_ID.get("w90945261587363");
if(v75Term){
  v75Term.entryType="supplemental";
  v75Term.evidenceType="compoundOnly";
}
[
  "p9000000008","p9000000005","p9000000012","p9000000004",
  "p9000000006","p9000000015","p9000000014","p9000000016"
].forEach(id=>{
  const v=VOCAB_BY_ID.get(id);
  if(v&&!v.challengeReason){
    v.challengeReason="得点ラベルは基礎重要度、75点挑戦層は出現年度の限定性・通常学習での優先度を表す別軸として扱います。";
  }
});

function v75IsoNow(){return new Date().toISOString()}
function v75MakeId(prefix="id"){
  if(globalThis.crypto&&typeof globalThis.crypto.randomUUID==="function")return prefix+"-"+globalThis.crypto.randomUUID();
  return prefix+"-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,10);
}
function v75SetToArray(x){return x instanceof Set?[...x]:Array.isArray(x)?x:[]}
function v75ToSet(x){return x instanceof Set?x:new Set(Array.isArray(x)?x:[])}
function v75HasMeaningfulActivity(s){
  if(!s||typeof s!=="object")return false;
  if(Number(s.stats&&s.stats.totalAnswers)>0)return true;
  return Object.values(s.words||{}).some(p=>attemptCount(p)>0);
}
function markSettingsUpdated(){state.settingsUpdatedAt=v75IsoNow()}

clearToast=function(){
  clearTimeout(toastTimer);
  const t=$("toast");
  if(!t)return;
  t.classList.remove("show");
  t.textContent="";
};
showToast=function(msg,options={}){
  const t=$("toast");if(!t)return;
  const kind=options.kind||"info";
  const durations={success:3000,info:3000,warning:4000,error:5000};
  const duration=Number(options.duration)||durations[kind]||3000;
  clearTimeout(toastTimer);
  t.textContent=msg;
  t.dataset.kind=kind;
  t.setAttribute("aria-live",kind==="error"?"assertive":"polite");
  t.classList.add("show");
  toastTimer=setTimeout(()=>{t.classList.remove("show");t.textContent=""},duration);
};

function v75SessionLabel(){
  const m=session&&session.active?session.mode:(state.settings.mode||"recommended");
  return session&&session.active?`学習中｜${modeLabel(m)}`:modeLabel(m);
}
const v74RenderLearnHome=renderLearnHome;
renderLearnHome=function(){
  syncToday();
  if(session&&session.active){
    $("learnSetup").style.display="none";
    $("quizArea").style.display="block";
    $("sessionBar").classList.add("show");
    $("headerTitle").textContent=v75SessionLabel();
    return;
  }
  $("learnSetup").style.display="block";
  $("quizArea").style.display="none";
  $("sessionBar").classList.remove("show");
  v74RenderLearnHome();
  $("headerTitle").textContent=v75SessionLabel();
};

setView=function(name){
  if(session&&session.active)persistActiveSession();
  clearToast();
  currentView=name;
  document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.id==="view-"+name));
  document.querySelectorAll(".nav button").forEach(b=>b.classList.toggle("active",b.dataset.view===name));
  const titles={learn:v75SessionLabel(),list:"単語一覧",stats:"学習統計",analysis:"過去問分析",settings:"設定"};
  $("headerTitle").textContent=titles[name]||"早稲渋 Vocabulary Coach";
  if(name==="list")renderList();
  if(name==="stats")renderStats();
  if(name==="analysis")renderAnalysis();
  if(name==="settings")renderSettings();
  if(name==="learn")renderLearnHome();
  window.scrollTo({top:0,behavior:"instant"});
};
function navigateToView(name){
  const h="#"+name;
  if(location.hash===h)setView(name);
  else location.hash=h;
}
function applyRoute(){
  const name=(location.hash||"#learn").slice(1);
  const allowed=new Set(["learn","list","stats","analysis","settings"]);
  setView(allowed.has(name)?name:"learn");
}

function v75SerializeCurrentQuestion(){
  if(!currentQuestion)return null;
  return {
    questionInstanceId:currentQuestion.questionInstanceId,
    wordId:currentQuestion.v&&currentQuestion.v.id,
    type:currentQuestion.type,
    isRetry:!!currentQuestion.isRetry,
    submitted:!!currentQuestion.submitted,
    outcomeApplied:!!currentQuestion.outcomeApplied,
    draft:currentQuestion.draft||"",
    choiceIds:Array.isArray(currentQuestion.choiceIds)?currentQuestion.choiceIds:[],
    selectedChoiceId:currentQuestion.selectedChoiceId||null,
    userAnswer:currentQuestion.userAnswer||"",
    ok:typeof currentQuestion.ok==="boolean"?currentQuestion.ok:null,
    reason:currentQuestion.reason||""
  };
}
function v75SerializableSession(){
  if(!session||!session.active)return null;
  return {
    sessionFormatVersion:V75_SESSION_FORMAT_VERSION,
    dataVersion:META.dataVersion,
    sessionId:session.sessionId,
    createdAt:session.createdAt,
    updatedAt:v75IsoNow(),
    mode:session.mode,
    year:session.year,
    requestedSessionSize:session.requestedSessionSize,
    actualSessionSize:session.actualSessionSize,
    unlimited:!!session.unlimited,
    candidatePoolIds:Array.isArray(session.candidatePoolIds)?session.candidatePoolIds:[],
    generatedBaseIds:Array.isArray(session.generatedBaseIds)?session.generatedBaseIds:[],
    baseQueueIds:Array.isArray(session.baseQueueIds)?session.baseQueueIds:[],
    baseCursor:Number(session.baseCursor)||0,
    baseAnswered:Number(session.baseAnswered)||0,
    retryAnswered:Number(session.retryAnswered)||0,
    totalAnswered:Number(session.totalAnswered)||0,
    correct:Number(session.correct)||0,
    wrong:Number(session.wrong)||0,
    masteryUps:Number(session.masteryUps)||0,
    currentQuestion:v75SerializeCurrentQuestion(),
    questionHistory:Array.isArray(session.questionHistory)?session.questionHistory:[],
    recentIds:Array.isArray(session.recentIds)?session.recentIds:[],
    retryQueue:Array.isArray(session.retryQueue)?session.retryQueue:[],
    retryCounts:session.retryCounts||{},
    blockedIds:v75SetToArray(session.blockedIds),
    missedIds:v75SetToArray(session.missed),
    weakIds:v75SetToArray(session.weak),
    newFixedIds:v75SetToArray(session.newFixed),
    pendingOutcome:session.pendingOutcome||null,
    challengeBaseCount:Number(session.challengeBaseCount)||0,
    baseReasons:session.baseReasons||{}
  };
}
persistActiveSession=function(){
  if(!session||!session.active)return;
  try{localStorage.setItem(V75_ACTIVE_SESSION_KEY,JSON.stringify(v75SerializableSession()))}
  catch(e){console.warn("Active session save failed",e)}
};
function clearActiveSession(){
  try{localStorage.removeItem(V75_ACTIVE_SESSION_KEY)}catch(e){console.warn("Active session clear failed",e)}
}
