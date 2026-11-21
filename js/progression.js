/* Versioned LocalStorage state with a safe migration from the original { level } save. */
(() => {
  const KEY='bottle-game-save', VERSION=5, SHUFFLE_COST=25, HINT_COST=10, DAILY_REWARD=15, MAX_LIVES=3, LIFE_INTERVAL=30*60*1000;
  function normalize(value={}){
    const data=value&&typeof value==='object'?value:{};
    return {version:VERSION,level:Math.max(1,Number(data.level)||1),coins:Math.max(0,Number(data.coins)||0),
      clearedSpecials:Array.isArray(data.clearedSpecials)?[...new Set(data.clearedSpecials.filter(Number.isInteger))]:[],
      rewardedLevels:Array.isArray(data.rewardedLevels)?[...new Set(data.rewardedLevels.filter(Number.isInteger))]:[],
      countedWinAttempts:Array.isArray(data.countedWinAttempts)?[...new Set(data.countedWinAttempts.filter(value=>typeof value==='string'&&value))]:[],
      freeHintsUsedLevels:Array.isArray(data.freeHintsUsedLevels)?[...new Set(data.freeHintsUsedLevels.filter(level=>Number.isInteger(level)&&level>0))]:[],
      stats:{totalMoves:Math.max(0,Number(data.stats?.totalMoves)||0),levelsWon:Math.max(0,Number(data.stats?.levelsWon)||0)},
      settings:{theme:typeof data.settings?.theme==='string'?data.settings.theme:'autumn',animations:data.settings?.animations!==false,music:data.settings?.music===true,sfx:data.settings?.sfx!==false,volume:Number.isFinite(data.settings?.volume)?Math.max(0,Math.min(1,data.settings.volume)):.45},
      lastDailyClaim:typeof data.lastDailyClaim==='string'?data.lastDailyClaim:'',
      lives:Math.max(0,Math.min(MAX_LIVES,Number.isInteger(data.lives)?data.lives:MAX_LIVES)),
      nextLifeAt:Number.isFinite(data.nextLifeAt)?data.nextLifeAt:null,
      pausedLifeMs:Number.isFinite(data.pausedLifeMs)?Math.max(0,Math.min(LIFE_INTERVAL,data.pausedLifeMs)):null,
      lastDailyLifeDate:typeof data.lastDailyLifeDate==='string'?data.lastDailyLifeDate:'',
      undoUsedLevels:Array.isArray(data.undoUsedLevels)?[...new Set(data.undoUsedLevels.filter(level=>Number.isInteger(level)&&level>0))]:(Number.isInteger(data.undoUsedLevel)&&data.undoUsedLevel>0?[data.undoUsedLevel]:[]),
      attemptId:typeof data.attemptId==='string'?data.attemptId:'',lastLifeLossId:typeof data.lastLifeLossId==='string'?data.lastLifeLossId:'',
      hiddenAttempt:data.hiddenAttempt&&typeof data.hiddenAttempt==='object'?data.hiddenAttempt:null,
      activeAttempt:data.activeAttempt&&typeof data.activeAttempt==='object'?data.activeAttempt:null};
  }
  function createStore(storage,clock=()=>new Date()){
    let activeStorage=storage;
    if(!activeStorage){try{activeStorage=window.localStorage}catch{activeStorage=null}}
    let state;try{state=normalize(JSON.parse(activeStorage?.getItem(KEY)||'{}'))}catch{state=normalize()}
    if(!state.attemptId)state.attemptId=`${clock().getTime()}-${Math.random().toString(36).slice(2)}`;
    function persist(){try{activeStorage?.setItem(KEY,JSON.stringify(state));return Boolean(activeStorage)}catch{return false}}
    function syncLives(now=clock()){
      const time=now instanceof Date?now.getTime():Number(now);let gained=0;
      if(state.nextLifeAt!==null&&Number.isFinite(time)&&time>=state.nextLifeAt){
        const cycles=Math.floor((time-state.nextLifeAt)/LIFE_INTERVAL)+1;gained=Math.min(cycles,MAX_LIVES-state.lives);state.lives+=gained;
        if(state.lives===MAX_LIVES){state.nextLifeAt=null;state.pausedLifeMs=null}else state.nextLifeAt+=cycles*LIFE_INTERVAL;
        persist();
      }
      return gained;
    }
    function localDay(date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`}
    syncLives();
    function writeAttempt(attempt){state.activeAttempt=attempt;state.hiddenAttempt=null}
    function setActiveAttempt(attempt){writeAttempt(attempt);persist()}
    return {get data(){return JSON.parse(JSON.stringify(state))},persist,setActiveAttempt,
      recordMove(attempt){if(attempt!==undefined)writeAttempt(attempt);state.stats.totalMoves++;persist()},
      spend(amount){if(!Number.isFinite(amount)||amount<0||state.coins<amount)return false;state.coins-=amount;persist();return true},
      useHint(level,price=HINT_COST){
        if(!Number.isInteger(level)||level<1)return {ok:false,reason:'level',coins:state.coins};
        if(!state.freeHintsUsedLevels.includes(level)){state.freeHintsUsedLevels.push(level);persist();return {ok:true,free:true,coins:state.coins}}
        if(!Number.isFinite(price)||price<0||state.coins<price)return {ok:false,reason:'coins',coins:state.coins};
        state.coins-=price;persist();return {ok:true,free:false,coins:state.coins};
      },
      rewardLevel(level,moves,special=false,reward=10,attemptId=state.attemptId){
        if(!state.rewardedLevels.includes(level)){state.rewardedLevels.push(level);state.coins+=reward}
        if(special&&!state.clearedSpecials.includes(level))state.clearedSpecials.push(level);
        if(state.hiddenAttempt?.level===level)state.hiddenAttempt=null;
        if(state.activeAttempt?.level===level)state.activeAttempt=null;
        const winAttempt=typeof attemptId==='string'&&attemptId?attemptId:state.attemptId;
        if(!state.countedWinAttempts.includes(winAttempt)){state.countedWinAttempts.push(winAttempt);state.stats.levelsWon++}
        state.level=Math.max(state.level,level+1);persist();return state.coins;
      },
      beginAttempt(){state.attemptId=`${clock().getTime()}-${Math.random().toString(36).slice(2)}`;persist();return state.attemptId},
      loseLife(attemptId=state.attemptId,now=clock()){
        syncLives(now);if(!attemptId||attemptId===state.lastLifeLossId)return {lost:false,lives:state.lives};
        if(state.lives<=0)return {lost:false,lives:0};
        state.lastLifeLossId=attemptId;state.lives--;
        if(state.nextLifeAt===null){const pause=state.pausedLifeMs;state.nextLifeAt=(now instanceof Date?now.getTime():Number(now))+(pause??LIFE_INTERVAL);state.pausedLifeMs=null}
        persist();return {lost:true,lives:state.lives};
      },
      syncLives,
      claimDailyLife(now=clock()){
        syncLives(now);const date=now instanceof Date?now:new Date(now),today=localDay(date);
        if(state.lastDailyLifeDate===today)return {claimed:false,reason:'already'};
        if(state.lives>=MAX_LIVES)return {claimed:false,reason:'full'};
        state.lastDailyLifeDate=today;state.lives=Math.min(MAX_LIVES,state.lives+1);
        if(state.lives===MAX_LIVES&&state.nextLifeAt!==null){state.pausedLifeMs=Math.max(0,state.nextLifeAt-date.getTime());state.nextLifeAt=null}
        persist();return {claimed:true,lives:state.lives};
      },
      lifeTimeRemaining(now=clock()){
        syncLives(now);if(state.lives>=MAX_LIVES||state.nextLifeAt===null)return 0;
        const time=now instanceof Date?now.getTime():Number(now);return Math.max(0,state.nextLifeAt-time);
      },
      claimDaily(){const today=clock().toISOString().slice(0,10);if(state.lastDailyClaim===today)return false;state.lastDailyClaim=today;state.coins+=DAILY_REWARD;persist();return true},
      setTheme(theme){state.settings.theme=theme;persist()},setAnimations(enabled){state.settings.animations=Boolean(enabled);persist()},
      setAudio(settings){state.settings={...state.settings,...settings};persist()},
      useUndo(level,attempt){if(!Number.isInteger(level)||level<1||state.undoUsedLevels.includes(level))return false;if(attempt!==undefined)writeAttempt(attempt);state.undoUsedLevels.push(level);persist();return true},
      grantCoins(amount){if(Number.isFinite(amount)&&amount>0){state.coins+=Math.floor(amount);persist()}return state.coins},
      grantLives(amount){if(Number.isFinite(amount)&&amount>0){state.lives=Math.min(MAX_LIVES,state.lives+Math.floor(amount));persist()}return state.lives},
      setLevel(level){if(Number.isInteger(level)&&level>0){state.level=level;persist()}return state.level}};
  }
  window.GameProgress={KEY,VERSION,SHUFFLE_COST,HINT_COST,DAILY_REWARD,MAX_LIVES,LIFE_INTERVAL,normalize,createStore};
})();
