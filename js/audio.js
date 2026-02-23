/**
 * Neandertool - Audio Engine
 *
 * Ice Age themed 8-bit sounds. Music removed; SFX retained.
 */

class AudioEngine {
    constructor() {
        this.ctx = null;
        this.enabled = true;
    }

    init() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }

    ensureContext() {
        if (!this.ctx) this.init();
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    /**
     * Play an 8-bit style tone
     */
    playTone(frequency, duration = 0.1, type = 'square', volume = 0.2) {
        if (!this.enabled) return;
        this.ensureContext();

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.value = frequency;

        gain.gain.setValueAtTime(volume, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    /**
     * Play success sound (icy chime - ascending)
     */
    playSuccess() {
        this.playTone(523, 0.1, 'triangle');  // C5
        setTimeout(() => this.playTone(659, 0.1, 'triangle'), 80);   // E5
        setTimeout(() => this.playTone(784, 0.15, 'triangle'), 160); // G5
        setTimeout(() => this.playTone(1047, 0.2, 'triangle'), 260); // C6
    }

    /**
     * Play failure sound (mammoth groan)
     */
    playFail() {
        this.playTone(100, 0.4, 'sawtooth', 0.3);
        setTimeout(() => this.playTone(80, 0.5, 'sawtooth', 0.2), 200);
    }

    /**
     * Play click sound (ice crack)
     */
    playClick() {
        this.playTone(2000, 0.03, 'square', 0.1);
        this.playTone(1500, 0.02, 'square', 0.05);
    }

    /**
     * Play round complete sound
     */
    playRoundComplete() {
        const notes = [392, 440, 523, 659, 784]; // G4, A4, C5, E5, G5
        notes.forEach((freq, i) => {
            setTimeout(() => this.playTone(freq, 0.2, 'triangle', 0.15), i * 100);
        });
    }

    /**
     * Play a timer tick sound.
     * @param {number} t - urgency 0 (calm) to 1 (urgent). Higher t = higher pitch, shorter tick.
     */
    playTick(t = 0) {
        if (!this.enabled) return;
        // Pitch rises from 800 Hz (calm) to 1800 Hz (urgent)
        const freq = 800 + t * 1000;
        // Duration shortens from 0.06s to 0.025s
        const dur = 0.06 - t * 0.035;
        // Volume goes slight up under urgency
        const vol = 0.08 + t * 0.06;
        this.playTone(freq, dur, 'square', vol);
    }

    toggle() {
        this.enabled = !this.enabled;
        return this.enabled;
    }
}

// Global audio instance
const audio = new AudioEngine();
