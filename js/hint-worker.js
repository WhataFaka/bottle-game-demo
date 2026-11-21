importScripts('hint-engine.js');
self.onmessage=event=>{
  const {id,request}=event.data||{};
  try{
    self.postMessage({id,result:self.GameHintEngine.getHint(request)});
  }catch{
    self.postMessage({id,result:{status:'no-guaranteed-hint',reason:'calculation-error'}});
  }
};
