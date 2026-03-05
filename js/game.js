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

class GameManager {
    constructor() {
        this.mode = 'sandbox';  // 'sandbox' or 'challenge'
        this.score = 0;
        this.round = 1;
        this.timeRemaining = 60;
        this.timerInterval = null;
        this.countdownInterval = null;
        this.constraints = null;
        this.isGameOver = false;
        this.isPaused = false; // Used during popups

        // Difficulty settings
        this.baseMinOrder = 2;
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

        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }

        // Wait for explicit this.startRound() call from UI
    }

    startRound() {
        this.timeRemaining = 60;
        this.generateConstraints();
        this.updateHUD();

        // Start timer
        if (this.timerInterval) clearInterval(this.timerInterval);

        if (this.subMode === 'hardcore') {
            this.timerInterval = setInterval(() => {
                if (this.isPaused) return; // Freeze timer during popups

                this.timeRemaining--;

                // Play tick — urgency increases as time decreases (0 when full, 1 when empty)
                const urgency = Math.max(0, Math.min(1, 1 - this.timeRemaining / 60));
                audio.playTick(urgency);

                if (this.timeRemaining <= 0) {
                    clearInterval(this.timerInterval);
                    this.isGameOver = true;
                }

                this.updateHUD();
            }, 1000);
        }
    }

    skipLevel() {
        if (this.subMode !== 'zen') return;
        this.startRound();
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

        if (this.subMode === 'hardcore') {
            // Score based on time and stages used
            const timeBonus = this.timeRemaining * 10;
            const stageCount = cascade.stages.length;
            const optimalOrder = this.constraints.minOrder;
            const stagePenalty = Math.max(0, (stageCount - optimalOrder) * 50);

            roundScore = Math.max(0, 1000 + timeBonus - stagePenalty);
            this.score += roundScore;
        }

        audio.playRoundComplete();

        // Trigger the UI popup and countdown
        if (uiCallback) {
            uiCallback(roundScore);
        } else {
            // Fallback if no UI attached
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
            timerEl.textContent = '∞';
            timerEl.classList.remove('timer-yellow', 'timer-red');
            timerEl.classList.add('timer-green');
            document.getElementById('score').textContent = '-';
            document.getElementById('round').textContent = '-';
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
                const arr = await res.json();
                arr.forEach(e => { e.score = parseInt(e.score, 10) || 0; });
                return arr;
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
