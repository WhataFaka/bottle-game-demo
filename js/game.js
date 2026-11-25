/* Pure game rules: bottle contents are arrays ordered bottom to top. */
(() => {
  const CAPACITY = 4;
  const POUR_TIMING=Object.freeze({speed:.72,prepare:.22,return:.18,raise:.14,travelMin:.17,travelMax:.37,tilt:.18,streamFade:.10,straighten:.16,selection:.22});
  const PALETTE=window.GameThemes?.liquidPalettes?.classic||['#f43f5e','#ff8a00','#ffd000','#18b86a','#00b9d6','#3867f5','#8d45e8','#e843b5','#77bd12','#b83e12'];
  const LATE_PALETTE=window.GameThemes?.liquidPalettes?.late||['#e11d48','#fb6b00','#f4c400','#00a878','#00a9d6','#2452c9','#7436d1','#c02a91','#58a80b','#9b4617'];
  function paletteForLevel(level){return level>=51?LATE_PALETTE:PALETTE}
  // A board is complete only when every level color has its own full bottle.
  function solved(bottles, expectedColors = []) {
    if (!Array.isArray(expectedColors) || !expectedColors.length) return false;
    const collected = new Set();
    for (const bottle of bottles) {
      if (!bottle.length) continue;
      if (bottle.length !== CAPACITY || !bottle.every(color => color === bottle[0]) || collected.has(bottle[0])) return false;
      collected.add(bottle[0]);
    }
    return expectedColors.every(color => collected.has(color)) && collected.size === expectedColors.length;
  }
  function legalMoves(bottles) {
    const moves=[];
    bottles.forEach((from,i)=>{
      if(!from.length) return;
      const color=from[from.length-1];
      if (isCompleteBottle(from)) return;
      bottles.forEach((to,j)=>{ if(i===j||to.length===CAPACITY||isCompleteBottle(to)) return; if(!to.length||to[to.length-1]===color) moves.push([i,j]); });
    });
    return moves;
  }
  // Early lessons receive a playable board state instead of relying on spare capacity alone.
  function findTutorialMove(bottles,level){
    const moves=legalMoves(bottles);
    if(level===2)return moves.find(([from,to])=>bottles[to].length>0&&bottles[to].at(-1)===bottles[from].at(-1))||null;
    if(level===3)return moves.find(([,to])=>bottles[to].length===0)||null;
    return moves[0]||null;
  }
  function isCompleteBottle(bottle) { return bottle.length===CAPACITY && bottle.every(color=>color===bottle[0]); }
  // Reverse only exact maximal pours from a solved board; replaying the forward moves always solves it.
  function isSpecialLevel(level) { return level > 0 && level % 10 === 0; }
  function createLevel(level) { return createLevelDetails(level).bottles; }
  function getLevelProfile(level){
    const cycle=(level-1)%8,kind=['calm','standard','tight','open','twist','calm','open','standard'][cycle];
    return {kind,multiplier:{calm:.72,standard:1,tight:1.12,open:1.28,twist:1.4}[kind]};
  }
  function reverseMoves(board, reserved, spare, previous, maxAmount=3){
    const choices=[];
    board.forEach((donor,from)=>{
      if(!donor.length)return;
      const color=donor.at(-1);
      let run=0;
      while(run<donor.length&&donor[donor.length-1-run]===color)run++;
      for(let to=0;to<board.length-reserved;to++){
        const target=board[to];
        if(to===from||target.length===CAPACITY||target.at(-1)===color)continue;
        const max=Math.min(run,CAPACITY-1,CAPACITY-target.length-spare,maxAmount);
        for(let amount=1;amount<=max;amount++){
          const remaining=donor.length-amount;
          if(remaining&&donor[remaining-1]!==color)continue;
          const key=`${from}:${to}:${amount}`;
          if(key!==previous)choices.push([from,to,amount,key]);
        }
      }
    });
    return choices;
  }
  function chooseReverseMove(choices,random,singleWeight=.78,board){
    const singles=choices.filter(([, ,amount])=>amount===1),larger=choices.filter(([, ,amount])=>amount>1);
    let pool=singles.length&&larger.length&&random()<singleWeight?singles:choices;
    if(board){
      const runs=pool.map(([from])=>{
        const bottle=board[from],color=bottle.at(-1);let run=0;
        while(run<bottle.length&&bottle[bottle.length-1-run]===color)run++;
        return run;
      });
      const partialRuns=runs.filter(run=>run>1),preferredRun=Math.min(...(partialRuns.length?partialRuns:runs));
      pool=pool.filter((_,index)=>runs[index]===preferredRun);
    }
    return pool[Math.floor(random()*pool.length)];
  }
  // Keep this profile in sync with GameHiddenColors.profileForLevel; the generator is also tested standalone.
  function hiddenLayerPlan(level,seed){
    let bottles,layers;
    if(level>=15&&level<=30&&(level-15)%3===0){bottles=[1,2];layers=[1,3]}
    else if(level>30&&level<=60&&level%2===1){bottles=[2,4];layers=[3,6]}
    else if(level>60&&(level-61)%4<3){bottles=level<=82?[3,5]:[4,6];layers=level<=82?[5,9]:[8,12]}
    else return null;
    const random=mulberry32((seed^0x203f873b)>>>0),pick=range=>range[0]+Math.floor(random()*(range[1]-range[0]+1));
    return {bottles:pick(bottles),layers:pick(layers)};
  }
  function rareEasyStart(level,seed){
    return mulberry32((seed^Math.imul(level,0x85ebca6b)^0x68bc21eb)>>>0)()<.01;
  }
  function safeLayerSlots(board,solution,bottleLimit){
    const walk=board.map((bottle,index)=>bottle.map((color,unit)=>({id:`${index}:${unit}`,color,revealed:unit===bottle.length-1}))),
      candidates=new Set(walk.flat().filter(layer=>!layer.revealed).map(layer=>layer.id));
    for(const [from,to] of solution){
      const source=walk[from],target=walk[to];if(!source?.length||!target||target.length>=CAPACITY)return 0;
      const top=source.at(-1).color,space=CAPACITY-target.length;
      for(let depth=0;depth<space&&depth<source.length;depth++){
        const layer=source[source.length-1-depth];
        if(!layer.revealed)candidates.delete(layer.id);
        if(layer.color!==top)break;
      }
      let amount=0;while(amount<space&&amount<source.length&&source[source.length-1-amount].color===top)amount++;
      if(!amount)return 0;
      const moved=source.splice(-amount);for(const layer of moved)layer.revealed=true;
      target.push(...moved);if(source.length)source.at(-1).revealed=true;
      if(target.length===CAPACITY&&target.every(layer=>layer.color===target[0].color))for(const layer of target)layer.revealed=true;
    }
    const byBottle=new Map();
    for(const layer of walk.flat())if(candidates.has(layer.id)){const index=Number(layer.id.split(':')[0]);byBottle.set(index,(byBottle.get(index)||0)+1)}
    return [...byBottle.values()].sort((a,b)=>b-a).slice(0,bottleLimit).reduce((sum,count)=>sum+count,0);
  }
  function startQuality(board,solution=[],hiddenPlan=null,colors){
    const closable=new Set();
    for(const [from,to] of legalMoves(board)){
      const source=board[from],target=board[to],color=source[source.length-1];
      let amount=0;while(amount<source.length&&source[source.length-1-amount]===color&&target.length+amount<CAPACITY)amount++;
      if(target.length+amount===CAPACITY&&target.every(value=>value===color))closable.add(to);
    }
    const triples=board.filter(bottle=>{
      const counts=new Map();for(const color of bottle)counts.set(color,(counts.get(color)||0)+1);
      return [...counts.values()].some(count=>count>=3);
    }).length;
    const pairs=board.filter(bottle=>bottle.some((color,index)=>index>0&&color===bottle[index-1])).length;
    const knownRoute=hiddenPlan?(colors?.length?removeCycles(board,solution,colors):solution):[];
    const hiddenSlots=hiddenPlan&&knownRoute.length?safeLayerSlots(board,knownRoute,hiddenPlan.bottles):0;
    return {closable:closable.size,triples,pairs,hiddenSlots,hiddenDeficit:Math.max(0,(hiddenPlan?.layers||0)-hiddenSlots)};
  }
  function layoutVariation(board,colors,seed){
    let hash=seed>>>0;
    for(const bottle of board){
      hash=Math.imul(hash^0x9e3779b9,16777619)>>>0;
      for(const color of bottle)hash=Math.imul(hash^colors.indexOf(color),16777619)>>>0;
    }
    return mulberry32(hash)()*12;
  }
  function reversePour(board, from, to, amount){
    board[to].push(...board[from].splice(-amount));
  }
  function createLevelDetails(level, options = {}) {
    if(level>=31)return createBalancedLevel(level,options);
    const special=isSpecialLevel(level), milestone=Math.floor(level/10);
    const profile=getLevelProfile(level);
    const palette=paletteForLevel(level);
    const baseColors=Math.min(8,Math.max(2,2+Math.floor((level-1)*0.62)));
    const colorVariation=level<=5?0:[0,1,-1,0,1,-1,0,1][(level-6)%8];
    const colorCount=Math.min(9,palette.length,Math.max(2,baseColors+colorVariation)+((special&&(milestone===2||milestone===5))?1:0));
    const minBottleCount=Math.max(4,Math.ceil(colorCount*CAPACITY/3),colorCount+2);
    const extraByProfile={calm:0,standard:1,tight:0,open:2,twist:1}[profile.kind];
    const variedSpace=level<=5?0:(Math.floor((level-6)/2)%3);
    const suggestedBottleCount=Math.min(12,minBottleCount+(special&&milestone===3?0:Math.max(extraByProfile,variedSpace)));
    const seed=(options.seed??(level*9187+42))>>>0,seeded=options.seed!==undefined&&level>5,varied=seeded&&!options.fixedLayout;
    const settings=mulberry32(seed^0x4b1d8afb);
    const minimum=seeded?Math.max(4,colorCount+2):minBottleCount;
    const variants=[...new Set([minimum,suggestedBottleCount,Math.min(12,suggestedBottleCount+1)])];
    const bottleCount=options.bottleCount||(varied?variants[Math.floor(settings()*variants.length)]:suggestedBottleCount);
    const emptyCount=bottleCount-colorCount;
    if(bottleCount<minimum||bottleCount>12)throw new RangeError('Количество бутылочек не подходит для уровня');
    const colors=options.colors?.slice()||Array.from({length:colorCount},(_,i)=>palette[(i+(level-1)*3)%palette.length]);
    if(colors.length!==colorCount)throw new RangeError('Набор цветов не соответствует уровню');
    const solvedBoard=[...colors.map(color=>Array(CAPACITY).fill(color)),...Array.from({length:emptyCount},()=>[])];
    const maxReserved=Math.max(0,Math.min(special&&milestone===3?1:2,bottleCount-Math.ceil(colorCount*CAPACITY/3)));
    const reserved=varied?Math.floor(settings()*(maxReserved+1)):level<=5?1:0;
    const target=Math.min(230,Math.round((10+level*2.4+Math.sqrt(level)*4+(special?10+milestone*2:0))*profile.multiplier*(varied?.8+.4*settings():1)));
    let bottles=null,solution=[],bestScore=-Infinity,easyCandidate=null,easyScore=-Infinity;
    // Restart short reverse walks so later levels do not stop at an easy local dead end.
    for(let attempt=0;attempt<(level<=5?64:24);attempt++){
      const candidate=solvedBoard.map(b=>b.slice()),rng=mulberry32(seed+attempt*0x9e3779b9),path=[];let previous='';
      for(let n=0;n<target+64&&(n<target||candidate.some(isCompleteBottle));n++){
        const choices=reverseMoves(candidate,reserved,seeded?0:1,previous,level>5?2:3);
        if(!choices.length)break;
        const [from,to,amount,key]=level>5?chooseReverseMove(choices,rng,.97,candidate):choices[Math.floor(rng()*choices.length)];
        reversePour(candidate,from,to,amount);
        path.unshift([to,from]);previous=key;
      }
      const hasTutorialMove=level!==2||Boolean(findTutorialMove(candidate,2));
      if(level<=5){
        if(!candidate.some(isCompleteBottle)&&hasTutorialMove&&path.length>solution.length&&certifies(candidate,path,colors)){bottles=candidate;solution=path}
        if(solution.length>=target&&hasTutorialMove)break;
      }else{
        const quality=startQuality(candidate,path,hiddenLayerPlan(level,seed),colors),score=path.length*0.04-quality.closable*300-quality.triples*24-Math.max(0,quality.pairs-1)*8-quality.hiddenDeficit*200;
        if(!candidate.some(isCompleteBottle)&&path.length>0&&certifies(candidate,path,colors)){
          const candidateEasyScore=path.length*0.04-quality.triples*24-Math.max(0,quality.pairs-1)*8-quality.hiddenDeficit*200;
          if(rareEasyStart(level,seed)&&quality.closable===1&&quality.hiddenDeficit===0&&candidateEasyScore>easyScore){easyCandidate={bottles:candidate,solution:path};easyScore=candidateEasyScore}
          if(!bottles||score>bestScore){bottles=candidate;solution=path;bestScore=score}
        }
        if(solution.length>=target&&quality.closable===0&&quality.triples<=1&&quality.pairs<=3)break;
      }
    }
    if(rareEasyStart(level,seed)&&easyCandidate){bottles=easyCandidate.bottles;solution=easyCandidate.solution}
    if(!bottles&&varied)return createLevelDetails(level,{...options,seed,fixedLayout:true});
    if(!bottles)throw new Error('Не удалось создать перемешанный решаемый уровень');
    if(level===2&&!findTutorialMove(bottles,2))throw new Error('Уровень 2 не содержит подходящего хода для обучения');
    if(level===3&&!findTutorialMove(bottles,3))throw new Error('Уровень 3 не содержит пустой бутылочки для обучения');
    if(options.seed!==undefined)solution=removeCycles(bottles,solution,colors);
    return {seed,bottles,solution,colors,colorCount,bottleCount:bottles.length,special,profile:profile.kind,challenge:createChallenge(level,solution.length,bottles.length,profile.kind)};
  }
  const balanceBands=[
    {colors:[7,8,8,9],mix:18},
    {colors:[8,8,9,9],mix:20},
    {colors:[8,9,9,10],mix:22},
    {colors:[9,9,10,10],mix:24},
  ];
  function createBalancedLevel(level,{seed=(level*9187+42),bottleCount,colors}={}){
    seed>>>=0;
    const special=isSpecialLevel(level),profile=getLevelProfile(level).kind,palette=paletteForLevel(level);
    const band=balanceBands[Math.min(balanceBands.length-1,Math.floor((level-31)/18))];
    const levelSeed=(seed+Math.imul(level,0x9e3779b9))>>>0,rng=mulberry32(levelSeed);
    const sampledColors=band.colors[Math.floor(rng()*band.colors.length)];
    const colorCount=colors?.length??Math.min(Math.max(sampledColors,level===50?9:2),(bottleCount??12)-2);
    colors=colors?.slice()??Array.from({length:colorCount},(_,i)=>palette[(i+(level-1)*3)%palette.length]);
    bottleCount??=Math.min(12,colorCount+(rng()<.36?3:2));
    if(colorCount<2||colorCount>palette.length||!Number.isInteger(bottleCount)||bottleCount<colorCount+2||bottleCount>12)throw new RangeError('Количество бутылочек не подходит для уровня');
    const goal=Math.min((CAPACITY-1)*colorCount,band.mix+Math.floor(rng()*5)-2+(profile==='calm'?-1:0));
    const preferredEmpty=bottleCount>colorCount+2&&rng()<.65?2:1;
    const initial=[...colors.map(color=>Array(CAPACITY).fill(color)),...Array.from({length:bottleCount-colorCount},()=>[])];
    let best=null,easyCandidate=null,easyScore=Infinity;
    const candidates=[];
    const preserveEasy=rareEasyStart(level,seed);
    for(let attempt=0;attempt<16;attempt++){
      if(attempt===6&&candidates.length&&preferredEmpty===2)break;
      const random=mulberry32(levelSeed+Math.imul(attempt+1,0x6d2b79f5));
      const board=initial.map(bottle=>bottle.slice()),path=[];
      const seen=new Set([JSON.stringify(board)]);
      const reserved=attempt<6?preferredEmpty:1;
      let mix=0,attemptCandidates=[],bestNoClose=null,bestEasy=null;
      for(let step=0;step<goal+16;step++){
        const choices=reverseMoves(board,reserved,0,'',2);
        if(!choices.length)break;
        const splits=choices.filter(([from,,amount])=>amount<board[from].length);
        // Keep another exposed run available for splitting when choosing a receiver.
        const openSplits=splits.filter(([,to])=>board[to].length<2||board[to].at(-1)!==board[to].at(-2));
        const pool=openSplits.length&&random()<.9?openSplits:splits.length&&random()<.9?splits:choices;
        const [from,to,amount]=chooseReverseMove(pool,random,.97,board);
        mix+=Number(amount<board[from].length);
        reversePour(board,from,to,amount);
        path.push([to,from]);
        const signature=JSON.stringify(board);
        if(seen.has(signature))break;
        seen.add(signature);
        if(board.some(isCompleteBottle))continue;
        const empty=board.filter(bottle=>!bottle.length).length;
        if(empty>2)continue;
        // Splits count the surplus monochrome runs, a lower bound on forward moves.
        const baseScore=Math.min(mix,goal)*6-Math.max(0,empty-preferredEmpty)*3-(path.length-mix);
        const route=path.slice().reverse(),quick=startQuality(board,route),closurePenalty=preserveEasy
          ?(quick.closable===1?-24:quick.closable*300):quick.closable*300;
        const quickScore=baseScore-closurePenalty-quick.triples*40-Math.max(0,quick.pairs-2)*10+random()*0.5;
        const candidate={bottles:board.map(bottle=>bottle.slice()),solution:route,baseScore,mix,empty,tie:random(),quickScore,quickQuality:quick};
        if(quick.closable===0&&(!bestNoClose||quickScore>bestNoClose.quickScore))bestNoClose=candidate;
        if(preserveEasy&&quick.closable===1&&(!bestEasy||quickScore>bestEasy.quickScore))bestEasy=candidate;
        attemptCandidates.push(candidate);
        attemptCandidates.sort((a,b)=>b.quickScore-a.quickScore);
        if(attemptCandidates.length>3)attemptCandidates.pop();
        if(mix>=goal&&empty<=preferredEmpty&&path.length<=mix+4&&quick.closable===0&&quick.triples<=1&&quick.pairs<=3)break;
      }
      candidates.push(...attemptCandidates);
      if(bestNoClose)candidates.push(bestNoClose);
      if(bestEasy)candidates.push(bestEasy);
    }
    const candidatesToScore=candidates.sort((a,b)=>b.quickScore-a.quickScore||b.tie-a.tie);
    for(const attemptCandidate of candidatesToScore){
      const quality=startQuality(attemptCandidate.bottles,attemptCandidate.solution,hiddenLayerPlan(level,seed));
      const score=attemptCandidate.baseScore-quality.closable*300-quality.triples*40
        -Math.max(0,quality.pairs-2)*10-quality.hiddenDeficit*200+attemptCandidate.tie*12
        +layoutVariation(attemptCandidate.bottles,colors,levelSeed);
      const candidate={bottles:attemptCandidate.bottles,solution:attemptCandidate.solution,score,hiddenDeficit:quality.hiddenDeficit};
      if(!best||score>best.score)best=candidate;
      if(preserveEasy&&quality.closable===1&&quality.hiddenDeficit===0&&attemptCandidate.mix>=goal
        &&attemptCandidate.empty<=preferredEmpty&&attemptCandidate.solution.length<=attemptCandidate.mix+4){
        const easyValue=quality.triples*40+Math.max(0,quality.pairs-2)*10+attemptCandidate.solution.length-attemptCandidate.mix;
        if(certifies(candidate.bottles,candidate.solution,colors)&&easyValue<easyScore){easyCandidate=candidate;easyScore=easyValue}
      }
    }
    const {bottles,solution}=easyCandidate??best??balancedFallback(initial,colorCount);
    if(!certifies(bottles,solution,colors))throw new Error('Не удалось создать перемешанный решаемый уровень');
    return {seed,bottles,solution,colors,colorCount,bottleCount,special,profile,challenge:createChallenge(level,solution.length,bottleCount,profile)};
  }
  function balancedFallback(bottles,colorCount){
    // Move one unit into a buffer, then pass each opened slot to the previous color.
    const solution=[];
    for(let from=colorCount-1;from>=0;from--){
      reversePour(bottles,from,from+1,1);
      solution.unshift([from+1,from]);
    }
    if(bottles.length===colorCount+2){
      reversePour(bottles,colorCount,0,1);
      solution.unshift([0,colorCount]);
    }
    return {bottles,solution};
  }
  function removeCycles(bottles,solution,colors){
    const board=bottles.map(bottle=>bottle.slice()),states=[JSON.stringify(board)],moves=[];
    const seen=new Map([[states[0],0]]);
    for(const [from,to] of solution){
      pour(board,from,to,colors);
      const signature=JSON.stringify(board),previous=seen.get(signature);
      if(previous!==undefined){
        while(states.length>previous+1)seen.delete(states.pop());
        moves.length=previous;
      }else{
        moves.push([from,to]);
        seen.set(signature,moves.length);
        states.push(signature);
      }
    }
    return moves;
  }
  function certifies(bottles,solution,colors){
    const board=bottles.map(bottle=>bottle.slice());
    return solution.every(([from,to])=>pour(board,from,to,colors).ok)&&solved(board,colors);
  }
  function randomSeed(){return window.crypto?.getRandomValues(new Uint32Array(1))[0]??Math.floor(Math.random()*4294967296)}
  function newLevelDetails(level,previous,options={}){
    const signature=bottles=>level>=31?JSON.stringify(bottles.map(bottle=>JSON.stringify(bottle)).sort()):JSON.stringify(bottles);
    const prior=previous?signature(previous):null,seed=randomSeed();
    for(let attempt=0;attempt<16;attempt++){
      const data=createLevelDetails(level,{...options,seed:(seed+attempt*0x9e3779b9)>>>0});
      if(signature(data.bottles)!==prior)return data;
    }
    throw new Error('Не удалось создать новую раскладку');
  }
  function createChallenge(level,solutionLength,bottleCount=4,profile=getLevelProfile(level).kind){
    const special=isSpecialLevel(level),milestone=Math.floor(level/10);
    const type=!special?'standard':milestone===1?'moves':milestone===3?'space':milestone===2||milestone===5?'complex':'mixed';
    const margin={calm:.38,standard:.32,tight:.26,open:.4,twist:.3}[profile]||.32;
    const bottleBonus=Math.max(0,bottleCount-4);
    const specialMargin={moves:3,space:4,complex:5,mixed:4};
    const extra=special?specialMargin[type]:Math.max(3,Math.ceil(solutionLength*margin)+Math.floor(bottleBonus/2));
    return {type,moveLimit:solutionLength+extra,reward:special?50+milestone*10:10,label:special?'Особый уровень':'Лимит ходов',special,solutionLength,profile,bottleCount};
  }
  // A reshuffle creates another certified layout while preserving color totals and vessel count.
  function reshuffle(bottles,level,seed=Date.now()){
    const colors=[...new Set(bottles.flat())];
    if(colors.some(color=>bottles.flat().filter(unit=>unit===color).length!==CAPACITY))throw new Error('Неверный состав цвета для перемешивания');
    return createLevelDetails(level,{bottleCount:bottles.length,colors,seed});
  }
  function isDeadlocked(bottles,expectedColors){return !solved(bottles,expectedColors)&&legalMoves(bottles).length===0;}
  function pourAnimationDuration(amount,reduced=false){return reduced?0:Math.round((420+Math.max(1,Math.min(CAPACITY,amount))*140)*POUR_TIMING.speed);}
  function mulberry32(a){return function(){let t=a+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
  function pour(bottles,from,to,expectedColors){
    if(from===to||!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<0||from>=bottles.length||to>=bottles.length)return {ok:false,reason:'Выбери две разные бутылочки'};
    const source=bottles[from], target=bottles[to];
    if(isCompleteBottle(source))return {ok:false,reason:'Эта бутылочка уже собрана'};
    if(isCompleteBottle(target))return {ok:false,reason:'Эта бутылочка уже собрана'};
    if(!source.length)return {ok:false,reason:'Эта бутылочка пустая'};
    if(target.length===CAPACITY)return {ok:false,reason:'В бутылочке нет места'};
    const color=source[source.length-1];
    if(target.length&&target[target.length-1]!==color)return {ok:false,reason:'Можно переливать только на такой же цвет'};
    let amount=0;while(source.length&&source[source.length-1]===color&&target.length<CAPACITY){target.push(source.pop());amount++}
    return {ok:true,amount,color,won:solved(bottles,expectedColors)};
  }
  window.WaterSort={CAPACITY,POUR_TIMING,PALETTE,LATE_PALETTE,paletteForLevel,solved,legalMoves,findTutorialMove,createLevel,createLevelDetails,newLevelDetails,createChallenge,getLevelProfile,reshuffle,isDeadlocked,isSpecialLevel,pour,isCompleteBottle,pourAnimationDuration};
})();
