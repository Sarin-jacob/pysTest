
/* AX-CPT full implementation
   - Two-button responses (target / non-target)
   - CPT and CPT-AX
   - Color mode with two colors and optional requirement of A's color
   - Extra distractor letter toggles
   - Centered big countdown overlay
   - Smaller report popup that fits one window
   - CSV + PDF export + charts
*/


// DOM refs
const subjectIdEl = $('subjectId'), subjectAgeEl = $('subjectAge'), subjectSexEl = $('subjectSex');
const testTypeEl = $('testType'), numTrialsEl = $('numTrials'), stimTimeEl = $('stimTime'), isiEl = $('isi');
const goProbEl = $('goProb'), axRateEl = $('axRate');
const targetKeyEl = $('targetKey'), nonTargetKeyEl = $('nonTargetKey');
const colorModeEl = $('colorMode'), colorAEl = $('colorA'), colorBEl = $('colorB'), requireAColorEl = $('requireAColor');
const extraLettersToggle = $('extraLettersToggle'), lettersGrid = $('lettersGrid');
const startBtn = $('startBtn'), resetBtn = $('resetBtn'), openReport = $('openReport'), saveDefaults = $('saveDefaults');
const stimDiv = $('stimLetter'), statusEl = $('status'), resultsSummary = $('resultsSummary');
const popup = $('popup'), closePopup = $('closePopup'), csvBtn = $('csvBtn'), pdfBtn = $('pdfBtn');
const rtCanvas = $('rtChart'), perfCanvas = $('perfChart');
const countOverlay = $('countdownOverlay'), countNum = $('countdownNum'), sideBar = $('sidebar');
const targetBtn = $('targetBtn'), nonTargetBtn = $('nonTargetBtn');
const modeToggle = $('modeToggle');

let trials = [], currentIndex = -1, awaiting = false, stimShownAt = 0;
let stimTimeout = null, isiTimeout = null;
let results = [], rtList = [], omissions=0, commissions=0, correctResponses=0, correctInhibitions=0;
let rtChart=null, perfChart=null;
let cachedCsvBlob = null;

updateConfigVisibility();
updateKeyLabels();
// letters pool helpers
const BASE_DISTRACTORS = ['B','C','D'];
// load defaults and wire UI
window.addEventListener('load', ()=>{
  if(localStorage['ax_seen_instructions'] !== '1') { /* show instructions? we don't have overlay here */ localStorage['ax_seen_instructions']='1'; }
  // restore basic advanced values
  ['numTrials','stimTime','isi','goProb','axRate','targetKey','nonTargetKey'].forEach(k => { if(localStorage[k]!==undefined && $(k)) $(k).value = localStorage[k]; });
  subjectIdEl.value=''; subjectAgeEl.value=''; subjectSexEl.value='';
  // letters grid toggling
  extraLettersToggle.addEventListener('change', ()=>{
    lettersGrid.style.display = extraLettersToggle.checked ? 'grid' : 'none';
  });
  // button wiring
  startBtn.addEventListener('click', startTest);
  resetBtn.addEventListener('click', resetAll);
  openReport.addEventListener('click', ()=> { if(results.length===0) showAlert('No results yet — run a test first'); else { popup.style.display='flex'; renderCharts(); }});
  closePopup.addEventListener('click', ()=> popup.style.display='none');
  csvBtn.addEventListener('click', downloadCSV);
  pdfBtn.addEventListener('click', downloadPDF);
  saveDefaults.addEventListener('click', saveDefaultsFn);
  // on-screen response buttons
  targetBtn.addEventListener('click', ()=> simulateKey('target'));
  nonTargetBtn.addEventListener('click', ()=> simulateKey('nontarget'));
  // keyboard listener
  document.addEventListener('keydown', handleKeyDown);
  modeToggle.addEventListener('click', ()=> { document.body.classList.toggle('light'); modeToggle.textContent = document.body.classList.contains('light') ? '🌞' : '🌙'; });
  testTypeEl.addEventListener('change', updateConfigVisibility);
//   updateConfigVisibility();
targetKeyEl.addEventListener('input', updateKeyLabels);
nonTargetKeyEl.addEventListener('input', updateKeyLabels);
});

function hideInstructions(){
  $('instructions').style.display = 'none';
  $('subjectId').focus();
}
function updateKeyLabels() {
  targetBtn.textContent = `Target (${normKeyName(targetKeyEl.value)})`;
  if (testTypeEl.value === 'CPT-AX') {
    nonTargetBtn.style.display = '';
    nonTargetBtn.textContent = `Non-target (${normKeyName(nonTargetKeyEl.value)})`;
  } else {
    nonTargetBtn.style.display = 'none';
  }
}

// normalize key name (user input)
function normKeyName(name){
  if(!name) return 'Space';
  return name.trim();
}
function keyMatchesEvent(e, name){
  const n=name.toLowerCase();
  if(n==='space') return e.code==='Space' || e.key===' ' || e.key==='Spacebar';
  if(n==='enter') return e.code==='Enter' || e.key==='Enter';
  if(n.length===1) return e.key.toLowerCase()===n;
  // fallback: check code includes
  return e.code.toLowerCase().includes(n);
}

// generate trials
function getDistractorLetters(){
  let set = ['B']; // default
  if(extraLettersToggle.checked){
    document.querySelectorAll('.distractorLetter').forEach(ch => { if(ch.checked && !set.includes(ch.value)) set.push(ch.value); });
  }
  // ensure unique and alphabetical
  return Array.from(new Set(set)).slice(0,6);
}
function generateTrials(){
  const N = Math.max(1, parseInt(numTrialsEl.value,10) || 30);
  const type = testTypeEl.value;
  const goProb = Math.max(0, Math.min(1, parseFloat(goProbEl.value || 0.4)));
  const axRate = Math.max(0, Math.min(0.4, parseFloat(axRateEl.value || 0.2)));
  const distractors = getDistractorLetters();
  // base letters pool excluding A and X to avoid accidental placing
  const pool = distractors.concat(['Y','Z','M','T']).slice(0,8);

  // create blank array
  let arr = new Array(N).fill(null).map(()=>({ letter: pool[Math.floor(Math.random()*pool.length)], expected:false, color:null }));

  if(testTypeEl.value === 'CPT'){
    for(let i=0;i<N;i++){
      if(Math.random() < goProb){
        arr[i].letter = 'X'; arr[i].expected = true;
      }
    }
  } else { // CPT-AX
    // place AX pairs
    let pairs = Math.floor(N * axRate);
    pairs = Math.min(pairs, Math.floor(N/2));
    const taken = new Set();
    let placed=0, attempts=0;
    while(placed < pairs && attempts < pairs*8 + 200){
      attempts++;
      const pos = Math.floor(Math.random()*(N-1));
      if(taken.has(pos) || taken.has(pos+1)) continue;
      // place A at pos and X at pos+1
      arr[pos].letter = 'A'; arr[pos].expected = false;
      arr[pos+1].letter = 'X'; // expected only if prev is A and color rule satisfied (we'll mark expected later)
      taken.add(pos); taken.add(pos+1);
      placed++;
    }
    // mark expected true only when X follows A
    for(let i=0;i<N;i++){
      if(arr[i].letter === 'X' && i>0 && arr[i-1].letter === 'A') arr[i].expected = true;
      else arr[i].expected = false;
    }
  }

  // if colorMode, assign colors randomly between colorA/colorB (we'll use 'A' and 'B' labels)
  if(colorModeEl.checked){
    const cA = colorAEl.value, cB = colorBEl.value;
    for(let i=0;i<arr.length;i++){
      // random color
      arr[i].color = Math.random() < 0.5 ? 'A' : 'B';
    }
    // if requireAColor is checked, only mark expected true if preceding A had color A. For CPT-AX we need to re-evaluate
    if(testTypeEl.value === 'CPT-AX' && requireAColorEl.checked){
      for(let i=0;i<arr.length;i++){
        if(arr[i].letter === 'X' && i>0 && arr[i-1].letter === 'A' && arr[i-1].color === 'A'){
          arr[i].expected = true;
        } else {
          // if previously marked expected but precursor not in color A, disable
          if(arr[i].letter === 'X') arr[i].expected = false;
        }
      }
    }
  } else {
    // no colors, keep color null
    arr.forEach(a => a.color = null);
  }

  // attach index
  return arr.map((t,i) => ({ idx:i+1, letter:t.letter, expected:!!t.expected, color:t.color }));
}

// start test with countdown overlay centered
let countdownInterval = null;
function startTest(){
  const sid = subjectIdEl.value.trim();
  if(!sid){ showAlert('Subject ID is required'); return; }
  if(!subjectAgeEl.value){ showAlert('Age is required'); return; }
  if(!subjectSexEl.value){ showAlert('Sex is required'); return; }

  sideBar.style.display = 'none';
  trials = generateTrials();
  currentIndex = -1; results = []; rtList=[]; omissions=0; commissions=0; correctResponses=0; correctInhibitions=0;
  stimDiv.textContent = '';
  startBtn.disabled = true;

  // show centered countdown overlay (3..1)
  let c = 3; countNum.textContent = c; countOverlay.style.display = 'flex';
  countdownInterval = setInterval(()=> {
    c--;
    if(c<=0){
      clearInterval(countdownInterval); countOverlay.style.display = 'none'; statusEl.textContent='Running...'; nextTrial();
    } else {
      countNum.textContent = c;
    }
  },1000);
}

// proceed to next trial
function nextTrial(){
  currentIndex++;
  clearTimeout(stimTimeout); clearTimeout(isiTimeout);
  if(currentIndex >= trials.length){
    finishTest(); return;
  }
  const tr = trials[currentIndex];
  // render letter and if color mode, color it
  stimDiv.textContent = tr.letter;
  if(tr.color === 'A') stimDiv.style.color = colorAEl.value;
  else if(tr.color === 'B') stimDiv.style.color = colorBEl.value;
  else stimDiv.style.color = ''; // default
  statusEl.textContent = `Trial ${currentIndex+1} / ${trials.length}`;
  awaiting = true;
  stimShownAt = performance.now();

  // stimulus timeout: if no response -> omission/correct inhibition
  stimTimeout = setTimeout(()=>{
    if(!awaiting) return;
    awaiting = false;
    if(tr.expected){
      omissions++; results.push({ trial:tr.idx, letter:tr.letter, expected:true, keyPressed:'', RT:'', correct:0, note:'Omission' });
      //missed target feedback
      beep(380,200);
      // visual
      stimDiv.textContent = 'Missed';
      stimDiv.style.color = '#ef4444';
      setTimeout(()=> stimDiv.textContent = '', 200);
    } else {
      // correct inhibition (non-target not responded)
      correctInhibitions++;
      results.push({ trial:tr.idx, letter:tr.letter, expected:false, keyPressed:'', RT:'', correct:1, note:'Correct Inhibition' });
      // visual
      stimDiv.style.boxShadow = '0 8px 30px rgba(0,0,0,0.08)';
      setTimeout(()=> stimDiv.style.boxShadow = '', 120);
      stimDiv.textContent = '';
    }
    // schedule next after ISI
    isiTimeout = setTimeout(()=> { stimDiv.textContent=''; nextTrial(); }, parseInt(isiEl.value,10));
  }, parseInt(stimTimeEl.value,10));
}

// handle keyboard responses
function handleKeyDown(e){
  if(popup.style.display === 'flex') return;
  if(countOverlay.style.display === 'flex') return;
  if(!awaiting) return;
  const targetKeyName = normKeyName(targetKeyEl.value || 'Space');
  const nonTargetKeyName = normKeyName(nonTargetKeyEl.value || 'N');
  if(keyMatchesEvent(e, targetKeyName)) { processResponse('target'); e.preventDefault(); }
  else if(keyMatchesEvent(e, nonTargetKeyName)) { processResponse('nontarget'); e.preventDefault(); }
}

// simulate key from on-screen button
function simulateKey(which){ if(!awaiting) return; processResponse(which); }

function updateConfigVisibility() {
  const type = testTypeEl.value;
  if (type === 'CPT') {
    // hide non-target config and color options
    nonTargetKeyEl.style.display = 'none';
    $('requireAColor').parentElement.style.display = 'none';
    $('colorMode').closest('div').style.display = 'none';
    lettersGrid.style.display = 'none';
    document.querySelectorAll('.input_hide').forEach(el => el.style.display = 'none');

  } else {
    // AX-CPT → show everything
    nonTargetKeyEl.style.display = '';
    $('requireAColor').parentElement.style.display = '';
    $('colorMode').closest('div').style.display = 'flex';
    if (extraLettersToggle.checked) lettersGrid.style.display = 'grid';
    document.querySelectorAll('.input_hide').forEach(el => el.style.display = 'flex');
  }
  updateKeyLabels();
}

// process a response (target or non-target pressed)
function processResponse(which){
  if(!awaiting) return;
  awaiting = false;
  clearTimeout(stimTimeout);
  const tr = trials[currentIndex];
  const rt = Math.round(performance.now() - stimShownAt);
  let record = { trial: tr.idx, letter: tr.letter, expected:tr.expected, keyPressed: which, RT: rt, correct:0, note:'' };

  if(tr.expected){
    // correct response should be target press
    if(which === 'target'){ record.correct = 1; record.note='Correct Target'; correctResponses++; rtList.push(rt); }
    else { // pressed non-target when target expected
      record.correct = 0; record.note='Wrong key on Target (Commission)'; commissions++; if(colorModeEl.checked) beep(380,160); }
  } else {
    // non-target trial -> correct response should be non-target press
    if(which === 'nontarget'){ record.correct = 1; record.note='Correct Non-target'; correctInhibitions++; }
    else { record.correct = 0; record.note='Commission on Non-target'; commissions++; if(colorModeEl.checked) beep(380,160); }
  }
  results.push(record);
  // visual feedback
  stimDiv.style.boxShadow = record.correct ? '0 8px 40px rgba(16,185,129,0.18)' : '0 8px 40px rgba(239,68,68,0.18)';
  setTimeout(()=> stimDiv.style.boxShadow = '', 160);
  // clear letter (so it doesn't overlap)
  stimDiv.textContent = '';
  // next after ISI
  isiTimeout = setTimeout(()=> nextTrial(), parseInt(isiEl.value,10));
}

// finish test
function finishTest(){
  startBtn.disabled = false;
  statusEl.textContent = 'Finished';
  stimDiv.textContent = '—';
  sideBar.style.display = 'block';
  renderSummary();
  // popup.style.display = 'flex'; //dont show charts immediately
  renderCharts(); 
  generateCSV();
}

// render summary block
function renderSummary(){
  const meanRT = rtList.length ? Math.round(rtList.reduce((a,b)=>a+b,0)/rtList.length) : '-';
  resultsSummary.style.display = 'none'; //hide summary initially block
  resultsSummary.innerHTML = `
    <div style="background:linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01));padding:12px;border-radius:10px">
      <strong>Summary</strong>
      <div class="muted">Trials: ${results.length}</div>
      <div>Mean RT (correct targets): <strong>${meanRT} ms</strong></div>
      <div>Correct Targets: <strong>${correctResponses}</strong> | Omissions: <strong>${omissions}</strong> | Commissions: <strong>${commissions}</strong> | Correct Non-targets: <strong>${correctInhibitions}</strong></div>
    </div>
  `;
}

// render charts
function renderCharts(disableAnim=false){
  // RT chart: chronological correct target RTs
  const rtRecords = results.filter(r => r.RT && r.RT !== '' && r.note && r.note.startsWith('Correct Target'));
  const labels = rtRecords.map(r => `T${r.trial}`);
  const data = rtRecords.map(r => r.RT);
  if(rtChart) rtChart.destroy();
  rtChart = new Chart(rtCanvas.getContext('2d'), {
    type:'line',
    data:{ labels, datasets:[{ label:'RT (ms)', data, tension:0.2, fill:false }]},
    options:{ animation: disableAnim?false:undefined, plugins:{ title:{ display:true, text:'Reaction Times (Correct Targets)' },legend:{ display:false } }, scales:{x:{ title:{ display:true, text:'Trial' }}, y:{ beginAtZero:true, title:{ display:true, text:'RT (ms)' }}} }
  });

  // perf chart
  if(perfChart) perfChart.destroy();
  const perfData = [correctResponses, omissions, correctInhibitions, commissions];
  perfChart = new Chart(perfCanvas.getContext('2d'), {
    type:'bar',
    data:{ labels:['Correct Targets','Omissions','Correct Non-targets','Commissions'], datasets:[{ label:'Count', data:perfData,backgroundColor:['#16a34a','#f97316','#3b82f6','#ef4444'] }] },
    options:{ animation: disableAnim?false:undefined, plugins:{title:{ display:true, text:'Performance Summary' }, legend:{ display:false } }, scales:{ x:{ title:{ display:true,text:'Category' },ticks:{font:{size:8}} }, y:{ beginAtZero:true,title:{ display:true,text:'Count' } } } }
  });
}
function generateCSV(){
  const sid = subjectIdEl.value.trim() || 'subject';
  const meta = [
    `Subject ID,${sid}`,
    `Age,${subjectAgeEl.value||''}`,
    `Sex,${subjectSexEl.value||''}`,
    `Test Type,${testTypeEl.value}`,
    `Num Trials,${numTrialsEl.value}`,
    `Stimulus Time,${stimTimeEl.value}`,
    `ISI,${isiEl.value}`,
    `Target Prob (CPT),${goProbEl.value}`,
    `AX Rate (CPT-AX),${axRateEl.value}`,
    `Color Mode,${colorModeEl.checked}`,
    `ColorA,${colorAEl.value}`,
    `ColorB,${colorBEl.value}`,
    `RequireAColor,${requireAColorEl.checked}`,
    `TargetKey,${targetKeyEl.value}`,
    `NonTargetKey,${nonTargetKeyEl.value}`
  ].join('\n');
  const hdr = ['trial','letter','color','expected','keyPressed','correct','RT','note'];
  const rows = [meta, '', hdr.join(',')];
  for(const r of results){
    const vals = [
      r.trial, r.letter, (r.color||''), r.expected?1:0, r.keyPressed, r.correct?1:0, r.RT||'', r.note||''
    ].map(v => { const s = String(v).replace(/"/g,'""'); return (s.includes(',') ? `"${s}"` : s); }).join(',');
    rows.push(vals);
  }
  cachedCsvBlob = new Blob([rows.join('\n')], { type:'text/csv' });
  uploadCsv(cachedCsvBlob, getStandardFileName(sid, testTypeEl.value, 'csv'));
}

// CSV export
function downloadCSV(){
  if(results.length===0){ showAlert('No results to export'); return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(cachedCsvBlob);
  a.download = getStandardFileName(subjectIdEl.value, testTypeEl.value, 'csv');
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
}

// PDF export
async function downloadPDF(){
  const sid = subjectIdEl.value.trim() || 'subject';
  if(results.length===0){ showAlert('No results to export'); return; }
  renderCharts(true);
  await new Promise(r => setTimeout(r,200));
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit:'mm', format:'a4', orientation:'portrait' });
  const pageW = pdf.internal.pageSize.getWidth(), margin=12, colW=(pageW-margin*2-8)/2;
  let y1=36, y2=36;
  pdf.setFontSize(18); pdf.setFont('helvetica','bold'); pdf.text('AX-CPT Report', pageW/2, 18, { align:'center' });
  pdf.setFontSize(9); pdf.setFont('helvetica','normal'); pdf.text(`Generated: ${new Date().toLocaleString()}`, pageW/2, 24, { align:'center' });
  pdf.line(margin,28, pageW - margin, 28);
  // left: config
  pdf.setFontSize(12); pdf.setFont('helvetica','bold'); pdf.text('Configuration', margin, y1); y1+=6;
  pdf.setFontSize(10); pdf.setFont('helvetica','normal');
  const cfg = {
    'Subject ID': subjectIdEl.value || '',
    'Age': subjectAgeEl.value || '',
    'Sex': subjectSexEl.value || '',
    'Test Type': testTypeEl.value,
    'Num Trials': numTrialsEl.value,
    'Stimulus Time (ms)': stimTimeEl.value,
    'ISI (ms)': isiEl.value,
    'Target Prob (CPT)': goProbEl.value,
    'AX Rate (CPT-AX)': axRateEl.value,
    'Color Mode': colorModeEl.checked,
    'Color A': colorAEl.value,
    'Color B': colorBEl.value,
    'Require A Color': requireAColorEl.checked,
    'Target Key': targetKeyEl.value,
    'Non-target Key': nonTargetKeyEl.value
  };
  for(const [k,v] of Object.entries(cfg)){ pdf.setFont('helvetica','bold'); pdf.text(k+':', margin, y1); pdf.setFont('helvetica','normal'); pdf.text(String(v), margin + 58, y1); y1 += 6; }
  // summary
  y1 += 4; pdf.setFont('helvetica','bold'); pdf.text('Performance Summary', margin, y1); y1+=6;
  const meanRT = rtList.length? Math.round(rtList.reduce((a,b)=>a+b,0)/rtList.length) : 'N/A';
  const summ = {'Mean RT (ms)': meanRT, 'Correct Targets': correctResponses, 'Omissions': omissions, 'Correct Non-targets': correctInhibitions, 'Commissions': commissions};
  for(const [k,v] of Object.entries(summ)){ pdf.setFont('helvetica','bold'); pdf.text(k+':', margin, y1); pdf.setFont('helvetica','normal'); pdf.text(String(v), margin + 58, y1); y1 += 6; }

  // right column: charts
  const rtImg = rtCanvas.toDataURL('image/png'); const perfImg = perfCanvas.toDataURL('image/png');
  const imgW = colW; const imgH = imgW * 0.55;
  pdf.setFont('helvetica','bold'); pdf.text('Reaction Time Chart', margin + colW + 8, y2); y2 += 6;
  pdf.addImage(rtImg, 'PNG', margin + colW + 8, y2, imgW, imgH); y2 += imgH + 8;
  pdf.setFont('helvetica','bold'); pdf.text('Performance Chart', margin + colW + 8, y2); y2 += 6;
  pdf.addImage(perfImg, 'PNG', margin + colW + 8, y2, imgW, imgH);

  // footer
  const pc = pdf.internal.getNumberOfPages();
  for(let i=1;i<=pc;i++){ pdf.setPage(i); pdf.setFontSize(9); pdf.setTextColor(150); pdf.text(`Page ${i} of ${pc} | AX-CPT Report`, pageW/2, pdf.internal.pageSize.getHeight() - 8, { align:'center' }); }

  pdf.save( getStandardFileName(sid, testTypeEl.value, 'pdf') );
}

// reset all
function resetAll(){
  clearTimeout(stimTimeout); clearTimeout(isiTimeout); clearInterval(countdownInterval);
  trials=[]; results=[]; currentIndex=-1; awaiting=false;
  stimDiv.textContent='—'; stimDiv.style.color=''; statusEl.textContent='Ready. Configure and press Start Test.'; resultsSummary.style.display='none';
  popup.style.display='none';
  startBtn.disabled = false;
}

// save defaults
function saveDefaultsFn(){
  ['numTrials','stimTime','isi','goProb','axRate','targetKey','nonTargetKey'].forEach(k => { if($(k)) localStorage[k] = $(k).value; });
  showAlert('Defaults saved');
}