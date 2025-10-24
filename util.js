/**
 * @file A collection of common utility functions extracted from various cognitive test scripts.
 * This includes helpers for DOM manipulation, user feedback (audio/visual), and data handling.
 */


// A global flag to control logging. It's 'false' by default.
let _APP_DEBUG_MODE = false;

/**
 * Enables debug logging across the application.
 * This function is attached to the 'window' object to make it
 * easily callable from the browser's developer console.
 */
function debugy() {
  _APP_DEBUG_MODE = true;
  // This message will appear to confirm that debug mode is on.
  console.log('%cDebug mode enabled.', 'color: #00ff00; font-weight: bold; font-size: 1.1em;');
  return 'Logging is now active for subsequent operations.';
}

// Attach the function to the window object
window.debugy = debugy;

/**
 * Function to hide the Intruction overlay
 */
function hideInstructions() {
  $("instructions").style.display = "none";
  $('subjectId').focus();
}

// Disable transition, apply saved mode, then restore transition
window.addEventListener("DOMContentLoaded", () => {
  $("modeToggle").addEventListener("click",toggleMode);
  // Temporarily disable transitions
  document.body.style.transition = "none";
  const savedMode = localStorage.getItem("mode");
  const modeToggle = document.getElementById('modeToggle');

  if (savedMode === "light") {
    document.body.classList.add("light");
    if (modeToggle) modeToggle.textContent = "🌞";
  } else {
    document.body.classList.remove("light");
    if (modeToggle) modeToggle.textContent = "🌙";
  }

  // Force reflow and restore transition
  void document.body.offsetHeight; // forces reflow
  document.body.style.transition = "background var(--transition-speed) ease, color var(--transition-speed) ease";
});


/**
 * A shorthand for document.getElementById.
 * @param {string} id The ID of the DOM element to retrieve.
 * @returns {HTMLElement | null} The element with the specified ID, or null if not found.
 */
const $ = (id) => document.getElementById(id);

/**
 * Displays a non-blocking, modern-style alert message on the screen.
 * Assumes the presence of elements with IDs 'modernAlert' and 'modernAlertMessage'.
 * @param {string} message The message to display in the alert.
 */
let _alertTimeout = null;
function showAlert(message) {
  const alertBox = $('modernAlert');
  const alertMessage = $('modernAlertMessage');
  if (!alertBox || !alertMessage) {
    console.error("showAlert requires DOM elements with IDs 'modernAlert' and 'modernAlertMessage'.");
    // Fallback to a standard alert if the modern one isn't available.
    alert(message);
    return;
  }
  clearTimeout(_alertTimeout);
  alertMessage.textContent = message;
  alertBox.classList.add("show");
  _alertTimeout = setTimeout(() => alertBox.classList.remove("show"), 3000);
}

/**
 * Mode Toggle Helper
 * Toggles between light and dark mode by adding/removing a CSS class on the body
 * 
 */
function toggleMode() {
  const modeToggle = $('modeToggle');
if (modeToggle) {
      document.body.classList.toggle("light");
      let isLight=document.body.classList.contains("light")
      modeToggle.textContent = isLight ? "🌞" : "🌙";
      localStorage.setItem("mode", isLight ? "light" : "dark");
  }
}

// --- Audio Feedback ---

/**
 * Global AudioContext for sound generation to avoid creating multiple contexts.
 * @type {AudioContext}
 */
let _audioCtx;

/**
 * Plays a simple sine wave beep sound.
 * @param {number} [freq=440] The frequency of the beep in Hertz.
 * @param {number} [duration=150] The duration of the beep in milliseconds.
 * @param {number} [volume=0.1] The volume of the beep (0.0 to 1.0).
 */
function beep(freq = 440, duration = 150, volume = 0.1) {
  if (!_audioCtx) {
    try {
      _audioCtx = new(window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.error("Web Audio API is not supported in this browser.");
      return;
    }
  }
  const osc = _audioCtx.createOscillator();
  const gain = _audioCtx.createGain();
  osc.connect(gain);
  gain.connect(_audioCtx.destination);
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, _audioCtx.currentTime);
  osc.start();
  osc.stop(_audioCtx.currentTime + duration / 1000);
}


// --- Data & File Helpers ---

/**
 * Generates a standardized filename for data exports.
 * Format: "subjectId-testName_YYYY-MM-DDTHH-mm-ss.ext"
 * @param {string} subjectId The subject's identifier.
 * @param {string} testName The name of the test (e.g., "Stroop", "GoNoGo").
 * @param {string} ext The file extension (e.g., "csv", "pdf").
 * @returns {string} The formatted filename.
 */
function getStandardFileName(subjectId, testName, ext) {
  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const sub = subjectId.trim() || "subject";
  return `${sub}-${testName}_${ts}.${ext}`;
}


// --- Color Utilities ---

/**
 * Calculates the relative luminance of a hex color.
 * Useful for determining color contrast.
 * @param {string} hex The hex color string (e.g., "#ef4444").
 * @returns {number} The luminance value (0 to 1).
 */
function getLuminance(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const a = [r, g, b].map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}

/**
 * Determines whether black or white text is more readable against a given background hex color.
 * @param {string} hex The background hex color string.
 * @returns {string} '#000' (black) or '#fff' (white).
 */
function getContrastTextColor(hex) {
  return getLuminance(hex) > 0.179 ? '#000' : '#fff';
}

// --- Data Upload ---
async function uploadCsv(blob, fileName) {
  const formData = new FormData();
  formData.append('csvFile', blob, fileName);

  try {
    const response = await fetch('./api/upload', {
      method: 'POST',
      body: formData,
    });

    if (_APP_DEBUG_MODE) {
    if (!response.ok) {
      throw new Error(`Server responded with an error: ${response.status}`);
    }
  }
    const result = await response.json();
    
    // MODIFIED: Only log if debug mode is enabled
    if (_APP_DEBUG_MODE) {
      console.log('Upload successful!', result);
    }

    return result;

  } catch (error) {
    // MODIFIED: Only log if debug mode is enabled
    if (_APP_DEBUG_MODE) {
      console.error(`Error uploading ${fileName}:`, error);
    }
    
    // throw error; // Still throw the error so your other code can handle it
  }
}

/**
 * Function to change language
 * @param {string} lang The language code to  switch to (e.g., 'en', 'mr', 'hi ).
 */
function switchLang( lang,flag=false) {
  const langClass ={"en":"lang-en","mr":"lang-mr","hi":"lang-hi"};
  // add hidden class to all language class selectors except the selected one
  Object.values(langClass).forEach( cls => {
    const elements = document.getElementsByClassName(cls);
    for (let el of elements) {
      if (cls === langClass[lang]) {
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    }
  });
  // if(flag)location.reload();

}

/**
 * Generates an array of color objects with stable keys and translated names.
 *
 * @param {string} lang - The language code (e.g., 'en', 'mr', 'hi').
 * @returns {Array<Object>} The array of color objects.
 */
function generateAllColors(lang = 'en') {
  
  // Master list of all color translations
  const colorTranslations = {
    RED:    { en: 'RED',    mr: 'लाल',    hi: 'लाल',    css: '#ef4444' },
    GREEN:  { en: 'GREEN',  mr: 'हिरवा',   hi: 'हरा',     css: '#10b981' },
    BLUE:   { en: 'BLUE',   mr: 'निळा',    hi: 'नीला',    css: '#3b82f6' },
    YELLOW: { en: 'YELLOW', mr: 'पिवळा',  hi: 'पीला',    css: '#f59e0b' },
    PURPLE: { en: 'PURPLE', mr: 'जांभळा',  hi: 'बैंगनी',  css: '#8b5cf6' },
    BROWN:  { en: 'BROWN',  mr: 'तपकिरी',  hi: 'भूरा',     css: '#af623a' },
    ORANGE: { en: 'ORANGE', mr: 'नारंगी',  hi: 'नारंगी',  css: '#fb923c' }
  };

  // Build the array by mapping over the master list
  const allColors = Object.keys(colorTranslations).map(key => {
    const colorData = colorTranslations[key];
    return {
      key: key, // <-- The stable English key (e.Example: 'RED')
      name: colorData[lang] || colorData['en'], // <-- The displayed (translated) name
      css: colorData.css
    };
  });

  return allColors;
}