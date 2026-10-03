import fs from'node:fs';import assert from'node:assert/strict';import{execFileSync}from'node:child_process';
const file='src/waseda-bootstrap/10-waseda-data.js';
const baseline=execFileSync('git',['show','30c883a4bab19ecdd8f1732cd6cae86de6821f4d:'+file],{encoding:'utf8',maxBuffer:2000000});
const current=fs.readFileSync(file,'utf8');
const old='「かまれても破れない保護具です」とシンダーは言いました。';
const next='「うっかり一口食べてしまったときの反応を防ぐ備えです」とシンダーは言いました。';
assert.equal(baseline.split(old).length,2);assert.equal(current.split(next).length,2);
assert.equal(current.replace(next,old),baseline,'Only the reviewed protection translation may differ from the frozen data baseline');
console.log('Reviewed one-sentence translation delta; all remaining data bytes preserved PASS');
