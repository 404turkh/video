/* 焱 SubStudio 0.6 — device-first project recovery.
   Text metadata: IndexedDB + localStorage fallback; video: IndexedDB when quota permits.
   Browser storage is not a backup. Offer explicit JSON project export. */
(function(){
  'use strict';
  const DB='substudio-projects-v6', STORE='records', FALLBACK='substudio-draft-v6';
  let dbPromise;
  function open(){
    if(!('indexedDB' in window))return Promise.reject(Error('IndexedDB unavailable'));
    if(!dbPromise){
      dbPromise=new Promise(function(resolve,reject){
        const request=indexedDB.open(DB,1);
        request.onupgradeneeded=function(){if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE)};
        request.onsuccess=function(){resolve(request.result)};
        request.onerror=function(){reject(request.error||Error('IndexedDB unavailable'))};
        request.onblocked=function(){reject(Error('Local database blocked'))};
      }).catch(function(err){dbPromise=null;throw err});
    }
    return dbPromise;
  }
  async function read(key){
    const db=await open();
    return new Promise(function(resolve,reject){
      const transaction=db.transaction(STORE,'readonly');
      const request=transaction.objectStore(STORE).get(key);
      request.onsuccess=function(){resolve(request.result)};
      request.onerror=function(){reject(request.error||Error('Reading failed'))};
    });
  }
  async function write(key,value){
    const db=await open();
    return new Promise(function(resolve,reject){
      const transaction=db.transaction(STORE,'readwrite');
      transaction.objectStore(STORE).put(value,key);
      transaction.oncomplete=function(){resolve(true)};
      transaction.onerror=function(){reject(transaction.error||Error('Saving failed'))};
      transaction.onabort=function(){reject(transaction.error||Error('Saving aborted'))};
    });
  }
  async function remove(key){
    const db=await open();
    return new Promise(function(resolve,reject){
      const tx=db.transaction(STORE,'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete=function(){resolve(true)};
      tx.onerror=function(){reject(tx.error||Error('Delete failed'))};
    });
  }
  async function saveDraft(state){
    let fallback=false, dbSaved=false;
    try{localStorage.setItem(FALLBACK,JSON.stringify(state));fallback=true}catch(_){}
    try{await write('draft',state);dbSaved=true}catch(_){}
    return {ok:fallback||dbSaved,dbSaved:dbSaved,fallback:fallback};
  }
  async function loadDraft(){
    try{const state=await read('draft');if(state)return state}catch(_){}
    try{const value=localStorage.getItem(FALLBACK);return value?JSON.parse(value):null}catch(_){return null}
  }
  async function saveMedia(file){
    if(!file)throw Error('No media');
    if(file.size>180*1024*1024)return {ok:false,reason:'180 MB üzerindeki videolar cihaz belleğinde güvenilir saklanamıyor. Proje yedeğini indir, videoyu tekrar yükle.'};
    try{
      await write('video',{blob:file,name:file.name,size:file.size,type:file.type,updated:Date.now()});
      return {ok:true};
    }catch(err){return {ok:false,reason:String(err&&err.message||'Cihazda video depolama sınırı doldu')}};
  }
  async function loadMedia(){try{return await read('video')}catch(_){return null}}
  async function clearMedia(){try{await remove('video')}catch(_){}}
  async function clearAll(){
    try{localStorage.removeItem(FALLBACK)}catch(_){}
    try{await remove('draft')}catch(_){}
    await clearMedia();
  }
  function persistStorage(){
    try{if(navigator.storage&&navigator.storage.persist)return navigator.storage.persist().catch(function(){return false})}
    catch(_){}
    return Promise.resolve(false);
  }
  window.SubStudioStore={saveDraft:saveDraft,loadDraft:loadDraft,saveMedia:saveMedia,loadMedia:loadMedia,clearMedia:clearMedia,clearAll:clearAll,persistStorage:persistStorage};
})();
