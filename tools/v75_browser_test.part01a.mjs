
  // Existing-user import protection: even a later-dated backup must not lower mastery/evidence.
  await openFresh();
  const adversarialImport=await page.evaluate(()=>{
    const id=VOCAB[0].id;
    const cp=getProgress(id);
    Object.assign(cp,{correct:12,incorrect:3,mastery:4,evidence:12,streak:2,lastStudied:'2026-09-01T10:00:00.000Z'});
    state.stats.totalAnswers=400;saveState();
    const s=defaultState();
    s.schemaVersion=7;s.dataVersion='2019-2026-v7.4-ja-translation-audited';
    s.words[id]=Object.assign(defaultProgress(),{
      correct:5,incorrect:1,mastery:1,evidence:2,streak:0,lastStudied:'2026-09-02T10:00:00.000Z'
    });
    s.stats.totalAnswers=350;
    return {id,backup:{app:'早稲渋 Vocabulary Coach',schemaVersion:7,dataVersion:s.dataVersion,state:s}};
  });
  await page.evaluate(raw=>mergeImported(raw),adversarialImport.backup);
  const noRegression=await page.evaluate(id=>({
    p:JSON.parse(JSON.stringify(getProgress(id))),total:state.stats.totalAnswers
  }),adversarialImport.id);
  assert.equal(noRegression.p.correct,12);
  assert.equal(noRegression.p.incorrect,3);
  assert.equal(noRegression.p.mastery,4);
  assert.equal(noRegression.p.evidence,12);
  assert.equal(noRegression.p.lastStudied,'2026-09-02T10:00:00.000Z');
  assert.equal(noRegression.total,400);
  await page.reload({waitUntil:'domcontentloaded'});
  const noRegressionReload=await page.evaluate(id=>({mastery:getProgress(id).mastery,evidence:getProgress(id).evidence,correct:getProgress(id).correct,incorrect:getProgress(id).incorrect}),adversarialImport.id);
  assert.deepEqual(noRegressionReload,{mastery:4,evidence:12,correct:12,incorrect:3});
