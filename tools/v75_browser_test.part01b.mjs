
  // Existing-user protection: realistic sparse v7.4 state (only studied IDs persisted) must remain intact.
  await openFresh();
  const sparseLegacy=await page.evaluate(()=>{
    const words={};
    VOCAB.slice(0,50).forEach((v,i)=>{
      words[v.id]={
        mastery:i%5,correct:(i%7)+1,incorrect:i%3,streak:i%4,
        lastStudied:new Date(Date.UTC(2026,7,10+(i%15),8,i%60)).toISOString(),
        nextReview:new Date(Date.UTC(2026,8,5+(i%15),9,0)).toISOString(),
        recentMistakeUntil:null,lastRating:i%3===0?'miss':'got',
        evidence:Math.min(12,(i%5)*3+1),
        recentResults:[{ok:i%3!==0,type:'choice',at:new Date(Date.UTC(2026,7,10+(i%15),8,0)).toISOString()}]
      };
    });
    words['legacy-sparse-orphan']={mastery:2,correct:4,incorrect:1,streak:1,lastStudied:'2026-08-25T12:00:00.000Z',nextReview:'2026-09-15T12:00:00.000Z',recentMistakeUntil:null,lastRating:'got',evidence:7,recentResults:[{ok:true,type:'choice',at:'2026-08-25T12:00:00.000Z'}]};
    const s={
      schemaVersion:7,dataVersion:'2019-2026-v7.4-ja-translation-audited',words,
      stats:{todayKey:localDayKey(),todayCount:7,totalAnswers:777,totalSessions:44},
      settings:{mode:'70',sessionSize:20,year:'all',accent:'auto',voiceURI:'',theme:'auto'}
    };
    const raw=JSON.stringify(s);
    localStorage.setItem('waseshibu_vocab_state',raw);
    localStorage.removeItem('waseshibu_vocab_active_session_v1');
    return {raw,ids:Object.keys(words)};
  });
  await page.reload({waitUntil:'domcontentloaded'});
  assert.equal(await page.evaluate(()=>localStorage.getItem('waseshibu_vocab_state')),sparseLegacy.raw,'opening v7.5 rewrote sparse v7.4 state');
  const sparseBefore=JSON.parse(sparseLegacy.raw);
  await start('random','10','all');
  const sparseChanged=await page.evaluate(()=>currentQuestion.v.id);
  await answerCorrect();
  const sparseAfter=await page.evaluate(()=>JSON.parse(localStorage.getItem('waseshibu_vocab_state')));
  assert.equal(sparseAfter.stats.totalAnswers,778);
  assert.ok(sparseAfter.words['legacy-sparse-orphan']);
  for(const [id,before] of Object.entries(sparseBefore.words)){
    if(id===sparseChanged)continue;
    assert.ok(sparseAfter.words[id],`sparse saved history ID disappeared: ${id}`);
    assert.deepEqual(sparseAfter.words[id],before,`sparse saved history changed unexpectedly: ${id}`);
  }
  await page.reload({waitUntil:'domcontentloaded'});
  assert.equal(await page.evaluate(()=>state.stats.totalAnswers),778);
  assert.deepEqual(await page.evaluate(()=>JSON.parse(JSON.stringify(state.words['legacy-sparse-orphan']))),sparseBefore.words['legacy-sparse-orphan']);
  await resumeAfterReload();
  assert.equal(await page.evaluate(()=>state.stats.totalAnswers),778,'sparse submitted question double-counted after reload');
  await page.evaluate(()=>endSession(true));
