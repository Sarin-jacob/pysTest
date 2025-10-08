// CPT (Target 'X') implementation

// DOM refs
const subjectIdEl = $('subjectId'), subjectAgeEl = $('subjectAge'), subjectSexEl = $('subjectSex');
const numTrialsEl = $('numTrials'), stimTimeEl = $('stimTime'), isiEl =$('isi');
const goProbEl = $('goProb');
const targetKeyEl = $('targetKey');
const startBtn = $('startBtn'), resetBtn = $('resetBtn'), openReport = $('openReport'), saveDefaults = $('saveDefaults');
const stimDiv = $('stimLetter'), statusEl = $('status'), resultsSummary = $('resultsSummary');
const popup = $('popup'), closePopup = $('closePopup'), csvBtn = $('csvBtn'), pdfBtn = $('pdfBtn');
const rtCanvas = $('rtChart'), perfCanvas = $('perfChart');
const countOverlay = $('countdownOverlay'), countNum = $('countdownNum'), sideBar = $('sidebar');
const targetBtn = $('targetBtn');
const modeToggle = $('modeToggle'), trialRunCheckbox = $('trialRunCheckbox');

let trials = [], currentIndex = -1, awaiting = false, stimShownAt = 0;
let stimTimeout = null, isiTimeout = null;
let results = [], rtList = [], omissions=0, commissions=0, correctResponses=0, correctInhibitions=0;
let rtChart=null, perfChart=null;
let cachedCsvBlob = null;
let isTrialMode = false;
let hasTrialRunCompleted = false;
const TRIAL_RUN_COUNT = 5;

updateKeyLabels();

window.addEventListener('load', ()=>{
  if(localStorage['ax_seen_instructions'] !== '1') { localStorage['ax_seen_instructions']='1'; }
  ['numTrials','stimTime','isi','goProb','targetKey'].forEach(k => { if(localStorage[k]!==undefined && $(k)) $(k).value = localStorage[k]; });
  subjectIdEl.value=''; subjectAgeEl.value=''; subjectSexEl.value='';
  startBtn.addEventListener('click', startTest);
  resetBtn.addEventListener('click', resetAll);
  openReport.addEventListener('click', ()=> { if(results.length===0) showAlert('No results yet — run a test first'); else { popup.style.display='flex'; renderCharts(); }});
  closePopup.addEventListener('click', ()=> popup.style.display='none');
  csvBtn.addEventListener('click', downloadCSV);
  pdfBtn.addEventListener('click', downloadPDF);
  saveDefaults.addEventListener('click', saveDefaultsFn);
  targetBtn.addEventListener('click', ()=> simulateKey('target'));
  document.addEventListener('keydown', handleKeyDown);
  modeToggle.addEventListener('click', ()=> { document.body.classList.toggle('light'); modeToggle.textContent = document.body.classList.contains('light') ? '🌞' : '🌙'; });
  targetKeyEl.addEventListener('input', updateKeyLabels);
});

function updateKeyLabels() {
  targetBtn.textContent = `Target (${normKeyName(targetKeyEl.value)})`;
}

function normKeyName(name){
  if(!name) return 'Space';
  return name.trim();
}

function keyMatchesEvent(e, name){
  const n=name.toLowerCase();
  if(n==='space') return e.code==='Space' || e.key===' ' || e.key==='Spacebar';
  if(n==='enter') return e.code==='Enter' || e.key==='Enter';
  if(n.length===1) return e.key.toLowerCase()===n;
  return e.code.toLowerCase().includes(n);
}

function generateTrials(isPractice = false){
  const N = isPractice ? TRIAL_RUN_COUNT : (Math.max(1, parseInt(numTrialsEl.value,10) || 30));
  const goProb = Math.max(0, Math.min(1, parseFloat(goProbEl.value || 0.4)));
  const pool = ['B','C','D','F','G','H','J','K','L'];
  let arr = [];
  for(let i=0; i<N; i++){
    if(Math.random() < goProb){
      arr.push({ letter: 'X', expected: true });
    } else {
      arr.push({ letter: pool[Math.floor(Math.random()*pool.length)], expected: false });
    }
  }
  if (isPractice) {
    const hasTarget = arr.some(t => t.expected);
    if (!hasTarget && N > 2) {
      arr[2] = { letter: 'X', expected: true }; // Force a target on the 3rd trial
    }
  }
  return arr.map((t,i) => ({ idx:i+1, letter:t.letter, expected:!!t.expected }));
}

let countdownInterval = null;
function startTest(){
  const sid = subjectIdEl.value.trim();
  if(!sid){ showAlert('Subject ID is required'); return; }
  if(!subjectAgeEl.value){ showAlert('Age is required'); return; }
  if(!subjectSexEl.value){ showAlert('Sex is required'); return; }
  const wantsTrialRun = trialRunCheckbox.checked;
  if (wantsTrialRun && !hasTrialRunCompleted) {
    runPracticeSession();
  } else {
    runMainSession();
  }
}

async function runPracticeSession() {
  isTrialMode = true;
  hasTrialRunCompleted = true; // Prevents it from running again
  sideBar.style.display = 'none';
  stimDiv.textContent = '';
  startBtn.disabled = true;

  // Show "TRIAL" message
  statusEl.textContent = 'Preparing trial run...';
  stimDiv.style.fontSize = '120px';
  stimDiv.textContent = 'TRIAL';
  await new Promise(r => setTimeout(r, 2000));
  stimDiv.style.fontSize = '';

  trials = generateTrials(true);
  currentIndex = -1;
  nextTrial();
}

function runMainSession() {
  isTrialMode = false;
  sideBar.style.display = 'none';
  trials = generateTrials();
  currentIndex = -1; results = []; rtList=[]; omissions=0; commissions=0; correctResponses=0; correctInhibitions=0;
  stimDiv.textContent = '';
  startBtn.disabled = true;

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

function nextTrial(){
  currentIndex++;
  clearTimeout(stimTimeout); clearTimeout(isiTimeout);
  if(currentIndex >= trials.length){
    if (isTrialMode) {
      isTrialMode = false;
    //   runMainSession(); // Start the main test after the trial
        sideBar.style.display = 'block';
        stimDiv.textContent = '—';
        startBtn.disabled = false;
        statusEl.textContent = 'Trial run completed. press Start Test (Enter) to begin the main session.';
        startBtn.focus();
    } else {
      finishTest();
    }
    return;
  }
  const tr = trials[currentIndex];
  stimDiv.textContent = tr.letter;
  stimDiv.style.color = '';
  statusEl.textContent = `Trial ${currentIndex+1} / ${trials.length}`;
  awaiting = true;
  stimShownAt = performance.now();

  stimTimeout = setTimeout(()=>{
    if(!awaiting) return;
    awaiting = false;
    if(tr.expected){
      if (!isTrialMode) {
      omissions++; results.push({ trial:tr.idx, letter:tr.letter, expected:true, keyPressed:'', RT:'', correct:0, note:'Omission' });
      }else {
      // feedback for miss
      beep(380,200);
      stimDiv.textContent = 'Missed'; stimDiv.style.color = '#ef4444';
      setTimeout(()=> stimDiv.textContent = '', 200);
      }
        stimDiv.textContent = '';
    } else {
        if (!isTrialMode) {
      correctInhibitions++;
      results.push({ trial:tr.idx, letter:tr.letter, expected:false, keyPressed:'', RT:'', correct:1, note:'Correct Inhibition' });
      } else {
        // feedback for correct inhibition
      stimDiv.style.boxShadow = '0 8px 30px rgba(0,0,0,0.08)';
      setTimeout(()=> stimDiv.style.boxShadow = '', 120);
      }
      stimDiv.textContent = '';
    }
    isiTimeout = setTimeout(()=> { stimDiv.textContent=''; nextTrial(); }, parseInt(isiEl.value,10));
  }, parseInt(stimTimeEl.value,10));
}

function handleKeyDown(e){
  if(popup.style.display === 'flex' || countOverlay.style.display === 'flex' || !awaiting) return;
  const targetKeyName = normKeyName(targetKeyEl.value || 'Space');
  if(keyMatchesEvent(e, targetKeyName)) {
    processResponse('target');
    e.preventDefault();
  }
}

function simulateKey(which){ if(!awaiting) return; processResponse(which); }

function processResponse(which){
  if(!awaiting || which !== 'target') return;
  awaiting = false;
  clearTimeout(stimTimeout);
  const tr = trials[currentIndex];
  const rt = Math.round(performance.now() - stimShownAt);
  let record = { trial: tr.idx, letter: tr.letter, expected:tr.expected, keyPressed: 'target', RT: rt, correct:0, note:'' };
  if (isTrialMode) {
    // feedback effects
    const isCorrect = tr.expected;
    stimDiv.style.boxShadow = isCorrect ? '0 8px 40px rgba(16,185,129,0.18)' : '0 8px 40px rgba(239,68,68,0.18)';
    if (!isCorrect) beep(440, 150);
    setTimeout(()=> stimDiv.style.boxShadow = '', 160);
  } else {
  if(tr.expected){
    record.correct = 1; record.note='Correct Target'; correctResponses++; rtList.push(rt);
  } else {
    record.correct = 0; record.note='Commission on Non-target'; commissions++;
  }
  results.push(record);
}
  stimDiv.textContent = '';
  isiTimeout = setTimeout(()=> nextTrial(), parseInt(isiEl.value,10));
}

function finishTest(){
  startBtn.disabled = false;
  statusEl.textContent = 'Finished';
  stimDiv.textContent = '—';
  sideBar.style.display = 'block';
//   renderSummary();
  renderCharts();
  generateCSV();
}

function renderSummary(){
    const meanRT = rtList.length ? Math.round(rtList.reduce((a,b)=>a+b,0)/rtList.length) : '-';
    resultsSummary.style.display = 'block';
    resultsSummary.innerHTML = `
      <div style="background:linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01));padding:12px;border-radius:10px">
        <strong>Summary</strong>
        <div class="muted">Trials: ${results.length}</div>
        <div>Mean RT (correct targets): <strong>${meanRT} ms</strong></div>
        <div>Correct Targets: <strong>${correctResponses}</strong> | Omissions: <strong>${omissions}</strong> | Commissions: <strong>${commissions}</strong> | Correct Non-targets: <strong>${correctInhibitions}</strong></div>
      </div>
    `;
}

function renderCharts(disableAnim=false){
  const rtRecords = results.filter(r => r.RT && r.RT !== '' && r.note === 'Correct Target');
  const labels = rtRecords.map(r => `T${r.trial}`);
  const data = rtRecords.map(r => r.RT);
  if(rtChart) rtChart.destroy();
  rtChart = new Chart(rtCanvas.getContext('2d'), { type:'line', data:{ labels, datasets:[{ label:'RT (ms)', data, tension:0.2, fill:false }]}, options:{ animation: disableAnim?false:undefined, plugins:{ title:{ display:true, text:'Reaction Times (Correct Targets)' },legend:{ display:false } }, scales:{x:{ title:{ display:true, text:'Trial' }}, y:{ beginAtZero:true, title:{ display:true, text:'RT (ms)' }}} } });

  if(perfChart) perfChart.destroy();
  const perfData = [correctResponses, omissions, correctInhibitions, commissions];
  perfChart = new Chart(perfCanvas.getContext('2d'), { type:'bar', data:{ labels:['Correct Targets','Omissions','Correct Non-targets','Commissions'], datasets:[{ label:'Count', data:perfData,backgroundColor:['#16a34a','#f97316','#3b82f6','#ef4444'] }] }, options:{ animation: disableAnim?false:undefined, plugins:{title:{ display:true, text:'Performance Summary' }, legend:{ display:false } }, scales:{ x:{ title:{ display:true,text:'Category' },ticks:{font:{size:8}} }, y:{ beginAtZero:true,title:{ display:true,text:'Count' } } } } });
}

function generateCSV(){
  const sid = subjectIdEl.value.trim() || 'subject';
  const meta = [
    `Subject ID,${sid}`, `Age,${subjectAgeEl.value||''}`, `Sex,${subjectSexEl.value||''}`,
    `Test Type,CPT`, `Num Trials,${numTrialsEl.value}`, `Stimulus Time,${stimTimeEl.value}`, `ISI,${isiEl.value}`,
    `Target Prob,${goProbEl.value}`, `TargetKey,${targetKeyEl.value}`
  ].join('\n');
  const hdr = ['trial','letter','expected','keyPressed','correct','RT','note'];
  const rows = [meta, '', hdr.join(',')];
  for(const r of results){
    const vals = [r.trial, r.letter, r.expected?1:0, r.keyPressed, r.correct?1:0, r.RT||'', r.note||'']
      .map(v => { const s = String(v).replace(/"/g,'""'); return (s.includes(',') ? `"${s}"` : s); }).join(',');
    rows.push(vals);
  }
  cachedCsvBlob = new Blob([rows.join('\n')], { type:'text/csv' });
  uploadCsv(cachedCsvBlob, getStandardFileName(sid, 'CPT', 'csv')); // Assuming util.js has this
}

function downloadCSV(){
  if(results.length===0){ showAlert('No results to export'); return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(cachedCsvBlob);
  a.download = `${subjectIdEl.value || 'subject'}_CPT_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
}

async function downloadPDF(){
  const sid = subjectIdEl.value.trim() || 'subject';
  if(results.length===0){ showAlert('No results to export'); return; }
  renderCharts(true);
  await new Promise(r => setTimeout(r,200));
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit:'mm', format:'a4', orientation:'portrait' });
  const pageW = pdf.internal.pageSize.getWidth(), margin=12, colW=(pageW-margin*2-8)/2;
  let y1=36;
  pdf.setFontSize(18); pdf.setFont('helvetica','bold'); pdf.text('CPT Report', pageW/2, 18, { align:'center' });
  pdf.setFontSize(9); pdf.setFont('helvetica','normal'); pdf.text(`Generated: ${new Date().toLocaleString()}`, pageW/2, 24, { align:'center' });
  pdf.line(margin,28, pageW - margin, 28);
  pdf.setFontSize(12); pdf.setFont('helvetica','bold'); pdf.text('Configuration', margin, y1); y1+=6;
  pdf.setFontSize(10); pdf.setFont('helvetica','normal');
  const cfg = {
    'Subject ID': subjectIdEl.value || '', 'Age': subjectAgeEl.value || '', 'Sex': subjectSexEl.value || '',
    'Test Type': 'CPT', 'Num Trials': numTrialsEl.value, 'Stimulus Time (ms)': stimTimeEl.value,
    'ISI (ms)': isiEl.value, 'Target Prob': goProbEl.value, 'Target Key': targetKeyEl.value
  };
  for(const [k,v] of Object.entries(cfg)){ pdf.setFont('helvetica','bold'); pdf.text(k+':', margin, y1); pdf.setFont('helvetica','normal'); pdf.text(String(v), margin + 58, y1); y1 += 6; }
  y1 += 4; pdf.setFont('helvetica','bold'); pdf.text('Performance Summary', margin, y1); y1+=6;
  const meanRT = rtList.length? Math.round(rtList.reduce((a,b)=>a+b,0)/rtList.length) : 'N/A';
  const summ = {'Mean RT (ms)': meanRT, 'Correct Targets': correctResponses, 'Omissions': omissions, 'Correct Non-targets': correctInhibitions, 'Commissions': commissions};
  for(const [k,v] of Object.entries(summ)){ pdf.setFont('helvetica','bold'); pdf.text(k+':', margin, y1); pdf.setFont('helvetica','normal'); pdf.text(String(v), margin + 58, y1); y1 += 6; }

  const rtImg = rtCanvas.toDataURL('image/png'); const perfImg = perfCanvas.toDataURL('image/png');
  const imgW = colW; const imgH = imgW * 0.55;
  let y2 = 36;
  pdf.setFont('helvetica','bold'); pdf.text('Reaction Time Chart', margin + colW + 8, y2); y2 += 6;
  pdf.addImage(rtImg, 'PNG', margin + colW + 8, y2, imgW, imgH); y2 += imgH + 8;
  pdf.setFont('helvetica','bold'); pdf.text('Performance Chart', margin + colW + 8, y2); y2 += 6;
  pdf.addImage(perfImg, 'PNG', margin + colW + 8, y2, imgW, imgH);

  pdf.save( `${sid}_CPT_${new Date().toISOString().slice(0,10)}.pdf` );
}

function resetAll(){
  clearTimeout(stimTimeout); clearTimeout(isiTimeout); clearInterval(countdownInterval);
  trials=[]; results=[]; currentIndex=-1; awaiting=false;
  stimDiv.textContent='—'; stimDiv.style.color=''; statusEl.textContent='Ready. Configure and press Start Test.'; resultsSummary.style.display='none';
  popup.style.display='none';
  startBtn.disabled = false;
  isTrialMode = false;
  hasTrialRunCompleted = false;
}

function saveDefaultsFn(){
  ['numTrials','stimTime','isi','goProb','targetKey'].forEach(k => { if($(k)) localStorage[k] = $(k).value; });
  showAlert('Defaults saved');
}