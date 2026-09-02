// Post-review refinements before the v7.5 implementation clean-pass count starts.
[
  "p9000000008","p9000000005","p9000000012","p9000000004",
  "p9000000006","p9000000015","p9000000014","p9000000016"
].forEach(id=>{
  const v=VOCAB_BY_ID.get(id);
  if(v)v.challengeReason="「60点／70点」は表現自体の基礎重要度、「75点挑戦層」は通常学習へ混ぜるかどうかの優先度を表す別軸です。この表現は出現年度が限定的なため75点挑戦層で扱います。";
});

const v75RenderCurrentQuestionBase=v75RenderCurrentQuestion;
v75RenderCurrentQuestion=function(){
  v75RenderCurrentQuestionBase();
  if(currentQuestion&&currentQuestion.reason&&$("qTypeLabel")){
    $("qTypeLabel").textContent=`挑戦前の基礎確認 ・ ${$("qTypeLabel").textContent}`;
  }
};

v75EnsureYearHelp=function(){
  const sel=$("learnYearSelect");if(!sel||document.getElementById("yearExampleHelp"))return;
  const p=document.createElement("p");p.id="yearExampleHelp";p.className="tiny muted";p.style.margin="6px 3px 0";
  p.textContent="年度指定は、その年度に確認された語の抽出条件です。採点後の代表例文が別年度の場合は、指定年度にも出現していることと表示例文の年度を明記します。";
  sel.parentElement.appendChild(p);
};

v75PickUnlimitedBase=function(){
  let pool=filterPool(session.mode,session.year).filter(v=>!session.blockedIds.has(v.id));
  if(session.mode==="75")pool=pool.filter(v=>(v.studyLayer||"core")==="challenge");
  if(!pool.length)return null;
  const recent=new Set(session.recentIds.slice(-6));
  let candidates=pool.filter(v=>!recent.has(v.id));if(!candidates.length)candidates=pool;
  const weights=candidates.map(v=>session.mode==="75"?v75ChallengeScore(v):schedulerScore(v,session.mode));
  return weightedChoice(candidates,weights);
};
