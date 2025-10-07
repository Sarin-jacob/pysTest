

/* Stroop Export - cloned UI from gng-export with stroop logic
   - orientation multiples of 45° with random option
   - bindings modal for key assignments
   - CSV + PDF report using Chart.js + jsPDF
*/
function hideInstructions() {
  $("instructions").style.display = "none";
//   $("startBtn").style.display = "inline-block";
  $('subjectId').focus();
}

window.addEventListener("load", () => {
  document.querySelectorAll("#sidebar input, #sidebar select").forEach(el => {
    if (["subjectId","subjectAge","subjectSex"].includes(el.id)) return; // skip
    if (localStorage[el.id]) el.value = localStorage[el.id];
    el.addEventListener("change", () => {
      if (!["subjectId","subjectAge","subjectSex"].includes(el.id)) {
        localStorage[el.id] = el.value;
      }
    });
  });
});

// subject fields always blank on refresh
$('subjectId').value = '';
$('subjectAge').value = '';
$('subjectSex').value = '';
$('numColors').value =  '3';


(() => {
  // palette (same as gng-export - choose top N)
  const ALL_COLORS = [
    {name:'RED', css:'#ef4444'},
    {name:'GREEN', css:'#10b981'},
    {name:'BLUE', css:'#3b82f6'},
    {name:'YELLOW', css:'#f59e0b'},
    {name:'PURPLE', css:'#8b5cf6'},
    {name:'BROWN', css:'#af623a'},
    {name:'ORANGE', css:'#fb923c'}
  ];

  // DOM refs
  const subjectIdEl = $('subjectId');
  const subjectAgeEl = $('subjectAge');
  const subjectSexEl = $('subjectSex');
  const numTrialsEl = $('numTrials');
  const stimTimeEl = $('stimTime');
  const isiEl = $('isi');
  const matchPctEl = $('matchPct');
  const matchPctLabel = $('matchPctLabel');
  const respondToEl = $('respondTo');
  const numColorsEl = $('numColors');
  const orientationEl = $('orientation');
  const openBindingsBtn = $('openBindings');
  const bindingsModal = $('bindingsModal');
  const bindingsList = $('bindingsList');
  const closeBindingsBtn = $('closeBindings');
  const loadDefaultsBtn = $('loadDefaults');
  const startBtn = $('startBtn');
  const restartBtn = $('restartBtn');
  const statusEl = $('status');
  const stimEl = $('stimulus');
  const stimWordEl = $('stimWord');
  const keybarEl = $('keybar');
  const resultsSummaryEl = $('resultsSummary');
  const popup = $('popup');
  const closePopupBtn = $('closePopup');
  const csvBtn = $('csvBtn');
  const pdfBtn = $('pdfBtn');
  const rtCanvas = $('rtChart');
  const accCanvas = $('accChart');
  const countsCanvas = $('countsChart');
  const modernAlert = $('modernAlert');
  const modernAlertMessage = $('modernAlertMessage');
  const modeToggle = $("modeToggle");
  const countOverlay = $('countdownOverlay');
  const countNum = $('countdownNum');
  const  openReport = $('openReport');

  // state
  let bindings = {}; // colorName -> key (lowercase)
  let trials = [];
  let currentIndex = -1;
  let awaitingResponse = false;
  let stimulusShownAt = 0;
  let stimTimeout = null;
  let isiTimeout = null;
  let results = []; // per-trial records
  let lastCapturedKey = null;
  let currentBindingCapture = null;
  let rtChart = null;
  let accChart = null;
  let countsChart = null;
  let cachedCsvBlob = null;

  // default bindings loader
  function loadDefaultBindings(n){
    const keys = ['s','d','f','j','k','l','g'];
    bindings = {};
    const sel = ALL_COLORS.slice(0,n);
    sel.forEach((c,i) => bindings[c.name] = keys[i] || String(i+1));
    rebuildKeybar();
  }

  // render keybar
  function rebuildKeybar(){
    keybarEl.innerHTML = '';
    const n = parseInt(numColorsEl.value,10);
    const colors = ALL_COLORS.slice(0,n);
    colors.forEach(c => {
      const el = document.createElement('div');
      el.className = 'key';
      el.dataset.color = c.name;
      // inner
      const kd = document.createElement('div'); kd.className='kbd'; kd.textContent = (bindings[c.name] || '-').toUpperCase();
      const cn = document.createElement('div'); cn.className='colname'; cn.textContent = c.name;
      cn.style.background = c.css;
      cn.style.color = getContrastTextColor(c.css);
      cn.style.padding = '6px 10px';
      cn.style.borderRadius = '8px';
      el.appendChild(kd); el.appendChild(cn);
      keybarEl.appendChild(el);
      //simulate key
    el.addEventListener('click', () => {
    const boundKey = (bindings[c.name] || '').toLowerCase();
    if(boundKey) handleResponseKey(boundKey);
  });
    });
  }

  // bindings modal render
  function renderBindingsList(){
    bindingsList.innerHTML = '';
    const n = parseInt(numColorsEl.value,10);
    const colors = ALL_COLORS.slice(0,n);
    colors.forEach(c => {
      const row = document.createElement('div');
      row.style.display='flex';row.style.justifyContent='space-between';row.style.alignItems='center';
      row.style.padding='8px';row.style.borderRadius='8px';row.style.background='rgba(255,255,255,0.01)';
      const left = document.createElement('div'); left.style.display='flex';left.style.alignItems='center';left.style.gap='10px';
      const sw = document.createElement('div'); sw.style.width='28px';sw.style.height='20px';sw.style.background=c.css;sw.style.borderRadius='6px';
      const lbl = document.createElement('div'); lbl.innerHTML=`<strong>${c.name}</strong><div class="muted" style="font-size:12px">${c.css}</div>`;
      left.appendChild(sw); left.appendChild(lbl);
      const right = document.createElement('div'); right.style.display='flex';right.style.alignItems='center';right.style.gap='8px';
      const keyDisplay = document.createElement('div'); keyDisplay.style.minWidth='80px'; keyDisplay.style.padding='6px 8px'; keyDisplay.style.borderRadius='8px';
      keyDisplay.style.background='rgba(0,0,0,0.08)'; keyDisplay.textContent = (bindings[c.name]||'[not set]').toUpperCase();
      const setBtn = document.createElement('button'); setBtn.className='btn'; setBtn.textContent='Set';
      setBtn.onclick = () => {
        currentBindingCapture = c.name;
        lastCapturedKey = null;
        // show temporary change
        keyDisplay.textContent = 'Press key → Enter';
        keyDisplay.style.background='rgba(16,185,129,0.08)';
        keyDisplay.style.fontWeight='700';
        // focus to document for key capture
      };
      right.appendChild(keyDisplay); right.appendChild(setBtn);
      row.appendChild(left); row.appendChild(right);
      bindingsList.appendChild(row);
    });
  }

  // normalize key
  function normKey(k){
    if(!k) return '';
    if(k.length === 1) return k.toLowerCase();
    return k.toLowerCase();
  }

  // generate trials
  function generateTrials(){
    const N = Math.max(1, parseInt(numTrialsEl.value,10) || 30);
    const nColors = Math.max(2, Math.min(ALL_COLORS.length, parseInt(numColorsEl.value,10)));
    const matchPct = parseInt(matchPctEl.value,10);
    const colors = ALL_COLORS.slice(0,nColors);
    const orientOpt = orientationEl.value; // 'random' or degree
    const trialsArr = [];
    for(let i=0;i<N;i++){
      const isMatch = Math.random()*100 < matchPct;
      // pick displayed word (a color name) and ink color
      let wordObj = colors[Math.floor(Math.random()*colors.length)];
      let inkObj;
      if(isMatch){
        inkObj = wordObj;
      } else {
        const others = colors.filter(c=>c.name!==wordObj.name);
        inkObj = others[Math.floor(Math.random()*others.length)];
      }
      // orientation
      let angle = 0;
      if(orientOpt === 'random'){
        const multiples = [0,45,90,135,180,225,270,315];
        angle = multiples[Math.floor(Math.random()*multiples.length)];
      } else {
        angle = parseInt(orientOpt,10) || 0;
      }
      // saved
      trialsArr.push({
        idx: i+1,
        word: wordObj.name,
        wordCSS: wordObj.css,
        ink: inkObj.name,
        inkCSS: inkObj.css,
        isMatch,
        angle
      });
    }
    return trialsArr;
  }

  // show stimulus
  function showStim(tr){
    stimWordEl.textContent = tr.word;
    stimWordEl.style.color = tr.inkCSS;
    stimWordEl.style.transform = `rotate(${tr.angle}deg)`;
    // center and style
    stimulusShownAt = performance.now();
    awaitingResponse = true;
    // set timeout for omission
    stimTimeout = setTimeout(()=>{
      if(awaitingResponse){
        awaitingResponse = false;
        // omission
        results.push({
          trial: tr.idx,
          word: tr.word,
          ink: tr.ink,
          angle: tr.angle,
          keyPressed: '',
          correctKey: bindings[(respondToEl.value === 'color') ? tr.ink : tr.word] || '',
          correct: 0,
          RT: ''
        });
        // show missed briefly
        stimWordEl.textContent = 'Missed';
        stimWordEl.style.color = '#ef4444';
        setTimeout(()=>{ stimWordEl.textContent=''; }, 220);
        isiTimeout = setTimeout(()=> nextTrial(), parseInt(isiEl.value,10));
      }
    }, parseInt(stimTimeEl.value,10));
  }

  // next trial
  function nextTrial(){
    currentIndex++;
    clearTimeout(stimTimeout); clearTimeout(isiTimeout);
    stimWordEl.style.transform = 'rotate(0deg)';
    stimWordEl.style.color = 'var(--muted)';
    if(currentIndex >= trials.length){
      endTest();
      return;
    }
    const tr = trials[currentIndex];
    statusEl.textContent = `Trial ${currentIndex+1} / ${trials.length}`;
    // small blank then show
    setTimeout(()=> showStim(tr), 120);
  }

  // handle response (key press)
  function handleResponseKey(key){
    key = normKey(key);
    if(!awaitingResponse) return;
    awaitingResponse = false;
    clearTimeout(stimTimeout);
    const tr = trials[currentIndex];
    const rt = Math.round(performance.now() - stimulusShownAt);
    const expectedName = (respondToEl.value === 'color') ? tr.ink : tr.word;
    const correctKey = (bindings[expectedName] || '').toLowerCase();
    const pressedIsCorrect = (key === correctKey);
    // find pressed color(s) if any
    // add result
    results.push({
      trial: tr.idx,
      word: tr.word,
      ink: tr.ink,
      angle: tr.angle,
      keyPressed: key || '',
      correctKey: correctKey || '',
      correct: pressedIsCorrect ? 1 : 0,
      RT: pressedIsCorrect ? rt : rt
    });

    // visual flash on keybar
    highlightKeyByKey(key);

    // feedback effects
    if(pressedIsCorrect){
      stimWordEl.style.boxShadow = '0 8px 40px rgba(16,185,129,0.18)';
    } else {
      stimWordEl.style.boxShadow = '0 8px 40px rgba(239,68,68,0.18)';
      beep(400,160);
    }
    setTimeout(()=> stimWordEl.style.boxShadow = '', 160);

    // proceed after ISI
    isiTimeout = setTimeout(()=> nextTrial(), parseInt(isiEl.value,10));
  }

  // highlight keybar element by pressed key string
  function highlightKeyByKey(k){
    const pressKeys = Object.keys(bindings).filter(n => (bindings[n]||'').toLowerCase() === k);
    Array.from(keybarEl.children).forEach(el=>{
      el.classList.remove('pressed');
      if(pressKeys.includes(el.dataset.color)){
        el.classList.add('pressed');
        setTimeout(()=> el.classList.remove('pressed'), 220);
      }
    });
  }

  // start test with countdown overlay centered
let countdownInterval = null;

  // start test
  function startTest(){
    // validate subject info
    const sid = subjectIdEl.value.trim();
    if(!sid){ showAlert('Subject ID is required'); return; }
    if(!subjectAgeEl.value){ showAlert('Age is required'); return; }
    if(!subjectSexEl.value){ showAlert('Sex is required'); return; }

    // validate bindings
    const neededColors = ALL_COLORS.slice(0, parseInt(numColorsEl.value,10)).map(c=>c.name);
    const missing = neededColors.filter(c=>!(bindings[c]));
    if(missing.length){
      showAlert('Please set key bindings for all colors before starting.');
      openBindings();
      return;
    }

    // reset
    results = []; currentIndex = -1;
    trials = generateTrials();

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

  function endTest(){
    startBtn.disabled = false;
    statusEl.textContent = 'Finished';
    stimWordEl.textContent = '—';
    // show summary
    showSummary();
    // enable popup/report button
    // popup.style.display = 'flex'; //dont show automatically
    popup.style.alignItems = 'center';
    popup.style.justifyContent = 'center';
    // Render charts
    renderCharts(); 
    generateCSV();
  }

  // show summary on page
  function showSummary(){
    const correctCount = results.filter(r=>r.correct).length;
    const omissions = results.filter(r=>r.keyPressed === '').length;
    const commissions = results.filter(r=>r.keyPressed && !r.correct).length;
    const rtList = results.filter(r=>r.RT).map(r=>Number(r.RT));
    const meanRT = rtList.length ? Math.round(rtList.reduce((a,b)=>a+b,0)/rtList.length) : '-';
    resultsSummaryEl.style.display = 'none'; //hide summary was block
    resultsSummaryEl.innerHTML = `
      <div style="background:linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01));padding:12px;border-radius:10px">
        <strong>Summary</strong>
        <div class="muted">Trials: ${results.length}</div>
        <div>Mean RT (correct): <strong>${meanRT} ms</strong></div>
        <div>Correct: <strong>${correctCount}</strong> | Omissions: <strong>${omissions}</strong> | Commissions: <strong>${commissions}</strong></div>
      </div>
    `;
  }

    // Dark/Light mode toggle
    modeToggle.addEventListener("click", () => {
      document.body.classList.toggle("light");
      modeToggle.textContent = document.body.classList.contains("light") ? "🌞" : "🌙";
    });
  function generateCSV(){
  const sid = subjectIdEl.value.trim() || 'subject';
    const hdr = ['trial','word','ink','angle','keyPressed','correctKey','correct','RT'];
    const rows = [hdr.join(',')];
    for(const r of results){
      const vals = hdr.map(h => {
        const v = (r[h] === undefined || r[h] === null) ? '' : String(r[h]);
        return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g,'""')}"` : v;
      }).join(',');
      rows.push(vals);
    }
    // add metadata at top
    const meta = [
      `Subject ID,${sid}`,
      `Age,${subjectAgeEl.value||''}`,
      `Sex,${subjectSexEl.value||''}`,
      `NUM_TRIALS,${numTrialsEl.value}`,
      `STIMULUS_TIME,${stimTimeEl.value}`,
      `ISI,${isiEl.value}`,
      `MatchPct,${matchPctEl.value}`,
      `NUM_COLORS,${numColorsEl.value}`,
      `RespondTo,${respondToEl.value}`,
      `Orientation,${orientationEl.value}`,
    ].join('\n');
    const csv = meta + '\n\n' + rows.join('\n');
    cachedCsvBlob = new Blob([csv], {type:'text/csv'});
    uploadCsv(cachedCsvBlob, getStandardFileName(sid, 'Stroop', 'csv'));
  }
  // CSV download
  function downloadCSV(){
    if(results.length === 0){ showAlert('No results to export'); return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(cachedCsvBlob);
    a.download = getStandardFileName(subjectIdEl.value, 'Stroop', 'csv');
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(a.href);
  }

  // PDF generation using jsPDF - two pages: cover + charts
 async function downloadPDF() {
    if (results.length === 0) {
        showAlert('No results to export');
        return;
    }
    await renderCharts(true); // Ensure charts are ready

    const { jsPDF } = window.jspdf;
    // Initialize PDF in A4 size with mm as units
    const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
    });

    // --- 1. Layout & Page Setup ---
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 15;
    const gutter = 10; // Space between columns
    const colWidth = (pageWidth - (margin * 2) - gutter) / 2;
    const col1_x = margin;
    const col2_x = margin + colWidth + gutter;
    let y = 0; // Global Y-position tracker

    // --- 2. Report Header ---
    const now = new Date();
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(18);
    pdf.text('Stroop Test Report', pageWidth / 2, 20, { align: 'center' });

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(100);
    pdf.text(`Generated on: ${now.toLocaleString()}`, pageWidth / 2, 27, { align: 'center' });

    pdf.setLineWidth(0.5);
    pdf.line(margin, 32, pageWidth - margin, 32);

    // Set starting Y position for columns
    y = 40;
    let y_col1 = y;
    let y_col2 = y;

    // --- 3. Left Column (Test Data) ---

    // Configuration Section
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.text('Test Configuration', col1_x, y_col1);
    y_col1 += 8;

    const configData = {
        'Subject ID': subjectIdEl.value,
        'Age': subjectAgeEl.value,
        'Sex': subjectSexEl.value,
        'Number of Trials': numTrialsEl.value,
        'Stimulus Time (ms)': stimTimeEl.value,
        'ISI (ms)': isiEl.value,
        'Match %': matchPctEl.value,
        'Respond To': respondToEl.value,
        'Number of Colors': numColorsEl.value,
        'Orientation': orientationEl.value,
    };

    pdf.setFontSize(10);
    for (const [label, value] of Object.entries(configData)) {
        pdf.setFont('helvetica', 'bold');
        pdf.text(label + ':', col1_x, y_col1, { maxWidth: colWidth });
        pdf.setFont('helvetica', 'normal');
        pdf.text(String(value), col1_x + 45, y_col1, { maxWidth: colWidth - 45 });
        y_col1 += 6;
    }

    // Performance Summary Section
    y_col1 += 5;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.text('Performance Summary', col1_x, y_col1);
    y_col1 += 8;
    
    // Calculate summary stats from the 'results' array
    const rtList = results.filter(r => r.RT && r.correct).map(r => Number(r.RT));
    const meanRT = rtList.length ? (rtList.reduce((a, b) => a + b, 0) / rtList.length).toFixed(2) : "N/A";
    const correctCount = results.filter(r => r.correct).length;
    const omissions = results.filter(r => r.keyPressed === '').length;
    const commissions = results.filter(r => r.keyPressed && !r.correct).length;

    const summaryData = {
        'Avg. Reaction Time': `${meanRT} ms`,
        'Correct Responses': correctCount,
        'Omissions': omissions,
        'Commissions': commissions,
    };

    pdf.setFontSize(10);
    for (const [label, value] of Object.entries(summaryData)) {
        pdf.setFont('helvetica', 'bold');
        pdf.text(label + ':', col1_x, y_col1);
        pdf.setFont('helvetica', 'normal');
        pdf.text(String(value), col1_x + 45, y_col1);
        y_col1 += 6;
    }

    // Metrics Explained Section
    y_col1 += 5;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.text('Metrics Explained', col1_x, y_col1);
    y_col1 += 6;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(80);
    pdf.text("Omissions: Failing to respond to a stimulus within the allowed time.", col1_x, y_col1, { maxWidth: colWidth });
    y_col1 += 8;
    pdf.text("Commissions: Responding with the wrong key for a given stimulus.", col1_x, y_col1, { maxWidth: colWidth });

    // --- 4. Right Column (Charts) ---
    const rtImg = rtCanvas.toDataURL("image/png");
    const accImg = accCanvas.toDataURL("image/png");
    const countsImg = countsCanvas.toDataURL("image/png");

    const graphWidth = colWidth;
    const graphHeight = graphWidth / 2; // Maintain 2:1 aspect ratio

    // Reaction Time Chart
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.text("Reaction Time Chart", col2_x, y_col2);
    y_col2 += 6;
    pdf.addImage(rtImg, "PNG", col2_x, y_col2, graphWidth, graphHeight);
    y_col2 += graphHeight + 10;

    // Accuracy Chart
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.text("Accuracy by Color", col2_x, y_col2);
    y_col2 += 6;
    pdf.addImage(accImg, "PNG", col2_x, y_col2, graphWidth, graphHeight);
    y_col2 += graphHeight + 10;
    
    // Response Counts Chart
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.text("Response Counts by Color", col2_x, y_col2);
    y_col2 += 6;
    pdf.addImage(countsImg, "PNG", col2_x, y_col2, graphWidth, graphHeight);

    // --- 5. Footer ---
    const pageCount = pdf.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        pdf.setPage(i);
        pdf.setFontSize(9);
        pdf.setTextColor(150);
        const footerText = `Page ${i} of ${pageCount} | Stroop Test Report`;
        pdf.text(footerText, pageWidth / 2, pageHeight - 10, { align: 'center' });
    }

    // --- 6. Save the PDF ---
    const sid = subjectIdEl.value.trim() || 'subject';
    pdf.save(getStandardFileName(sid, 'Stroop', 'pdf'));
}

  // charts rendering (Chart.js)
// MODIFIED RENDERCHARTS TO DISABLE ANIMATIONS ON DEMAND
async function renderCharts(disableAnimation = false) {
    const animationOption = disableAnimation ? { animation: false } : {};

    // --- Chart 1: Reaction Time ---
    const rtList = results.filter(r => r.RT && r.correct).map((r, i) => r.RT);
    const rtLabels = rtList.map((_, i) => `#${i+1}`);
    if (rtChart) rtChart.destroy();
    rtChart = new Chart(rtCanvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: rtLabels,
            datasets: [{
                label: 'RT (ms) - correct',
                data: rtList,
                borderColor: '#3b82f6',
                fill: false
            }]
        },
        options: {
            ...animationOption, // Add this
            responsive: false,
            plugins: {
                title: { display: true, text: 'Reaction Time (Correct Trials)', font: { size: 16 } },
                legend: { display: false }
            },
            scales: { y: { title: { display: true, text: 'RT (ms)' } } }
        }
    });

    // --- Data Prep ---
    const mode = respondToEl.value;
    const usedColors = ALL_COLORS.slice(0, parseInt(numColorsEl.value, 10));
    const colorNames = usedColors.map(c => c.name);

    // --- Chart 2: Accuracy by Color ---
    const accuracyData = colorNames.map(name => {
        const colorResults = results.filter(r => ((mode === 'color') ? r.ink : r.word) === name);
        const correctCount = colorResults.filter(r => r.correct === 1).length;
        const totalCount = colorResults.length;
        return totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;
    });

    if (accChart) accChart.destroy();
    accChart = new Chart(accCanvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: colorNames,
            datasets: [{
                label: 'Accuracy %',
                data: accuracyData,
                backgroundColor: usedColors.map(c => c.css)
            }]
        },
        options: {
            ...animationOption, // Add this
            responsive: false,
            plugins: {
                title: { display: true, text: 'Accuracy by Color', font: { size: 16 } },
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    title: { display: true, text: 'Accuracy (%)' }
                }
            }
        }
    });

    // --- Chart 3: Response Counts by Color ---
    const countLabels = ['Correct', 'Omissions', 'Commissions'];
    const colorCountDatasets = usedColors.map(color => {
        const colorResults = results.filter(r => ((mode === 'color') ? r.ink : r.word) === color.name);
        const correctCount = colorResults.filter(r => r.correct === 1).length;
        const commissionCount = colorResults.filter(r => r.correct === 0 && r.keyPressed !== '').length;
        const omissionCount = colorResults.filter(r => r.keyPressed === '').length;
        return {
            label: color.name,
            data: [correctCount, commissionCount, omissionCount],
            backgroundColor: color.css
        };
    });

    if (countsChart) countsChart.destroy();
    countsChart = new Chart(countsCanvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: countLabels,
            datasets: colorCountDatasets
        },
        options: {
            ...animationOption, // Add this
            responsive: false,
            plugins: {
                title: { display: true, text: 'Response Counts by Color', font: { size: 16 } },
                legend: { display: true }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: true, text: 'Count' },
                    ticks: { stepSize: 1 }
                }
            }
        }
    });

    return Promise.resolve();
}

  // keyboard handlers
  document.addEventListener('keydown', (ev)=>{
    // binding capture flow
    if(bindingsModal.style.display === 'flex' && currentBindingCapture){
      ev.preventDefault();
      if(ev.key === 'Enter'){
        if(lastCapturedKey){
          bindings[currentBindingCapture] = lastCapturedKey;
          currentBindingCapture = null;
          lastCapturedKey = null;
          renderBindingsList();
          rebuildKeybar();
        }
      } else if(ev.key === 'Escape'){
        currentBindingCapture = null; lastCapturedKey = null; renderBindingsList();
      } else {
        lastCapturedKey = normKey(ev.key);
        // update visible preview
        const rows = bindingsList.children;
        for(const row of rows){
          const strong = row.querySelector('strong');
          if(strong && strong.textContent === currentBindingCapture){
            const disp = row.querySelectorAll('div')[1].querySelector('div') || row.querySelectorAll('div')[1];
            if(disp) disp.textContent = lastCapturedKey.toUpperCase();
            break;
          }
        }
      }
      return;
    }
    // if bindings modal open and not capturing - ignore test keys
    if(bindingsModal.style.display === 'flex') return;

    // If test running and awaiting response
    if(awaitingResponse && trials.length && currentIndex >= 0){
      handleResponseKey(ev.key);
    }
  });

  // UI wiring
  openBindingsBtn.addEventListener('click', ()=> openBindings());
  closeBindingsBtn.addEventListener('click', ()=> closeBindings());
  // loadDefaultsBtn.addEventListener('click', ()=> { loadDefaultBindings(parseInt(numColorsEl.value,10)); renderBindingsList(); });
  numColorsEl.addEventListener('change', ()=> { loadDefaultBindings(parseInt(numColorsEl.value,10)); rebuildKeybar(); renderBindingsList(); });
  matchPctEl.addEventListener('input', ()=> { matchPctLabel.textContent = matchPctEl.value + '%'; });
  startBtn.addEventListener('click', startTest);
  openReport.addEventListener('click', ()=> { if(results.length===0) showAlert('No results yet — run a test first'); else { popup.style.display='flex'; renderCharts(); }});
  restartBtn.addEventListener('click', ()=> location.reload());
  csvBtn.addEventListener('click', downloadCSV);
  pdfBtn.addEventListener('click', downloadPDF);
  closePopupBtn.addEventListener('click', ()=> popup.style.display='none');

  // keybar click to simulate
  keybarEl.addEventListener('click', (ev)=>{
    const el = ev.target.closest('.key');
    if(!el) return;
    const color = el.dataset.color;
    const k = bindings[color];
    // if test running and awaiting response, treat as response
    if(awaitingResponse) handleResponseKey(k);
    else { el.classList.add('pressed'); setTimeout(()=>el.classList.remove('pressed'),160); }
  });

  // open/close bindings
  function openBindings(){
    renderBindingsList();
    bindingsModal.style.display = 'flex';
    bindingsModal.style.alignItems = 'center';
    bindingsModal.style.justifyContent = 'center';
    currentBindingCapture = null; lastCapturedKey = null;
  }
  function closeBindings(){
    bindingsModal.style.display = 'none';
    currentBindingCapture = null; lastCapturedKey = null;
  }

  // set up initial defaults
  function init(){
    // fill defaults same as gng-export defaults
    numTrialsEl.value = 30;
    stimTimeEl.value = 1500;
    isiEl.value = 800;
    numColorsEl.value = 3;
    orientationEl.value = '0';
    matchPctEl.value = 50;
    matchPctLabel.textContent = '50%';
    respondToEl.value = 'color';
    loadDefaultBindings(parseInt(numColorsEl.value,10));
    rebuildKeybar();
    renderBindingsList();
  }

  // expose some functions for debugging
  window._stroop = { startTest, generateTrials, bindings, getResults: ()=>results };

  init();

})();