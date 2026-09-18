import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const source = readFileSync("src/common-engine/learning-ui-runtime.js", "utf8");
const context = vm.createContext({});
vm.runInContext(source, context);
const ui = context.VocabularyLearningUI;
const input = { mode: "study", baseTotal: 20, basePosition: 18, baseAnswered: 17, retryAnswered: 3, isRetry: false, answeredCurrent: false };
const before = JSON.stringify(input);
assert.equal(ui.progress(input).secondary, "基本 18/20 ・ 再確認 3");
assert.equal(ui.progress({ ...input, isRetry: true }).secondary, "基本 17/20 ・ 再確認 4");
assert.equal(ui.progress({ ...input, isRetry: true, answeredCurrent: true, retryAnswered: 4 }).secondary, "基本 17/20 ・ 再確認 4");
assert.equal(ui.progress({ ...input, unlimited: true }).secondary, "基本 17問 / 再確認 3問");
assert.equal(ui.progress({ ...input, mode: "diagnostic" }).secondary, "18/20");
assert.equal(JSON.stringify(input), before);

const adapter = readFileSync("src/waseda-bootstrap/33-v75-ui-runtime.js", "utf8")
  .split("function v75UpdateSessionBar(showCurrent=true){")[1].split("function v75RenderCurrentQuestion(){")[0];
assert.ok(adapter);
const elements = { sessionCount: {}, sessionScore: {} };
Object.assign(context, { $: id => elements[id], session: { actualSessionSize: 20, baseAnswered: 17, retryAnswered: 3, correct: 18, wrong: 2 }, currentQuestion: { isRetry: true }, questionResolved: false });
vm.runInContext("function v75UpdateSessionBar(showCurrent=true){" + adapter, context);
context.v75UpdateSessionBar();
assert.equal(elements.sessionCount.textContent, "基本 17/20 ・ 再確認 4");
context.questionResolved = true;
context.session.retryAnswered = 4;
context.v75UpdateSessionBar();
assert.equal(elements.sessionCount.textContent, "基本 17/20 ・ 再確認 4");
assert.equal(elements.sessionScore.textContent, "正解 18 / 不正解 2");
assert.ok(readFileSync("index.html", "utf8").includes(source.trim()));
console.log("Shared learning UI runtime and Waseda adapter: PASS");
