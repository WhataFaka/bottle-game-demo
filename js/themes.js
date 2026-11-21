/* Add seasonal palettes here without touching puzzle rules or level generation. */
(() => {
  // Color IDs remain stable in game state; only their display values are tuned here.
  const liquidPalettes=Object.freeze({
    classic:Object.freeze(['#f43f5e','#ff8a00','#ffd000','#18b86a','#00b9d6','#3867f5','#8d45e8','#e843b5','#77bd12','#b83e12']),
    late:Object.freeze(['#e11d48','#fb6b00','#f4c400','#00a878','#00a9d6','#2452c9','#7436d1','#c02a91','#58a80b','#9b4617'])
  });
  const themes={
    autumn:{label:'Осень',background:'#f4dfb8',accent:'#ba6f32',leaf:'#d8843d',leaf2:'#c7a14e',lifeIcon:'🍂',panel:'#554331',panelLight:'#806143',button:'#b86f36',border:'#eac68a'},
    winter:{label:'Зима',background:'#dcebf0',accent:'#5895b5',leaf:'#dcebf0',leaf2:'#a9d3e3',lifeIcon:'❄️',panel:'#304b61',panelLight:'#54788e',button:'#5386a4',border:'#bfe4f2'},
    spring:{label:'Весна',background:'#e5efd5',accent:'#719a58',leaf:'#8fb76e',leaf2:'#d5d778',lifeIcon:'🌸',panel:'#405b43',panelLight:'#66815b',button:'#769a59',border:'#c9dfa8'},
    summer:{label:'Лето',background:'#f3e8c4',accent:'#b98d36',leaf:'#77a45d',leaf2:'#e3ba51',lifeIcon:'☀️',panel:'#405c50',panelLight:'#68806a',button:'#bd9141',border:'#ead17c'},
    festive:{label:'Праздник',background:'#e9d9e8',accent:'#a55b83',leaf:'#b84f51',leaf2:'#e4c35d',lifeIcon:'✨',panel:'#59404e',panelLight:'#806077',button:'#ac6080',border:'#edbdd1'}
  };
  function apply(theme){const active=themes[theme]||themes.autumn,applied=theme in themes?theme:'autumn',root=typeof document!=='undefined'?document.documentElement:null;if(root){root.dataset.theme=applied;for(const [key,value] of Object.entries({accent:active.accent,bg:active.background,leaf:active.leaf,'leaf-2':active.leaf2,panel:active.panel,'panel-light':active.panelLight,button:active.button,border:active.border}))root.style.setProperty(`--theme-${key}`,value)}return applied}
  apply('autumn');window.GameThemes={catalog:Object.freeze(themes),liquidPalettes,apply};
})();
