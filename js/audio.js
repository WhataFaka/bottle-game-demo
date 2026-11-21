/* A soft procedural lo-fi arpeggio; one sequencer is reused, while pour cues stay unchanged. */
(() => {
  let context=null,volume=.45,musicEnabled=false,musicTimer=null,step=0,musicBus=null,highPass=null,lowPass=null;
  const activeNotes=new Set(),STEP_MS=60_000/72/2;
  // Cmaj7, Am7, Fmaj7 and G6 voicings, kept above the rumbling bass range.
  const phrase=[261.63,329.63,392,493.88,392,329.63,392,493.88,261.63,329.63,440,523.25,440,329.63,392,440,261.63,349.23,440,523.25,440,349.23,392,440,293.66,392,493.88,587.33,493.88,392,440,493.88];
  function audioContext(){if(!context){const Context=window.AudioContext||window.webkitAudioContext;if(Context)context=new Context()}if(context?.state==='suspended')context.resume();return context}
  function ensureMusicBus(ctx){if(musicBus)return;highPass=ctx.createBiquadFilter();highPass.type='highpass';highPass.frequency.value=205;lowPass=ctx.createBiquadFilter();lowPass.type='lowpass';lowPass.frequency.value=1500;lowPass.Q.value=.35;musicBus=ctx.createGain();musicBus.gain.value=0;highPass.connect(lowPass).connect(musicBus).connect(ctx.destination)}
  function setVolume(value){volume=Math.max(0,Math.min(1,Number(value)||0));if(musicBus)musicBus.gain.setTargetAtTime(musicEnabled?volume*.22:0,audioContext().currentTime,.2)}
  function playMusicStep(){if(!musicEnabled||!context||!musicBus)return;const currentStep=step++%phrase.length,now=context.currentTime;
    if(currentStep%8!==7){const osc=context.createOscillator(),envelope=context.createGain(),accent=currentStep%4===0?.14:.095,noteLength=STEP_MS/1000*.88;
      osc.type='triangle';osc.frequency.setValueAtTime(phrase[currentStep],now);envelope.gain.setValueAtTime(.0001,now);envelope.gain.exponentialRampToValueAtTime(accent,now+.055);envelope.gain.setTargetAtTime(.0001,now+noteLength-.12,.08);
      osc.connect(envelope).connect(highPass);activeNotes.add(osc);osc.onended=()=>{activeNotes.delete(osc);try{osc.disconnect();envelope.disconnect()}catch{}};osc.start(now);osc.stop(now+noteLength)}
    musicTimer=window.setTimeout(playMusicStep,STEP_MS);
  }
  function stopMusic(){musicEnabled=false;if(musicTimer!==null){window.clearTimeout(musicTimer);musicTimer=null}for(const osc of activeNotes){try{osc.stop();osc.disconnect()}catch{}}activeNotes.clear();if(musicBus&&context)musicBus.gain.setTargetAtTime(0,context.currentTime,.06)}
  function setMusic(enabled,value=volume){const shouldPlay=Boolean(enabled);volume=Math.max(0,Math.min(1,Number(value)||0));if(!shouldPlay){stopMusic();return}if(musicEnabled){setVolume(volume);return}const ctx=audioContext();if(!ctx)return;ensureMusicBus(ctx);musicEnabled=true;step=0;musicBus.gain.setTargetAtTime(volume*.22,ctx.currentTime,.35);playMusicStep()}
  // Keep the existing short effects intact; only the background music path has changed.
  function cue(kind='tap',enabled=true){if(!enabled)return;const ctx=audioContext();if(!ctx)return;const osc=ctx.createOscillator(),amp=ctx.createGain(),now=ctx.currentTime;osc.type='sine';osc.frequency.setValueAtTime(kind==='win'?523:kind==='pour'?392:330,now);osc.frequency.exponentialRampToValueAtTime(kind==='win'?784:kind==='pour'?494:370,now+.12);amp.gain.setValueAtTime(Math.max(.001,volume*.055),now);amp.gain.exponentialRampToValueAtTime(.001,now+.18);osc.connect(amp).connect(ctx.destination);osc.start(now);osc.stop(now+.19)}
  window.GameAudio={setMusic,setVolume,cue};
})();
