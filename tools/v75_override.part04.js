  if(options.countSession!==false){state.stats.totalSessions++;saveState()}
  clearActiveSession();
  $("sessionBar").classList.remove("show");$("quizArea").style.display="none";$("learnSetup").style.display="block";
  v75UpdateQuickSpeakLabel();
  if(silent){session=null;currentQuestion=null;renderLearnHome();return}
  const accuracy=s.totalAnswered?Math.round(s.correct/s.totalAnswered*100):0;
  const challengeRatio=s.mode==="75"&&!s.unlimited&&s.actualSessionSize?Math.round(s.challengeBaseCount/s.actualSessionSize*100):null;
  openSheet(`<h2 style="margin-top:0">セッション結果</h2>
  <div class="grid">
   <div class="stat"><div class="n">${s.baseAnswered}</div><div class="l">基本問題</div></div>
   <div class="stat"><div class="n">${s.retryAnswered}</div><div class="l">再確認</div></div>
   <div class="stat"><div class="n">${s.totalAnswered}</div><div class="l">総回答</div></div>
   <div class="stat"><div class="n">${s.correct}</div><div class="l">正解</div></div>
   <div class="stat"><div class="n">${s.wrong}</div><div class="l">不正解</div></div>
   <div class="stat"><div class="n">${accuracy}%</div><div class="l">正解率</div></div>
   <div class="stat"><div class="n">${s.masteryUps}</div><div class="l">習熟度UP</div></div>
   <div class="stat"><div class="n">${s.newFixed.size}</div><div class="l">新しく定着</div></div>
  </div>
  ${challengeRatio!=null?`<div class="section-title">75点挑戦層の基本問題比率</div><div class="small"><b>${s.challengeBaseCount}/${s.actualSessionSize}（${challengeRatio}%）</b></div>`:""}
  <div class="section-title">今回ミスした語</div><div class="small">${s.missed.size?[...s.missed].slice(0,18).map(id=>esc(v75DisplayWord(VOCAB_BY_ID.get(id)||{word:id}))).join("・"):"なし"}</div>
  <div class="section-title">苦手判定語</div><div class="small">${s.weak.size?[...s.weak].slice(0,18).map(id=>esc(v75DisplayWord(VOCAB_BY_ID.get(id)||{word:id}))).join("・"):"なし"}</div>
  <div class="section-title">次の復習予定</div><div class="small">${esc(v75NextReviewText(s))}</div>
  <button class="primary full" style="margin-top:18px" onclick="closeSheet()">閉じる</button>`);
  session=null;currentQuestion=null;questionResolved=false;renderLearnHome();
};

function restoreActiveSession(raw){
  v75RestoreSessionObject(raw);
  recoverPendingOutcome();
  $("learnSetup").style.display="none";$("quizArea").style.display="block";$("sessionBar").classList.add("show");
  currentView="learn";location.hash="#learn";
  if(currentQuestion)v75RenderCurrentQuestion();else renderQuestion();
  persistActiveSession();
}
function v75PromptRestore(raw){
  v75RestorePromptOpen=true;
  const shown=raw.unlimited?`${raw.baseAnswered||0}問回答済み`:`${raw.baseAnswered||0} / ${raw.actualSessionSize||raw.requestedSessionSize||0}問まで進んでいます`;
  openSheet(`<h2 style="margin-top:0">前回の学習が途中です</h2><p class="small">${esc(shown)}。</p><div class="row" style="margin-top:18px"><button class="primary" id="resumeActiveBtn" style="flex:1">続きから再開</button><button class="danger-lite" id="finishActiveBtn" style="flex:1">このセッションを終了</button></div>`);
  $("resumeActiveBtn").addEventListener("click",()=>{v75RestorePromptOpen=false;closeSheet();restoreActiveSession(raw)});
  $("finishActiveBtn").addEventListener("click",()=>{v75RestorePromptOpen=false;v75RestoreSessionObject(raw);recoverPendingOutcome();closeSheet();endSession(false,{countSession:true,force:true})});
}

function validateImportPayload(raw){
  if(!raw||typeof raw!=="object"||Array.isArray(raw))return false;
  if(raw.app&&raw.app!=="早稲渋 Vocabulary Coach")return false;
  const s=raw.state&&typeof raw.state==="object"?raw.state:raw;
  if(!s||typeof s!=="object")return false;
  const hasSchema=Number.isFinite(Number(raw.schemaVersion||s.schemaVersion));
  const hasProgress=(s.words&&typeof s.words==="object"&&!Array.isArray(s.words))||(s.progress&&typeof s.progress==="object"&&!Array.isArray(s.progress));
  if(!hasSchema||!hasProgress)return false;
  if(s.stats!=null&&typeof s.stats!=="object")return false;
  if(s.settings!=null&&typeof s.settings!=="object")return false;
  return true;
}
mergeImported=function(raw){
  if(!validateImportPayload(raw))throw new Error("Invalid vocabulary backup");
  const incoming=migrate(raw.state||raw),current=state;
  const currentWasActive=v75HasMeaningfulActivity(current);
  syncToday();
  for(const [id,ip] of Object.entries(incoming.words||{})){
    const cp=current.words[id];
    if(!cp){current.words[id]=ip;continue}
    const it=ip.lastStudied?new Date(ip.lastStudied).getTime():0,ct=cp.lastStudied?new Date(cp.lastStudied).getTime():0;
    const newer=it>=ct?ip:cp;
    current.words[id]=Object.assign(defaultProgress(),newer,{
      correct:Math.max(Number(ip.correct)||0,Number(cp.correct)||0),
      incorrect:Math.max(Number(ip.incorrect)||0,Number(cp.incorrect)||0),
      streak:newer.streak??0
    });
  }
  current.stats.totalAnswers=Math.max(Number(current.stats.totalAnswers)||0,Number(incoming.stats.totalAnswers)||0);
  current.stats.totalSessions=Math.max(Number(current.stats.totalSessions)||0,Number(incoming.stats.totalSessions)||0);
  if(incoming.stats.todayKey===localDayKey())current.stats.todayCount=Math.max(Number(current.stats.todayCount)||0,Number(incoming.stats.todayCount)||0);
  const ct=current.settingsUpdatedAt?new Date(current.settingsUpdatedAt).getTime():0;
  const it=incoming.settingsUpdatedAt?new Date(incoming.settingsUpdatedAt).getTime():0;
  let useIncoming=false;
  if(ct&&it)useIncoming=it>ct;
  else if(!ct&&it)useIncoming=true;
  else if(!ct&&!it)useIncoming=!currentWasActive;
  if(useIncoming){current.settings=Object.assign({},current.settings,incoming.settings||{});current.settingsUpdatedAt=incoming.settingsUpdatedAt||v75IsoNow()}
  current.schemaVersion=SCHEMA_VERSION;current.dataVersion=META.dataVersion;saveState();
  hydrateUiFromState();
  showToast("バックアップを統合しました",{kind:"success"});
};
handleImport=function(file){
  if(session&&session.active){showToast("学習中のセッションがあります。セッションを終了してからインポートしてください。",{kind:"warning",duration:5000});return}
  if(loadActiveSession()){showToast("途中セッションがあります。続きから再開するか終了してからインポートしてください。",{kind:"warning",duration:5000});return}
  const reader=new FileReader();
  reader.onload=()=>{try{const raw=JSON.parse(reader.result);mergeImported(raw)}catch(e){console.warn("Import rejected",e);showToast("このバックアップJSONは読み込めませんでした",{kind:"error"})}};
  reader.readAsText(file);
};

function hydrateUiFromState(){
  syncToday();
  setTheme(state.settings.theme||"auto");
  if($("modeSelect"))$("modeSelect").value=state.settings.mode||"recommended";
  if($("learnYearSelect"))$("learnYearSelect").value=state.settings.year||"all";
  if($("sessionSizeSelect"))$("sessionSizeSelect").value=String(state.settings.sessionSize??20);
  if($("themeSelect"))$("themeSelect").value=state.settings.theme||"auto";
  if($("accentSelect"))$("accentSelect").value=state.settings.accent||"auto";
  populateVoices();
  applyRoute();
  if(currentView==="stats")renderStats();
  if(currentView==="settings")renderSettings();
  v75UpdateQuickSpeakLabel();
}

renderList=function(){
  const q=$("searchInput").value.trim().toLowerCase(),y=$("listYear").value,pri=$("listPriority").value,layer=$("listLayer").value,lev=$("listLevel").value,mas=$("listMastery").value;
  let arr=VOCAB.filter(v=>{
    const p=getProgress(v.id),display=v75DisplayWord(v).toLowerCase();
    if(q&&!v.word.toLowerCase().includes(q)&&!display.includes(q)&&!v.meaning.toLowerCase().includes(q))return false;
    if(y!=="all"&&!v.years.includes(Number(y)))return false;
    if(pri!=="all"&&v.priority!==pri)return false;
    if(layer!=="all"&&(v.studyLayer||"core")!==layer)return false;
    if(lev!=="all"&&String(v.level)!==lev)return false;
    if(mas!=="all"&&String(p.mastery)!==mas)return false;
    return true;
  });
  const po={S:0,A:1,B:2,C:3},lo={core:0,diagnostic:1,challenge:2,reference:3};
  arr.sort((a,b)=>lo[a.studyLayer||"core"]-lo[b.studyLayer||"core"]||po[a.priority]-po[b.priority]||a.level-b.level||b.yearCount-a.yearCount||effectiveFrequency(b)-effectiveFrequency(a)||a.word.localeCompare(b.word));
  $("listCount").textContent=`${arr.length}件`;
  $("wordList").innerHTML=arr.length?arr.map(v=>{
    const p=getProgress(v.id);
    return `<div class="list-row" data-detail="${v.id}"><div><div class="list-word">${esc(v75DisplayWord(v))}</div><div class="list-meaning">${esc(v.meaning)}</div><div class="badges" style="margin-top:6px">${badgeHTML(v)} ${masteryDots(p.mastery)}</div></div><div class="list-meta">${v75CompactEvidence(v)}<br>習熟度 ${p.mastery} ${MASTER_LABEL[p.mastery]}</div></div>`;
  }).join(""):`<div class="empty">該当する語がありません</div>`;
  document.querySelectorAll("[data-detail]").forEach(el=>el.addEventListener("click",()=>openDetail(el.dataset.detail)));
};
openDetail=function(id){
  const v=VOCAB_BY_ID.get(id),p=getProgress(id);if(!v)return;
  const cats=v.categories.map(c=>CATEGORY_JP[c]||c).join("・");
  const audio=v.entryType==="listeningQuestionStem"?"":`<button class="icon-btn" onclick="speakWord('${v.id}')" aria-label="${esc(v75AudioLabel(v))}" title="${esc(v75DisplayWord(v))} の発音を聞く">🔊</button>`;
  openSheet(`<div class="row between"><div><div class="word" style="font-size:34px;text-align:left">${esc(v75DisplayWord(v))}</div><div style="font-size:19px;font-weight:650;margin-top:5px">${esc(v.meaning)}</div></div>${audio}</div>
  <div class="badges" style="margin-top:12px">${badgeHTML(v)} <span class="badge">習熟度 ${p.mastery} ${MASTER_LABEL[p.mastery]}</span></div>
  ${v75EntryNote(v)}<div class="small" style="margin-top:12px">${esc(v.note||"")}</div><div class="section-title">出題根拠</div>${v75EvidenceDetail(v)}
  <div class="section-title">カテゴリ</div><div class="small">${esc(cats||"—")}</div>${examExampleHTML(v)}
  <button class="secondary full" style="margin-top:18px" onclick="closeSheet()">閉じる</button>`);
};

const v74RenderAnalysis=renderAnalysis;
renderAnalysis=function(){
  v74RenderAnalysis();
  const grid=$("analysisGrid");if(!grid||!grid.parentElement)return;
  const notes=[...grid.parentElement.querySelectorAll("p.tiny.muted")].filter(p=>p.textContent.trim().startsWith("※1,831"));
  notes.forEach((p,i)=>{if(i===0){p.id="analysisCandidateNote"}else p.remove()});
  const table=$("top100Body")&&$("top100Body").closest(".card");
  if(table&&!document.getElementById("evidenceCountHelp")){
    const p=document.createElement("p");p.id="evidenceCountHelp";p.className="tiny muted";p.style.margin="10px 2px 0";
    p.textContent="「通常出現」は本文・音声での表層出現回数、「年度数」は直接出題なども含む登録年度数です。0回／1年度は、語句整序・直接語彙などで出題された場合に生じます。";
    table.appendChild(p);
  }
};

function v75EnsureYearHelp(){
  const sel=$("learnYearSelect");if(!sel||document.getElementById("yearExampleHelp"))return;
  const p=document.createElement("p");p.id="yearExampleHelp";p.className="tiny muted";p.style.margin="6px 3px 0";
  p.textContent="年度指定はその年度に確認された語を絞り込みます。例文は同年度を優先し、代表例が別年度の場合はその旨を表示します。";
  sel.parentElement.appendChild(p);
}

attachEvents=function(){
  document.querySelectorAll(".nav button").forEach(b=>b.addEventListener("click",()=>navigateToView(b.dataset.view)));
  $("startBtn").addEventListener("click",startSession);
  $("endSessionBtn").addEventListener("click",()=>endSession(false));
  $("quickSpeak").addEventListener("click",()=>speakWord(currentQuestion?currentQuestion.v.id:"important"));
  $("modeSelect").addEventListener("change",e=>{state.settings.mode=e.target.value;markSettingsUpdated();saveState();if(currentView==="learn")$("headerTitle").textContent=v75SessionLabel()});
  $("learnYearSelect").addEventListener("change",e=>{state.settings.year=e.target.value;markSettingsUpdated();saveState()});
  $("sessionSizeSelect").addEventListener("change",e=>{state.settings.sessionSize=Number(e.target.value);markSettingsUpdated();saveState()});
  ["searchInput","listYear","listPriority","listLayer","listLevel","listMastery"].forEach(id=>$(id).addEventListener(id==="searchInput"?"input":"change",renderList));
  $("sheetOverlay").addEventListener("click",e=>{if(e.target===$("sheetOverlay")&&!v75RestorePromptOpen)closeSheet()});
  $("accentSelect").addEventListener("change",e=>{state.settings.accent=e.target.value;state.settings.voiceURI="";markSettingsUpdated();saveState();populateVoices()});
  $("voiceSelect").addEventListener("change",e=>{state.settings.voiceURI=e.target.value;markSettingsUpdated();saveState()});
  $("voiceTestBtn").addEventListener("click",()=>speakWord("important"));
  $("themeSelect").addEventListener("change",e=>{setTheme(e.target.value);markSettingsUpdated();saveState()});
  $("exportBtn").addEventListener("click",exportData);
  $("importBtn").addEventListener("click",()=>{
    if(session&&session.active||loadActiveSession())showToast("途中セッションがあります。終了してからインポートしてください。",{kind:"warning",duration:5000});
    else $("importFile").click();
  });
  $("importFile").addEventListener("change",e=>{const f=e.target.files&&e.target.files[0];if(f)handleImport(f);e.target.value=""});
