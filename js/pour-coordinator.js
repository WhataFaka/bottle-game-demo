// Reserves only the two vessels involved in a pour, allowing disjoint pours to overlap.
(() => {
  function create(){
    const flows=new Map(),reserved=new Map();
    return{
      flows,
      reserved:new Set(),
      reserve(flow){
        const {id,from,to}=flow;
        if(!Number.isInteger(id)||!Number.isInteger(from)||!Number.isInteger(to)||from===to||flows.has(id)||reserved.has(from)||reserved.has(to))return false;
        flows.set(id,flow);reserved.set(from,id);reserved.set(to,id);this.reserved.add(from);this.reserved.add(to);return true;
      },
      release(id){
        const flow=flows.get(id);if(!flow)return false;
        flows.delete(id);
        for(const index of [flow.from,flow.to])if(reserved.get(index)===id){reserved.delete(index);this.reserved.delete(index)}
        return true;
      },
      clear(){flows.clear();reserved.clear();this.reserved.clear()}
    };
  }
  window.PourCoordinator={create};
})();
