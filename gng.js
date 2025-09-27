
// DOM refs
const subjectIdEl = $('subjectId'), subjectAgeEl = $('subjectAge'), subjectSexEl = $('subjectSex');
const numTrialsEl = $('numTrials'), stimTimeEl = $('stimTime'), isiEl = $('isi');
const goProbEl = $('goProb'), textureToggleEl = $('textureToggle');
const goColorEl = $('goColor'), nogoColorEl = $('nogoColor');
const startBtn = $('startBtn'), showReportBtn = $('showReportBtn');
const stimulusDiv = $('stimulus'), statusEl = $('status'), resultsSummary = $('resultsSummary');
const popup = $('popup'), csvBtn = $('csvBtn'), pdfBtn = $('pdfBtn');
const rtCanvas = $('rtChart'), perfCanvas = $('perfChart');
const instructionsDiv = $('instructions'), modeToggle = $('modeToggle');
const countdownOverlay = $('countdownOverlay'), countdownNum = $('countdownNum');

let trial, config, results, subjectId;
let currentStimulus = null;
let stimulusOnset = null;
let responseMade = false;
let cachedCsvBlob = null;
let countdownInterval;
let trialLogs = [];
let trialActive = false;
let rtChart, perfChart;
const testName = "GoNoGo";

// Initial setup
window.addEventListener('load', () => {
    subjectIdEl.value = ''; subjectAgeEl.value = ''; subjectSexEl.value = '';
    startBtn.addEventListener("click", startTest);
    showReportBtn.addEventListener("click", showReport);
    csvBtn.addEventListener("click", downloadCSV);
    pdfBtn.addEventListener("click", downloadPDF);
    document.addEventListener("keydown", handleKeydown);
    $('main').addEventListener("pointerdown", () => { if (trialActive) handleKeydown({ type: "click" }); }, {passive:true});
    modeToggle.addEventListener("click", () => {
      document.body.classList.toggle("light");
      modeToggle.textContent = document.body.classList.contains("light") ? "🌞" : "🌙";
    });
});

function hideInstructions() {
  instructionsDiv.style.display = "none";
  subjectIdEl.focus();
}
function closePopup() {
  popup.style.display = "none";
}
function getConfig() {
  return {
    AGE: parseInt(subjectAgeEl.value), 
    SEX: subjectSexEl.value,
    NUM_TRIALS: parseInt(numTrialsEl.value),
    STIMULUS_TIME: parseInt(stimTimeEl.value),
    ISI: parseInt(isiEl.value),
    GO_PROBABILITY: parseFloat(goProbEl.value),
    TEXTURE: textureToggleEl.checked,
    GO_COLOR: goColorEl.value,
    NOGO_COLOR: nogoColorEl.value,
  };
}

function startTest() {
  subjectId = subjectIdEl.value.trim();
  if (!subjectId) { showAlert("Subject ID is required!"); return; }
  if (!subjectAgeEl.value) { showAlert("Age is required!"); return; }
  if (!subjectSexEl.value) { showAlert("Sex is required!"); return; }
  
  config = getConfig();
  trial = 0;
  results = { reactionTimes: [], omissions: 0, correctInhibitions: 0, commissions: 0, correctResponses: 0 };
  trialLogs = []; 
  resultsSummary.style.display = 'none';
  startBtn.disabled = true;

  let count = 3;
  countdownNum.textContent = count;
  countdownOverlay.style.display = 'flex';
  countdownInterval = setInterval(() => {
    count--;
    if (count <= 0) {
      clearInterval(countdownInterval);
      countdownOverlay.style.display = 'none';
      statusEl.textContent = 'Running...';
      nextTrial();
    } else {
      countdownNum.textContent = count;
    }
  }, 1000);
}

function nextTrial() {
  if (trial >= config.NUM_TRIALS) { endTest(); return; }
  trial++;
  responseMade = false;
  trialActive = true;
  statusEl.textContent = `Trial ${trial} / ${config.NUM_TRIALS}`;

  currentStimulus = (Math.random() < config.GO_PROBABILITY) ? "GO" : "NOGO";
  showStimulus(currentStimulus === "GO");
  stimulusOnset = performance.now();

  setTimeout(() => {
    if (!trialActive) return;
    trialActive = false;
    stimulusDiv.textContent = "";

    if (currentStimulus === "GO" && !responseMade) {
      results.omissions++;
      beep(400, 200);
      stimulusDiv.innerHTML = `<span style="color:red;font-size:48px;">❌ Missed!</span>`;
      trialLogs.push({ trial, stimulus: "GO", responded: false, rt: "", outcome: "Omission" });
      setTimeout(() => { stimulusDiv.textContent = ""; setTimeout(nextTrial, config.ISI); }, 300);
    } else if (currentStimulus === "NOGO" && !responseMade) {
      results.correctInhibitions++;
      trialLogs.push({ trial, stimulus: "NOGO", responded: false, rt: "", outcome: "Correct Inhibition" });
      setTimeout(nextTrial, config.ISI);
    }
  }, config.STIMULUS_TIME);
}

function showStimulus(isGo) {
  if (config.TEXTURE) {
    stimulusDiv.classList.remove("big");
    stimulusDiv.innerHTML = isGo 
      ? `<span style="color:${config.GO_COLOR};">✔</span>` 
      : `<span style="color:${config.NOGO_COLOR};">✘</span>`;
  } else {
    stimulusDiv.classList.add("big");
    stimulusDiv.innerHTML = isGo 
      ? `<span style="color:${config.GO_COLOR};">●</span>` 
      : `<span style="color:${config.NOGO_COLOR};">●</span>`;
  }
}

function handleKeydown(e) {
  if (!stimulusOnset || !trialActive || responseMade) return;
  responseMade = true;
  trialActive = false;
  let rt = Math.round(performance.now() - stimulusOnset);
  stimulusDiv.textContent = "";

  if (currentStimulus === "GO") {
    results.reactionTimes.push(rt);
    results.correctResponses++;
    trialLogs.push({ trial, stimulus: "GO", responded: true, rt: rt, outcome: "Correct" });
    setTimeout(nextTrial, config.ISI);
  } else if (currentStimulus === "NOGO") {
    results.commissions++;
    beep(400, 200);
    stimulusDiv.innerHTML = `<span style="color:red;font-size:48px;">❌ Error!</span>`;
    trialLogs.push({ trial, stimulus: "NOGO", responded: true, rt: rt, outcome: "Commission" });
    setTimeout(() => { stimulusDiv.textContent = ""; setTimeout(nextTrial, config.ISI); }, 300);
  }
}

function endTest() {
  stimulusDiv.textContent = "—";
  startBtn.disabled = false;
  statusEl.textContent = "Finished";
  renderSummary();
//   showReport(); //hide dont open unless clicked 
generateCSV(); //pre-generate CSV for download/upload
}

function renderSummary() {
    const avgRT = results.reactionTimes.length
      ? (results.reactionTimes.reduce((a,b) => a+b, 0) / results.reactionTimes.length).toFixed(2)
      : "N/A";
    resultsSummary.style.display = "none"; //hide summary was block
    resultsSummary.innerHTML = `
      <div style="background:linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01));padding:12px;border-radius:10px">
        <strong>Summary</strong>
        <div>Avg RT: <strong>${avgRT} ms</strong> | Correct: <strong>${results.correctResponses}</strong> | Omissions: <strong>${results.omissions}</strong> | Commissions: <strong>${results.commissions}</strong></div>
      </div>
    `;
}

function showReport() {
  if (!trialLogs.length) { showAlert('No results yet - run a test first'); return; }
  popup.style.display = "flex";
  if (rtChart) rtChart.destroy();
  if (perfChart) perfChart.destroy();

  rtChart = new Chart(rtCanvas, {
    type: 'line', data: { labels: results.reactionTimes.map((_,i) => `T${i+1}`), datasets: [{ label: "RT (ms)", data: results.reactionTimes, borderColor: "#3b82f6", fill: false }] },
    options: { plugins: { title: { display: true, text: 'Reaction Time (Correct)', font: { size: 14 } }, legend: { display: false } }, scales: { y: { title: { display: true, text: 'RT (ms)' } } } }
  });

  perfChart = new Chart(perfCanvas, {
    type: 'bar', data: { labels: ["Correct", "Omissions", "Correct Inhibitions", "Commissions"], datasets: [{ label: "Count", data: [results.correctResponses, results.omissions, results.correctInhibitions, results.commissions], backgroundColor: ["#16a34a","#f97316","#3b82f6","#ef4444"] }] },
    options: { plugins: { title: { display: true, text: 'Performance Summary', font: { size: 14 } }, legend: { display: false } }, scales: { y: { beginAtZero: true, title: { display: true, text: 'Count' }, ticks: { stepSize: 1 } } } }
  });
}

function generateCSV() {
          let csv = `Subject ID,${subjectId}\n`;
      csv += `Age,${config.AGE}\n`;
      csv += `Sex,${config.SEX}\n`;
      csv += `Num Trials,${config.NUM_TRIALS}\nStimulus Time,${config.STIMULUS_TIME}\nISI,${config.ISI}\nGo Probability,${config.GO_PROBABILITY}\nUse Texture,${config.TEXTURE}\n`;
      csv += `Summary,,,\n`;
      csv += `Correct Responses,${results.correctResponses}\n`;
      csv += `Omissions,${results.omissions}\n`;
      csv += `Correct Inhibitions,${results.correctInhibitions}\n`;
      csv += `Commissions,${results.commissions}\n\n`;
      csv += "Trial,Stimulus,Responded,RT_ms,Outcome\n";
       trialLogs.forEach(t => {
          csv += `${t.trial},${t.stimulus},${t.responded ? 1 : 0},${t.rt},${t.outcome}\n`;
        });
      cachedCsvBlob = new Blob([csv], {type:"text/csv"});
      uploadCsv(cachedCsvBlob, getStandardFileName(subjectId, testName, "csv"))
}

    function downloadCSV() {
      if (!trialLogs.length) { showAlert('No results to export'); return; }
      const link = document.createElement("a");
      link.href = URL.createObjectURL(cachedCsvBlob);
      link.download = getStandardFileName(subjectId, testName, "csv");
      link.click();
    }

async function downloadPDF() {
    if (!trialLogs.length) { showAlert('No results to export'); return; }
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth(), margin=12, colW=(pageW-margin*2-8)/2;
    const pageHeight = pdf.internal.pageSize.getHeight();
    let y1=36, y2=36;

    pdf.setFontSize(18); pdf.setFont('helvetica','bold'); pdf.text('Go/No-Go Report', pageW/2, 18, { align:'center' });
    pdf.setFontSize(9); pdf.setFont('helvetica','normal'); pdf.text(`Generated: ${new Date().toLocaleString()}`, pageW/2, 24, { align:'center' });
    pdf.line(margin, 28, pageW - margin, 28);
    
    // Left: Config
    pdf.setFontSize(12); pdf.setFont('helvetica','bold'); pdf.text('Configuration', margin, y1); y1+=6;
    pdf.setFontSize(10); pdf.setFont('helvetica','normal');
    const cfg = { 'Subject ID': subjectId, 'Age': config.AGE, 'Sex': config.SEX, 'Num Trials': config.NUM_TRIALS, 'Stimulus Time (ms)': config.STIMULUS_TIME, 'ISI (ms)': config.ISI, 'Go Probability': config.GO_PROBABILITY };
    for(const [k,v] of Object.entries(cfg)){ pdf.setFont('helvetica','bold'); pdf.text(k+':', margin, y1); pdf.setFont('helvetica','normal'); pdf.text(String(v), margin + 58, y1); y1 += 6; }
    
    // Left: Summary
    y1 += 4; pdf.setFont('helvetica','bold'); pdf.text('Performance Summary', margin, y1); y1+=6;
    const avgRT = results.reactionTimes.length? (results.reactionTimes.reduce((a,b) => a+b,0)/results.reactionTimes.length).toFixed(2) : 'N/A';
    const summ = {'Mean RT (ms)': avgRT, 'Correct Responses': results.correctResponses, 'Omissions': results.omissions, 'Correct Inhibitions': results.correctInhibitions, 'Commissions': results.commissions};
    for(const [k,v] of Object.entries(summ)){ pdf.setFont('helvetica','bold'); pdf.text(k+':', margin, y1); pdf.setFont('helvetica','normal'); pdf.text(String(v), margin + 58, y1); y1 += 6; }

    // Right: Charts
    const rtImg = rtCanvas.toDataURL('image/png'); const perfImg = perfCanvas.toDataURL('image/png');
    const imgW = colW; const imgH = imgW * 0.55;
    pdf.setFont('helvetica','bold'); pdf.text('Reaction Time Chart', margin + colW + 8, y2); y2 += 6;
    pdf.addImage(rtImg, 'PNG', margin + colW + 8, y2, imgW, imgH); y2 += imgH + 8;
    pdf.setFont('helvetica','bold'); pdf.text('Performance Chart', margin + colW + 8, y2); y2 += 6;
    pdf.addImage(perfImg, 'PNG', margin + colW + 8, y2, imgW, imgH);
    
      // --- 5. Footer ---
  const pageCount = pdf.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    pdf.setPage(i);
    pdf.setFontSize(9);
    pdf.setTextColor(150);
    const footerText = `Page ${i} of ${pageCount} | Go/No-Go Test Report`;
    pdf.text(footerText, pageW / 2, pageHeight - 10, { align: 'center' });
  }


    pdf.save(getStandardFileName(subjectId, testName, "pdf"));
}