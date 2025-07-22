let audioContext: AudioContext | null;
let analyser: AnalyserNode | null;
let microphone: MediaStreamAudioSourceNode | null;
let dataArray: Uint8Array;
let isListening: boolean = false;

// Reference frequency for Sa (C3 = 130.81 Hz, but adjustable)
const baseFrequency: number = 130.81;

// Frequency ratios for Hindustani notes (just intonation)
const noteRatios: Record<string, number> = {
    'S': 1.0,      // Sa (shudh)
    'r': 9/8,      // Re (shudh)
    'g': 5/4,      // Ga (shudh)
    'm': 4/3,      // Ma (shudh)
    'p': 3/2,      // Pa (shudh)
    'd': 5/3,      // Dha (shudh)
    'n': 15/8,     // Ni (shudh)
    "S'": 2.0      // High Sa (octave, shudh)
};

const noteNames: string[] = Object.keys(noteRatios);

async function startDetection(): Promise<void> {
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
        
        analyser.fftSize = 4096;
        analyser.smoothingTimeConstant = 0.3;
        
        const bufferLength: number = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);
        
        microphone.connect(analyser);
        
        isListening = true;
        (document.getElementById('startBtn') as HTMLButtonElement).disabled = true;
        (document.getElementById('stopBtn') as HTMLButtonElement).disabled = false;
        (document.getElementById('status') as HTMLElement).textContent = 'Listening... Start singing!';
        
        detectPitch();
        
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

function detectPitch(): void {
    if (!isListening || !analyser) return;
    
    analyser.getByteFrequencyData(dataArray);
    
    const frequency: number = findFundamentalFrequency();
    
    if (frequency > 80 && frequency < 2000) {
        const detectedNote: string = findClosestNote(frequency);
        displayNote(detectedNote, frequency);
    }
    
    requestAnimationFrame(detectPitch);
}

function findFundamentalFrequency(): number {
    if (!audioContext || !dataArray) return 0;
    const nyquist: number = audioContext.sampleRate / 2;
    const resolution: number = nyquist / dataArray.length;
    
    let maxIndex = 0;
    let maxValue = 0;
    
    for (let i = 10; i < dataArray.length / 2; i++) {
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

function findClosestNote(frequency: number): string {
    let closestNote: string = 'S';
    let minDifference: number = Infinity;
    
    for (const [note, ratio] of Object.entries(noteRatios)) {
        const targetFreq: number = baseFrequency * ratio;
        
        for (let octave = 0; octave < 4; octave++) {
            const octaveFreq: number = targetFreq * Math.pow(2, octave);
            const difference: number = Math.abs(frequency - octaveFreq);
            
            if (difference < minDifference) {
                minDifference = difference;
                closestNote = note;
            }
        }
    }
    
    return closestNote;
}

function displayNote(note: string, frequency: number): void {
    (document.getElementById('currentNote') as HTMLElement).textContent = note;
    (document.getElementById('frequencyDisplay') as HTMLElement).textContent = `Frequency: ${frequency.toFixed(1)} Hz`;
    
    document.querySelectorAll('.note').forEach(noteEl => {
        noteEl.classList.remove('active');
    });
    
    const activeNote = document.querySelector(`[data-note="${note}"]`);
    if (activeNote) {
        activeNote.classList.add('active');
    }
}

document.addEventListener('visibilitychange', function() {
    if (document.hidden && isListening) {
        stopDetection();
    }
});
