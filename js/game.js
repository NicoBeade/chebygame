/**
 * Neandertool - Game Logic
 *
 * Handles challenge mode, scoring, timer, and difficulty progression.
 */

// ── Supabase Leaderboard Configuration ────────────────────────────────────
// 1. Create a free project at https://supabase.com
// 2. Replace these two values with your project's URL and anon key
//    (found in: Project Settings → API)
const SUPABASE_URL = 'https://iwwckvwdxdmdupxtplpv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3d2NrdndkeGRtZHVweHRwbHB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2NjcwMjcsImV4cCI6MjA4ODI0MzAyN30.Mj34IlquH1nW2vP34vL2QidJm3QDAdoXDNMLgpGnlNE';

// ── 15 Hardcoded Zen Levels ────────────────────────────────────────────────
const ZEN_LEVELS = [
    { wp: 1, ratio: 3.0, Ap: 3, As: 20, minOrder: 1 },
    { wp: 2, ratio: 2.8, Ap: 3, As: 22, minOrder: 1 },
    { wp: 3, ratio: 2.5, Ap: 3, As: 24, minOrder: 2 },
    { wp: 1, ratio: 2.3, Ap: 3, As: 26, minOrder: 2 },
    { wp: 5, ratio: 2.1, Ap: 3, As: 28, minOrder: 3 },
    { wp: 2, ratio: 1.9, Ap: 3, As: 30, minOrder: 3 },
    { wp: 4, ratio: 1.8, Ap: 3, As: 31, minOrder: 4 },
    { wp: 3, ratio: 1.7, Ap: 3, As: 32, minOrder: 4 },
    { wp: 1, ratio: 1.65, Ap: 3, As: 33, minOrder: 5 },
    { wp: 5, ratio: 1.6, Ap: 3, As: 34, minOrder: 5 },
    { wp: 2, ratio: 1.55, Ap: 3, As: 35, minOrder: 6 },
    { wp: 4, ratio: 1.5, Ap: 3, As: 36, minOrder: 6 },
    { wp: 3, ratio: 1.45, Ap: 3, As: 38, minOrder: 7 },
    { wp: 1, ratio: 1.4, Ap: 3, As: 40, minOrder: 7 },
    { wp: 5, ratio: 1.35, Ap: 3, As: 42, minOrder: 8 },
];

class GameManager {
    constructor() {
        this.mode = 'sandbox';  // 'sandbox', 'challenge', or 'zen'
        this.score = 0;
        this.round = 1;
        this.timeRemaining = 60;
        this.timeElapsed = 0;   // Zen mode count-up timer
        this.timerInterval = null;
        this.countdownInterval = null;
        this.constraints = null;
        this.isGameOver = false;
        this.isPaused = false; // Used during popups
        this.usedBestSolution = false; // Penalty flag per round

        // Zen mode state
        this.zenLevelsPassed = new Array(ZEN_LEVELS.length).fill(false);
        this.zenBestTimes = new Array(ZEN_LEVELS.length).fill(null);
        this.zenCurrentPassed = false; // Has current level been passed?

        // Challenge difficulty settings (start at order 1, scale gradually)
        this.baseMinOrder = 1;
        this.orderIncreasePerRound = 0.5;
    }

    /**
     * Generate random filter constraints
     * Now operates in normalized frequency (ωp = 1)
     */
    generateConstraints() {
        const minOrder = Math.floor(this.baseMinOrder + (this.round - 1) * this.orderIncreasePerRound);

        // Passband frequency is a random multiple of 1kHz up to 10kHz
        const passbandFreq = Math.floor(Math.random() * 10) + 1;

        // Stopband starts 1.5 to 3.0 in normalized space
        const gap = 1.5 + Math.random() * 1.5;
        const stopbandFreq = passbandFreq * gap;

        // Passband ripple is strictly fixed to 3 dB max (Gp = -3dB)
        const passbandRipple = 3.0;

        // Stopband attenuation (25 to 35 dB)
        const stopbandAtten = 25 + Math.random() * 10;

        this.constraints = {
            passband: {
                freqMin: 0.1,  // Plot down to 0.1 instead of 10 Hz
                freqMax: passbandFreq,
                dbMin: -passbandRipple
            },
            stopband: {
                freqMin: stopbandFreq,
                freqMax: 100, // Safe high limit in normalized freq
                dbMax: -stopbandAtten
            },
            wp: passbandFreq, // 1.0
            ws: stopbandFreq, // > 1.0
            Ap: passbandRipple,
            As: stopbandAtten,
            minOrder
        };

        return this.constraints;
    }

    /**
     * Check if current filter meets constraints
     */
    checkConstraints(cascade) {
        if (!this.constraints) return false;

        const { passband, stopband } = this.constraints;

        // Check passband (should be above dbMin AND below 0dB)
        const pbResponse = cascade.getFrequencyResponse(passband.freqMin, passband.freqMax, 50);
        const pbTooLow = pbResponse.some(p => p.magnitudeDb < passband.dbMin);
        const pbTooHigh = pbResponse.some(p => p.magnitudeDb > 0);  // Gain > 0dB is invalid

        // Check stopband (should be below dbMax)
        const sbResponse = cascade.getFrequencyResponse(stopband.freqMin, stopband.freqMax, 50);
        const sbFails = sbResponse.some(p => p.magnitudeDb > stopband.dbMax);

        return !pbTooLow && !pbTooHigh && !sbFails;
    }

    /**
     * Start a new challenge round
     */
    startChallenge(subMode = 'hardcore') {
        this.mode = subMode === 'zen' ? 'zen' : 'challenge';
        this.subMode = subMode;
        this.round = 1;
        this.score = 0;
        this.isGameOver = false;
        this.isPaused = false;
        this.usedBestSolution = false;

        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }

        // Wait for explicit this.startRound() call from UI
    }

    startRound() {
        this.usedBestSolution = false; // Reset per round
        this.zenCurrentPassed = false;
        this.isPaused = false; // Ensure timer runs (was set true by completeRound)

        if (this.subMode === 'zen') {
            // Load hardcoded zen level
            this.loadZenLevel(this.round);
            this.timeElapsed = 0;

            // Start count-UP timer
            if (this.timerInterval) clearInterval(this.timerInterval);
            this.timerInterval = setInterval(() => {
                if (this.isPaused) return;
                this.timeElapsed++;
                this.updateHUD();
            }, 1000);
        } else {
            // Hardcore mode
            this.timeRemaining = 60;
            this.generateConstraints();

            // Start countdown timer
            if (this.timerInterval) clearInterval(this.timerInterval);
            this.timerInterval = setInterval(() => {
                if (this.isPaused) return;
                this.timeRemaining--;

                const urgency = Math.max(0, Math.min(1, 1 - this.timeRemaining / 60));
                audio.playTick(urgency);

                if (this.timeRemaining <= 0) {
                    clearInterval(this.timerInterval);
                    this.isGameOver = true;
                }

                this.updateHUD();
            }, 1000);
        }

        this.updateHUD();
    }

    /**
     * Load constraints from the hardcoded ZEN_LEVELS array
     */
    loadZenLevel(levelNum) {
        const idx = Math.min(levelNum - 1, ZEN_LEVELS.length - 1);
        const lv = ZEN_LEVELS[idx];
        const stopbandFreq = lv.wp * lv.ratio;

        this.constraints = {
            passband: { freqMin: 0.1, freqMax: lv.wp, dbMin: -lv.Ap },
            stopband: { freqMin: stopbandFreq, freqMax: 100, dbMax: -lv.As },
            wp: lv.wp,
            ws: stopbandFreq,
            Ap: lv.Ap,
            As: lv.As,
            minOrder: lv.minOrder
        };
    }

    /**
     * Navigate to next zen level (only if current is passed)
     */
    nextLevel() {
        if (this.subMode !== 'zen') return;
        if (!this.zenCurrentPassed && !this.zenLevelsPassed[this.round - 1]) return;
        if (this.round >= ZEN_LEVELS.length) return;
        this.round++;
        this.startRound();
    }

    /**
     * Navigate to previous zen level
     */
    prevLevel() {
        if (this.subMode !== 'zen') return;
        if (this.round <= 1) return;
        this.round--;
        this.startRound();
    }

    /**
     * Check if all zen levels have been completed
     */
    allZenLevelsComplete() {
        return this.zenLevelsPassed.every(p => p);
    }

    endGame() {
        clearInterval(this.timerInterval);
        this.isGameOver = true;
        this.isPaused = true;
    }

    /**
     * Called when player successfully meets constraints
     */
    completeRound(cascade, uiCallback) {
        clearInterval(this.timerInterval);
        this.isPaused = true;

        let roundScore = 0;

        if (this.subMode === 'zen') {
            // Mark level as passed
            this.zenCurrentPassed = true;
            this.zenLevelsPassed[this.round - 1] = true;

            // Track best time
            const prevBest = this.zenBestTimes[this.round - 1];
            if (prevBest === null || this.timeElapsed < prevBest) {
                this.zenBestTimes[this.round - 1] = this.timeElapsed;
            }
        } else {
            // Hardcore scoring
            const timeBonus = this.timeRemaining * 10;
            const stageCount = cascade.stages.length;
            const optimalOrder = this.constraints.minOrder;
            const stagePenalty = Math.max(0, (stageCount - optimalOrder) * 50);

            roundScore = Math.max(0, 1000 + timeBonus - stagePenalty);

            // Penalty for using best solution
            if (this.usedBestSolution) {
                roundScore = Math.floor(roundScore * 0.15);
            }

            this.score += roundScore;
        }

        audio.playRoundComplete();

        // Trigger the UI callback (no auto-advance in zen mode)
        if (uiCallback) {
            uiCallback(roundScore);
        } else if (this.subMode !== 'zen') {
            this.proceedToNextRound();
        }

        return roundScore;
    }

    proceedToNextRound() {
        this.round++;
        this.isPaused = false;
        this.startRound();
    }

    gameOver(uiCallback) {
        clearInterval(this.timerInterval);
        this.isGameOver = true;
        this.isPaused = true;

        audio.playFail();

        if (uiCallback) {
            uiCallback(this.score, this.round - 1);
        }
    }

    updateHUD() {
        const timerEl = document.getElementById('timer');

        if (this.subMode === 'zen') {
            // Count-up timer display (MM:SS)
            const mins = Math.floor(this.timeElapsed / 60);
            const secs = this.timeElapsed % 60;
            timerEl.textContent = `${mins}:${String(secs).padStart(2, '0')}`;
            timerEl.classList.remove('timer-yellow', 'timer-red');
            timerEl.classList.add('timer-green');

            // Show best personal time for this level
            const bestTime = this.zenBestTimes[this.round - 1];
            if (bestTime !== null) {
                const bm = Math.floor(bestTime / 60);
                const bs = bestTime % 60;
                document.getElementById('score').textContent = `${bm}:${String(bs).padStart(2, '0')}`;
            } else {
                document.getElementById('score').textContent = '--:--';
            }
            document.getElementById('round').textContent = `${this.round}/${ZEN_LEVELS.length}`;
        } else {
            timerEl.textContent = this.timeRemaining;

            // Update timer color based on urgency
            timerEl.classList.remove('timer-green', 'timer-yellow', 'timer-red');
            if (this.timeRemaining > 30) {
                timerEl.classList.add('timer-green');
            } else if (this.timeRemaining > 15) {
                timerEl.classList.add('timer-yellow');
            } else {
                timerEl.classList.add('timer-red');
            }

            document.getElementById('score').textContent = this.score;
            document.getElementById('round').textContent = this.round;
        }
    }

    /**
     * Get optimal Chebyshev solution for current constraints
     */
    getBestSolution(freqMin, freqMax) {
        if (!this.constraints) return null;

        return ChebyshevSolver.getFrequencyResponse(
            this.constraints.wp,
            this.constraints.ws,
            this.constraints.Ap,
            this.constraints.As,
            freqMin,
            freqMax
        );
    }

    /**
     * Get the exact instantiated stages and global gain for the best solution
     */
    getBestSolutionStages() {
        if (!this.constraints) return null;

        return ChebyshevSolver.getBestSolutionStages(
            this.constraints.wp,
            this.constraints.ws,
            this.constraints.Ap,
            this.constraints.As
        );
    }

    /**
     * Retrieve top 10 scores from Supabase
     */
    async getLeaderboard() {
        try {
            const res = await fetch(
                `${SUPABASE_URL}/rest/v1/scores?select=name,score,date&order=score.desc&limit=10`,
                {
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Authorization': `Bearer ${SUPABASE_KEY}`
                    }
                }
            );
            if (res.ok) {
                const data = await res.json();
                // Supabase may return an error object instead of an array
                if (!Array.isArray(data)) return [];
                data.forEach(e => { e.score = parseInt(e.score, 10) || 0; });
                return data;
            }
        } catch (e) {
            console.error('Leaderboard fetch error:', e);
        }
        return [];
    }

    /**
     * Save a score to Supabase
     */
    async saveScore(name, score, dateStr = null) {
        const date = dateStr ? dateStr : new Date().toISOString().split('T')[0];
        try {
            await fetch(`${SUPABASE_URL}/rest/v1/scores`, {
                method: 'POST',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify({ name, score, date })
            });
        } catch (e) {
            console.error('Leaderboard save error:', e);
        }
    }

    /**
     * Check if a score qualifies for the global top 10 asynchronously
     */
    async isHighScore(score) {
        if (score <= 0) return false;
        const lb = await this.getLeaderboard();
        if (lb.length < 10) return true;
        // If it's strictly greater than the lowest score in the top 10
        return score > lb[lb.length - 1].score;
    }
}
