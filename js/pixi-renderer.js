/* PixiJS is the bottle renderer; DOM buttons remain the input/accessibility layer. */
(() => {
  const PIXI_URL='https://cdn.jsdelivr.net/npm/pixi.js@8.23.0/dist/pixi.min.mjs';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const toneCache=new Map();
  function tone(color,amount){const key=`${color}:${amount}`;if(toneCache.has(key))return toneCache.get(key);const target=amount>0?0xffffff:0,weight=Math.abs(amount),channels=[16,8,0].map(shift=>Math.round(((color>>shift)&255)*(1-weight)+((target>>shift)&255)*weight)),result=(channels[0]<<16)|(channels[1]<<8)|channels[2];toneCache.set(key,result);return result}
  const SHAPE={left:-54,right:54,top:-164,bottom:156},NECK={x:0,y:-139},CAP={top:-12,bottom:7,seatHalfWidth:15,headHalfWidth:17.5},CAP_TINTS={autumn:0x78b7d1,winter:0x78b7d1,spring:0x78b7d1,summer:0x78b7d1,festive:0x78b7d1};
  function paintCap(shape,theme,gradient){const{top,bottom,seatHalfWidth:seat,headHalfWidth:head}=CAP,color=CAP_TINTS[theme]||CAP_TINTS.autumn;shape.clear();const body=()=>shape.moveTo(-seat,bottom).lineTo(-seat,2).quadraticCurveTo(-head,2,-head,-2).lineTo(-head,top+3).quadraticCurveTo(-head,top,-head+3,top).lineTo(head-3,top).quadraticCurveTo(head,top,head,top+3).lineTo(head,-2).quadraticCurveTo(head,2,seat,2).lineTo(seat,bottom).closePath();body().fill({color,alpha:1});body().fill(gradient??{color,alpha:1}).stroke({color:0xffffff,width:2,alpha:.9,join:'round'});shape.poly([head-5,top,head,top+3,head,-2,seat,2,seat-3,-1]).fill({color:tone(color,-.38),alpha:1});shape.moveTo(-head+5,top+3).quadraticCurveTo(-1,top+1,head-6,top+3).stroke({color:0xffffff,width:2.5,alpha:.8,cap:'round'})}
  function calculateBottlePlacement(slot){const scale=Math.min((slot.width-4)/(SHAPE.right-SHAPE.left),(slot.height-4)/(SHAPE.bottom-SHAPE.top)),x=slot.x+slot.width/2,y=slot.y+slot.height/2-(SHAPE.top+SHAPE.bottom)*scale/2;return{x,y,scale,bounds:rotatedBounds({x,y},0,scale)}}
  const BUBBLES=[{x:-18,r:5.2,speed:.55,phase:3},{x:10,r:4.2,speed:.75,phase:17},{x:0,r:6.1,speed:.38,phase:31},{x:21,r:4.7,speed:.65,phase:43},{x:-5,r:5.5,speed:.46,phase:59}];
  const pointOnBottle=(center,angle,scale,point)=>{const c=Math.cos(angle),s=Math.sin(angle);return{x:center.x+(point.x*c-point.y*s)*scale,y:center.y+(point.x*s+point.y*c)*scale}};
  function rotatedBounds(center,angle,scale){const corners=[{x:SHAPE.left,y:SHAPE.top},{x:SHAPE.right,y:SHAPE.top},{x:SHAPE.right,y:SHAPE.bottom},{x:SHAPE.left,y:SHAPE.bottom}].map(p=>pointOnBottle(center,angle,scale,p));return{left:Math.min(...corners.map(p=>p.x)),right:Math.max(...corners.map(p=>p.x)),top:Math.min(...corners.map(p=>p.y)),bottom:Math.max(...corners.map(p=>p.y))}}
  const overlap=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
  function cubicPoint(curve,t){const u=1-t;return{x:u*u*u*curve.p0.x+3*u*u*t*curve.p1.x+3*u*t*t*curve.p2.x+t*t*t*curve.p3.x,y:u*u*u*curve.p0.y+3*u*u*t*curve.p1.y+3*u*t*t*curve.p2.y+t*t*t*curve.p3.y}}
  function createStreamCurve(source,target,rotation){const dx=target.x-source.x,dy=Math.max(8,target.y-source.y),exitLength=clamp(Math.hypot(dx,dy)*.2,12,28);return{p0:{x:source.x,y:source.y},p1:{x:source.x+Math.sin(rotation)*exitLength,y:source.y-Math.cos(rotation)*exitLength},p2:{x:target.x-dx*.18,y:target.y-dy*.2},p3:{x:target.x,y:target.y}}}
  const aboveNeck={x:NECK.x,y:NECK.y-1};
  function streamCurveFromViews(root,source,target,previous){
    const outlet=root.toLocal(NECK,source),inlet=root.toLocal(NECK,target),axis=root.toLocal(aboveNeck,source);
    const curve=createStreamCurve(outlet,inlet,Math.atan2(axis.x-outlet.x,outlet.y-axis.y));
    if(previous&&['p0','p1','p3'].every(key=>Math.abs(curve[key].x-previous[key].x)<1e-6&&Math.abs(curve[key].y-previous[key].y)<1e-6))return previous;
    return curve;
  }
  const obstacleBounds=obstacle=>({left:obstacle.left??obstacle.x-obstacle.width/2,right:obstacle.right??obstacle.x+obstacle.width/2,top:obstacle.top??obstacle.y-obstacle.height/2,bottom:obstacle.bottom??obstacle.y+obstacle.height/2});
  function curveMetrics(curve,scale,obstacles){let length=0,collisions=0,previous=curve.p0,steps=32;for(let n=1;n<=steps;n++){const point=cubicPoint(curve,n/steps);length+=Math.hypot(point.x-previous.x,point.y-previous.y);if(n<steps){const box=rotatedBounds(point,0,scale);for(const obstacle of obstacles)if(overlap(box,obstacleBounds(obstacle)))collisions++}previous=point}return{length,collisions}}
  function curveCandidates(start,end,safe,halfW,halfH){const dx=end.x-start.x,dy=end.y-start.y,horizontal=Math.abs(dx)>=Math.abs(dy),distance=Math.max(1,Math.hypot(dx,dy)),amplitude=clamp(distance*.12,18,38),mid=horizontal?(start.y+end.y)/2:(start.x+end.x)/2,min=horizontal?safe.y+halfH:safe.x+halfW,max=horizontal?safe.y+safe.height-halfH:safe.x+safe.width-halfW,lanes=[mid-amplitude,mid+amplitude,horizontal?min:max,horizontal?max:min].map(value=>clamp(value,min,max)),unique=[...new Set(lanes.map(value=>Math.round(value*10)/10))];return unique.map(lane=>{const p1=horizontal?{x:start.x,y:lane}:{x:lane,y:start.y},p2=horizontal?{x:end.x,y:lane}:{x:lane,y:end.y};return{curve:{p0:start,p1,p2,p3:end},route:[start,p1,p2,end],lane}})}
  function calculatePourTrajectory({source,target,bounds,obstacles=[],margin=9}){
    const preferred=Math.abs(target.x-source.x)>4?Math.sign(target.x-source.x):(bounds.x+bounds.width/2>=source.x?1:-1),targetMouth=pointOnBottle(target,0,target.scale,NECK),targetBox=rotatedBounds(target,0,target.scale),safe={x:bounds.x+margin,y:bounds.y+margin,width:Math.max(1,bounds.width-2*margin),height:Math.max(1,bounds.height-2*margin)},safeRight=safe.x+safe.width,safeBottom=safe.y+safe.height,outletDrop=clamp(source.scale*48,18,28),drops=[outletDrop,Math.min(outletDrop,12),Math.min(outletDrop,7),Math.min(outletDrop,3),Math.min(outletDrop,1)],candidates=[];
    // Keep the bottle at its normal render scale. Search positions, tilt and travel lanes instead.
    for(const sign of [preferred,-preferred])for(const degrees of [28,38,48,58,68])for(const drop of drops){
      const angle=sign*degrees*Math.PI/180,scale=source.scale,neckOffset=pointOnBottle({x:0,y:0},angle,scale,NECK),turnBounds=rotatedBounds({x:0,y:0},angle,scale),sideClearance=(turnBounds.right-turnBounds.left)/2+target.scale*(SHAPE.right-SHAPE.left)/2+6,openingOffset=Math.max(0,sideClearance-Math.abs(neckOffset.x)),outlet={x:targetMouth.x-sign*openingOffset,y:targetMouth.y-drop},center={x:outlet.x-neckOffset.x,y:outlet.y-neckOffset.y},critical=Math.atan(Math.abs(SHAPE.right)/Math.abs(SHAPE.bottom)),sampleAngles=Math.abs(angle)>critical?[0,Math.sign(angle)*critical,angle]:[0,angle],angleBounds=sampleAngles.map(a=>rotatedBounds(center,a,scale));if(angleBounds.some(b=>b.left<safe.x||b.right>safeRight||b.top<safe.y||b.bottom>safeBottom)||overlap(angleBounds.at(-1),targetBox))continue;
      const existingLift=Math.max(0,(source.baseY??source.y)-source.y),requestedLift=Math.max(0,16-existingLift),availableLift=Math.max(0,source.y-(safe.y+Math.abs(SHAPE.top)*scale)),lift=Math.min(requestedLift,availableLift),raised={x:source.x,y:source.y-lift},halfW=Math.max(Math.abs(SHAPE.left),Math.abs(SHAPE.right))*scale,halfH=Math.max(Math.abs(SHAPE.top),Math.abs(SHAPE.bottom))*scale;
      for(const candidate of curveCandidates(raised,center,safe,halfW,halfH)){const{curve,route}=candidate,{length,collisions}=curveMetrics(curve,scale,obstacles);
        let finalOverlap=0;const finalBox=angleBounds.at(-1);for(const obstacle of obstacles)if(overlap(finalBox,obstacleBounds(obstacle)))finalOverlap++;
        const preferencePenalty=sign===preferred?0:80,score=collisions*100000+finalOverlap*4000+preferencePenalty+Math.abs(degrees-44)*2+length;
        candidates.push({angle:sign*degrees,scale:1,lift,center,route,curve,outlet,targetMouth,collisions,finalOverlap,score});
      }
    }
    if(candidates.length)return candidates.reduce((best,next)=>next.score<best.score?next:best);
    // Tight edge cases still stay within the canvas; move the source inside the safe box before pouring.
    const angle=preferred*24*Math.PI/180,scale=source.scale,neckOffset=pointOnBottle({x:0,y:0},angle,scale,NECK),desiredDrop=clamp(targetMouth.y-safe.y,1,outletDrop),desiredOutlet={x:targetMouth.x-preferred*scale*70,y:targetMouth.y-desiredDrop};let center={x:desiredOutlet.x-neckOffset.x,y:desiredOutlet.y-neckOffset.y},tilted=rotatedBounds(center,angle,scale);center={x:center.x+Math.max(0,safe.x-tilted.left)-Math.max(0,tilted.right-safeRight),y:center.y+Math.max(0,safe.y-tilted.top)-Math.max(0,tilted.bottom-safeBottom)};tilted=rotatedBounds(center,angle,scale);const outlet=pointOnBottle(center,angle,scale,NECK),existingLift=Math.max(0,(source.baseY??source.y)-source.y),lift=Math.min(Math.max(0,16-existingLift),Math.max(0,source.y-safe.y-Math.abs(SHAPE.top)*scale)),raised={x:source.x,y:source.y-lift},halfW=Math.max(Math.abs(SHAPE.left),Math.abs(SHAPE.right))*scale,halfH=Math.max(Math.abs(SHAPE.top),Math.abs(SHAPE.bottom))*scale,alternatives=curveCandidates(raised,center,safe,halfW,halfH).map(candidate=>{const metrics=curveMetrics(candidate.curve,scale,obstacles);return{...candidate,score:metrics.collisions*100000+metrics.length,collisions:metrics.collisions}}).sort((a,b)=>a.score-b.score),best=alternatives[0],finalOverlap=obstacles.filter(obstacle=>overlap(tilted,obstacleBounds(obstacle))).length;
    return{angle:preferred*24,scale:1,lift,center,route:best.route,curve:best.curve,outlet,targetMouth,collisions:best.collisions,finalOverlap,score:Infinity};
  }
  async function create(board){
    const [PIXI,{createLiquidStream,smoothUnit}]=await Promise.all([import(PIXI_URL),import('./liquid-stream.mjs')]);
    const app=new PIXI.Application();
    const bounds=board.getBoundingClientRect();
    const resolution=()=>Math.min(window.devicePixelRatio||1,2);
    try{await app.init({width:Math.max(1,bounds.width),height:Math.max(1,bounds.height),resolution:resolution(),autoDensity:true,backgroundAlpha:0,antialias:true,preference:'webgl',powerPreference:'low-power',autoStart:false,sharedTicker:false})}catch(error){try{app.destroy(true,{children:true,texture:true,textureSource:true})}catch{}throw error}
    app.ticker.stop();
    const canvas=app.canvas;canvas.className='pixi-board-canvas';canvas.setAttribute('aria-hidden','true');board.append(canvas);
    const root=new PIXI.Container();app.stage.addChild(root);
    const views=[],activeFlows=[],timelines=new Set(),selectionTweens=new Map(),liquidGradients=new Map(),capGradients=new Map();let width=0,height=0,destroyed=false,renderQueued=false,latest={bottles:[],selected:null,lifted:[],pours:[],reserved:[]};const timeOrigin=performance.now(),glassGradient=new PIXI.FillGradient({type:'linear',start:{x:0,y:0},end:{x:1,y:0},colorStops:[{offset:0,color:0xc9efff},{offset:.18,color:0xffffff},{offset:.48,color:0x9ddfff},{offset:.76,color:0xffffff},{offset:1,color:0xa3d7f4}]});
    function liquidGradient(color){if(!liquidGradients.has(color))liquidGradients.set(color,new PIXI.FillGradient({type:'linear',start:{x:0,y:0},end:{x:1,y:0},colorStops:[{offset:0,color:tone(color,-.2)},{offset:.18,color:tone(color,-.08)},{offset:.48,color:tone(color,.12)},{offset:.68,color:tone(color,.2)},{offset:.86,color:tone(color,.05)},{offset:1,color:tone(color,-.2)}]}));return liquidGradients.get(color)}
    function capGradient(theme){if(!capGradients.has(theme)){const color=CAP_TINTS[theme]||CAP_TINTS.autumn;capGradients.set(theme,new PIXI.FillGradient({type:'linear',start:{x:0,y:0},end:{x:1,y:0},colorStops:[{offset:0,color:tone(color,-.22)},{offset:.5,color},{offset:1,color:tone(color,.24)}]}))}return capGradients.get(theme)}
    function paintLiquidLayer(layer,color){
      layer.body.clear();layer.body.moveTo(-34,0).lineTo(-34,-48).lineTo(34,-48).lineTo(34,0).closePath().fill(liquidGradient(color));
      layer.body.rect(-34,-48,5,48).fill({color:0x101521,alpha:.15});layer.body.rect(29,-48,5,48).fill({color:0x101521,alpha:.19});layer.body.rect(-22,-46,5,45).fill({color:0xffffff,alpha:.11});layer.body.rect(-10,-46,7,45).fill({color:0xffffff,alpha:.055});
      layer.surface.clear();for(let point=0;point<=24;point++){const x=-34+point*68/24;layer.surface[point?'lineTo':'moveTo'](x,-48+Math.sin(point*.42)*.55)}layer.surface.stroke({color:0xffffff,width:2.1,alpha:.48});layer.surface.moveTo(-26,-44).quadraticCurveTo(0,-46,23,-44).stroke({color:0xffffff,width:1,alpha:.2});layer.color=color;
    }
    function updateHiddenCover(layer,appearance,animations,attemptId){
      const id=appearance?`${attemptId??''}:${appearance.id}`:null,hidden=appearance?.hidden===true;
      if(layer.coverId===id&&layer.hidden===hidden)return;
      const unveiling=layer.hidden&&layer.coverId===id&&!hidden;
      layer.coverId=id;layer.hidden=hidden;
      if(hidden&&!layer.cover){
        const cover=new PIXI.Container(),shade=new PIXI.Graphics();
        shade.rect(-34,-48,68,48).fill({color:0x27303c,alpha:.68});
        const mark=new PIXI.Text({text:'?',style:{fontFamily:'system-ui',fontSize:35,fontWeight:'700',fill:0xf4f7ff}});
        mark.anchor.set(.5);mark.position.set(0,-24);cover.addChild(shade,mark);layer.group.addChild(cover);layer.cover=cover;
      }
      const cover=layer.cover;if(!cover)return;
      selectionTweens.get(cover)?.kill();selectionTweens.delete(cover);
      if(hidden){cover.alpha=1;cover.visible=true;return}
      if(unveiling&&animations&&window.gsap){
        selectionTweens.set(cover,window.gsap.to(cover,{alpha:0,duration:.19,ease:'sine.out',onUpdate:scheduleDraw,onComplete:()=>{
          cover.visible=false;selectionTweens.delete(cover);scheduleDraw();
        }}));
      }else cover.visible=false;
    }
    function makeView(){
      const c=new PIXI.Container(),liquid=new PIXI.Container(),mask=new PIXI.Graphics(),glass=new PIXI.Graphics(),bubbles=new PIXI.Container(),cap=new PIXI.Container(),capShape=new PIXI.Graphics(),capShadow=new PIXI.Graphics(),hintGlow=new PIXI.Graphics();
      mask.moveTo(-18,-137).lineTo(18,-137).lineTo(18,-107).quadraticCurveTo(34,-98,35,-72).lineTo(35,116).quadraticCurveTo(35,130,21,130).lineTo(-21,130).quadraticCurveTo(-35,130,-35,116).lineTo(-35,-72).quadraticCurveTo(-34,-98,-18,-107).closePath().fill(0xffffff);
      const inside=new PIXI.Container(),liquidLayers=Array.from({length:4},()=>{const group=new PIXI.Container(),body=new PIXI.Graphics(),surface=new PIXI.Graphics();group.addChild(body,surface);liquid.addChild(group);return{group,body,surface,color:null}}),bubbleNodes=BUBBLES.map(bubble=>{const graphic=new PIXI.Graphics();graphic.circle(0,0,bubble.r).fill({color:0xffffff,alpha:.16}).circle(0,0,bubble.r-.45).stroke({color:0xf7fdff,width:1.15,alpha:.8}).ellipse(-bubble.r*.28,-bubble.r*.3,bubble.r*.29,bubble.r*.18).fill({color:0xffffff,alpha:.8});bubbles.addChild(graphic);return graphic});
      inside.mask=mask;inside.addChild(liquid,bubbles);cap.addChild(capShadow,capShape);cap.visible=false;cap.alpha=1;cap.y=-151;capShadow.ellipse(0,7,19,4).fill({color:0x07121d,alpha:.38});cap.scale.set(1.08,1);cap.position.set(0,-139);hintGlow.roundRect(SHAPE.left-4,SHAPE.top-4,SHAPE.right-SHAPE.left+8,SHAPE.bottom-SHAPE.top+8,20).stroke({color:0xfff0a8,width:5,alpha:.94});hintGlow.roundRect(SHAPE.left,SHAPE.top,SHAPE.right-SHAPE.left,SHAPE.bottom-SHAPE.top,16).stroke({color:0xffffff,width:2,alpha:.92});hintGlow.visible=false;c.addChild(inside,mask,glass,cap,hintGlow);
      glass.moveTo(-23,-139).lineTo(23,-139).lineTo(23,-108).quadraticCurveTo(50,-96,52,-65).lineTo(52,116).quadraticCurveTo(52,149,24,149).quadraticCurveTo(0,153,-24,149).quadraticCurveTo(-52,149,-52,116).lineTo(-52,-65).quadraticCurveTo(-50,-96,-23,-108).closePath().fill({fill:glassGradient,alpha:.13}).stroke({color:0xe8f8ff,width:4.2,alpha:.64,join:'round'});
      glass.moveTo(-39,-46).quadraticCurveTo(-43,4,-40,94).stroke({color:0xffffff,width:6,alpha:.48,cap:'round'});glass.moveTo(-32,-71).quadraticCurveTo(-26,-84,-14,-91).stroke({color:0xdaf7ff,width:2.5,alpha:.35,cap:'round'});glass.moveTo(41,-26).quadraticCurveTo(44,22,40,94).stroke({color:0xb9e7ff,width:3.4,alpha:.34,cap:'round'});glass.moveTo(-43,111).quadraticCurveTo(0,137,43,111).stroke({color:0xe9fbff,width:4.2,alpha:.46,cap:'round'});glass.moveTo(-31,118).quadraticCurveTo(0,138,31,118).stroke({color:0xffffff,width:1.8,alpha:.3,cap:'round'});glass.ellipse(0,-139,23,5).stroke({color:0xe9fbff,width:2.6,alpha:.64});glass.moveTo(-19,-134).lineTo(-19,-109).stroke({color:0xd9f5ff,width:2.3,alpha:.46,cap:'round'});glass.moveTo(19,-134).lineTo(19,-109).stroke({color:0xffffff,width:1.8,alpha:.38,cap:'round'});
      c.pivot.set(0,0);root.addChild(c);return{container:c,liquid,liquidLayers,bubbles,bubbleNodes,cap,capShape,capShadow,hintGlow,pose:{x:0,y:0,rotation:0,scale:1,selectedLift:0},baseX:0,baseY:0,baseScale:1,slot:null,slotX:0,slotY:0,slotWidth:0,slotHeight:0,capState:'hidden',capTheme:''};
    }
    function scheduleDraw(){if(renderQueued||destroyed)return;renderQueued=true;requestAnimationFrame(()=>{renderQueued=false;draw(latest)})}
    function reconcileViews(count){while(views.length<count)views.push(makeView());while(views.length>count){const view=views.pop();root.removeChild(view.container);view.container.destroy({children:true})}}
    function refreshLayout(){const rect=board.getBoundingClientRect(),nextWidth=rect.width,nextHeight=rect.height,dpr=resolution();if(nextWidth!==width||nextHeight!==height||app.renderer.resolution!==dpr){width=nextWidth;height=nextHeight;app.renderer.resize(Math.max(1,width),Math.max(1,height),dpr)}const slots=board.querySelectorAll(':scope > .bottle-slot');for(let i=0;i<views.length;i++){const view=views[i],slot=slots[i];if(!slot)continue;const x=slot.offsetLeft,y=slot.offsetTop,w=slot.offsetWidth,h=slot.offsetHeight,placement=calculateBottlePlacement({x,y,width:w,height:h});view.slot=slot;view.slotX=x;view.slotY=y;view.slotWidth=w;view.slotHeight=h;view.baseX=placement.x;view.baseY=placement.y;view.baseScale=placement.scale}}
    function resize(){refreshLayout();scheduleDraw()}
    const observer=new ResizeObserver(resize);observer.observe(board);refreshLayout();
    function draw(state=latest){
      if(destroyed)return;
      if(canvas.parentElement!==board)board.append(canvas);
      const seconds=(performance.now()-timeOrigin)/1000;
      for(let i=0;i<views.length;i++){
        const v=views[i],scale=v.baseScale;if(!v.slot)continue;
        const liftPx=`${v.pose.selectedLift}px`;if(v.slot.style.getPropertyValue('--pixi-lift')!==liftPx)v.slot.style.setProperty('--pixi-lift',liftPx);
        v.container.x=v.baseX+v.pose.x;v.container.y=v.baseY+v.pose.y+v.pose.selectedLift;v.container.scale.set(scale*v.pose.scale);v.container.rotation=v.pose.rotation*Math.PI/180;
        const colors=state.bottles[i]||[],source=activeFlows.find(flow=>flow.from===i),target=activeFlows.find(flow=>flow.to===i),pending=state.pours.find(flow=>flow.phase==='prepare'&&(flow.from===i||flow.to===i));
        let volume=colors.length,layers=colors,appearances=state.hiddenLayers?.[i],flowColor=0xff6b82;
        if(source){volume=source.sourceStart.length-source.amount*source.progress;layers=source.sourceStart.slice(0,source.sourceStart.length-source.amount);appearances=source.progress>=1?appearances:source.hiddenSourceStart;flowColor=source.color}
        if(target){volume=target.targetStart.length+target.amount*target.progress;layers=target.targetStart;appearances=target.progress>=1?appearances:target.hiddenTargetStart;flowColor=target.color}
        if(pending?.from===i){volume=pending.sourceStart.length;layers=pending.sourceStart;appearances=pending.hiddenSourceStart;flowColor=pending.color}
        if(pending?.to===i){volume=pending.targetStart.length;layers=pending.targetStart;appearances=pending.hiddenTargetStart;flowColor=pending.color}
        const boundedVolume=clamp(volume,0,4),fullUnits=Math.floor(boundedVolume),partial=boundedVolume-fullUnits,topUnit=Math.max(0,Math.ceil(boundedVolume)-1),bottom=128,top=bottom-boundedVolume*48;
        for(let unit=0;unit<v.liquidLayers.length;unit++){
          const layer=v.liquidLayers[unit],amount=unit<fullUnits?1:unit===fullUnits?partial:0;
          const appearance=unit<layers.length||source?.progress===0?appearances?.[unit]:null;
          const color=appearance?.hidden?appearance.fill:unit<layers.length?layers[unit]:flowColor;
          const parsedColor=Number.isInteger(color)?color:(Number.parseInt(String(color).replace('#',''),16)||0xff6b82);
          if(layer.color!==parsedColor)paintLiquidLayer(layer,parsedColor);
          updateHiddenCover(layer,appearance,state.animations!==false,state.attemptId);
          layer.group.visible=amount>0;layer.group.y=bottom-unit*48;layer.group.scale.set(1,amount);layer.surface.visible=amount>0&&unit===topUnit;layer.surface.y=Math.sin(seconds*(activeFlows.length?3:1.8)+i)*.4;layer.surface.rotation=Math.sin(seconds*(activeFlows.length?2.4:1.5)+i)*.008;layer.surface.scale.y=activeFlows.length?1.45:1;
        }
        for(let bubbleIndex=0;bubbleIndex<BUBBLES.length;bubbleIndex++){
          const bubble=BUBBLES[bubbleIndex],bubbleView=v.bubbleNodes[bubbleIndex];
          const travel=Math.max(0,bottom-top-bubble.r*2-7);if(travel<1){bubbleView.visible=false;continue}
          const phase=((seconds*bubble.speed*30/48+bubble.phase/48+i*13/48)%1),by=clamp(bottom-bubble.r-4-phase*travel,top+bubble.r+2,bottom-bubble.r-3),bx=clamp(bubble.x+Math.sin(seconds*bubble.speed*.08+bubble.phase)*2,-29+bubble.r,29-bubble.r);
          bubbleView.visible=volume>=.55&&travel>=1;bubbleView.position.set(bx,by);
        }
        const isReserved=state.reserved.includes(i),shouldCap=colors.length===4&&colors.every(color=>color===colors[0])&&!isReserved&&!source&&!target;
        const capTheme=state.theme||'autumn';if(capTheme!==v.capTheme){v.capTheme=capTheme;paintCap(v.capShape,capTheme,capGradient(capTheme))}
        const hint=state.hint,showHint=hint&&(hint.phase==='pair'?(i===hint.from||i===hint.to):i===hint.from);v.hintGlow.visible=Boolean(showHint);v.hintGlow.alpha=showHint?.92+.08*Math.sin(seconds*4):0;
        if(shouldCap&&v.capState==='hidden'){v.capState='installing';selectionTweens.get(v.cap)?.kill();v.cap.visible=true;v.cap.position.set(0,-151);if(window.gsap)selectionTweens.set(v.cap,window.gsap.to(v.cap,{y:-139,duration:.24,ease:'power2.inOut',onUpdate:scheduleDraw,onComplete:()=>{v.capState='sealed';selectionTweens.delete(v.cap);scheduleDraw()}}));else{v.cap.y=-139;v.capState='sealed'}}else if(!shouldCap&&v.capState!=='hidden'){selectionTweens.get(v.cap)?.kill();selectionTweens.delete(v.cap);v.capState='hidden';v.cap.visible=false;v.cap.y=-151}
      }
      for(const flow of activeFlows){
        const from=views[flow.from],to=views[flow.to],clock=flow.timeline.time();
        if(!from||!to||clock>=flow.dropEnd){
          flow.visual?.destroy();
          flow.visual=null;
          continue;
        }
        if(clock<flow.streamStart||(!flow.visual&&flow.streamAlpha<=0))continue;
        const curve=streamCurveFromViews(root,from.container,to.container,flow.visual?.curve);
        if(!flow.visual){
          flow.visual=createLiquidStream(PIXI,curve,flow.color);
          root.addChild(flow.visual.impact,flow.visual.mesh,flow.visual.drop);
        }
        flow.visual.update({
          curve,
          reveal:flow.streamProgress,
          alpha:flow.streamAlpha,
          elapsed:clock-flow.streamStart,
          tension:(1-smoothUnit(flow.streamProgress))*.86+(clock>=flow.fadeStart?1-flow.streamAlpha:0),
          contactAge:Math.max(0,clock-flow.contactStart),
          release:(clock-flow.dropStart)/Math.max(.0001,flow.dropEnd-flow.dropStart),
        });
      }
      app.renderer.render({container:root});
    }
    function setState(state){
      latest={...state,bottles:state.bottles.map(b=>b.slice()),lifted:[...(state.lifted||[])],pours:[...(state.pours||[])],reserved:[...(state.reserved||[])]};reconcileViews(latest.bottles.length);refreshLayout();draw(latest);
      for(let i=0;i<views.length;i++){const view=views[i],lift=latest.selected===i||latest.lifted.includes(i)?-16:0;if(Math.abs(view.pose.selectedLift-lift)<.1)continue;selectionTweens.get(view.pose)?.kill();if(window.gsap&&latest.animations!==false)selectionTweens.set(view.pose,window.gsap.to(view.pose,{selectedLift:lift,duration:.22,ease:'sine.out',overwrite:true,onUpdate:scheduleDraw,onComplete:()=>selectionTweens.delete(view.pose)}));else{view.pose.selectedLift=lift;selectionTweens.delete(view.pose)}}
    }
    function setHint(hint){latest={...latest,hint};scheduleDraw()}
    function animatePour({from,to,sourceStart,targetStart,sourceAfter,targetAfter,hiddenSourceStart,hiddenTargetStart,color,duration,timing=window.WaterSort?.POUR_TIMING||{speed:1,raise:.14,travelMin:.17,travelMax:.37,tilt:.18,streamFade:.10,straighten:.16,return:.18}}){
      if(!window.gsap)return Promise.reject(new Error('GSAP is unavailable'));
      if(activeFlows.some(flow=>[flow.from,flow.to].includes(from)||[flow.from,flow.to].includes(to)))return Promise.reject(new Error('Bottle is already reserved by an active pour'));
      const sourceView=views[from],targetView=views[to];if(!sourceView||!targetView)return Promise.reject(new Error('Bottle view is not available'));
      const selectionLift=sourceView.pose.selectedLift;selectionTweens.get(sourceView.pose)?.kill();selectionTweens.delete(sourceView.pose);sourceView.pose.y+=selectionLift;sourceView.pose.selectedLift=0;
      const obstacles=views.flatMap((view,index)=>index===from?[]:[{left:view.slotX,right:view.slotX+view.slotWidth,top:view.slotY,bottom:view.slotY+view.slotHeight}]),trajectory=calculatePourTrajectory({source:{x:sourceView.baseX,y:sourceView.baseY+sourceView.pose.y,baseY:sourceView.baseY,scale:sourceView.baseScale},target:{x:targetView.baseX,y:targetView.baseY,scale:targetView.baseScale},bounds:{x:0,y:0,width,height},obstacles});
      const parsedColor=typeof color==='number'?color:Number.parseInt(String(color).replace('#',''),16);
      const flow={from,to,sourceStart:[...sourceStart],targetStart:[...targetStart],hiddenSourceStart,hiddenTargetStart,color:Number.isFinite(parsedColor)?parsedColor:0xff6b82,amount:sourceStart.length-sourceAfter.length,progress:0,streamProgress:0,streamAlpha:0,visual:null};
      activeFlows.push(flow);
      return new Promise(resolve=>{
        const finish=()=>{if(flow.finished)return;flow.finished=true;flow.visual?.destroy();flow.visual=null;const index=activeFlows.indexOf(flow);if(index>=0)activeFlows.splice(index,1);sourceView.pose.x=sourceView.pose.y=sourceView.pose.rotation=0;sourceView.pose.scale=1;scheduleDraw();resolve()};flow.finish=finish;
        const gsap=window.gsap;
        const phase=name=>(timing[name]||0)*(timing.speed||1),pose=sourceView.pose,curve=trajectory.curve,curveLength=Math.max(1,curveMetrics(curve,sourceView.baseScale,[]).length),travelMs=clamp(curveLength/500,phase('travelMin'),phase('travelMax')),raisedY=trajectory.route[0].y-sourceView.baseY,motion={progress:0},returnMotion={progress:0},returnCurve={p0:curve.p3,p1:curve.p2,p2:curve.p1,p3:curve.p0};let timeline;timeline=gsap.timeline({onUpdate:scheduleDraw,onComplete:()=>{timelines.delete(timeline);finish()}});timelines.add(timeline);flow.timeline=timeline;
        if(Math.abs(pose.y-raisedY)>.5)timeline.to(pose,{y:raisedY,duration:phase('raise'),ease:'sine.out'});
        timeline.to(motion,{progress:1,duration:travelMs,ease:'power2.inOut',onUpdate:()=>{const point=cubicPoint(curve,motion.progress);pose.x=point.x-sourceView.baseX;pose.y=point.y-sourceView.baseY}});
        timeline.to(pose,{rotation:trajectory.angle,duration:phase('tilt'),ease:'sine.inOut'});
        flow.streamStart=timeline.duration();
        timeline.to(flow,{streamProgress:1,streamAlpha:1,duration:phase('streamFade'),ease:'sine.in'});
        flow.contactStart=timeline.duration();
        timeline.to(flow,{progress:1,duration:duration/1000,ease:'sine.inOut'});
        flow.fadeStart=timeline.duration();
        timeline.to(flow,{streamAlpha:0,duration:phase('streamFade'),ease:'sine.out'});
        flow.dropStart=flow.fadeStart+phase('streamFade')/9;
        timeline.to(pose,{rotation:0,duration:phase('straighten'),ease:'sine.inOut'});
        flow.dropEnd=timeline.duration();
        timeline.to(returnMotion,{progress:1,duration:Math.max(.12,phase('return')*.7),ease:'power2.inOut',onUpdate:()=>{const point=cubicPoint(returnCurve,returnMotion.progress);pose.x=point.x-sourceView.baseX;pose.y=point.y-sourceView.baseY}}).to(pose,{x:0,y:0,duration:Math.max(.08,phase('return')*.3),ease:'sine.inOut'});
      });
    }
    const layoutTimer=window.setInterval(()=>{if(!document.hidden)scheduleDraw()},1000/30);
    return{setState,setHint,animatePour,resize,get activePourCount(){return activeFlows.length},stop(){for(const timeline of timelines)timeline.kill();timelines.clear();for(const flow of [...activeFlows])flow.finish?.();activeFlows.length=0;for(const tween of selectionTweens.values())tween.kill();selectionTweens.clear();views.forEach(v=>{v.pose.x=v.pose.y=v.pose.rotation=v.pose.selectedLift=0;v.pose.scale=1});draw(latest)},destroy(){destroyed=true;window.clearInterval(layoutTimer);observer.disconnect();for(const timeline of timelines)timeline.kill();for(const tween of selectionTweens.values())tween.kill();timelines.clear();for(const flow of [...activeFlows])flow.finish?.();activeFlows.length=0;selectionTweens.clear();app.destroy(true,{children:true,texture:true,textureSource:true});glassGradient.destroy();for(const gradient of liquidGradients.values())gradient.destroy();for(const gradient of capGradients.values())gradient.destroy();liquidGradients.clear();capGradients.clear()}};
  }
  window.PixiBottleRenderer={create,calculatePourTrajectory,calculateBottlePlacement,cubicPoint,createStreamCurve,streamCurveFromViews,visualBounds:SHAPE,neck:NECK,capGeometry:CAP,capColors:Object.freeze({...CAP_TINTS}),paintCap,bubbleCount:BUBBLES.length};
})();
