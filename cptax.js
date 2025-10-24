// AX-CPT full implementation

// DOM refs
const subjectIdEl = $('subjectId'), subjectAgeEl = $('subjectAge'), subjectSexEl = $('subjectSex');
const numTrialsEl = $('numTrials'), stimTimeEl = $('stimTime'), isiEl = $('isi');
const axRateEl = $('axRate');
const targetKeyEl = $('targetKey'), nonTargetKeyEl = $('nonTargetKey');
const colorModeEl = $('colorMode'), colorAEl = $('colorA'), colorBEl = $('colorB'), requireAColorEl = $('requireAColor');
const extraLettersToggle = $('extraLettersToggle'), lettersGrid = $('lettersGrid');
const startBtn = $('startBtn'), resetBtn = $('resetBtn'), openReport = $('openReport'), saveDefaults = $('saveDefaults');
const stimDiv = $('stimLetter'), statusEl = $('status'), resultsSummary = $('resultsSummary');
const popup = $('popup'), closePopup = $('closePopup'), csvBtn = $('csvBtn'), pdfBtn = $('pdfBtn');
const rtCanvas = $('rtChart'), perfCanvas = $('perfChart');
const countOverlay = $('countdownOverlay'), countNum = $('countdownNum'), sideBar = $('sidebar');
const targetBtn = $('targetBtn'), nonTargetBtn = $('nonTargetBtn');
const trialRunCheckbox = $('trialRunCheckbox');

let trials = [], currentIndex = -1, awaiting = false, stimShownAt = 0;
let stimTimeout = null, isiTimeout = null;
let results = [], rtList = [], omissions=0, commissions=0, correctResponses=0, correctInhibitions=0;
let rtChart=null, perfChart=null;
let cachedCsvBlob = null;
let isTrialMode = false;
let hasTrialRunCompleted = false;
const TRIAL_RUN_COUNT = 10;
const PLUS_TIME=350;

window.addEventListener("load", () => {
          const testName = "CPTAX"; 
  const excludedIds = ["subjectId", "subjectAge", "subjectSex"];
    const getStorageKey = (id) => `${testName}_${id}`;
  document.querySelectorAll("#sidebar input, #sidebar select").forEach(el => {
        if (excludedIds.includes(el.id)) return; 
    const storageKey = getStorageKey(el.id);
            if (localStorage[storageKey]) {
      el.value = localStorage[storageKey];
    }
        el.addEventListener("change", () => {
      localStorage[storageKey] = el.value;
    });
  });
});

updateKeyLabels();
switchLang($("testLang").value);
window.addEventListener('load', ()=>{
  subjectIdEl.value=''; subjectAgeEl.value=''; subjectSexEl.value='';
  extraLettersToggle.addEventListener('change', ()=> lettersGrid.style.display = extraLettersToggle.checked ? 'grid' : 'none');
  startBtn.addEventListener('click', startTest);
  resetBtn.addEventListener('click', resetAll);
  openReport.addEventListener('click', ()=> { if(results.length===0) showAlert('No results yet — run a test first'); else { popup.style.display='flex'; renderCharts(); }});
  closePopup.addEventListener('click', ()=> popup.style.display='none');
  csvBtn.addEventListener('click', downloadCSV);
  pdfBtn.addEventListener('click', downloadPDF);
  // saveDefaults.addEventListener('click', saveDefaultsFn);
  targetBtn.addEventListener('click', ()=> simulateKey('target'));
  nonTargetBtn.addEventListener('click', ()=> simulateKey('nontarget'));
  document.addEventListener('keydown', handleKeyDown);
  targetKeyEl.addEventListener('input', updateKeyLabels);
  nonTargetKeyEl.addEventListener('input', updateKeyLabels);
  $("testLang").addEventListener("change",switchLang($("testLang").value))
});

function updateKeyLabels() {
  targetBtn.textContent = `Target (${normKeyName(targetKeyEl.value)})`;
  nonTargetBtn.textContent = `Non-target (${normKeyName(nonTargetKeyEl.value)})`;
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

function getDistractorLetters(){
  let set = ['B'];
  if(extraLettersToggle.checked){
    document.querySelectorAll('.distractorLetter').forEach(ch => { if(ch.checked && !set.includes(ch.value)) set.push(ch.value); });
  }
  return Array.from(new Set(set)).slice(0,6);
}

function generateTrials(isPractice = false){
  const N = isPractice ? TRIAL_RUN_COUNT : (Math.max(1, parseInt(numTrialsEl.value,10) || 30));
  const axRate = Math.max(0, Math.min(0.4, parseFloat(axRateEl.value || 0.2)));
  const distractors = getDistractorLetters();
  const pool = distractors.concat(['Y','Z','M','T']).slice(0,8);
  let arr = new Array(N).fill(null).map(()=>({ letter: pool[Math.floor(Math.random()*pool.length)], expected:false, color:null }));

  let pairs = Math.floor(N * axRate);
  pairs = Math.min(pairs, Math.floor(N/2));
  const taken = new Set();
  let placed=0, attempts=0;
  while(placed < pairs && attempts < pairs*8 + 200){
    attempts++;
    const pos = Math.floor(Math.random()*(N-1));
    if(taken.has(pos) || taken.has(pos+1)) continue;
    arr[pos].letter = 'A'; arr[pos].expected = false;
    arr[pos+1].letter = 'X';
    taken.add(pos); taken.add(pos+1);
    placed++;
  }

  for(let i=0;i<N;i++){
    if(arr[i].letter === 'X' && i>0 && arr[i-1].letter === 'A') arr[i].expected = true;
    else arr[i].expected = false;
  }

  if(colorModeEl.checked){
    for(let i=0;i<arr.length;i++){
      arr[i].color = Math.random() < 0.5 ? 'A' : 'B';
    }
    if(requireAColorEl.checked){
      for(let i=0;i<arr.length;i++){
        if(arr[i].letter === 'X' && i>0 && arr[i-1].letter === 'A' && arr[i-1].color === 'A'){
          arr[i].expected = true;
        } else {
          if(arr[i].letter === 'X') arr[i].expected = false;
        }
      }
    }
  } else {
    arr.forEach(a => a.color = null);
  }
  if(isPractice){ //check later for error
    const hasTarget = arr.some(t => t.expected);
    if(!hasTarget){
      arr[0].letter = 'A'; arr[0].color = 'A';
      arr[1].letter = 'X'; arr[1].expected = true; arr[1].color = 'A';
    }
  }
  return arr.map((t,i) => ({ idx:i+1, letter:t.letter, expected:!!t.expected, color:t.color }));
}

let countdownInterval = null;
function startTest(){
  const sid = subjectIdEl.value.trim();
  if(!sid){ showAlert('Subject ID is required'); return; }
  if(!subjectAgeEl.value){ showAlert('Age is required'); return; }
  if(!subjectSexEl.value){ showAlert('Sex is required'); return; }
  const wantsTrialRun = trialRunCheckbox.checked;
  if(wantsTrialRun && !hasTrialRunCompleted){
    runPracticeSession();
  } else {
    runMainSession();
  }}

async function runPracticeSession() {
  isTrialMode = true;
    hasTrialRunCompleted = true; // Prevents it from running again
  sideBar.style.display = 'none';
  stimDiv.textContent = '';
  startBtn.disabled = true;

  statusEl.textContent = 'Practice Run: Respond to AX pairs only. Press target key for X following A.';
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
    if(isTrialMode){
        isTrialMode = false;
        sideBar.style.display = 'block';
        stimDiv.textContent = '—';
        statusEl.textContent = 'Practice run complete. Press Start Test (Enter) for the main session.';
        startBtn.disabled = false;
        startBtn.focus();
    } else {
        finishTest();
    }
    return;
  }
  stimDiv.textContent="+";
  stimDiv.style.fontWeight="lighter"
  stimDiv.style.color="var(--button-text)";
  stimDiv.style.fontSize="128px";
  setTimeout(()=>{
  stimDiv.style.fontSize=''
  stimDiv.style.fontWeight='';
  const tr = trials[currentIndex];
  stimDiv.textContent = tr.letter;
  if(tr.color === 'A') stimDiv.style.color = colorAEl.value;
  else if(tr.color === 'B') stimDiv.style.color = colorBEl.value;
  else stimDiv.style.color = '';
  statusEl.textContent = `Trial ${currentIndex+1} / ${trials.length}`;
  awaiting = true;
  stimShownAt = performance.now();

  stimTimeout = setTimeout(()=>{
    if(!awaiting) return;
    awaiting = false;
    if(tr.expected){
        if(!isTrialMode){
      omissions++; results.push({ trial:tr.idx, letter:tr.letter, expected:true, keyPressed:'', RT:'', correct:0, note:'Omission' });
        }else {
      // feedback for miss
      beep(380,200);
      stimDiv.textContent = 'Missed'; stimDiv.style.color = '#ef4444';
      setTimeout(()=> stimDiv.textContent = '', 200);
        }
        stimDiv.textContent = '';
    } else {
        if(!isTrialMode){
      correctInhibitions++;
      results.push({ trial:tr.idx, letter:tr.letter, expected:false, keyPressed:'', RT:'', correct:1, note:'Correct Inhibition' });
      } else {
        // feedback for correct inhibition
      stimDiv.style.boxShadow = '0 8px 30px rgba(0,0,0,0.08)';
      setTimeout(()=> stimDiv.style.boxShadow = '', 120);
        }
      stimDiv.textContent = '';
    }
    isiTimeout = setTimeout(()=> { stimDiv.textContent=''; nextTrial(); }, parseInt(isiEl.value,10)-PLUS_TIME);
  }, parseInt(stimTimeEl.value,10));
},PLUS_TIME);
}

function handleKeyDown(e){
  if(popup.style.display === 'flex' || countOverlay.style.display === 'flex' || !awaiting) return;
  const targetKeyName = normKeyName(targetKeyEl.value || 'Space');
  const nonTargetKeyName = normKeyName(nonTargetKeyEl.value || 'N');
  if(keyMatchesEvent(e, targetKeyName)) { processResponse('target'); e.preventDefault(); }
  else if(keyMatchesEvent(e, nonTargetKeyName)) { processResponse('nontarget'); e.preventDefault(); }
}

function simulateKey(which){ if(!awaiting) return; processResponse(which); }

function processResponse(which){
  if(!awaiting) return;
  awaiting = false;
  clearTimeout(stimTimeout);
  const tr = trials[currentIndex];
  const rt = Math.round(performance.now() - stimShownAt);
  let record = { trial: tr.idx, letter: tr.letter, expected:tr.expected, keyPressed: which, RT: rt, correct:0, note:'' };
  if(isTrialMode){
    const isCorrect = (tr.expected && which==='target') || (!tr.expected && which==='nontarget');
    //feedback effects
  stimDiv.style.boxShadow = isCorrect ? '0 8px 40px rgba(16,185,129,0.18)' : '0 8px 40px rgba(239,68,68,0.18)';
  if (!isCorrect) beep(440,150);
  setTimeout(()=> stimDiv.style.boxShadow = '', 160);
  }else{
  if(tr.expected){
    if(which === 'target'){ record.correct = 1; record.note='Correct Target'; correctResponses++; rtList.push(rt); }
    else { record.correct = 0; record.note='Wrong key on Target (Commission)'; commissions++; if(colorModeEl.checked) beep(380,160); }
  } else {
    if(which === 'nontarget'){ record.correct = 1; record.note='Correct Non-target'; correctInhibitions++; }
    else { record.correct = 0; record.note='Commission on Non-target'; commissions++; if(colorModeEl.checked) beep(380,160); }
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
  const rtRecords = results.filter(r => r.RT && r.RT !== '' && r.note && r.note.startsWith('Correct Target'));
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
    `Test Type,AX-CPT`, `Num Trials,${numTrialsEl.value}`, `Stimulus Time,${stimTimeEl.value}`, `ISI,${isiEl.value}`,
    `AX Rate,${axRateEl.value}`, `Color Mode,${colorModeEl.checked}`, `ColorA,${colorAEl.value}`, `ColorB,${colorBEl.value}`,
    `RequireAColor,${requireAColorEl.checked}`, `TargetKey,${targetKeyEl.value}`, `NonTargetKey,${nonTargetKeyEl.value}`
  ].join('\n');
  const hdr = ['trial','letter','color','expected','keyPressed','correct','RT','note'];
  const rows = [meta, '', hdr.join(',')];
  for(const r of results){
    const vals = [r.trial, r.letter, (r.color||''), r.expected?1:0, r.keyPressed, r.correct?1:0, r.RT||'', r.note||'']
      .map(v => { const s = String(v).replace(/"/g,'""'); return (s.includes(',') ? `"${s}"` : s); }).join(',');
    rows.push(vals);
  }
  cachedCsvBlob = new Blob([rows.join('\n')], { type:'text/csv' });
  uploadCsv(cachedCsvBlob, getStandardFileName(sid, 'AX-CPT', 'csv')); // Assuming util.js has this
}

function downloadCSV(){
  if(results.length===0){ showAlert('No results to export'); return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(cachedCsvBlob);
  a.download = `${subjectIdEl.value || 'subject'}_AX-CPT_${new Date().toISOString().slice(0,10)}.csv`;
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
    pdf.setFontSize(18); pdf.setFont('helvetica','bold'); pdf.text('AX-CPT Report', pageW/2, 18, { align:'center' });
    pdf.setFontSize(9); pdf.setFont('helvetica','normal'); pdf.text(`Generated: ${new Date().toLocaleString()}`, pageW/2, 24, { align:'center' });
    pdf.line(margin,28, pageW - margin, 28);
    pdf.setFontSize(12); pdf.setFont('helvetica','bold'); pdf.text('Configuration', margin, y1); y1+=6;
    pdf.setFontSize(10); pdf.setFont('helvetica','normal');
    const cfg = {
        'Subject ID': subjectIdEl.value || '', 'Age': subjectAgeEl.value || '', 'Sex': subjectSexEl.value || '',
        'Test Type': 'AX-CPT', 'Num Trials': numTrialsEl.value, 'Stimulus Time (ms)': stimTimeEl.value, 'ISI (ms)': isiEl.value,
        'AX Rate': axRateEl.value, 'Color Mode': colorModeEl.checked, 'Color A': colorAEl.value, 'Color B': colorBEl.value,
        'Require A Color': requireAColorEl.checked, 'Target Key': targetKeyEl.value, 'Non-target Key': nonTargetKeyEl.value
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

    pdf.save( `${sid}_AX-CPT_${new Date().toISOString().slice(0,10)}.pdf` );
}

function resetAll(){
  clearTimeout(stimTimeout); clearTimeout(isiTimeout); clearInterval(countdownInterval);
  trials=[]; results=[]; currentIndex=-1; awaiting=false;
  stimDiv.textContent='—'; stimDiv.style.color=''; statusEl.textContent='Ready. Configure and press Start Test.'; resultsSummary.style.display='none';
  popup.style.display='none';
  startBtn.disabled = false;
}

function saveDefaultsFn(){
  ['numTrials','stimTime','isi','axRate','targetKey','nonTargetKey'].forEach(k => { if($(k)) localStorage[k] = $(k).value; });
  showAlert('Defaults saved');
}