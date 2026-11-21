/* Standalone solver. Bottles contain public color strings or null, bottom to top. */
(() => {
  const DEFAULT_WORK = 12000;
  const MAX_WORLDS = 256;
  const MAX_DEPTH = 64;
  const OUT_OF_WORK = Symbol('hint search budget');
  const unavailable = reason => ({status:'no-guaranteed-hint', reason});
  const validColor = value => typeof value === 'string' && value.length > 0;
  const colorOf = Math.abs;

  function readPosition(visible, publicColors, capacity){
    if(!Array.isArray(visible)||!visible.length||visible.length>12)return {reason:'invalid-state'};
    const known=new Set();
    let units=0;
    for(const bottle of visible){
      if(!Array.isArray(bottle)||bottle.length>capacity||bottle.at(-1)===null)return {reason:'invalid-state'};
      for(const layer of bottle){
        if(layer!==null&&!validColor(layer))return {reason:'invalid-state'};
        if(layer!==null)known.add(layer);
        units++;
      }
    }
    const colorCount=units/capacity;
    if(!Number.isInteger(colorCount)||!colorCount||known.size>colorCount)return {reason:'invalid-state'};
    if(publicColors!==undefined&&(!Array.isArray(publicColors)||publicColors.length!==colorCount||
      new Set(publicColors).size!==colorCount||!Array.from(publicColors).every(validColor))){
      return {reason:'invalid-state'};
    }
    if(publicColors===undefined&&known.size<colorCount)return {reason:'insufficient-information'};
    const ids=new Map(Array.from(publicColors??known,(color,index)=>[color,index+1]));
    if([...known].some(color=>!ids.has(color)))return {reason:'invalid-state'};
    const missing=Array(colorCount+1).fill(capacity);
    const slots=[],board=visible.map((bottle,index)=>bottle.map((layer,depth)=>{
      if(layer===null){slots.push([index,depth]);return 0;}
      const id=ids.get(layer);
      missing[id]--;
      return id;
    }));
    if(missing.some(count=>count<0))return {reason:'invalid-state'};
    return {board,missing,slots,colorCount};
  }

  function complete(bottle,capacity){
    return bottle.length===capacity&&bottle.every(color=>colorOf(color)===colorOf(bottle[0]));
  }

  function possibleWorlds({board,missing,slots},capacity,spend){
    const worlds=[];
    function assign(index){
      spend();
      if(index===slots.length){
        // Completed bottles are public, including their full contents.
        if(board.some(bottle=>complete(bottle,capacity)&&bottle.some(layer=>layer<0)))return;
        if(worlds.length>=MAX_WORLDS)throw OUT_OF_WORK;
        worlds.push(board.map(bottle=>bottle.slice()));
        return;
      }
      const [bottle,depth]=slots[index];
      for(let id=1;id<missing.length;id++){
        if(!missing[id])continue;
        missing[id]--;
        board[bottle][depth]=-id;
        assign(index+1);
        missing[id]++;
      }
    }
    assign(0);
    return worlds;
  }

  function amountFor(board,from,to,capacity){
    const source=board[from],target=board[to],color=colorOf(source.at(-1));
    if(!source.length||complete(source,capacity)||target.length===capacity||
      (target.length&&colorOf(target.at(-1))!==color))return 0;
    let amount=0;
    while(amount<capacity-target.length&&colorOf(source[source.length-1-amount])===color)amount++;
    return amount;
  }

  function afterPour(board,from,to,amount,capacity){
    const next=board.slice();
    const source=next[from]=board[from].slice(0,-amount);
    const target=next[to]=board[to].concat(board[from].slice(-amount).map(colorOf));
    if(source.length)source[source.length-1]=colorOf(source.at(-1));
    if(complete(target,capacity))next[to]=target.map(colorOf);
    return next;
  }

  const observation=board=>board.map(bottle=>bottle.map(color=>Math.max(0,color)).join(',')).join('|');
  function lowerBound(board,colorCount){
    let runs=0;
    for(const bottle of board){
      let previous=0;
      for(const layer of bottle){
        const color=colorOf(layer);
        if(color!==previous)runs++;
        previous=color;
      }
    }
    return runs-colorCount;
  }

  function findPolicy(worlds,capacity,colorCount,locked,moves,spend){
    const failed=new Map();
    function search(belief,remaining,minimum){
      spend();
      if(minimum===0)return {worstCaseMoves:0};
      if(minimum>remaining)return null;
      const key=belief.map(board=>board.map(bottle=>bottle.join(',')).join('|')).join('/');
      if((failed.get(key)??-1)>=remaining)return null;
      const first=belief[0],candidates=[];
      for(let from=0;from<first.length;from++){
        if(locked.has(from)||!first[from].length)continue;
        let triedEmpty=false;
        for(let to=0;to<first.length;to++){
          if(to===from||locked.has(to))continue;
          if(!first[to].length&&triedEmpty)continue;
          const amount=amountFor(first,from,to,capacity);
          if(!amount)continue;
          if(!first[to].length){
            triedEmpty=true;
            if(amount===first[from].length&&first[from].every(layer=>layer>0))continue;
          }
          candidates.push({from,to,amount,priority:first[to].length+amount});
        }
      }
      candidates.sort((a,b)=>b.priority-a.priority);
      for(const {from,to,amount} of candidates){
        const outcomes=new Map();
        let guaranteed=true;
        for(const board of belief){
          spend();
          if(amountFor(board,from,to,capacity)!==amount){guaranteed=false;break;}
          const next=afterPour(board,from,to,amount,capacity);
          const seen=observation(next);
          if(!outcomes.has(seen))outcomes.set(seen,[]);
          outcomes.get(seen).push(next);
        }
        if(!guaranteed)continue;
        let worstCaseMoves=0;
        for(const branch of outcomes.values()){
          const score=Math.max(...branch.map(board=>lowerBound(board,colorCount)));
          const next=search(branch,remaining-1,score);
          if(!next){guaranteed=false;break;}
          worstCaseMoves=Math.max(worstCaseMoves,next.worstCaseMoves);
        }
        if(guaranteed)return {from,to,amount,worstCaseMoves:worstCaseMoves+1};
      }
      failed.set(key,remaining);
      return null;
    }
    const minimum=Math.max(...worlds.map(board=>lowerBound(board,colorCount)));
    if(!minimum)return unavailable('already-solved');
    if(minimum>moves)return unavailable('move-budget');
    for(let depth=minimum;depth<=Math.min(moves,MAX_DEPTH);depth++){
      const result=search(worlds,depth,minimum);
      if(result)return {status:'ok',...result};
    }
    return unavailable(moves>MAX_DEPTH?'search-budget':'no-proven-win');
  }

  // publicColors is optional and must be a color roster independently visible to the player.
  // maxWork counts enumeration and search operations. A partial search never yields a hint.
  function getHint({visibleBottles,lockedBottles=[],movesRemaining,levelRules={}}={}){
    if(!levelRules||typeof levelRules!=='object')return unavailable('invalid-state');
    const {capacity=4,publicColors,maxWork=DEFAULT_WORK,phase='ready'}=levelRules;
    if(phase!=='ready')return unavailable('busy');
    if(!Number.isInteger(capacity)||capacity<2||capacity>4||!Number.isInteger(movesRemaining)||
      movesRemaining<0||!Number.isInteger(maxWork)||maxWork<1)return unavailable('invalid-state');
    const position=readPosition(visibleBottles,publicColors,capacity);
    if(position.reason)return unavailable(position.reason);
    if(!Array.isArray(lockedBottles)||Array.from(lockedBottles).some(index=>!Number.isInteger(index)||
      index<0||index>=visibleBottles.length))return unavailable('invalid-state');
    let work=Math.min(maxWork,DEFAULT_WORK);
    const spend=()=>{if(--work<0)throw OUT_OF_WORK;};
    try{
      const worlds=possibleWorlds(position,capacity,spend);
      if(!worlds.length)return unavailable('invalid-state');
      return findPolicy(worlds,capacity,position.colorCount,new Set(lockedBottles),movesRemaining,spend);
    }catch(error){
      if(error!==OUT_OF_WORK)throw error;
      return unavailable('search-budget');
    }
  }

  const root=typeof window!=='undefined'?window:self;
  root.GameHintEngine={getHint};
})();
