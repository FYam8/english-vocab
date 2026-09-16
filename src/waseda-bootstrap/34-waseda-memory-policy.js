/*
 * Waseda-only memory scheduling policy adapter.
 * These values and predicates are extracted from the reviewed v7.6 runtime
 * without changing learner state, persistence identifiers or scheduler outputs.
 */
const WASEDA_MEMORY_POLICY=Object.freeze({
  targetRetention(v,p){
    const s=v&&v.priority==="S",w=!!(p&&isWeakProgress(p));
    if(s&&w)return .93;
    if(s||w)return .92;
    return .90;
  },
  reviewIntervalDays(v,p,model){
    return v76Clamp(v76IntervalForTarget(model.stabilityDays,WASEDA_MEMORY_POLICY.targetRetention(v,p)),.75,60);
  },
  isDiagnosticFirstPass(v,p,attemptsBefore){
    return (v.studyLayer||"core")==="diagnostic"&&attemptsBefore===0&&p.incorrect===0;
  },
  retryCorrectIntervalDays:1,
  missIntervalMinutes:15
});
