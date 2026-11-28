(() => {
  const {CAPACITY,POUR_TIMING,newLevelDetails,pour,legalMoves,findTutorialMove,isCompleteBottle,isDeadlocked,pourAnimationDuration,solved}=window.WaterSort;
  const Progress=window.GameProgress,Hidden=window.GameHiddenColors,Attempts=window.GameLevelAttempt,HintAccess=window.GameHintAccess,PourCoordinator=window.PourCoordinator,$=id=>document.getElementById(id);let store=Progress.createStore();
  const telegramApp=window.Telegram?.WebApp,isTelegramMiniApp=Boolean(telegramApp&&telegramApp.platform&&telegramApp.platform!=='unknown'&&telegramApp.version!=='0.0');
  const board=$('board'),hintText=$('board-hint'),themes=window.GameThemes.catalog,themeNames=Object.keys(themes),themePreferences=['auto',...themeNames];
  const motionQuery=window.matchMedia('(prefers-reduced-motion: reduce)');
  let pixiRenderer=null,pixiLoading=false;
  const pourCoordinator=PourCoordinator.create(),activePours=pourCoordinator.flows,reservedBottles=pourCoordinator.reserved,hintAccess=HintAccess.create();
  let save=store.data,level=save.level,moves=0,bottles=[],initial=[],levelColors=[],selected=null,history=[],toastTimer,animating=false,challenge=null,remainingMoves=0,themeIndex=Math.max(0,themeNames.indexOf(window.GameThemes.resolve(save.settings.theme))),attemptId=save.attemptId,lastRenderedLives=save.lives,nextPourId=0,failureHandled=false,levelResultShown=false,tutorialArmed=false,tutorialMoveDone=false,tutorialHintUsed=false,tutorialUndoDone=false,gameStarted=false,hintWorker=null,hintTimer=null,hintRevision=0,hintPending=false,hintVisual=null;

  let hiddenState=null,seed=null,certifiedRoute=[];
  function activeAttempt({state=hiddenState,board=bottles,moveCount=moves,budget=remainingMoves,undo=history.at(-1)??null,solution=certifiedRoute}={}){
    return {version:1,level,seed,attemptId,state:Hidden.snapshot(state),bottles:board.map(bottle=>bottle.slice()),
      initial:initial.map(bottle=>bottle.slice()),colors:levelColors.slice(),challenge:{...challenge},moves:moveCount,remainingMoves:budget,undo,solution:solution.map(move=>move.slice())};
  }
  function startLevel(data,newAttempt=false,{resume=false}={}){
    clearHint();
    const stored=store.data;
    const restored=resume?Attempts.restore(stored.activeAttempt??stored.hiddenAttempt,level,stored.attemptId):null;
    const layout=restored??data??newLevelDetails(level,initial);
    pixiRenderer?.stop();
    attemptId=newAttempt&&!restored?store.beginAttempt():stored.attemptId;
    initial=(restored?.initial??layout.bottles).map(bottle=>bottle.slice());levelColors=layout.colors.slice();challenge=layout.challenge;
    bottles=layout.bottles.map(bottle=>bottle.slice());seed=layout.seed??null;
    hiddenState=restored?restored.state:Hidden.createForLevel(bottles,level,levelColors,{seed,solution:layout.solution,capacity:CAPACITY});
    certifiedRoute=(restored?.solution??layout.solution??[]).map(move=>move.slice());
    moves=restored?.moves??0;remainingMoves=restored?.remainingMoves??challenge?.moveLimit??0;
    history=restored?.undo?[restored.undo]:[];
    selected=null;pourCoordinator.clear();animating=false;failureHandled=false;levelResultShown=false;
    store.setActiveAttempt(activeAttempt());
    render();
    hintText.textContent='Выбери бутылочку, чтобы начать';
    if(gameStarted&&level<=5)showTutorial(level);
  }
  function setTheme(preference){
    const appliedTheme=window.GameThemes.apply(preference);store.setTheme(preference);themeIndex=themeNames.indexOf(appliedTheme);refreshSave();syncThemeIcons(appliedTheme);updateDailyLifeButton();
  }
  // Rebuild the life meter from the exact theme selected in the same synchronous update.
  function syncThemeIcons(theme){
    const active=themes[theme]||themes.autumn,icon=active.lifeIcon;
    $('theme-button').innerHTML=`<span>${icon}</span> Тема: ${active.label.toLowerCase()}`;
    $('daily-life-icon').textContent=icon;$('life-empty-icon').textContent=icon;
    renderLives('',theme);
  }
  function setAnimations(enabled){
    store.setAnimations(enabled);document.body.classList.toggle('motion-off',!enabled);
    refreshSave();
  }
  function showRendererStatus(message,retry=false){const panel=$('renderer-status');$('renderer-status-copy').textContent=message;$('renderer-retry').hidden=!retry;$('renderer-reload').hidden=!retry;panel.hidden=false;board.setAttribute('aria-busy',String(!retry))}
  async function initializeRenderer(){
    if(pixiLoading||pixiRenderer)return;
    pixiLoading=true;showRendererStatus('Загружаем объёмную графику…');$('renderer-retry').disabled=true;
    try{
      if(!window.gsap)throw new Error('Библиотека GSAP не загрузилась');
      if(!window.PixiBottleRenderer)throw new Error('Модуль PixiJS не загрузился');
      pixiRenderer=await window.PixiBottleRenderer.create(board);board.classList.add('pixi-active');$('renderer-status').hidden=true;board.removeAttribute('aria-busy');render();
    }catch(error){pixiRenderer?.destroy();pixiRenderer=null;board.classList.remove('pixi-active');showRendererStatus('Не удалось загрузить игровую графику. Проверьте подключение и попробуйте ещё раз. Прогресс сохранён.',true);console.error('Pixi renderer initialization failed',error);render()}
    finally{pixiLoading=false;$('renderer-retry').disabled=false}
  }
  function refreshSave(){save=store.data}
  function updateDailyLifeButton(){
    const ready=save.lastDailyLifeDate!==localDay();$('daily-life-button').classList.toggle('bonus-ready',ready&&save.lives<Progress.MAX_LIVES);$('daily-life-button').classList.toggle('bonus-held',ready&&save.lives===Progress.MAX_LIVES);
    // Keep the themed icon node alive; replacing button HTML breaks later theme changes.
    $('daily-life-label').textContent=ready?(save.lives===Progress.MAX_LIVES?'Забрать позже':'+1 жизнь'):'Получено сегодня';
  }
  function createSlot(index){
    const slot=document.createElement('button');slot.className='bottle-slot';slot.type='button';slot.addEventListener('click',()=>tap(index));
    slot.setAttribute('aria-hidden','false');return slot;
  }
  function updateSlot(slot,contents,index){
    const complete=isCompleteBottle(contents);
    slot.className='bottle-slot'+(selected===index?' selected':'');
    slot.setAttribute('aria-label',`Бутылочка ${index+1}, ${contents.length} из ${CAPACITY} единиц${complete?', собрана':''}`);
    slot.disabled=!pixiRenderer||pixiLoading||reservedBottles.has(index)||complete||(save.lives===0);slot.style.setProperty('--i',index);
  }
  function render(){
    refreshSave();$('level-value').textContent=level;$('moves-value').textContent=challenge?remainingMoves:moves;$('coin-count').textContent=save.coins;
    const hiddenLayers=Hidden.visible(hiddenState);
    const hasCover=bottle=>bottle?.some(layer=>layer.hidden);
    $('hidden-note').hidden=!(hiddenLayers.some(hasCover)||[...activePours.values()].some(flow=>hasCover(flow.hiddenSourceStart)||hasCover(flow.hiddenTargetStart)));
    $('special-badge').hidden=!challenge?.special;$('special-type').textContent=challenge?.special?`· ${challenge.type==='moves'?'ЛИМИТ ХОДОВ':challenge.type==='space'?'МАЛО МЕСТА':'СЛОЖНАЯ КОМБИНАЦИЯ'}`:'';
    $('shuffle-cost').textContent=Progress.SHUFFLE_COST;
    const requestedColumns=bottles.length>8?Math.min(6,Math.ceil(bottles.length/2)):Math.min(4,bottles.length),columnGap=Number.parseFloat(getComputedStyle(board).columnGap)||0,maxColumns=Math.max(1,Math.floor((board.clientWidth+columnGap)/(42+columnGap))),columns=Math.min(requestedColumns,maxColumns);
    board.style.gridTemplateColumns=`repeat(${columns}, minmax(42px,64px))`;
    // Pixi's canvas is a direct child of the board too; reconcile bottle buttons only
    // so a normal game render never detaches the active renderer's canvas.
    let slots=[...board.querySelectorAll(':scope > .bottle-slot')];
    while(slots.length>bottles.length)slots.pop().remove();
    while(slots.length<bottles.length){const slot=createSlot(slots.length);board.append(slot);slots.push(slot)}
    bottles.forEach((contents,index)=>updateSlot(slots[index],contents,index));
    pixiRenderer?.setState({bottles,hiddenLayers,attemptId,selected,hint:hintVisual,lifted:[...activePours.values()].filter(flow=>flow.phase==='prepare').map(flow=>flow.from),pours:[...activePours.values()].map(flow=>({from:flow.from,to:flow.to,phase:flow.phase,sourceStart:flow.sourceStart,targetStart:flow.targetStart,hiddenSourceStart:flow.hiddenSourceStart,hiddenTargetStart:flow.hiddenTargetStart,color:flow.color})),reserved:[...reservedBottles],animations:save.settings.animations&&!motionQuery.matches,levelColors,theme:save.settings.theme,level});
    const blocked=save.lives===0,undoUsed=save.undoUsedLevels.includes(level),freeHintAvailable=!save.freeHintsUsedLevels.includes(level),hintButton=$('hint-button');hintButton.querySelector('span:last-child').textContent=freeHintAvailable?'Подсказка':`Подсказка · ${Progress.HINT_COST} 🪙`;$('undo-button').disabled=!history.length||animating||blocked||undoUsed;hintButton.disabled=animating||blocked||hintPending||Boolean(hintVisual)||(!freeHintAvailable&&save.coins<Progress.HINT_COST);
    $('shuffle-button').disabled=animating||save.coins<Progress.SHUFFLE_COST||blocked;
    $('daily-button').disabled=save.lastDailyClaim===new Date().toISOString().slice(0,10);
    updateDailyLifeButton();
    updateLifeTimer();
  }
  let boardResizeFrame=0;window.addEventListener('resize',()=>{if(boardResizeFrame)return;boardResizeFrame=requestAnimationFrame(()=>{boardResizeFrame=0;render()})});
  function tap(index){
    if(!pixiRenderer){showRendererStatus('Графика игры ещё не готова. Нажмите «Повторить загрузку».',true);return}
    if(save.lives===0)return;
    if(remainingMoves<=0){showToast('Ходы закончились');return}
    if(reservedBottles.has(index)){showToast('Эта бутылочка сейчас участвует в переливании');return}
    clearHint();
    if(tutorialArmed&&level===5&&!tutorialHintUsed){showToast('Сначала нажми «Подсказка»');return}
    if(selected===null){if(!bottles[index].length){hintText.textContent='Выбери бутылочку с жидкостью';return}selected=index;hintText.textContent='Теперь выбери, куда перелить';render();if(tutorialArmed&&level<4)highlightTutorialTargets(level);return}
    if(selected===index){selected=null;hintText.textContent='Выбери бутылочку, чтобы начать';render();return}
    const from=selected;
    if(reservedBottles.has(from)){selected=null;render();showToast('Источник уже занят другим переливанием');return}
    if(tutorialArmed&&!tutorialMoveDone&&((level===2&&!(bottles[index].length>0&&bottles[index].at(-1)===bottles[from].at(-1)))||(level===3&&bottles[index].length>0))){showToast(level===2?'Выбери бутылочку с таким же цветом':'Для этого задания выбери пустую бутылочку');return}
    const before=bottles.map(b=>b.slice()),next=bottles.map(b=>b.slice()),result=pour(next,selected,index,levelColors);
    if(!result.ok){showToast(result.reason);selected=index;bottles[index].length?hintText.textContent='Теперь выбери, куда перелить':hintText.textContent='Выбери пустую бутылочку или такой же цвет';render();return}
    const flow={id:++nextPourId,from,to:index,sourceStart:bottles[from].slice(),targetStart:bottles[index].slice(),sourceAfter:next[from].slice(),targetAfter:next[index].slice(),amount:result.amount,color:result.color,next,phase:'prepare'};
    if(!pourCoordinator.reserve(flow)){showToast('Одна из бутылочек занята');return}
    history.push({bottles:before,hidden:Hidden.snapshot(hiddenState),solution:certifiedRoute.map(move=>move.slice())});
    if(hiddenState){
      const visible=Hidden.visible(hiddenState);
      flow.hiddenSourceStart=visible[from];flow.hiddenTargetStart=visible[index];
      Hidden.transfer(hiddenState,from,index,result.amount,CAPACITY);
    }
    bottles=next;moves++;remainingMoves--;
    if(certifiedRoute.length){const [plannedFrom,plannedTo]=certifiedRoute[0];if(plannedFrom===from&&plannedTo===index)certifiedRoute.shift();else certifiedRoute=[]}
    store.recordMove(activeAttempt());
    selected=null;animating=true;tutorialMoveDone=true;
    if(tutorialArmed){clearTutorialTargets();if(level===4)$('undo-button').classList.add('tutorial-target')}
    hintText.textContent=`Перелито: ${result.amount}`;window.GameAudio?.cue('pour',save.settings.sfx);render();runPour(flow);
  }
  async function runPour(flow){
    const reduced=motionQuery.matches||!save.settings.animations,flight=pourAnimationDuration(flow.amount,reduced);
    try{
    if(!reduced){
        await wait(POUR_TIMING.prepare*POUR_TIMING.speed*1000);if(activePours.get(flow.id)!==flow)return;
        flow.phase='flow';
        if(!pixiRenderer)throw new Error('Pixi renderer is unavailable');
        const visual=pixiRenderer.animatePour({from:flow.from,to:flow.to,sourceStart:flow.sourceStart,targetStart:flow.targetStart,sourceAfter:flow.sourceAfter,targetAfter:flow.targetAfter,hiddenSourceStart:flow.hiddenSourceStart,hiddenTargetStart:flow.hiddenTargetStart,color:flow.color,duration:flight,timing:POUR_TIMING});
        render();
        await visual;
      }
    }catch(error){console.error('Pour animation failed',error);pixiRenderer?.destroy();pixiRenderer=null;board.classList.remove('pixi-active');showRendererStatus('Анимация остановлена. Повторно загрузите игровую графику; ход сохранён.',true)}
    finally{
      if(!pourCoordinator.release(flow.id))return;
      animating=activePours.size>0;
      render();
      if(tutorialArmed&&level===4&&tutorialMoveDone&&!tutorialUndoDone&&solved(bottles,levelColors)){clearTutorialTargets();$('undo-button').classList.add('tutorial-target');showToast('Перед продолжением попробуй отменить последний ход');return}
      if(!animating)resolveLevelOutcome();
    }
  }
  function resolveLevelOutcome(){
    if(levelResultShown||animating)return;
    if(solved(bottles,levelColors)){
      if(tutorialArmed&&level===4&&!tutorialUndoDone)return;
      levelResultShown=true;const reward=challenge?.reward||10;store.rewardLevel(level,moves,Boolean(challenge?.special),reward,attemptId);refreshSave();window.GameAudio?.cue('win',save.settings.sfx);$('coin-count').textContent=save.coins;$('win-moves').textContent=moves;$('win-reward').textContent=`+${reward} монет`;$('win-modal').classList.toggle('special-win',Boolean(challenge?.special));$('win-modal').hidden=false;if(tutorialArmed)finishTutorial();return;
    }
    if(remainingMoves<=0)handleFailure('Лимит ходов исчерпан');else if(isDeadlocked(bottles,levelColors))handleFailure('Допустимых ходов больше нет');
  }
  function wait(milliseconds){return new Promise(resolve=>setTimeout(resolve,milliseconds))}
  function showToast(message){const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),1700)}
  function localDay(){const date=new Date();return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`}
  function renderLives(effect='',themeName=save.settings.theme){
    refreshSave();const meter=$('life-meter'),icon=themes[themeName]?.lifeIcon||'🍂',previous=lastRenderedLives;meter.replaceChildren();
    for(let index=0;index<Progress.MAX_LIVES;index++){
      const token=document.createElement('span'),active=index<save.lives;token.className=`life-token${active?' active':''}`;token.textContent=icon;token.setAttribute('aria-hidden','true');
      if(effect==='lost'&&index===save.lives)token.classList.add('life-lost');
      if(effect==='restored'&&save.lives>previous&&index===save.lives-1)token.classList.add('life-restored');
      meter.append(token);
    }
    meter.setAttribute('aria-label',`Жизней: ${save.lives} из ${Progress.MAX_LIVES}`);lastRenderedLives=save.lives;
  }
  function formatTime(milliseconds){const seconds=Math.max(0,Math.ceil(milliseconds/1000));return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`}
  function updateLifeTimer(){
    const remaining=store.lifeTimeRemaining(Date.now()),visible=save.lives<Progress.MAX_LIVES;
    $('life-timer').hidden=!visible;$('life-empty-timer').textContent=formatTime(remaining);
    if(visible)$('life-timer').textContent=formatTime(remaining);
  }
  function showDeadlock(message){
    $('deadlock-title').textContent=message;$('deadlock-copy').textContent=`Уровень не пройден. Можно начать заново или перемешать бутылочки за ${Progress.SHUFFLE_COST} монет.`;
    $('deadlock-shuffle').textContent=`Перемешать · ${Progress.SHUFFLE_COST}`;$('deadlock-modal').hidden=false;
  }
  function handleFailure(reason){
    if(failureHandled)return;failureHandled=true;const before=save.lives,result=store.loseLife(attemptId,Date.now());refreshSave();
    if(result.lost){renderLives('lost');showToast('Потеряна одна жизнь')}
    render();
    if(save.lives===0){$('deadlock-modal').hidden=true;$('life-empty-modal').hidden=false;updateLifeTimer()}
    else showDeadlock(reason);
    if(before===0)showToast('Жди восстановления жизни');
  }
  function syncLifeRecovery(){
    const before=save.lives,gained=store.syncLives(Date.now());refreshSave();
    if(gained){renderLives('restored');showToast(`Восстановлена жизнь · теперь ${save.lives} из 3`)}
    if(before===0&&save.lives>0){$('life-empty-modal').hidden=true;showDeadlock('Жизнь восстановлена · начни уровень заново')}
    if(save.lives===0)$('life-empty-modal').hidden=false;
    updateDailyLifeButton();if(gained)render();else updateLifeTimer();
  }
  function claimDailyLife(){
    const wasEmpty=save.lives===0,result=store.claimDailyLife(new Date());refreshSave();
    if(result.claimed){renderLives('restored');$('life-empty-modal').hidden=true;showToast('Ежедневная жизнь получена');if(wasEmpty)showDeadlock('Жизнь восстановлена · начни уровень заново')}
    else if(result.reason==='full')showToast('У тебя уже максимум жизней — бонус останется доступен');
    else showToast('Ежедневный бонус уже получен сегодня');
    if(save.lives===0)$('life-empty-modal').hidden=false;render();
  }
  function closeDeadlock(){ $('deadlock-modal').hidden=true }
  function doShuffle(){
    if(save.lives===0){showToast('Сначала дождись восстановления жизни');return false}
    if(save.coins<Progress.SHUFFLE_COST){showToast('Недостаточно монет');return false}
    const data=newLevelDetails(level,initial,{bottleCount:bottles.length,colors:levelColors});
    if(!store.spend(Progress.SHUFFLE_COST))return false;
    $('shuffle-modal').hidden=true;closeDeadlock();startLevel(data,true);render();return true;
  }

  function clearHint(){
    hintRevision++;if(hintTimer!==null)clearTimeout(hintTimer);
    hintTimer=null;hintWorker?.terminate();hintWorker=null;hintPending=false;hintVisual=null;hintAccess.cancel();
    if(pixiRenderer)pixiRenderer.setHint(null);
  }
  function visibleHintState(){
    const visible=hiddenState?Hidden.visible(hiddenState).map(bottle=>bottle.map(layer=>layer.color)):bottles.map(bottle=>bottle.slice());
    const lockedBottles=bottles.map((bottle,index)=>isCompleteBottle(bottle)||reservedBottles.has(index)?index:-1).filter(index=>index>=0);
    return {visibleBottles:visible,lockedBottles,movesRemaining:remainingMoves,levelRules:{capacity:CAPACITY,phase:animating?'in-flight':'ready',certifiedRoute}};
  }
  function visibleAmount(view,from,to){
    const source=view[from],target=view[to],color=source?.at(-1);
    if(!source?.length||!target||from===to||!color||target.length>=CAPACITY||target.length&&(target.at(-1)!==color))return 0;
    let amount=0;while(amount<source.length&&amount<CAPACITY-target.length&&source[source.length-1-amount]===color)amount++;
    return amount;
  }
  function presentHint(move,key){
    hintVisual={from:move.from,to:move.to,phase:'pair'};if(!tutorialArmed)hintText.textContent='';render();
    if(tutorialArmed&&level===5){tutorialHintUsed=true;clearTutorialTargets();move&&[move.from,move.to].forEach(index=>board.children[index]?.classList.add('tutorial-target'));showToast('Теперь повтори подсказанный перелив')}
    hintTimer=setTimeout(()=>{hintAccess.hide(key);hintVisual=null;hintTimer=null;render()},3600);
  }
  function requestHint(){
    if(animating||hintPending||hintAccess.isPending||hintVisual||(save.lives===0))return;
    const request=visibleHintState(),key=JSON.stringify({attemptId,level,...request});
    if(hintAccess.isVisible(key))return;
    selected=null;clearHint();const revision=hintRevision,ticket=hintAccess.begin(key,level);if(!ticket)return;hintPending=true;render();
    let worker;try{worker=new Worker(new URL('js/hint-worker.js',document.baseURI))}catch{hintAccess.finish(ticket,null,()=>{},{ok:false});hintPending=false;render();showToast('Пока нет гарантированной подсказки');return}
    hintWorker=worker;
    let finished=false;
    const finish=result=>{
      if(finished||revision!==hintRevision)return;finished=true;
      clearTimeout(hintTimer);hintTimer=null;worker.terminate();hintWorker=null;hintPending=false;
      const move=result?.status==='ok'?result:null;
      const valid=move&&Number.isInteger(move.from)&&Number.isInteger(move.to)&&move.from>=0&&move.to<bottles.length&&move.to>=0&&move.from<bottles.length&&move.from!==move.to&&!request.lockedBottles.includes(move.from)&&!request.lockedBottles.includes(move.to)&&visibleAmount(request.visibleBottles,move.from,move.to)===move.amount;
      const outcome=hintAccess.finish(ticket,valid?{from:move.from,to:move.to,amount:move.amount}:null,hint=>presentHint(hint,key),hintLevel=>store.useHint(hintLevel,Progress.HINT_COST));
      if(outcome.status==='payment-failed')clearHint();render();if(outcome.status!=='shown')showToast(outcome.status==='payment-failed'?'Недостаточно монет':'Пока нет гарантированной подсказки');
    };
    worker.onmessage=event=>finish(event.data?.result);
    worker.onerror=()=>finish(null);
    hintTimer=setTimeout(()=>finish(null),650);
    try{worker.postMessage({id:revision,request})}catch{finish(null)}
  }

  $('undo-button').addEventListener('click',()=>{
    if(animating||!history.length)return;
    const previous=history.at(-1),revealed=Hidden.retainRevealed(previous.hidden,hiddenState),moveCount=Math.max(0,moves-1);
    if(!store.useUndo(level,activeAttempt({state:revealed,board:previous.bottles,moveCount,budget:remainingMoves+1,undo:null,solution:previous.solution??[]}))){render();showToast('Бесплатная отмена на этом уровне уже использована');return}
    clearHint();history.pop();bottles=previous.bottles;hiddenState=revealed;certifiedRoute=(previous.solution??[]).map(move=>move.slice());moves=moveCount;remainingMoves++;selected=null;
    window.GameAudio?.cue('tap',save.settings.sfx);render();hintText.textContent='Ход отменён';
    if(tutorialArmed&&level===4&&tutorialMoveDone){tutorialUndoDone=true;finishTutorial();showToast('Отмена хода освоена')}
  });
  function restartLevel(){if(animating||save.lives===0)return;$('deadlock-modal').hidden=true;$('win-modal').hidden=true;startLevel(undefined,true);hintText.textContent='Создана новая раскладка'}
  $('hint-button').addEventListener('click',requestHint);
  $('next-button').addEventListener('click',()=>{level++;$('win-modal').hidden=true;startLevel(undefined,true)});
  $('shuffle-button').addEventListener('click',()=>{if(save.coins<Progress.SHUFFLE_COST){showToast('Недостаточно монет');return}$('shuffle-confirm-cost').textContent=Progress.SHUFFLE_COST;$('shuffle-confirm').textContent=`Потратить ${Progress.SHUFFLE_COST} монет`;$('shuffle-modal').hidden=false});
  $('shuffle-confirm').addEventListener('click',doShuffle);$('shuffle-cancel').addEventListener('click',()=>$('shuffle-modal').hidden=true);
  $('deadlock-restart').addEventListener('click',restartLevel);
  $('deadlock-shuffle').addEventListener('click',()=>{if(save.coins<Progress.SHUFFLE_COST){showToast('Недостаточно монет');return}$('deadlock-modal').hidden=true;$('shuffle-modal').hidden=false});
  $('daily-button').addEventListener('click',()=>{if(store.claimDaily()){refreshSave();render();showToast(`Ежедневная награда: +${Progress.DAILY_REWARD} монет`)}else showToast('Награда уже получена сегодня')});
  $('daily-life-button').addEventListener('click',claimDailyLife);$('life-empty-daily').addEventListener('click',claimDailyLife);
  $('theme-button').addEventListener('click',()=>{themeIndex=(themeIndex+1)%themeNames.length;setTheme(themeNames[themeIndex])});
  const lessonText={1:'Нажми на бутылочку с жидкостью, затем выбери другую бутылочку. Сделай первый перелив самостоятельно.',2:'Цвет можно лить только в пустую бутылочку или поверх такого же цвета. Найди подходящий верхний цвет и перелей его.',3:'Пустая бутылочка — временное место для сортировки. Перелей в неё верхний цвет.',4:'Попробуй сделать ход, а затем нажми «Отмена», чтобы вернуть его.',5:'Нажми «Подсказка», посмотри на предложенную пару и выполни этот перелив.'};
  function clearTutorialTargets(){document.querySelectorAll('.tutorial-target').forEach(el=>el.classList.remove('tutorial-target'))}
  function highlightTutorialTargets(number){clearTutorialTargets();if(number===4)return;if(number===5){$('hint-button').classList.add('tutorial-target');return}const move=findTutorialMove(bottles,number);if(move)move.forEach(index=>board.children[index]?.classList.add('tutorial-target'))}
  function showTutorial(number){tutorialArmed=true;tutorialMoveDone=false;tutorialHintUsed=false;tutorialUndoDone=false;$('tutorial-kicker').textContent=`ОБУЧЕНИЕ · УРОВЕНЬ ${number}`;$('tutorial-title').textContent=['','Первый перелив','Совместимость цветов','Свободное место','Планирование и отмена','Подсказка'][number];$('tutorial-copy').textContent=lessonText[number];$('tutorial-modal').hidden=false}
  function finishTutorial(){if(!tutorialArmed)return;tutorialArmed=false;$('tutorial-modal').hidden=true;clearTutorialTargets()}
  $('tutorial-start').addEventListener('click',()=>{$('tutorial-modal').hidden=true;highlightTutorialTargets(level);hintText.textContent=lessonText[level]||''});
  function syncTelegramViewport(){
    if(!isTelegramMiniApp)return;
    const height=telegramApp?.viewportStableHeight||telegramApp?.viewportHeight;
    if(height>0)document.documentElement.style.setProperty('--app-viewport-height',`${Math.round(height)}px`);
  }
  function syncTelegramBackButton(){
    const back=telegramApp?.BackButton;if(!isTelegramMiniApp||!back?.show||!back?.hide)return;
    const menuOpen=!$('menu-screen').hidden,shopOpen=!$('shop-screen').hidden,settingsOpen=!$('settings-modal').hidden;
    if(!menuOpen||shopOpen||settingsOpen)back.show();else back.hide();
  }
  function closeShop(){ $('shop-screen').hidden=true;$('menu-screen').hidden=false;$('shop-open-button').focus({preventScroll:true});syncTelegramBackButton() }
  function returnToMenu(){
    if(animating){showToast('Подожди, пока завершится переливание');return}
    if(!$('shop-screen').hidden){closeShop();return}
    if(!$('settings-modal').hidden){$('settings-modal').hidden=true;$('menu-screen').hidden=false;syncTelegramBackButton();return}
    clearHint();$('return-game-button').hidden=!gameStarted;$('menu-screen').hidden=false;$('win-modal').hidden=true;$('deadlock-modal').hidden=true;syncTelegramBackButton();
  }
  $('play-button').addEventListener('click',()=>{
    $('menu-screen').hidden=true;
    syncTelegramBackButton();
    if(gameStarted)return;
    gameStarted=true;
    const next=store.data.level;
    if(level===next&&initial.length){render();if(level<=5&&!tutorialArmed&&!moves)showTutorial(level);resolveLevelOutcome();return}
    level=next;startLevel(undefined,true,{resume:true});
  });
  $('return-game-button').addEventListener('click',()=>{$('menu-screen').hidden=true;syncTelegramBackButton()});
  function openShop(){$('menu-screen').hidden=true;$('shop-screen').hidden=false;$('shop-back-button').focus({preventScroll:true});syncTelegramBackButton()}
  $('shop-open-button').addEventListener('click',openShop);$('shop-back-button').addEventListener('click',closeShop);
  const botInviteUrl='https://t.me/BottleGameFromN_bot';
  function closeInvite(){ $('invite-modal').hidden=true;$('invite-open-button').focus({preventScroll:true}) }
  $('invite-open-button').addEventListener('click',()=>{$('invite-link').value=botInviteUrl;$('invite-status').textContent='';$('invite-modal').hidden=false;$('invite-close-button').focus({preventScroll:true})});
  $('invite-close-button').addEventListener('click',closeInvite);
  $('invite-modal').addEventListener('click',event=>{if(event.target===$('invite-modal'))closeInvite()});
  $('invite-modal').addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();closeInvite()}});
  $('invite-copy-button').addEventListener('click',async()=>{const value=$('invite-link').value;try{if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(value);else{const input=$('invite-link');input.focus();input.select();if(!document.execCommand('copy'))throw Error('copy failed')}$('invite-status').textContent='Ссылка скопирована';showToast('Ссылка скопирована')}catch{$('invite-link').focus();$('invite-link').select();$('invite-status').textContent='Буфер недоступен — выделите и скопируйте ссылку вручную'}});
  function openTelegramShare(value){const shareUrl=`https://t.me/share/url?url=${encodeURIComponent(value)}`;if(isTelegramMiniApp&&telegramApp?.openTelegramLink){telegramApp.openTelegramLink(shareUrl);return}const popup=window.open(shareUrl,'_blank','noopener,noreferrer');if(!popup)$('invite-status').textContent='Не удалось открыть Telegram — скопируйте ссылку вручную'}
  $('invite-share-button').addEventListener('click',async()=>{const value=$('invite-link').value;if(isTelegramMiniApp&&telegramApp?.openTelegramLink){openTelegramShare(value);return}if(navigator.share){try{await navigator.share({title:'Бутылочки',text:'Сыграй в BottleGame вместе со мной!',url:value});$('invite-status').textContent='Ссылка отправлена'}catch(error){if(error.name==='AbortError')return;openTelegramShare(value)}return}openTelegramShare(value)});
  $('home-button').addEventListener('click',returnToMenu);
  $('settings-open').addEventListener('click',openSettings);$('settings-close').addEventListener('click',()=>{$('settings-modal').hidden=true;syncTelegramBackButton()});
  function openSettings(){const settings=store.data.settings;$('music-toggle').checked=settings.music;$('sfx-toggle').checked=settings.sfx;$('volume-control').value=settings.volume;$('animations-toggle').checked=settings.animations;$('theme-select').replaceChildren(...themePreferences.map(name=>{const option=document.createElement('option');option.value=name;option.textContent=name==='auto'?'Авто (по сезону)':themes[name].label;option.selected=name===settings.theme;return option}));$('settings-modal').hidden=false;syncTelegramBackButton()}
  $('music-toggle').addEventListener('change',event=>{store.setAudio({music:event.target.checked});window.GameAudio?.setMusic(event.target.checked,store.data.settings.volume)});
  $('sfx-toggle').addEventListener('change',event=>store.setAudio({sfx:event.target.checked}));$('volume-control').addEventListener('input',event=>{store.setAudio({volume:Number(event.target.value)});window.GameAudio?.setVolume(Number(event.target.value))});
  $('animations-toggle').addEventListener('change',event=>setAnimations(event.target.checked));$('theme-select').addEventListener('change',event=>setTheme(event.target.value));
  $('renderer-retry').addEventListener('click',initializeRenderer);
  $('renderer-reload').addEventListener('click',()=>location.reload());
  const initialTheme=themePreferences.includes(save.settings.theme)?save.settings.theme:'auto';setTheme(initialTheme);setAnimations(save.settings.animations);window.GameAudio?.setMusic(save.settings.music,save.settings.volume);window.GameAudio?.setVolume(save.settings.volume);startLevel(undefined,true,{resume:true});renderLives();
  $('menu-screen').hidden=false;setInterval(syncLifeRecovery,1000);initializeRenderer();
  if(isTelegramMiniApp){
    telegramApp?.BackButton?.onClick(returnToMenu);
    telegramApp?.onEvent?.('viewportChanged',syncTelegramViewport);
    telegramApp?.ready?.();telegramApp?.expand?.();syncTelegramViewport();syncTelegramBackButton();
  }
  $('life-empty-modal').hidden=save.lives!==0;
})();
