(() => {
  const $ = id => document.getElementById(id);
  const MAP = 'eky-cologne-barcode-map-v1', HISTORY = 'eky-cologne-barcode-history-v1';
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } };
  let map = read(MAP, {}), history = read(HISTORY, []), code = '', selected = '', scanner = null, starting = false, busy = false, running = false, paused = false, wantsCamera = true, generation = 0, resumeTimer = null, lastCode = '', lastScanAt = 0, cameraQueue = Promise.resolve();
  const names = () => allProductNames();
  const message = text => { $('scannerMessage').textContent = text; };
  const save = () => { localStorage.setItem(MAP, JSON.stringify(map)); localStorage.setItem(HISTORY, JSON.stringify(history)); };
  function renderSaved() {
    $('barcodeCount').textContent = Object.keys(map).length;
    $('barcodeMappings').innerHTML = Object.entries(map).map(([barcode, entry]) => '<button type="button" class="scanner-mapping" data-code="'+esc(barcode)+'"><b>'+esc(entry.name)+'</b><small>'+esc(barcode)+' · Edit assignment</small></button>').join('') || '<p>No barcodes assigned yet.</p>';
    $('barcodeHistory').innerHTML = history.slice(0,50).map(row => '<div class="sale-row"><div><b>'+esc(row.name)+'</b><br><small>'+esc(row.code)+' · '+new Date(row.time).toLocaleString()+'</small></div><strong>'+(row.action==='in'?'+1 IN':'−1 OUT')+'</strong></div>').join('') || '<p>No stock scans recorded yet.</p>';
  }
  function renderChoices() {
    const term = $('barcodeCologne').value.trim().toLowerCase();
    $('barcodeChoices').innerHTML = names().filter(name => !term || name.toLowerCase().includes(term)).slice(0,60).map(name => '<button type="button" class="scanner-choice" data-name="'+esc(name)+'">'+esc(name)+'</button>').join('') || '<p>No cologne matches.</p>';
    $('barcodeChoices').classList.remove('hidden');
  }
  function open(raw) {
    code = String(raw || '').trim();
    if(!code || code.length>128){message('Enter a valid barcode.');return;}
    if(/^0\d{12}$/.test(code)&&map[code.slice(1)])code=code.slice(1);
    else if(/^\d{12}$/.test(code)&&map['0'+code])code='0'+code;
    selected = map[code]?.name || '';
    $('barcodeCode').textContent = code;
    $('barcodeCologne').value = selected;
    $('barcodeHint').textContent = selected ? 'Remembered as '+selected+'. Add or remove one bottle.' : 'First scan: pick the cologne this barcode belongs to.';
    $('barcodeChoices').classList.add('hidden');
    $('barcodeAction').classList.remove('hidden');
    $('barcodeForget').classList.toggle('hidden', !map[code]);
    if(!selected)renderChoices();
  }
  function close() {
    $('barcodeAction').classList.add('hidden'); code=''; selected='';
    message('Ready for the next bottle. Move the last barcode away, or tap Scan Same Barcode Again.');
    if(wantsCamera)start();
  }
  function active(){return $('scannerTab').classList.contains('active');} 
  function chosen() {
    const value=$('barcodeCologne').value.trim();
    return names().find(name=>name.toLowerCase()===value.toLowerCase());
  }
  function apply(action) {
    if(busy || !code)return;
    const name=chosen();if(!name){$('barcodeHint').textContent='Pick a cologne from the list first.';renderChoices();return;}
    const existing=inventory.find(item=>normalizeName(item.name)===normalizeName(name));
    if(action==='out'&&(!existing||Number(existing.qty)<1)){
      try{map[code]={name,updatedAt:Date.now()};save();renderSaved();$('barcodeForget').classList.remove('hidden');$('barcodeHint').textContent='Barcode remembered as '+name+'. There is no stock to remove yet. Choose IN to add a bottle, or close this page.';}catch{$('barcodeHint').textContent='Could not save the barcode assignment. Please try again.';}
      return;
    }
    busy=true;
    const oldInventory=JSON.stringify(inventory),oldMap=JSON.stringify(map),oldHistory=JSON.stringify(history);
    try {
      const item=existing||{id:Date.now().toString(36)+Math.random().toString(36).slice(2),name,qty:0,tote:''};
      if(!existing)inventory.push(item);
      const before=Number(item.qty)||0;item.qty=before+(action==='in'?1:-1);
      map[code]={name,updatedAt:Date.now()};
      history.unshift({code,name,action,time:Date.now(),before,after:item.qty});
      saveStock();save();
      renderInventory();render();renderSaved();close();
      message(name+(action==='in'?' added to stock.':' removed from stock.'));lowAlert(item,before);
    } catch(error) {
      inventory=JSON.parse(oldInventory);map=JSON.parse(oldMap);history=JSON.parse(oldHistory);
      try{saveStock();save();}catch{}
      $('barcodeHint').textContent='Could not save. Free some device storage and try again.';
    } finally {busy=false;}
  }
  function enqueueCamera(task){cameraQueue=cameraQueue.then(task,task);return cameraQueue;}
  async function releaseCamera(){
    const old=scanner;scanner=null;running=false;
    if(old){try{await old.stop();}catch{}try{old.clear();}catch{}}
    $('scanStart').disabled=false;$('scanStart').textContent='Start Barcode Scanner';$('scanStop').classList.add('hidden');
  }
  function stop(userStop=false){
    if(userStop)wantsCamera=false;
    generation++;
    return enqueueCamera(async()=>{await releaseCamera();if(userStop)message('Camera stopped. Tap Start to scan again.');});
  }
  function start(){
    return enqueueCamera(async()=>{
      if(scanner||!wantsCamera||!active()||document.hidden||code)return;
      starting=true;const ticket=++generation;$('scanStart').disabled=true;message('Opening rear camera…');
      try{
        if(!window.Html5Qrcode)throw new Error('reader-unavailable');
        const f=window.Html5QrcodeSupportedFormats;
        const reader=new Html5Qrcode('scannerCamera',{formatsToSupport:[f.EAN_13,f.EAN_8,f.UPC_A,f.UPC_E,f.CODE_128,f.CODE_39,f.ITF,f.CODABAR],verbose:false});
        scanner=reader;
        await reader.start({facingMode:'environment'},{fps:10,disableFlip:false,
          qrbox:(width,height)=>({width:Math.floor(Math.min(width*.9,360)),height:Math.floor(Math.min(height*.8,220))})
        },value=>{
          if(ticket!==generation||!active()||document.hidden||!wantsCamera)return;
          const now=Date.now();
          if(value===lastCode){lastScanAt=now;return;}
          if(code)return;
          lastCode=value;lastScanAt=now;open(value);message('Barcode found. Choose a cologne, then IN or OUT.');
        },()=>{
          if(!code&&Date.now()-lastScanAt>1200)lastCode='';
        });
        if(ticket!==generation||!wantsCamera||!active()||document.hidden){await releaseCamera();return;}
        running=true;try{localStorage.setItem('eky-cologne-camera-allowed-v1','true');}catch{}
        $('scanStart').disabled=false;$('scanStart').textContent='Restart Camera';$('scanStop').classList.remove('hidden');
        message('Scanning — keep the barcode inside the camera box.');
        if(typeof reader.applyVideoConstraints==='function')reader.applyVideoConstraints({advanced:[{focusMode:'continuous'}]}).catch(()=>{});
      }catch(error){
        await releaseCamera();
        if(ticket!==generation)return;
        const reason=String(error?.name||error||'');
        message(reason.includes('reader-unavailable')?'Camera reader did not load. Tap Update App and try again.':/NotAllowed|Permission|denied/i.test(reason)?'Allow camera access in your browser, then tap Start Barcode Scanner.':/NotFound/i.test(reason)?'No camera found. Enter the barcode below.':'Camera could not open. Tap Start Barcode Scanner to retry, or enter the number below.');
      }finally{starting=false;}
    });
  }
  $('scanStart').onclick=()=>{wantsCamera=true;stop(false).then(start);};
  $('scanStop').onclick=()=>stop(true);
  $('scanAgain').onclick=()=>{lastCode='';lastScanAt=0;wantsCamera=true;start();message('Ready to scan the same barcode again.');};
  $('manualBarcodeForm').onsubmit=e=>{e.preventDefault();const value=$('manualBarcode').value;open(value);$('manualBarcode').value='';};
  $('barcodeClose').onclick=close;$('barcodeAction').onclick=e=>{if(e.target===$('barcodeAction'))close();};
  $('barcodeIn').onclick=()=>apply('in');$('barcodeOut').onclick=()=>apply('out');
  $('barcodeCologne').oninput=()=>{selected='';renderChoices();};$('barcodeCologne').onfocus=renderChoices;
  $('barcodeChoices').onclick=e=>{const b=e.target.closest('[data-name]');if(b){selected=b.dataset.name;$('barcodeCologne').value=selected;$('barcodeChoices').classList.add('hidden');}};
  $('barcodeMappings').onclick=e=>{const b=e.target.closest('[data-code]');if(b)open(b.dataset.code);};
  $('barcodeSaveAssignment').onclick=()=>{const name=chosen();if(!name){renderChoices();return;}try{map[code]={name,updatedAt:Date.now()};save();renderSaved();close();message('Barcode assignment saved.');}catch{$('barcodeHint').textContent='Could not save assignment.';}};
  $('barcodeForget').onclick=()=>{if(!confirm('Forget this barcode assignment?'))return;delete map[code];save();renderSaved();close();};
  document.querySelectorAll('.nav').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.tab!=='scannerTab')stop(false);else{wantsCamera=true;renderSaved();start();}}));
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop(false);else if(active()&&wantsCamera)start();});
  renderSaved();
  start();
})();

