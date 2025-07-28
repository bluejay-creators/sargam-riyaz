let audioContext: AudioContext | null;
let analyser: AnalyserNode | null;
let microphone: MediaStreamAudioSourceNode | null;
let dataArray: Uint8Array;
let isListening: boolean = false;

// Settings variables and functions
function toggleSettings(): void {
    const popup = document.getElementById('settingsPopup');
    if (popup) {
        popup.classList.toggle('show');
    }
}

function toggleVisibility(elementId: string, show: boolean): void {
    const element = document.getElementById(elementId);
    if (element) {
        if (show) {
            element.classList.remove('hidden');
        } else {
            element.classList.add('hidden');
        }
    }
}

// Note to frequency mapping (A4 = 440 Hz)
const noteToFreq: Record<string, number> = {
    'C3': 130.81,
    'C#3': 138.59,
    'D3': 146.83,
    'D#3': 155.56,
    'E3': 164.81,
    'F3': 174.61,
    'F#3': 185.00,
    'G3': 196.00,
    'G#3': 207.65,
    'A3': 220.00,
    'A#3': 233.08,
    'B3': 246.94,
    'C4': 261.63
};

function updateBasePitch(note: string): void {
    const freq = noteToFreq[note];
    if (freq) {
        baseFrequency = freq;
        const display = document.getElementById('frequencyDisplay');
        if (display) {
            display.textContent = `Sa set to ${note}`;
        }
    }
}

function updateMaxFrequency(value: string): void {
    const freq = parseInt(value);
    if (!isNaN(freq) && freq > 0) {
        maxSearchFreq = freq;
    }
}

// Close settings when clicking outside
document.addEventListener('click', function(event: MouseEvent) {
    const popup = document.getElementById('settingsPopup');
    const settingsBtn = event.target as HTMLElement;
    
    if (popup && !popup.contains(event.target as Node) && !settingsBtn.classList.contains('settings-button')) {
        popup.classList.remove('show');
    }
});

// Frequency graph variables
const frequencyHistory: number[] = [];
const maxHistory: number = 240; // About 8 seconds at 30fps
let graphCanvas: HTMLCanvasElement | null = null;
let graphCtx: CanvasRenderingContext2D | null = null;

// Reference frequency for Sa (C3 = 130.81 Hz, but adjustable)
let baseFrequency: number = 130.81;
// Maximum frequency to search for (in Hz)
let maxSearchFreq: number = 500;

// Frequency ratios for Hindustani notes (just intonation)
const noteRatios: Record<string, number> = {
    'S': 1.0,      // Sa
    'Ṟ': 16/15,    // Re (komal)
    'R': 9/8,      // Re (shuddh)
    'G̱': 6/5,      // Ga (komal)
    'G': 5/4,      // Ga (shuddh)
    'M': 4/3,      // Ma (shuddh)
    'M̄': 45/32,    // Ma (tivra)
    'P': 3/2,      // Pa
    'Ḏ': 8/5,      // Dha (komal)
    'D': 5/3,      // Dha (shuddh)
    'Ṉ': 9/5,      // Ni (komal)
    'N': 15/8,     // Ni (shuddh)
    "S'": 2.0      // High Sa
};

const noteNames: string[] = Object.keys(noteRatios);

async function startDetection(): Promise<void> {
    // Initialize graph canvas/context if not already
    if (!graphCanvas) {
        graphCanvas = document.getElementById('frequencyGraph') as HTMLCanvasElement;
        graphCtx = graphCanvas.getContext('2d');
    }
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Browser does not support microphone access');
        }

        (document.getElementById('status') as HTMLElement).textContent = 'Requesting microphone permission...';
        
        const stream: MediaStream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
            } 
        });
        
        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        microphone = audioContext.createMediaStreamSource(stream);
        
        analyser.fftSize = 32768; // Increased for much better frequency resolution
        analyser.smoothingTimeConstant = 0.8; // Increased for more stable readings
        
        const bufferLength: number = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);
        
        microphone.connect(analyser);
        
        isListening = true;
        (document.getElementById('startBtn') as HTMLButtonElement).disabled = true;
        (document.getElementById('stopBtn') as HTMLButtonElement).disabled = false;
        (document.getElementById('status') as HTMLElement).textContent = 'Listening... Start singing!';
        
        detectNote();
        
    } catch (err: any) {
        console.error('Error accessing microphone:', err);
        let errorMsg = 'Error: ';
        
        if (err.name === 'NotAllowedError') {
            errorMsg += 'Microphone permission denied. Please click the microphone icon in your address bar and allow access.';
        } else if (err.name === 'NotFoundError') {
            errorMsg += 'No microphone found. Please connect a microphone and try again.';
        } else if (err.name === 'NotSupportedError') {
            errorMsg += 'Browser does not support microphone access. Try Chrome or Firefox.';
        } else {
            errorMsg += 'Could not access microphone. ' + err.message;
        }
        
        (document.getElementById('status') as HTMLElement).innerHTML = errorMsg + '<br><br>🔧 <strong>Troubleshooting:</strong><br>• Look for 🎤 icon in address bar and click "Allow"<br>• Try refreshing the page<br>• Use Chrome/Firefox for best support';
    }
}

function stopDetection(): void {
    // Clear frequency graph
    frequencyHistory.length = 0;
    drawFrequencyGraph();
    isListening = false;
    
    if (microphone) {
        microphone.disconnect();
    }
    if (audioContext) {
        audioContext.close();
    }
    
    (document.getElementById('startBtn') as HTMLButtonElement).disabled = false;
    (document.getElementById('stopBtn') as HTMLButtonElement).disabled = true;
    (document.getElementById('status') as HTMLElement).textContent = 'Detection stopped';
    (document.getElementById('currentNote') as HTMLElement).textContent = 'Start singing!';
    (document.getElementById('frequencyDisplay') as HTMLElement).textContent = 'Frequency: -- Hz';
    
    document.querySelectorAll('.note').forEach(note => {
        note.classList.remove('active');
    });
}

function detectNote(): void {
    if (!isListening || !analyser) return;
    
    analyser.getByteFrequencyData(dataArray);
    
    const frequency: number = findFundamentalFrequency();
    
    if (frequency > 80 && frequency < 2000) {
        const detectedNote: string = findClosestNote(frequency);
        displayNote(detectedNote, frequency);
        updateFrequencyHistory(frequency);
    } else {
        updateFrequencyHistory(0);
    }

    drawFrequencyGraph();
    requestAnimationFrame(detectNote);
}

function findFundamentalFrequency(): number {
    if (!audioContext || !dataArray) return 0;
    const nyquist: number = audioContext.sampleRate / 2;
    const resolution: number = nyquist / dataArray.length;
    
    let maxIndex = 0;
    let maxValue = 0;
    
    const maxBin = Math.floor(maxSearchFreq / resolution);
    for (let i = 10; i < maxBin; i++) {
        if (dataArray[i] > maxValue) {
            maxValue = dataArray[i];
            maxIndex = i;
        }
    }
    
    if (maxValue > 50) {
        return maxIndex * resolution;
    }
    
    return 0;
}

function findFundamentalFrequencyHPS(): number {
    if (!audioContext || !dataArray) return 0;
    const nyquist = audioContext.sampleRate / 2;
    const resolution = nyquist / dataArray.length;

    // Convert Uint8Array to Float32Array for better precision
    const spectrum = Float32Array.from(dataArray);

    // Number of harmonics to use (2-5 is typical)
    const harmonics = 4;
    const hps = new Float32Array(spectrum.length);

    // Copy original spectrum
    for (let i = 0; i < spectrum.length; i++) {
        hps[i] = spectrum[i];
    }

    // Multiply downsampled spectra
    for (let h = 2; h <= harmonics; h++) {
        for (let i = 0; i < spectrum.length / h; i++) {
            hps[i] *= spectrum[Math.floor(i * h)];
        }
    }

    // Search for peak in reasonable range (e.g., up to 500 Hz)
    const maxSearchFreq = 500;
    const maxBin = Math.floor(maxSearchFreq / resolution);
    let maxIndex = 0;
    let maxValue = 0;
    for (let i = 10; i < maxBin; i++) {
        if (hps[i] > maxValue) {
            maxValue = hps[i];
            maxIndex = i;
        }
    }

    if (maxValue > 1) { // threshold may need tuning
        return maxIndex * resolution;
    }
    return 0;
}

function findClosestNote(frequency: number): string {
    let closestNote: string = 'S';
    let minDifference: number = Infinity;
    
    console.log('Finding closest note for frequency:', frequency);
    
    for (const [note, ratio] of Object.entries(noteRatios)) {
        const targetFreq: number = baseFrequency * ratio;
        
        for (let octave = 0; octave < 4; octave++) {
            const octaveFreq: number = targetFreq * Math.pow(2, octave);
            const difference: number = Math.abs(frequency - octaveFreq);
            
            if (difference < minDifference) {
                minDifference = difference;
                closestNote = note;
                console.log(`Found closer note: ${note} (diff: ${difference.toFixed(2)}Hz, target: ${octaveFreq.toFixed(2)}Hz)`);
            }
        }
    }
    
    return closestNote;
}

function updateFrequencyHistory(frequency: number): void {
    frequencyHistory.push(frequency);
    if (frequencyHistory.length > maxHistory) {
        frequencyHistory.shift();
    }
}

function displayNote(note: string, frequency: number): void {
    const currentNoteElement = document.getElementById('currentNote');
    if (currentNoteElement && !currentNoteElement.classList.contains('hidden')) {
        currentNoteElement.textContent = note;
    }
    
    // Show detailed frequency info for debugging
    const freqDisplay = document.getElementById('frequencyDisplay') as HTMLElement;
    if (freqDisplay) {
        // Check if it's a komal or tivra note based on the Unicode character
        const noteType = note.includes('Ṟ') || note.includes('G̱') || note.includes('Ḏ') || note.includes('Ṉ') ? 'komal' :
                        note.includes('M̄') ? 'tivra' : 'shuddh';
        
        // Calculate the exact frequency for this note
        let exactFreq = 0;
        if (noteRatios[note]) {
            exactFreq = baseFrequency * noteRatios[note];
        }
        
        // Display detailed info
        freqDisplay.textContent = `${frequency.toFixed(2)} Hz (${noteType}) - Target: ${exactFreq.toFixed(2)} Hz`;
    }
    
    // Remove active class from all notes
    document.querySelectorAll('.note').forEach(noteEl => {
        noteEl.classList.remove('active');
    });
    
    // Find and highlight the active note
    const activeNote = document.querySelector(`[data-note="${note}"]`);
    if (activeNote) {
        activeNote.classList.add('active');
    }
}

function drawFrequencyGraph(): void {
    console.log('Drawing graph', frequencyHistory.length);
    if (!graphCanvas || !graphCtx) return;

    // Clear canvas
    graphCtx.clearRect(0, 0, graphCanvas.width, graphCanvas.height);

    // Draw frequency history as a line graph
    graphCtx.beginPath();
    graphCtx.strokeStyle = '#0074D9';
    graphCtx.lineWidth = 2;

    const height = graphCanvas.height;
    const width = graphCanvas.width;
    const len = frequencyHistory.length;

    for (let i = 0; i < len; i++) {
        const freq = frequencyHistory[i];
        // Map frequency to y position (log scale for better visualization)
        const y = freq > 0
            ? height - (Math.log(freq) - Math.log(80)) / (Math.log(2000) - Math.log(80)) * height
            : height;
        const x = width - len + i;
        if (i === 0) {
            graphCtx.moveTo(x, y);
        } else {
            graphCtx.lineTo(x, y);
        }
    }
    graphCtx.stroke();

    // Draw grid lines for notes
    graphCtx.font = '12px sans-serif';
    graphCtx.fillStyle = '#333';
    graphCtx.globalAlpha = 0.5;
    for (const [note, ratio] of Object.entries(noteRatios)) {
        const freq = baseFrequency * ratio;
        const y = height - (Math.log(freq) - Math.log(80)) / (Math.log(2000) - Math.log(80)) * height;
        graphCtx.beginPath();
        graphCtx.moveTo(0, y);
        graphCtx.lineTo(width, y);
        graphCtx.strokeStyle = '#cccccc';
        graphCtx.lineWidth = 1;
        graphCtx.stroke();
        graphCtx.fillText(note, 5, y - 2);
    }
    graphCtx.globalAlpha = 1.0;
}


document.addEventListener('visibilitychange', function() {
    if (document.hidden && isListening) {
        stopDetection();
    }
});
