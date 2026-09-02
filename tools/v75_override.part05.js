  if("speechSynthesis" in window){populateVoices();window.speechSynthesis.addEventListener("voiceschanged",populateVoices)}
  window.addEventListener("hashchange",applyRoute);
  window.addEventListener("pagehide",persistActiveSession);
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden")persistActiveSession()});
};

init=function(){
  initSelectors();
  if(!location.hash)history.replaceState(null,"",location.pathname+location.search+"#learn");
  setTheme(state.settings.theme||"auto");
  const toast=$("toast");if(toast)toast.setAttribute("aria-live","polite");
  attachEvents();v75EnsureYearHelp();hydrateUiFromState();
  const stored=loadActiveSession();
  if(stored){
    if(stored.dataVersion!==META.dataVersion){
      clearActiveSession();
      setTimeout(()=>showToast("アプリが更新されたため前回の途中セッションを終了しました。回答済みの学習履歴は保存されています。",{kind:"info",duration:6000}),50);
    }else{
      v75RestorableSession=stored;setTimeout(()=>v75PromptRestore(stored),60);
    }
  }
};
