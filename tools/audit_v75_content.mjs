import fs from 'node:fs';

const html = fs.readFileSync('index.html','utf8');

function extractInitializer(src, marker){
  const pos=src.indexOf(marker);
  if(pos<0) throw new Error(`marker not found: ${marker}`);
  let i=pos+marker.length;
  while(i<src.length && /\s/.test(src[i])) i++;
  const open=src[i];
  const close=open==='{'?'}':open==='['?']':null;
  if(!close) throw new Error(`unsupported initializer opener ${open} for ${marker}`);
  let depth=0, quote=null, escaped=false;
  for(let j=i;j<src.length;j++){
    const c=src[j];
    if(quote){
      if(escaped){escaped=false;continue;}
      if(c==='\\'){escaped=true;continue;}
      if(c===quote){quote=null;continue;}
      continue;
    }
    if(c==='"'||c==="'"||c==='`'){quote=c;continue;}
    if(c===open) depth++;
    else if(c===close){
      depth--;
      if(depth===0) return src.slice(i,j+1);
    }
  }
  throw new Error(`unterminated initializer: ${marker}`);
}

function evalLiteral(marker){
  const code=extractInitializer(html,marker);
  return Function(`"use strict"; return (${code});`)();
}

const VOCAB=evalLiteral('const VOCAB=');
const EXAM_EXAMPLES=evalLiteral('const EXAM_EXAMPLES=');
const byId=new Map(VOCAB.map(v=>[v.id,v]));

const timeJa=['昨日','今日','明日','先週','来週','昨年','去年','今年','来年','先月','来月','午前','午後','毎日','毎週','毎年','今朝','今晩','今夜'];
const timeEn=/\b(yesterday|today|tomorrow|last\s+week|next\s+week|last\s+year|this\s+year|next\s+year|last\s+month|next\s+month|morning|afternoon|evening|tonight|every\s+day|every\s+week|every\s+year)\b/i;
const negJa=/(ない|ません|なかった|ませんでした|ではない|じゃない|無い)/;
const negEn=/\b(no|not|never|neither|nor|without|hardly|scarcely)\b|n't\b/i;
const causalJa=/(ので|から|ため|だから|したがって|そのため)/;
const causalEn=/\b(because|since|therefore|thus|so|as a result|due to)\b/i;
const explicitJa=['彼','彼女','父','母','兄','姉','弟','妹','先生','教師','友達','友人','昨日','東京','日本','学校'];

function enText(ex){return String(ex?.sentence||ex?.fragment||ex?.matchedForm||'').trim();}
function numbers(s){return [...String(s).matchAll(/\d+(?:[.,]\d+)?/g)].map(m=>m[0].replace(/,/g,''));}
function flags(ex){
  const en=enText(ex), ja=String(ex?.ja||'').trim();
  const out=[];
  const jaTimes=timeJa.filter(x=>ja.includes(x));
  if(jaTimes.length && !timeEn.test(en)) out.push({type:'time-added',values:jaTimes});
  if(negJa.test(ja) && !negEn.test(en)) out.push({type:'negation-added'});
  if(causalJa.test(ja) && !causalEn.test(en)) out.push({type:'causal-added'});
  const enNums=numbers(en), jaNums=numbers(ja);
  for(const n of jaNums) if(!enNums.includes(n)) out.push({type:'number-added',value:n});
  const explicit=explicitJa.filter(x=>ja.includes(x));
  if(explicit.length) out.push({type:'explicit-ja-review',values:explicit});
  if(!ja) out.push({type:'missing-ja'});
  return out;
}

const pairs=[];
const yearCoverage=[];
const suspicious=[];
for(const v of VOCAB){
  const ex=EXAM_EXAMPLES[v.id]||null;
  const row={
    id:v.id,word:v.word,meaning:v.meaning,years:v.years||[],layer:v.studyLayer||'core',level:v.level,
    example:ex?{year:ex.year,source:ex.source,page:ex.page,mode:ex.mode,sentence:ex.sentence,fragment:ex.fragment,matchedForm:ex.matchedForm,ja:ex.ja,note:ex.note}:null
  };
  pairs.push(row);
  const fs=flags(ex);
  if(fs.length) suspicious.push({...row,flags:fs});
  for(const y of (v.years||[])){
    yearCoverage.push({id:v.id,word:v.word,year:y,representativeYear:ex?.year??null,sameYear:Number(ex?.year)===Number(y),hasRepresentative:!!ex});
  }
}

const sameYearCount=yearCoverage.filter(x=>x.sameYear).length;
const fallbackCount=yearCoverage.filter(x=>x.hasRepresentative&&!x.sameYear).length;
const missingExampleCount=yearCoverage.filter(x=>!x.hasRepresentative).length;
const summary={
  vocabCount:VOCAB.length,
  exampleCount:Object.keys(EXAM_EXAMPLES).length,
  pairCount:pairs.length,
  yearPairs:yearCoverage.length,
  sameYearCount,
  fallbackCount,
  missingExampleCount,
  suspiciousCount:suspicious.length,
  orphanExamples:Object.keys(EXAM_EXAMPLES).filter(id=>!byId.has(id)).length
};

fs.mkdirSync('qa/content-audit',{recursive:true});
fs.writeFileSync('qa/content-audit/summary.json',JSON.stringify(summary,null,2));
fs.writeFileSync('qa/content-audit/year-coverage.json',JSON.stringify(yearCoverage,null,2));
fs.writeFileSync('qa/content-audit/suspicious.json',JSON.stringify(suspicious,null,2));
for(let i=0;i<pairs.length;i+=80){
  const idx=String(i/80+1).padStart(2,'0');
  fs.writeFileSync(`qa/content-audit/pairs-${idx}.json`,JSON.stringify(pairs.slice(i,i+80),null,2));
}
console.log(JSON.stringify(summary,null,2));
if(VOCAB.length!==680) throw new Error(`VOCAB count ${VOCAB.length}`);
if(summary.orphanExamples!==0) throw new Error(`orphan examples ${summary.orphanExamples}`);
