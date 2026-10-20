const instances=new WeakMap();

// Keep the artwork separate from access/account readiness. A slow image must
// never disable Começar or either register.
export function setupLandingArt({document,window}) {
  const scene=document.querySelector('.landing-scene');
  if(!scene)return null;
  if(instances.has(scene))return instances.get(scene);

  const images=[...scene.querySelectorAll('img')];
  const mediaQueries=new Map();
  for(const image of images){
    for(const source of image.closest('picture')?.querySelectorAll('source')||[]){
      if(source.media&&!mediaQueries.has(source.media))mediaQueries.set(source.media,window.matchMedia(source.media));
    }
  }
  const absolute=value=>{
    try{return new URL(value,document.baseURI||window.location.href).href;}
    catch{return value;}
  };
  const resource=image=>{
    const sources=[...(image.closest('picture')?.querySelectorAll('source')||[])];
    const source=sources.find(item=>!item.media||mediaQueries.get(item.media)?.matches);
    // The home uses one resource per source, so the expected URL is known even
    // before the browser updates currentSrc after crossing the breakpoint.
    const selected=source?.srcset?.trim().split(/\s*,\s*/)[0]?.split(/\s+/)[0];
    return absolute(selected||image.getAttribute('src')||image.src);
  };
  let version=0,signature=null,disposed=false,pending=Promise.resolve(false);
  let watchers=[];

  function watch(image,expected,owner) {
    let settled=false,decoding=false,resolve;
    const result=new Promise(done=>{resolve=done;});
    const matches=()=>absolute(image.currentSrc||image.src)===expected;
    const finish=status=>{
      if(settled)return;
      settled=true;
      image.removeEventListener('load',check);
      image.removeEventListener('error',fail);
      if(status==='failed'&&owner===version&&!disposed){
        const picture=image.closest('picture')||image;
        picture.hidden=true;picture.dataset.artError='true';
      }
      resolve(status);
    };
    const current=()=>!disposed&&owner===version;
    function fail(){if(current()&&matches())finish('failed');}
    function check() {
      if(settled)return;
      if(!current()){finish('cancelled');return;}
      if(!matches()||!image.complete)return;
      if(!image.naturalWidth){finish('failed');return;}
      if(decoding)return;
      decoding=true;
      Promise.resolve().then(()=>typeof image.decode==='function'?image.decode():undefined).then(()=>{
        decoding=false;
        if(!current()){finish('cancelled');return;}
        // A prior source may finish decoding after a responsive source change.
        if(matches()&&image.complete&&image.naturalWidth)finish('ready');
      },()=>{
        decoding=false;
        if(!current()){finish('cancelled');return;}
        if(matches())finish('failed');
      });
    }
    image.addEventListener('load',check);
    image.addEventListener('error',fail);
    return {result,check,cancel:()=>finish('cancelled')};
  }

  function refresh() {
    if(disposed)return Promise.resolve(false);
    const resources=images.map(image=>({image,expected:resource(image)}));
    const nextSignature=resources.map(({expected})=>expected).join('\n');
    if(nextSignature===signature){watchers.forEach(watcher=>watcher.check());return pending;}
    signature=nextSignature;const owner=++version;
    watchers.forEach(watcher=>watcher.cancel());
    scene.dataset.artState='loading';
    for(const image of images){
      const picture=image.closest('picture')||image;
      picture.hidden=false;delete picture.dataset.artError;
    }
    watchers=resources.map(({image,expected})=>watch(image,expected,owner));
    const currentWatchers=watchers;
    pending=Promise.all(currentWatchers.map(watcher=>watcher.result)).then(()=>{
      if(disposed||owner!==version)return false;
      scene.dataset.artState='ready';return true;
    });
    // Let <picture> select its new source before examining already-cached images.
    window.requestAnimationFrame(()=>{
      if(!disposed&&owner===version)currentWatchers.forEach(watcher=>watcher.check());
    });
    return pending;
  }
  const onMedia=()=>{void refresh();};
  const onPageShow=()=>{void refresh();};
  const onVisibility=()=>{if(document.visibilityState!=='hidden')void refresh();};
  for(const media of mediaQueries.values())media.addEventListener('change',onMedia);
  window.addEventListener('pageshow',onPageShow);
  document.addEventListener('visibilitychange',onVisibility);
  const api={
    refresh,
    get ready(){return pending;},
    dispose(){
      if(disposed)return;
      disposed=true;version++;watchers.forEach(watcher=>watcher.cancel());
      for(const media of mediaQueries.values())media.removeEventListener('change',onMedia);
      window.removeEventListener('pageshow',onPageShow);
      document.removeEventListener('visibilitychange',onVisibility);
      instances.delete(scene);
    },
  };
  instances.set(scene,api);void refresh();return api;
}
