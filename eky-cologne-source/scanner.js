(() => {
  const $ = id => document.getElementById(id);
  const MAP = 'eky-cologne-barcode-map-v1', HISTORY = 'eky-cologne-barcode-history-v1';
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } };
  let map = read(MAP, {}), history = read(HISTORY, []), code = '', selected = '', scanner = null, starting = false, busy = false;
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
    selected = map[code]?.name || '';
    $('barcodeCode').textContent = code;
    $('barcodeCologne').value = selected;
    $('barcodeHint').textContent = selected ? 'Remembered as '+selected+'. Add or remove one bottle.' : 'First scan: pick the cologne this barcode belongs to.';
    $('barcodeChoices').classList.add('hidden');
    $('barcodeAction').classList.remove('hidden');
    $('barcodeForget').classList.toggle('hidden', !map[code]);
    if(!selected)renderChoices();
  }
  function close() { $('barcodeAction').classList.add('hidden'); code=''; selected=''; }
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
  async function stop() {
    if(scanner){try{await scanner.stop();}catch{}try{scanner.clear();}catch{}scanner=null;}
    $('scanStart').disabled=false;$('scanStop').classList.add('hidden');
  }
  async function start() {
    if(starting||scanner)return;starting=true;$('scanStart').disabled=true;
    try {
      if(!window.Html5Qrcode){
        message('Loading camera scanner…');
        await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';s.onload=resolve;s.onerror=reject;document.head.appendChild(s);});
      }
      scanner=new Html5Qrcode('scannerCamera');
      let detected=false;
      await scanner.start({facingMode:'environment'},{fps:10,qrbox:(w,h)=>({width:Math.floor(Math.min(w*.85,280)),height:Math.floor(Math.min(h*.7,140))})},async value=>{if(detected)return;detected=true;await stop();open(value);},()=>{});
      message('Point the camera at the bottle barcode.');$('scanStop').classList.remove('hidden');
    } catch(error) { await stop();message('Camera could not start. Allow camera access or enter the barcode below.'); }
    finally{starting=false;}
  }
  $('scanStart').onclick=start;$('scanStop').onclick=stop;
  $('manualBarcodeForm').onsubmit=e=>{e.preventDefault();const value=$('manualBarcode').value;stop();open(value);$('manualBarcode').value='';};
  $('barcodeClose').onclick=close;$('barcodeAction').onclick=e=>{if(e.target===$('barcodeAction'))close();};
  $('barcodeIn').onclick=()=>apply('in');$('barcodeOut').onclick=()=>apply('out');
  $('barcodeCologne').oninput=()=>{selected='';renderChoices();};$('barcodeCologne').onfocus=renderChoices;
  $('barcodeChoices').onclick=e=>{const b=e.target.closest('[data-name]');if(b){selected=b.dataset.name;$('barcodeCologne').value=selected;$('barcodeChoices').classList.add('hidden');}};
  $('barcodeMappings').onclick=e=>{const b=e.target.closest('[data-code]');if(b)open(b.dataset.code);};
  $('barcodeSaveAssignment').onclick=()=>{const name=chosen();if(!name){renderChoices();return;}try{map[code]={name,updatedAt:Date.now()};save();renderSaved();close();message('Barcode assignment saved.');}catch{$('barcodeHint').textContent='Could not save assignment.';}};
  $('barcodeForget').onclick=()=>{if(!confirm('Forget this barcode assignment?'))return;delete map[code];save();renderSaved();close();};
  document.querySelectorAll('.nav').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.tab!=='scannerTab')stop();else renderSaved();}));
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  renderSaved();
})();
