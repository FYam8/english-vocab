import fs from 'node:fs';
const html=fs.readFileSync('index.html','utf8');
function extract(marker){
 const p=html.indexOf(marker);if(p<0)throw new Error(marker);
 let i=p+marker.length;while(/\s/.test(html[i]))i++;
 const o=html[i],c=o==='{'?'}':']';let d=0,q=null,e=false;
 for(let j=i;j<html.length;j++){
  const x=html[j];
  if(q){if(e){e=false;continue}if(x==='\\'){e=true;continue}if(x===q)q=null;continue}
  if(x==='"'||x==="'"||x==='`'){q=x;continue}
  if(x===o)d++;else if(x===c&&--d===0)return html.slice(i,j+1);
 }
 throw new Error('unterminated');
}
const VOCAB=Function(`return (${extract('const VOCAB=')})`)();
const EX=Function(`return (${extract('const EXAM_EXAMPLES=')})`)();
const ids=['w2106363633','w0288940764','w1452406406','w3338173923','w3130268937','p3891949381','p3099442518','p4217966614','w1688387771','w2780795386','w91071520037954','w3032116916','w1094248838','w1284177306'];
const by=new Map(VOCAB.map(v=>[v.id,v]));
const rows=ids.map(id=>({id,word:by.get(id)?.word,years:by.get(id)?.years,example:EX[id]}));
fs.mkdirSync('qa/content-audit',{recursive:true});
fs.writeFileSync('qa/content-audit/review-candidates.json',JSON.stringify(rows,null,2));
console.log(JSON.stringify(rows,null,2));
