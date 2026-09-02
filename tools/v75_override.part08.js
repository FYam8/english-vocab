// Final content remediation found by the exhaustive second review.
// Keep fixed IDs, schemaVersion 7 and all learner progress untouched.

function v75CompleteOfficialExample(id, sentence, ja, note){
  const ex=EXAM_EXAMPLES[id];
  if(!ex)return;
  ex.sentence=sentence;
  ex.ja=ja;
  ex.mode="completed";
  ex.note=note||"問題冊子の空所を公式解答で補完した完成文";
}

// These examples previously filled blanks only in Japanese while being labelled "exact".
// Official answer sheets were rechecked, so make the completion explicit in both languages.
v75CompleteOfficialExample(
  "w2106363633",
  "Before the summer was over, Sheila’s spell over me was gone, but the memory of losing the bass never disappeared.",
  "夏が終わる前にはシーラの私への魅力は消えていましたが、バスを失った記憶は決して消えませんでした。",
  "2020年度・問6の公式解答 bass で空所を補完"
);
v75CompleteOfficialExample(
  "w0288940764",
  "The scientists were worried that magpies might have a hard time living in a warmer environment caused by climate change.",
  "科学者たちは、気候変動によって生じたより暖かい環境の中で、カササギが暮らすのに苦労するかもしれないことを心配していました。",
  "2023年度・問1の公式解答 worried / have / time / warmer で空所を補完"
);
["w1452406406","w3338173923"].forEach(id=>v75CompleteOfficialExample(
  id,
  "An adult female magpie was helping out another magpie in getting free from its harness.",
  "成鳥のメスのカササギが、別のカササギがハーネスから抜け出すのを助けていました。",
  "2023年度の公式解答 helping で空所を補完"
));

// Translation audit corrections: do not add facts/causes that are absent from the English.
if(EXAM_EXAMPLES["p3099442518"]){
  EXAM_EXAMPLES["p3099442518"].ja="私は歴史で一番助けが必要です。";
}
if(EXAM_EXAMPLES["p4217966614"]){
  EXAM_EXAMPLES["p4217966614"].ja="とにかく、キャンプ場に着いたころにはすでに天気が崩れ始めていて、期待していたような雨の降らない天気にはならないと分かりました。";
}
[
  ["w1688387771","「あなたが努力しても何も変わりません。」"],
  ["w2780795386","「あなたが努力しても何も変わりません。」"],
  ["w91071520037954","「参加を妨げるものはすべて取り除くべきです。」"]
].forEach(([id,ja])=>{if(EXAM_EXAMPLES[id])EXAM_EXAMPLES[id].ja=ja});

// Verified same-year examples. Only records checked against the actual past papers are added.
const V75_EXAM_EXAMPLES_BY_YEAR={};
function v75RegisterYearExample(id,ex){
  if(!V75_EXAM_EXAMPLES_BY_YEAR[id])V75_EXAM_EXAMPLES_BY_YEAR[id]={};
  const y=Number(ex.year);
  if(!V75_EXAM_EXAMPLES_BY_YEAR[id][y])V75_EXAM_EXAMPLES_BY_YEAR[id][y]=[];
  V75_EXAM_EXAMPLES_BY_YEAR[id][y].push(Object.assign({},ex));
}
Object.entries(EXAM_EXAMPLES).forEach(([id,ex])=>{
  if(ex&&Number(ex.year))v75RegisterYearExample(id,Object.assign({recordKind:"representative"},ex));
});

v75RegisterYearExample("w3032116916",{
  sentence:"Who would believe such a stupid story?",
  ja:"そんなばかげた話を誰が信じるでしょうか。",
  year:2019,source:"問題冊子",page:6,matchedForm:"believe",mode:"exact",
  note:"2019年度本文で確認した同年度例文",recordKind:"verifiedSameYear"
});
v75RegisterYearExample("w1094248838",{
  sentence:"When a place is (c ), it means there are a lot of people or too many people in it.",
  ja:"ある場所が (c ) なら、そこには多くの人、または多すぎるほどの人がいるという意味です。",
  year:2026,source:"問題冊子",page:6,matchedForm:"lot",mode:"sourceOnly",
  note:"2026年度の直接語彙問題内で a lot of people として確認",recordKind:"verifiedSameYear"
});
v75RegisterYearExample("w1284177306",{
  sentence:"Mrs. Moreno picked it up and looked at it closely but couldn’t see what was wrong.",
  ja:"モレノ夫人はそれを拾い上げ、注意深く見ましたが、何が悪いのか分かりませんでした。",
  year:2024,source:"問題冊子",page:7,matchedForm:"closely",mode:"sourceOnly",
  note:"2024年度は派生形 closely として確認",recordKind:"verifiedSameYear"
});

function selectExamExample(v,selectedYear=v75SelectedYear()){
  const representative=EXAM_EXAMPLES[v.id]||null;
  if(selectedYear==="all"||selectedYear==null)return {example:representative,isFallback:false,selectedYear:null};
  const y=Number(selectedYear);
  const rows=(V75_EXAM_EXAMPLES_BY_YEAR[v.id]&&V75_EXAM_EXAMPLES_BY_YEAR[v.id][y])||[];
  if(rows.length){
    const rank={exact:0,completed:1,direct:2,sourceOnly:3};
    const chosen=[...rows].sort((a,b)=>(rank[a.mode]??9)-(rank[b.mode]??9))[0];
    return {example:chosen,isFallback:false,selectedYear:y};
  }
  return {example:representative,isFallback:true,selectedYear:y};
}

examExampleHTML=function(v){
  const selected=selectExamExample(v,v75SelectedYear());
  const ex=selected.example;
  if(!ex)return `<div class="exam-example"><div class="exam-example-head">例文監査エラー</div><div class="exam-example-note">この項目の出典表示レコードが未登録です。固定ID: ${esc(v.id)}</div></div>`;
  const src=`${ex.year}年度 ${ex.source}${ex.page?`・PDF p.${ex.page}`:""}`;
  const highlight=(raw,form)=>{
    const s=String(raw||""),f=String(form||"");if(!f)return esc(s);
    const i=s.toLowerCase().indexOf(f.toLowerCase());
    return i>=0?esc(s.slice(0,i))+`<b>${esc(s.slice(i,i+f.length))}</b>`+esc(s.slice(i+f.length)):esc(s);
  };
  const ja=String(ex.ja||"").trim();
  const jaHTML=ja?`<div class="exam-example-ja"><span class="exam-example-ja-label">和訳</span>${esc(ja)}</div>`:`<div class="exam-example-ja"><span class="exam-example-ja-label">和訳監査エラー</span>この項目の和訳が未登録です。固定ID: ${esc(v.id)}</div>`;
  const fallbackNote=selected.isFallback&&selected.selectedYear&&Array.isArray(v.years)&&v.years.includes(selected.selectedYear)
    ?`<div class="exam-example-note">この語は${selected.selectedYear}年度にも確認されています。同年度の検証済み例文レコードが未登録のため、代表例として${ex.year}年度の実例を表示しています。</div>`:"";
  const modeNote=ex.note||((ex.mode==="completed")?"問題の空所を公式解答で補完した完成文":"");
  if(!ex.sentence){
    const fragment=String(ex.fragment||ex.matchedForm||v75DisplayWord(v));
    const note=modeNote||"過去問では単独語・選択肢として出現し、この語を含む完成英文は資料内から確認できません。";
    return `<div class="exam-example"><div class="exam-example-head">過去問での出題例 · ${esc(src)}</div><div class="exam-example-sentence">${highlight(fragment,ex.matchedForm||v.word)}</div>${jaHTML}<div class="exam-example-note">${esc(note)}</div>${fallbackNote}</div>`;
  }
  return `<div class="exam-example"><div class="exam-example-head">過去問例文 · ${esc(src)}</div><div class="exam-example-sentence">${highlight(ex.sentence,ex.matchedForm||v.word)}</div>${jaHTML}${modeNote?`<div class="exam-example-note">${esc(modeNote)}</div>`:""}${fallbackNote}</div>`;
};
