/* Validate active layouts independently of the generator so upgrades can resume older boards. */
(() => {
  const Hid=window.GameHiddenColors,Game=window.WaterSort;
  const clone=value=>JSON.parse(JSON.stringify(value));

  function restore(value,level,attemptId){
    if(!value||typeof attemptId!=='string'||!attemptId||value.attemptId!==attemptId||value.level!==level)return null;
    const legacy=value.version===undefined;
    if(!legacy&&value.version!==1)return null;
    const seed=legacy?null:value.seed;
    if(seed!==null&&(!Number.isInteger(seed)||seed<0||seed>0xffffffff))return null;
    if(!Array.isArray(value.initial)||value.initial.length<4||value.initial.length>12||
      value.initial.some(bottle=>!Array.isArray(bottle)||bottle.length>Game.CAPACITY))return null;
    const colors=legacy?[...new Set(value.initial.flat())]:value.colors;
    if(!Array.isArray(colors)||colors.length<2||new Set(colors).size!==colors.length||
      colors.some(color=>!Game.paletteForLevel(level).includes(color)))return null;
    const challenge=value.challenge;
    if(!Number.isInteger(challenge?.moveLimit)||challenge.moveLimit<=0||
      !Number.isInteger(value.moves)||value.moves<0||!Number.isInteger(value.remainingMoves)||value.remainingMoves<0||
      value.moves+value.remainingMoves!==challenge.moveLimit)return null;

    function validBoard(board){
      if(!Array.isArray(board)||board.length!==value.initial.length||
        board.some(bottle=>!Array.isArray(bottle)||bottle.length>Game.CAPACITY))return false;
      const counts=new Map(colors.map(color=>[color,0]));
      for(const color of board.flat()){
        if(!counts.has(color))return false;
        counts.set(color,counts.get(color)+1);
      }
      return [...counts.values()].every(count=>count===Game.CAPACITY);
    }
    if(!validBoard(value.initial))return null;
    const baseline=Hid.create(value.initial,level,true);
    const ids=new Map(baseline?.bottles.flat().map(layer=>[layer.id,layer.color]));
    function validHidden(state,board){
      if(!state||!baseline||state.bottles.length!==board.length||
        !state.bottles.every((bottle,i)=>bottle.length===board[i].length&&
          (!bottle.length||bottle.at(-1).revealed)&&bottle.every((layer,j)=>layer.color===board[i][j]&&ids.get(layer.id)===layer.color)))return false;
      return new Set(state.bottles.flat().map(layer=>layer.id)).size===ids.size;
    }
    const state=Hid.restore(value.state,level);
    const board=legacy&&state?Hid.contents(state):value.bottles;
    if(!validBoard(board)||(value.state!=null&&!validHidden(state,board)))return null;
    const oldUndo=legacy&&value.undo?Hid.restore(value.undo,level):null;
    const undo=legacy?(oldUndo?{bottles:Hid.contents(oldUndo),hidden:oldUndo}:null):value.undo;
    let previous=null;
    if(undo&&value.moves>0&&validBoard(undo.bottles)){
      const hidden=Hid.restore(undo.hidden,level);
      if(state?validHidden(hidden,undo.bottles):undo.hidden==null)previous={bottles:undo.bottles,hidden};
    }
    return clone({version:1,seed,level,attemptId,initial:value.initial,bottles:board,colors,challenge,
      state,moves:value.moves,remainingMoves:value.remainingMoves,undo:previous});
  }
  window.GameLevelAttempt={restore};
})();
