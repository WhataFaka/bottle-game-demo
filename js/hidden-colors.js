/* Stable identities let covered layers keep their revealed state through undo and reload. */
(() => {
  const VERSION=1;
  const UNKNOWN_FILL='#27303c';
  const clone=value=>JSON.parse(JSON.stringify(value));
  function create(bottles,level,enabled=false){
    if(!enabled||level<15)return null;
    let serial=0;
    return {version:VERSION,level,bottles:bottles.map((bottle,bottleIndex)=>bottle.map((color,unitIndex)=>({id:`${level}-${bottleIndex}-${unitIndex}-${serial++}`,color,revealed:unitIndex===bottle.length-1})))};
  }
  function revealTop(state,index){const bottle=state?.bottles[index];if(!bottle?.length)return false;bottle.at(-1).revealed=true;return true}
  // Move only the contiguous top run supplied by the already-validated game move.
  function transfer(state,from,to,amount,capacity=4){
    if(!state||!Number.isInteger(amount)||amount<1||from===to)return false;
    const source=state.bottles[from],target=state.bottles[to];if(!source||!target||amount>source.length)return false;
    const moved=source.splice(source.length-amount,amount);
    for(const layer of moved)layer.revealed=true;
    target.push(...moved);revealTop(state,from);revealTop(state,to);
    // A sealed, complete bottle also makes its uniform color public.
    if(target.length===capacity&&target.every(layer=>layer.color===target[0].color)){
      for(const layer of target)layer.revealed=true;
    }
    return true;
  }
  function visible(state){return state?.bottles.map(bottle=>bottle.map(layer=>({id:layer.id,color:layer.revealed?layer.color:null,hidden:!layer.revealed,fill:layer.revealed?layer.color:UNKNOWN_FILL,marker:layer.revealed?'':'?'})))||[]}
  function snapshot(state){return state?clone(state):null}
  function restore(value,expectedLevel){
    if(!value||value.version!==VERSION||value.level!==expectedLevel||!Array.isArray(value.bottles))return null;
    if(value.bottles.some(bottle=>!Array.isArray(bottle)||bottle.some(layer=>!layer||typeof layer.id!=='string'||typeof layer.color!=='string'||typeof layer.revealed!=='boolean')))return null;
    return clone(value);
  }
  function serialize(state){return state?JSON.stringify(state):''}
  function deserialize(serialized,level){try{return restore(JSON.parse(serialized),level)}catch{return null}}

  const profiles=[
    {name:'easy',bottles:[1,2],layers:[1,3]},
    {name:'medium',bottles:[2,4],layers:[3,6]},
    {name:'hard',bottles:[3,5],layers:[5,9]},
    {name:'expert',bottles:[4,6],layers:[8,12]},
  ];
  function profileForLevel(level){
    if(level<15)return null;
    if(level<=30)return (level-15)%3===0?profiles[0]:null;
    if(level<=60)return level%2===1?profiles[1]:null;
    return (level-61)%4<3?profiles[level<=82?2:3]:null;
  }
  function seededRandom(seed) {
    return () => {
      let n=seed+=0x6d2b79f5;
      n=Math.imul(n^n>>>15,n|1);
      n^=n+Math.imul(n^n>>>7,n|61);
      return ((n^n>>>14)>>>0)/4294967296;
    };
  }
  // A move is certified only when its entire maximal run can be predicted from the visible board.
  function publicMoveAmount(view,from,to,capacity=4){
    const source=view[from],target=view[to],top=source?.at(-1);
    if(from===to||!source||!target||!top||top.hidden||target.length>=capacity)return null;
    if(source.length===capacity&&source.every(layer=>layer.color===top.color))return null;
    if(target.length&&(target.at(-1).hidden||target.at(-1).color!==top.color))return null;
    let amount=0;
    while(amount<source.length&&amount<capacity-target.length){
      const layer=source[source.length-1-amount];
      if(layer.hidden)return null;
      if(layer.color!==top.color)break;
      amount++;
    }
    return amount||null;
  }
  function certifyRoute(state,solution,colors,capacity=4){
    const metadata=snapshot(state),board=contents(state),game=window.WaterSort;
    const opening=visible(metadata);
    if(!opening.some((source,from)=>opening.some((target,to)=>{
      const amount=publicMoveAmount(opening,from,to,capacity);
      return amount!==null&&(amount<source.length||target.length>0);
    })))return false;
    for(const [from,to] of solution){
      const amount=publicMoveAmount(visible(metadata),from,to,capacity);
      if(amount===null)return false;
      const move=game.pour(board,from,to,colors);
      if(!move.ok||move.amount!==amount)return false;
      transfer(metadata,from,to,amount,capacity);
    }
    return game.solved(board,colors);
  }
  function safeSlots(state,solution,colors,capacity){
    const walk=snapshot(state),board=contents(state),needsKnown=new Set();
    for(const [from,to] of solution){
      const source=walk.bottles[from],space=capacity-walk.bottles[to].length,top=source.at(-1)?.color;
      for(let depth=0;depth<space&&depth<source.length;depth++){
        const layer=source[source.length-1-depth];
        if(!layer.revealed)needsKnown.add(layer.id);
        if(layer.color!==top)break;
      }
      const move=window.WaterSort.pour(board,from,to,colors);
      if(!move.ok)return [];
      transfer(walk,from,to,move.amount,capacity);
    }
    return state.bottles.flatMap((bottle,index)=>bottle
      .filter(layer=>!layer.revealed&&!needsKnown.has(layer.id))
      .map(layer=>({layer,index})));
  }

  function availableSlots(bottles,level,colors,{solution=[],capacity=4}={}){
    const state=create(bottles,level,true);
    return profileForLevel(level)&&solution.length?safeSlots(state,solution,colors,capacity).length:0;
  }

  function createForLevel(bottles,level,colors,{seed=level*9187+42,solution=[],capacity=4}={}){
    const profile=profileForLevel(level);
    if(!profile||!solution.length)return null;
    const state=create(bottles,level,true),slots=safeSlots(state,solution,colors,capacity);
    if(!slots.length)return null;
    for(const layer of state.bottles.flat())layer.revealed=true;
    const rng=seededRandom(seed^0x203f873b);
    const pick=([min,max])=>min+Math.floor(rng()*(max-min+1));
    const bottleLimit=pick(profile.bottles),layerLimit=pick(profile.layers);
    const used=new Map(),seen=new Set(),chosen=[];
    for(const entry of slots)entry.order=rng();
    const grouped=new Map();
    for(const entry of slots){if(!grouped.has(entry.index))grouped.set(entry.index,[]);grouped.get(entry.index).push(entry)}
    const bottlePriority=([index,entries])=>{
      const bottle=state.bottles[index],positions=new Set(entries.map(entry=>bottle.indexOf(entry.layer)));
      const sameAbove=entries.filter(entry=>{const position=bottle.indexOf(entry.layer);return bottle[position+1]?.color===entry.layer.color}).length;
      let sameAdjacent=0;
      for(const position of positions)if(positions.has(position+1)&&bottle[position+1]?.color===bottle[position]?.color)sameAdjacent++;
      return entries.length*4+(entries.length-sameAbove)*2-sameAbove*6-sameAdjacent*3+Math.max(...entries.map(entry=>entry.order))*.3;
    };
    const rankedBottles=[...grouped.entries()];
    const allowed=new Map(rankedBottles.sort((a,b)=>b[1].length-a[1].length||bottlePriority(b)-bottlePriority(a)).slice(0,bottleLimit));
    let selectedCapacity=[...allowed.values()].reduce((sum,entries)=>sum+entries.length,0);
    const alternatives=rankedBottles.filter(([index])=>!allowed.has(index)).sort((a,b)=>bottlePriority(b)-bottlePriority(a));
    for(const [nextIndex,nextEntries] of alternatives){
      let replacement=null,bestGain=0;
      for(const [currentIndex,currentEntries] of allowed){
        if(selectedCapacity-currentEntries.length+nextEntries.length<layerLimit)continue;
        const gain=bottlePriority([nextIndex,nextEntries])-bottlePriority([currentIndex,currentEntries]);
        if(gain>bestGain){replacement=currentIndex;bestGain=gain}
      }
      if(replacement!==null){const removed=allowed.get(replacement);allowed.delete(replacement);allowed.set(nextIndex,nextEntries);selectedCapacity+=nextEntries.length-removed.length}
    }
    const allowedBottles=new Set(allowed.keys());
    for(let count=0;count<layerLimit;count++){
      let best=null,bestScore=-Infinity;
      for(const entry of slots){
        const depth=used.get(entry.index)||0;
        if(!allowedBottles.has(entry.index)||!entry.layer.revealed||(depth===0&&used.size>=bottleLimit))continue;
        const position=state.bottles[entry.index].indexOf(entry.layer);
        const above=state.bottles[entry.index][position+1],below=state.bottles[entry.index][position-1];
        // Start with more than one color, then favor both spread and stacked covers.
        const score=entry.order+(!seen.has(entry.layer.color)&&seen.size<3?3:0)
          +(used.size<profile.bottles[0]&&depth===0?2:depth>0?1:0)
          -(above?.revealed&&above.color===entry.layer.color?12:0)
          -(above&&!above.revealed&&above.color===entry.layer.color?12:0)
          -(below&&!below.revealed&&below.color===entry.layer.color?12:0);
        if(score>bestScore){bestScore=score;best=entry}
      }
      if(!best)break;
      best.layer.revealed=false;
      chosen.push(best.layer);
      used.set(best.index,(used.get(best.index)||0)+1);
      seen.add(best.layer.color);
    }
    while(chosen.length){
      if(certifyRoute(state,solution,colors,capacity))return state;
      chosen.pop().revealed=true;
    }
    return null;
  }

  const contents=state=>state.bottles.map(bottle=>bottle.map(layer=>layer.color));

  function retainRevealed(previous,current){
    if(!previous)return null;
    const result=snapshot(previous);
    const known=new Map(current?.bottles.flat().filter(layer=>layer.revealed).map(layer=>[layer.id,layer.color]));
    for(const bottle of result.bottles){
      for(const layer of bottle)if(known.get(layer.id)===layer.color)layer.revealed=true;
      if(bottle.length)bottle.at(-1).revealed=true;
    }
    return result;
  }

  window.GameHiddenColors={VERSION,UNKNOWN_FILL,create,transfer,visible,snapshot,restore,serialize,deserialize,
    profileForLevel,createForLevel,availableSlots,publicMoveAmount,certifyRoute,contents,retainRevealed};
})();
