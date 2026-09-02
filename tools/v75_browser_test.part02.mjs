
  // VOC-13: a pristine device may adopt settings from a valid imported backup.
  await openFresh();
  const freshBackup=await page.evaluate(()=>{
    const s=defaultState();s.schemaVersion=7;s.dataVersion='2019-2026-v7.4-ja-translation-audited';
    s.settings={mode:'random',sessionSize:50,year:'2024',accent:'us',voiceURI:'',theme:'light'};
    s.words[VOCAB[0].id]=Object.assign(defaultProgress(),{correct:2,incorrect:0,mastery:2,evidence:5,lastStudied:'2026-08-30T12:00:00.000Z'});
    return {app:'早稲渋 Vocabulary Coach',schemaVersion:7,dataVersion:s.dataVersion,state:s};
  });
  await page.evaluate(raw=>mergeImported(raw),freshBackup);
  let freshImport=await page.evaluate(()=>({mode:state.settings.mode,size:state.settings.sessionSize,year:state.settings.year,selected:document.getElementById('modeSelect').value}));
  assert.deepEqual(freshImport,{mode:'random',size:50,year:'2024',selected:'random'});
  await page.reload({waitUntil:'domcontentloaded'});
  freshImport=await page.evaluate(()=>({mode:state.settings.mode,size:state.settings.sessionSize,year:state.settings.year,selected:document.getElementById('modeSelect').value}));
  assert.deepEqual(freshImport,{mode:'random',size:50,year:'2024',selected:'random'});

  // Actual browser Export -> mutate -> Import: importing an older backup must never roll progress backwards.
  await openFresh();
  await page.evaluate(()=>{
    const p=getProgress(VOCAB[0].id);p.correct=5;p.incorrect=2;p.mastery=3;p.evidence=9;p.lastStudied='2026-09-01T10:00:00.000Z';
    state.stats.totalAnswers=100;state.settings.mode='random';state.settingsUpdatedAt=new Date(Date.now()-120000).toISOString();saveState();hydrateUiFromState();
    navigateToView('settings');
  });
  await page.waitForFunction(()=>location.hash==='#settings'&&document.getElementById('view-settings').classList.contains('active'));
  const downloadPromise=page.waitForEvent('download');
  await page.click('#exportBtn');
  const download=await downloadPromise;
  const exportedPath=await download.path();
  assert.ok(exportedPath);
  await page.evaluate(()=>{
    const p=getProgress(VOCAB[0].id);p.correct=8;p.incorrect=3;p.mastery=3;p.evidence=10;p.lastStudied='2026-09-02T10:00:00.000Z';
    state.stats.totalAnswers=103;state.settings.mode='70';state.settingsUpdatedAt=new Date().toISOString();saveState();hydrateUiFromState();
  });
  await page.setInputFiles('#importFile',exportedPath);
  await page.waitForFunction(()=>document.getElementById('toast').textContent.includes('統合しました'));
  const exportImport=await page.evaluate(()=>({
    total:state.stats.totalAnswers,mode:state.settings.mode,
    p:{correct:getProgress(VOCAB[0].id).correct,incorrect:getProgress(VOCAB[0].id).incorrect,mastery:getProgress(VOCAB[0].id).mastery,evidence:getProgress(VOCAB[0].id).evidence,lastStudied:getProgress(VOCAB[0].id).lastStudied}
  }));
  assert.equal(exportImport.total,103);
  assert.equal(exportImport.mode,'70');
  assert.equal(exportImport.p.correct,8);
  assert.equal(exportImport.p.incorrect,3);
  assert.equal(exportImport.p.lastStudied,'2026-09-02T10:00:00.000Z');
  await page.reload({waitUntil:'domcontentloaded'});
  assert.equal(await page.evaluate(()=>state.stats.totalAnswers),103);
  assert.equal(await page.evaluate(()=>state.settings.mode),'70');

  // Broken JSON through the real file input is rejected without changing state.
  await openFresh();
  const invalidBefore=await page.evaluate(()=>JSON.stringify(state));
  await page.setInputFiles('#importFile',{name:'broken.json',mimeType:'application/json',buffer:Buffer.from('{not valid json','utf8')});
  await page.waitForFunction(()=>document.getElementById('toast').textContent.includes('読み込めませんでした'));
  const invalidAfter=await page.evaluate(()=>JSON.stringify(state));
  assert.equal(invalidAfter,invalidBefore);

  // Import is blocked while a session is active.
  await openFresh();
  await start('recommended','10','all');
  const activeImportBefore=await page.evaluate(()=>({sessionId:session.sessionId,total:state.stats.totalAnswers}));
  await page.setInputFiles('#importFile',{name:'valid.json',mimeType:'application/json',buffer:backupBuffer(freshBackup)});
  await page.waitForFunction(()=>document.getElementById('toast').textContent.includes('セッションを終了してから'));
  const activeImportAfter=await page.evaluate(()=>({sessionId:session.sessionId,total:state.stats.totalAnswers}));
  assert.deepEqual(activeImportAfter,activeImportBefore);
  await page.evaluate(()=>endSession(true));

  // Highest-priority existing-user protection: simulate a full v7.4 state with all 680 IDs.
  // Merely opening/reloading v7.5 must not write or mutate the existing localStorage JSON.
  await openFresh();
  const legacySetup=await page.evaluate(()=>{
    const words={};
    VOCAB.forEach((v,i)=>{
      const mastery=i%5;
      words[v.id]={
        mastery,correct:(i%11)+1,incorrect:i%4,streak:i%3,
        lastStudied:new Date(Date.UTC(2026,7,1+(i%28),10,i%60)).toISOString(),
        nextReview:new Date(Date.UTC(2026,8,3+(i%20),9,0)).toISOString(),
        recentMistakeUntil:i%7===0?new Date(Date.UTC(2026,8,5,9,0)).toISOString():null,
        lastRating:i%4===0?'miss':'got',evidence:Math.min(12,mastery*3+1),
        recentResults:[{ok:i%4!==0,type:'choice',at:new Date(Date.UTC(2026,7,1+(i%28),10,0)).toISOString()}]
      };
    });
    words['legacy-orphan-test']={mastery:3,correct:17,incorrect:5,streak:2,lastStudied:'2026-08-31T12:00:00.000Z',nextReview:'2026-09-10T12:00:00.000Z',recentMistakeUntil:null,lastRating:'got',evidence:10,recentResults:[{ok:true,type:'reverse',at:'2026-08-31T12:00:00.000Z'}]};
    const s={
      schemaVersion:7,dataVersion:'2019-2026-v7.4-ja-translation-audited',words,
      stats:{todayKey:localDayKey(),todayCount:23,totalAnswers:4321,totalSessions:211},
      settings:{mode:'recommended',sessionSize:20,year:'all',accent:'gb',voiceURI:'legacy-voice',theme:'auto'}
    };
    const raw=JSON.stringify(s);
    localStorage.setItem('waseshibu_vocab_state',raw);
    localStorage.removeItem('waseshibu_vocab_active_session_v1');
    return {raw,count:Object.keys(words).length};
  });
  assert.equal(legacySetup.count,681);
  await page.reload({waitUntil:'domcontentloaded'});
  const rawAfterOpen=await page.evaluate(()=>localStorage.getItem('waseshibu_vocab_state'));
  assert.equal(rawAfterOpen,legacySetup.raw,'opening v7.5 rewrote existing v7.4 state');
  await page.reload({waitUntil:'domcontentloaded'});
  const rawAfterSecondOpen=await page.evaluate(()=>localStorage.getItem('waseshibu_vocab_state'));
  assert.equal(rawAfterSecondOpen,legacySetup.raw,'second reload rewrote existing v7.4 state');

  // After one new answer, only that answered ID plus intentional aggregate counters/dataVersion may change.
  const legacyBeforeAnswer=await page.evaluate(()=>JSON.parse(localStorage.getItem('waseshibu_vocab_state')));
  await start('random','10','all');
  const changedId=await page.evaluate(()=>currentQuestion.v.id);
  await answerCorrect();
  const legacyAfterAnswer=await page.evaluate(()=>JSON.parse(localStorage.getItem('waseshibu_vocab_state')));
  assert.equal(legacyAfterAnswer.schemaVersion,7);
  assert.equal(legacyAfterAnswer.dataVersion,'2019-2026-v7.5-user-test-remediation');
  assert.equal(legacyAfterAnswer.stats.totalAnswers,legacyBeforeAnswer.stats.totalAnswers+1);
  assert.ok(legacyAfterAnswer.words['legacy-orphan-test']);
  assert.deepEqual(legacyAfterAnswer.words['legacy-orphan-test'],legacyBeforeAnswer.words['legacy-orphan-test']);
  const protectedFields=['mastery','correct','incorrect','streak','lastStudied','nextReview','recentMistakeUntil','lastRating','evidence','recentResults'];
  let protectedCount=0;
  for(const [id,before] of Object.entries(legacyBeforeAnswer.words)){
    if(id===changedId)continue;
    const after=legacyAfterAnswer.words[id];
    assert.ok(after,`saved history ID disappeared: ${id}`);
    for(const k of protectedFields)assert.deepEqual(after[k],before[k],`history changed unexpectedly: ${id}.${k}`);
    protectedCount++;
  }
  assert.equal(protectedCount,680);
  await page.reload({waitUntil:'domcontentloaded'});
  const afterHistoryReload=await page.evaluate(()=>({
    schema:state.schemaVersion,total:state.stats.totalAnswers,orphan:JSON.parse(JSON.stringify(state.words['legacy-orphan-test'])),count:Object.keys(state.words).length
  }));
  assert.equal(afterHistoryReload.schema,7);
  assert.equal(afterHistoryReload.total,4322);
  assert.equal(afterHistoryReload.count,681);
  assert.deepEqual(afterHistoryReload.orphan,legacyBeforeAnswer.words['legacy-orphan-test']);
  await resumeAfterReload();
  const resubmittedTotals=await page.evaluate(()=>state.stats.totalAnswers);
  assert.equal(resubmittedTotals,4322,'reload of submitted question double-counted an answer');
  await page.evaluate(()=>endSession(true));

  // No reference-only entry can appear in any finite normal session plan.
  await openFresh();
  for(const mode of ['recommended','60','70','diagnostic','75','unlearned','frequent','random']){
    const result=await page.evaluate(mode=>{
      const p=buildSessionPlan(mode,'all',20);
      const ids=p.baseQueueIds||[];
      return {ids,refs:ids.filter(id=>(VOCAB_BY_ID.get(id).studyLayer||'core')==='reference').length};
    },mode);
    assert.equal(result.refs,0,`${mode} included reference-only cards`);
  }

  // Final browser health gate.
  assert.deepEqual(pageErrors,[],`page errors: ${pageErrors.join('\n')}`);
  assert.deepEqual(consoleErrors,[],`console errors: ${consoleErrors.join('\n')}`);
  console.log(`${process.env.V75_PASS||'USER-PASS'}: CLEAN`);
} finally {
  await browser.close();
}
