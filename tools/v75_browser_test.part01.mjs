
  await page.evaluate(()=>closeSheet());

  // VOC-02: reload before answering must restore the exact active question and not alter progress.
  await openFresh();
  await start('unlearned','10','all');
  const beforeReload=await page.evaluate(()=>({
    sessionId:session.sessionId,qid:currentQuestion.questionInstanceId,wordId:currentQuestion.v.id,
    baseCursor:session.baseCursor,totalAnswers:state.stats.totalAnswers,
    word:JSON.parse(JSON.stringify(getProgress(currentQuestion.v.id)))
  }));
  await page.reload({waitUntil:'domcontentloaded'});
  await resumeAfterReload();
  const afterReload=await page.evaluate(()=>({
    sessionId:session.sessionId,qid:currentQuestion.questionInstanceId,wordId:currentQuestion.v.id,
    baseCursor:session.baseCursor,totalAnswers:state.stats.totalAnswers,
    submitted:currentQuestion.submitted,word:JSON.parse(JSON.stringify(getProgress(currentQuestion.v.id)))
  }));
  assert.equal(afterReload.sessionId,beforeReload.sessionId);
  assert.equal(afterReload.qid,beforeReload.qid);
  assert.equal(afterReload.wordId,beforeReload.wordId);
  assert.equal(afterReload.baseCursor,beforeReload.baseCursor);
  assert.equal(afterReload.totalAnswers,beforeReload.totalAnswers);
  assert.equal(afterReload.submitted,false);
  assert.deepEqual(afterReload.word,beforeReload.word);

  // VOC-02: reload after submit must not re-apply outcome.
  await answerCorrect();
  const submitted=await page.evaluate(()=>({
    qid:currentQuestion.questionInstanceId,wordId:currentQuestion.v.id,totalAnswers:state.stats.totalAnswers,
    correct:getProgress(currentQuestion.v.id).correct,submitted:currentQuestion.submitted
  }));
  assert.equal(submitted.submitted,true);
  await page.reload({waitUntil:'domcontentloaded'});
  await resumeAfterReload();
  const restoredSubmitted=await page.evaluate(()=>({
    qid:currentQuestion.questionInstanceId,wordId:currentQuestion.v.id,totalAnswers:state.stats.totalAnswers,
    correct:getProgress(currentQuestion.v.id).correct,submitted:currentQuestion.submitted,outcomeApplied:currentQuestion.outcomeApplied
  }));
  assert.equal(restoredSubmitted.qid,submitted.qid);
  assert.equal(restoredSubmitted.wordId,submitted.wordId);
  assert.equal(restoredSubmitted.totalAnswers,submitted.totalAnswers);
  assert.equal(restoredSubmitted.correct,submitted.correct);
  assert.equal(restoredSubmitted.submitted,true);
  assert.equal(restoredSubmitted.outcomeApplied,true);
  await page.evaluate(()=>endSession(true));

  // VOC-02: typed draft persists across reload.
  await openFresh();
  await start('unlearned','10','all');
  await page.evaluate(()=>{
    currentQuestion.type='reverse';currentQuestion.draft='';currentQuestion.choiceIds=[];questionResolved=false;
    v75RenderCurrentQuestion();persistActiveSession();
  });
  await page.fill('#typedAnswer','draft-answer');
  await page.waitForTimeout(500);
  const draftQid=await page.evaluate(()=>currentQuestion.questionInstanceId);
  await page.reload({waitUntil:'domcontentloaded'});
  await resumeAfterReload();
  assert.equal(await page.inputValue('#typedAnswer'),'draft-answer');
  assert.equal(await page.evaluate(()=>currentQuestion.questionInstanceId),draftQid);
  await page.evaluate(()=>endSession(true));

  // VOC-08: in-app history works without losing the active question.
  await openFresh();
  await start('recommended','10','all');
  const navQ=await page.evaluate(()=>currentQuestion.questionInstanceId);
  await page.click('.nav button[data-view="list"]');
  await page.waitForFunction(()=>location.hash==='#list'&&document.getElementById('view-list').classList.contains('active'));
  assert.equal(await page.locator('#view-list').evaluate(el=>el.classList.contains('active')),true);
  await page.goBack({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>location.hash==='#learn'&&document.getElementById('view-learn').classList.contains('active'));
  assert.equal(await page.evaluate(()=>session&&session.active&&currentQuestion.questionInstanceId),navQ);
  await page.goForward({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>location.hash==='#list'&&document.getElementById('view-list').classList.contains('active'));
  assert.equal(await page.evaluate(()=>session&&session.active&&currentQuestion.questionInstanceId),navQ);
  await page.evaluate(()=>endSession(true));

  // VOC-05: analysis note stays unique across repeated visits.
  await openFresh();
  for(let i=0;i<10;i++){
    await page.evaluate(()=>navigateToView('analysis'));
    await page.evaluate(()=>navigateToView('learn'));
  }
  await page.evaluate(()=>navigateToView('analysis'));
  const notes=await page.locator('p.tiny.muted').evaluateAll(xs=>xs.filter(x=>x.textContent.trim().startsWith('※1,831')).length);
  assert.equal(notes,1);

  // VOC-06: toast replacement, auto-clear, view-change clear, and inline input validation.
  await page.evaluate(()=>showToast('first',{duration:1000}));
  await page.evaluate(()=>showToast('second',{duration:250}));
  assert.equal((await page.locator('#toast').textContent()).trim(),'second');
  await page.waitForTimeout(350);
  assert.equal((await page.locator('#toast').textContent()).trim(),'');
  await page.evaluate(()=>showToast('view-clear',{duration:5000}));
  await page.evaluate(()=>navigateToView('settings'));
  assert.equal((await page.locator('#toast').textContent()).trim(),'');
  await page.evaluate(()=>navigateToView('learn'));
  await start('unlearned','10','all');
  await page.evaluate(()=>{currentQuestion.type='reverse';currentQuestion.draft='';questionResolved=false;v75RenderCurrentQuestion();});
  await page.click('#submitTyped');
  assert.equal((await page.locator('#typedError').textContent()).trim(),'答えを入力してください');
  assert.equal((await page.locator('#toast').textContent()).trim(),'');
  await page.evaluate(()=>endSession(true));

  // VOC-04/07/09/10/11/12: content, evidence, selected-year example, and accessibility.
  await openFresh();
  const contentChecks=await page.evaluate(()=>{
    const hard=EXAM_EXAMPLES['w90545631866000'];
    state.settings.year='2019';
    const believe=VOCAB_BY_ID.get('w3032116916');
    const selectedYearExample=examExampleHTML(believe);
    const stem=VOCAB_BY_ID.get('p2681140134');
    const term=VOCAB_BY_ID.get('w90945261587363');
    const useful=VOCAB_BY_ID.get('w2386378786');
    return {
      hardJa:hard.ja,
      selectedYearExample,
      stemDisplay:v75DisplayWord(stem),stemType:stem.entryType,stemQuestionType:chooseType(stem,false),
      termType:term.entryType,termEvidence:term.evidenceType,termCompact:v75CompactEvidence(term),
      usefulCompact:v75CompactEvidence(useful)
    };
  });
  assert.equal(contentChecks.hardJa,'うん、その理科のテストは私にも難しかったです。');
  assert.match(contentChecks.selectedYearExample,/2019年度 問題冊子/);
  assert.match(contentChecks.selectedYearExample,/Who would .*believe.* such a stupid story/);
  assert.equal(contentChecks.stemDisplay,'What will ... probably say next?');
  assert.equal(contentChecks.stemType,'listeningQuestionStem');
  assert.equal(contentChecks.stemQuestionType,'choice');
  assert.equal(contentChecks.termType,'supplemental');
  assert.equal(contentChecks.termEvidence,'compoundOnly');
  assert.match(contentChecks.termCompact,/複合語内で確認/);
  assert.match(contentChecks.usefulCompact,/本文・音声：2回/);
  assert.match(contentChecks.usefulCompact,/登録年度：3年度/);
  assert.match(contentChecks.usefulCompact,/直接出題：1年度/);

  await start('recommended','10','all');
  await page.evaluate(()=>{
    currentQuestion={v:VOCAB_BY_ID.get('w1325048947'),type:'choice',isRetry:false,questionInstanceId:'aria-test',submitted:false,outcomeApplied:false,draft:'',choiceIds:[],selectedChoiceId:null,userAnswer:'',ok:null,reason:''};
    questionResolved=false;v75RenderCurrentQuestion();
  });
  const audioButton=page.locator('#promptArea button[aria-label]').first();
  assert.ok(await audioButton.count());
  const audioName=await audioButton.getAttribute('aria-label');
  assert.ok(audioName&&audioName!=='🔊'&&audioName.includes('community'));
  await page.evaluate(()=>endSession(true));

  // VOC-13: existing-device settings win over an older imported backup and survive reload.
  await openFresh();
  await page.evaluate(()=>{
    state.settings.mode='70';state.settings.year='2026';state.settings.sessionSize=30;
    state.settingsUpdatedAt=new Date(Date.now()+60000).toISOString();
    state.stats.totalAnswers=257;
    const v=VOCAB[0],p=getProgress(v.id);p.correct=9;p.incorrect=2;p.mastery=3;p.evidence=9;
    saveState();hydrateUiFromState();
  });
  const incoming=await page.evaluate(()=>{
    const v=VOCAB[0];
    const s=defaultState();
    s.schemaVersion=7;s.dataVersion='2019-2026-v7.4-ja-translation-audited';
    s.settings={mode:'random',sessionSize:10,year:'all',accent:'gb',voiceURI:'',theme:'dark'};
    s.settingsUpdatedAt=new Date(Date.now()-60000).toISOString();
    s.stats.totalAnswers=256;s.words[v.id]=Object.assign(defaultProgress(),{correct:3,incorrect:1,mastery:2,evidence:5,lastStudied:'2026-08-01T10:00:00.000Z'});
    return {app:'早稲渋 Vocabulary Coach',schemaVersion:7,dataVersion:s.dataVersion,state:s};
  });
  await page.evaluate(raw=>mergeImported(raw),incoming);
  const importExisting=await page.evaluate(()=>({
    total:state.stats.totalAnswers,mode:state.settings.mode,year:state.settings.year,size:state.settings.sessionSize,
    selected:document.getElementById('modeSelect').value,header:document.getElementById('headerTitle').textContent,
    p:JSON.parse(JSON.stringify(getProgress(VOCAB[0].id)))
  }));
  assert.equal(importExisting.total,257);
  assert.equal(importExisting.mode,'70');
  assert.equal(importExisting.year,'2026');
  assert.equal(importExisting.size,30);
  assert.equal(importExisting.selected,'70');
  assert.match(importExisting.header,/70点安定/);
  assert.equal(importExisting.p.correct,9);
  assert.equal(importExisting.p.incorrect,2);
  await page.reload({waitUntil:'domcontentloaded'});
  const postImportReload=await page.evaluate(()=>({total:state.stats.totalAnswers,mode:state.settings.mode,selected:document.getElementById('modeSelect').value,header:document.getElementById('headerTitle').textContent}));
  assert.deepEqual(postImportReload,{total:257,mode:'70',selected:'70',header:'70点安定'});
