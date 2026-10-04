(() => {
  const $ = id => document.getElementById(id);
  const MAP = 'eky-cologne-barcode-map-v1', HISTORY = 'eky-cologne-barcode-history-v1';
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } };
  let map = read(MAP, {}), history = read(HISTORY, []), code = '', selected = '', scanner = null, starting = false, busy = false, running = false, paused = false, wantsCamera = true, generation = 0, resumeTimer = null, lastCode = '', lastScanAt = 0;
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
    if(running && !paused){try{scanner.pause();paused=true;}catch{}}
    code = String(raw || '').trim();
    if(!code || code.length>128){message('Enter a valid barcode.');return;}
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
    clearTimeout(resumeTimer);
    resumeTimer=setTimeout(()=>{
      if(!wantsCamera||!active()||document.hidden||code)return;
      if(scanner&&running&&paused){try{scanner.resume();paused=false;message('Scanning automatically — point at the next barcode.');}catch{stop(false).then(start);}}
      else if(!scanner)start();
    },1400);
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
    if(action==='out'&&(!existing||Number(existing.qty)<1)){$('barcodeHint').textContent=name+' has no stock to remove.';return;}
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
  async function stop(userStop=false) {
    if(userStop)wantsCamera=false;
    generation++;clearTimeout(resumeTimer);
    const old=scanner;scanner=null;running=false;paused=false;
    if(old){try{await old.stop();}catch{}try{old.clear();}catch{}}
    $('scanStart').disabled=false;$('scanStart').textContent='Start Barcode Scanner';$('scanStop').classList.add('hidden');
    if(userStop)message('Camera stopped. Tap Start to scan again.');
  }
  async function start() {
    if(starting||scanner||!wantsCamera||!active()||document.hidden||code)return;
    starting=true;const ticket=++generation;$('scanStart').disabled=true;message('Opening rear camera…');
    let reader;
    try {
      if(!window.Html5Qrcode)throw new Error('reader-unavailable');
      const f=window.Html5QrcodeSupportedFormats;
      reader=new Html5Qrcode('scannerCamera',{formatsToSupport:[f.EAN_13,f.EAN_8,f.UPC_A,f.UPC_E,f.CODE_128,f.CODE_39,f.ITF,f.CODABAR],verbose:false});
      scanner=reader;
      await reader.start({facingMode:'environment'},{fps:12,disableFlip:true},value=>{
        if(ticket!==generation||code||paused||!active())return;
        const now=Date.now();if(value===lastCode&&now-lastScanAt<2000)return;
        lastCode=value;lastScanAt=now;open(value);message('Barcode found. Choose IN STOCK or OUT OF STOCK.');
      },()=>{});
      if(ticket!==generation||!wantsCamera||!active()||document.hidden){try{await reader.stop();reader.clear();}catch{}return;}
      running=true;$('scanStart').textContent='Camera scanning';$('scanStop').classList.remove('hidden');
      message('Scanning automatically — point the camera at a barcode.');
    } catch(error) {
      if(ticket===generation){
        await stop(false);
        const reason=String(error?.name||error||'');
        message(reason.includes('reader-unavailable')?'Camera reader did not load. Tap Update App, then try again.':reason.includes('NotAllowed')||reason.includes('Permission')?'Camera permission is needed. Allow camera access, then tap Start Scanner.':reason.includes('NotFound')?'No camera found. Enter a barcode below.':'Camera could not open. Tap Start Scanner to retry, or enter a barcode below.');
      }
    } finally{starting=false;}
  }
  $('scanStart').onclick=()=>{wantsCamera=true;start();};$('scanStop').onclick=()=>stop(true);
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
