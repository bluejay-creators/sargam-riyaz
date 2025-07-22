let audioContext;
let analyser;
let microphone;
let dataArray;
let isListening = false;

// Reference frequency for Sa (C3 = 130.81 Hz, but adjustable)
const baseFrequency = 130.81;

// Frequency ratios for Hindustani notes (just intonation)
const noteRatios = {
    'S': 1.0,      // Sa (shudh)
    'r': 9/8,      // Re (shudh)
    'g': 5/4,      // Ga (shudh)
    'm': 4/3,      // Ma (shudh)
    'p': 3/2,      // Pa (shudh)
    'd': 5/3,      // Dha (shudh)
    'n': 15/8,     // Ni (shudh)
    "S'": 2.0      // High Sa (octave, shudh)
};

const noteNames = Object.keys(noteRatios);

async function startDetection() {
    try {
        // Check if browser supports getUserMedia
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Browser does not support microphone access');
        }

        document.getElementById('status').textContent = 'Requesting microphone permission...';
        
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
            } 
        });
        
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        microphone = audioContext.createMediaStreamSource(stream);
        
        analyser.fftSize = 4096;
        analyser.smoothingTimeConstant = 0.3;
        
        const bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);
        
        microphone.connect(analyser);
        
        isListening = true;
        document.getElementById('startBtn').disabled = true;
        document.getElementById('stopBtn').disabled = false;
        document.getElementById('status').textContent = 'Listening... Start singing!';
        
        detectPitch();
        
    } catch (err) {
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
        
        document.getElementById('status').innerHTML = errorMsg + '<br><br>🔧 <strong>Troubleshooting:</strong><br>• Look for 🎤 icon in address bar and click "Allow"<br>• Try refreshing the page<br>• Use Chrome/Firefox for best support';
    }
}

function stopDetection() {
    isListening = false;
    
    if (microphone) {
        microphone.disconnect();
    }
    if (audioContext) {
        audioContext.close();
    }
    
    document.getElementById('startBtn').disabled = false;
    document.getElementById('stopBtn').disabled = true;
    document.getElementById('status').textContent = 'Detection stopped';
    document.getElementById('currentNote').textContent = 'Start singing!';
    document.getElementById('frequencyDisplay').textContent = 'Frequency: -- Hz';
    
    // Remove active class from all notes
    document.querySelectorAll('.note').forEach(note => {
        note.classList.remove('active');
    });
}

function detectPitch() {
    if (!isListening) return;
    
    analyser.getByteFrequencyData(dataArray);
    
    const frequency = findFundamentalFrequency();
    
    if (frequency > 80 && frequency < 2000) {
        const detectedNote = findClosestNote(frequency);
        displayNote(detectedNote, frequency);
    }
    
    requestAnimationFrame(detectPitch);
}

function findFundamentalFrequency() {
    const nyquist = audioContext.sampleRate / 2;
    const resolution = nyquist / dataArray.length;
    
    let maxIndex = 0;
    let maxValue = 0;
    
    // Look for the peak in the frequency domain
    for (let i = 10; i < dataArray.length / 2; i++) {
        if (dataArray[i] > maxValue) {
            maxValue = dataArray[i];
            maxIndex = i;
        }
    }
    
    // Only return frequency if amplitude is significant
    if (maxValue > 50) {
        return maxIndex * resolution;
    }
    
    return 0;
}

function findClosestNote(frequency) {
    let closestNote = 'S';
    let minDifference = Infinity;
    
    for (const [note, ratio] of Object.entries(noteRatios)) {
        const targetFreq = baseFrequency * ratio;
        
        // Check multiple octaves
        for (let octave = 0; octave < 4; octave++) {
            const octaveFreq = targetFreq * Math.pow(2, octave);
            const difference = Math.abs(frequency - octaveFreq);
            
            if (difference < minDifference) {
                minDifference = difference;
                closestNote = note;
            }
        }
    }
    
    return closestNote;
}

function displayNote(note, frequency) {
    document.getElementById('currentNote').textContent = note;
    document.getElementById('frequencyDisplay').textContent = `Frequency: ${frequency.toFixed(1)} Hz`;
    
    // Remove active class from all notes
    document.querySelectorAll('.note').forEach(noteEl => {
        noteEl.classList.remove('active');
    });
    
    // Add active class to detected note
    const activeNote = document.querySelector(`[data-note="${note}"]`);
    if (activeNote) {
        activeNote.classList.add('active');
    }
}

// Handle page visibility to pause/resume detection

document.addEventListener('visibilitychange', function() {
    if (document.hidden && isListening) {
        stopDetection();
    }
});
