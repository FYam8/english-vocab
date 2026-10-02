import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const lock=JSON.parse(await readFile('shared-progress-candidate.json','utf8'));
assert.equal(lock.repository,'FYam8/waseshibu-progress-cloud');
assert.match(lock.commit,/^[a-f0-9]{40}$/);
assert.equal(lock.sourcePath,'src/client/progress-transport.js');
const hash=x=>createHash('sha256').update(x).digest('hex');
const local=await readFile(lock.localPath);assert.equal(hash(local),lock.sha256,'Vendored shared transport changed');
if(process.argv.includes('--upstream')){
  const response=await fetch(`https://raw.githubusercontent.com/${lock.repository}/${lock.commit}/${lock.sourcePath}`);
  assert.equal(response.status,200);assert.equal(hash(Buffer.from(await response.arrayBuffer())),lock.sha256,'Immutable upstream mismatch');
}
console.log('Shared progress SHA and hash verified; productionVerified='+lock.productionVerified);
