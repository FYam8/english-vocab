// Existing-user protection refinement: importing a backup must never reduce objective mastery/evidence.
mergeImported=function(raw){
  if(!validateImportPayload(raw))throw new Error("Invalid vocabulary backup");
  const incoming=migrate(raw.state||raw),current=state;
  const currentWasActive=v75HasMeaningfulActivity(current);
  syncToday();
  for(const [id,ip] of Object.entries(incoming.words||{})){
    const cp=current.words[id];
    if(!cp){current.words[id]=ip;continue}
    const it=ip.lastStudied?new Date(ip.lastStudied).getTime():0,ct=cp.lastStudied?new Date(cp.lastStudied).getTime():0;
    const newer=it>=ct?ip:cp;
    current.words[id]=Object.assign(defaultProgress(),newer,{
      correct:Math.max(Number(ip.correct)||0,Number(cp.correct)||0),
      incorrect:Math.max(Number(ip.incorrect)||0,Number(cp.incorrect)||0),
      mastery:Math.max(Number(ip.mastery)||0,Number(cp.mastery)||0),
      evidence:Math.max(Number(ip.evidence)||0,Number(cp.evidence)||0),
      streak:newer.streak??0
    });
  }
  current.stats.totalAnswers=Math.max(Number(current.stats.totalAnswers)||0,Number(incoming.stats.totalAnswers)||0);
  current.stats.totalSessions=Math.max(Number(current.stats.totalSessions)||0,Number(incoming.stats.totalSessions)||0);
  if(incoming.stats.todayKey===localDayKey())current.stats.todayCount=Math.max(Number(current.stats.todayCount)||0,Number(incoming.stats.todayCount)||0);
  const ct=current.settingsUpdatedAt?new Date(current.settingsUpdatedAt).getTime():0;
  const it=incoming.settingsUpdatedAt?new Date(incoming.settingsUpdatedAt).getTime():0;
  let useIncoming=false;
  if(ct&&it)useIncoming=it>ct;
  else if(!ct&&it)useIncoming=true;
  else if(!ct&&!it)useIncoming=!currentWasActive;
  if(useIncoming){
    current.settings=Object.assign({},current.settings,incoming.settings||{});
    current.settingsUpdatedAt=incoming.settingsUpdatedAt||v75IsoNow();
  }
  current.schemaVersion=SCHEMA_VERSION;
  current.dataVersion=META.dataVersion;
  saveState();
  hydrateUiFromState();
  showToast("バックアップを統合しました",{kind:"success"});
};
