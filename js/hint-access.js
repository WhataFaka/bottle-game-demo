/* Prevent duplicate hint charges and stale async results from consuming usage. */
(() => {
  function create(){
    let pending=null,visibleKey=null,serial=0;
    return {
      begin(key,level){
        if(pending||visibleKey===key)return null;
        pending={id:++serial,key,level};return pending;
      },
      finish(ticket,move,show,consume){
        if(!ticket||pending!==ticket)return {status:'stale'};
        pending=null;
        if(!move)return {status:'unavailable'};
        show(move);
        const usage=consume(ticket.level);
        if(!usage?.ok)return {status:'payment-failed',usage};
        visibleKey=ticket.key;return {status:'shown',usage};
      },
      cancel(){serial++;pending=null;visibleKey=null},
      hide(key){if(visibleKey===key)visibleKey=null},
      isVisible(key){return visibleKey===key},
      get isPending(){return pending!==null}
    };
  }
  window.GameHintAccess={create};
})();
