/**
 * Neandertool - DSP Engine
 * 
 * Implements filter stages (1st order poles, 2nd order biquads)
 * and cascade computation for frequency response.
 */

/**
 * AnimatedParameter - A parameter that can oscillate within a range
 */
class AnimatedParameter {
    constructor(value, min, max) {
        this.value = value;
        this.min = Math.max(0, min);  // Ensure min >= 0
        this.max = max;
        this.isAnimating = false;
        this.phase = 0;  // 0 to 2π for oscillation
    }

    setRange(min, max) {
        this.min = Math.max(0, min);
        this.max = max;
        if (this.value < this.min) this.value = this.min;
        if (this.value > this.max) this.value = this.max;
    }

    update(deltaTime, speed) {
        if (!this.isAnimating) return;

        // Oscillate using sine wave
        this.phase += deltaTime * speed * 2 * Math.PI;
        if (this.phase > 2 * Math.PI) this.phase -= 2 * Math.PI;

        // Map sine [-1, 1] to [min, max]
        const normalized = (Math.sin(this.phase) + 1) / 2;
        this.value = this.min + normalized * (this.max - this.min);
    }

    startAnimation() {
        this.isAnimating = true;
    }

    stopAnimation() {
        this.isAnimating = false;
    }
}

/**
 * FilterStage - Base class for filter stages
 */
class FilterStage {
    constructor(type) {
        this.type = type;
        this.id = FilterStage.nextId++;
        this.active = true;
    }

    static nextId = 1;

    /**
     * Get complex frequency response H(jω)
     * Returns {re, im} for the complex value
     */
    getResponse(omega) {
        return { re: 1, im: 0 };
    }

    /**
     * Get magnitude |H(jω)|
     */
    getMagnitude(omega) {
        const h = this.getResponse(omega);
        return Math.sqrt(h.re * h.re + h.im * h.im);
    }

    /**
     * Get magnitude in dB
     */
    getMagnitudeDb(omega) {
        const mag = this.getMagnitude(omega);
        return mag > 1e-10 ? 20 * Math.log10(mag) : -200;
    }

    /**
     * Generate an isolated frequency response array for plotting just this stage
     */
    getFrequencyResponse(freqMin, freqMax, numPoints = 500) {
        const response = [];
        const logMin = Math.log10(Math.max(0.001, freqMin));
        const logMax = Math.log10(freqMax);

        for (let i = 0; i <= numPoints; i++) {
            const logFreq = logMin + (i / numPoints) * (logMax - logMin);
            const freq = Math.pow(10, logFreq);
            const omega = freq;

            response.push({
                freq,
                omega,
                magnitude: this.getMagnitude(omega),
                magnitudeDb: this.getMagnitudeDb(omega)
            });
        }

        return response;
    }
}

/**
 * FirstOrderLowPass - Single pole lowpass
 * H(s) = ω₀ / (s + ω₀)
 * H(jω) = ω₀ / (jω + ω₀)
 */
class FirstOrderLowPass extends FilterStage {
    constructor(w0 = 1.0) {
        super('pole');
        this.w0 = new AnimatedParameter(w0, 0.01, 100);
    }

    getResponse(omega) {
        const w0 = this.w0.value;
        // H(jω) = ω₀ / (jω + ω₀) = ω₀ / (ω₀ + jω)
        // = ω₀(ω₀ - jω) / (ω₀² + ω²)
        const denom = w0 * w0 + omega * omega;
        return {
            re: w0 * w0 / denom,
            im: -w0 * omega / denom
        };
    }

    getParameters() {
        return [this.w0];
    }

    /**
     * Get s-plane pole coordinates
     */
    getPoles() {
        return [
            { re: -this.w0.value, im: 0 }
        ];
    }
}

/**
 * SecondOrderLowPass - Biquad lowpass
 * H(s) = ω₀² / (s² + (ω₀/Q)s + ω₀²)
 * H(jω) = ω₀² / (-ω² + j(ω₀/Q)ω + ω₀²)
 */
class SecondOrderLowPass extends FilterStage {
    constructor(w0 = 1.0, Q = 0.707) {
        super('biquad');
        this.w0 = new AnimatedParameter(w0, 0.01, 100);
        this.Q = new AnimatedParameter(Q, 0.1, 20);
    }

    getResponse(omega) {
        const w0 = this.w0.value;
        const Q = this.Q.value;

        // H(jω) = ω₀² / (ω₀² - ω² + j(ω₀/Q)ω)
        const realPart = w0 * w0 - omega * omega;
        const imagPart = (w0 / Q) * omega;
        const denom = realPart * realPart + imagPart * imagPart;

        const num = w0 * w0;
        return {
            re: num * realPart / denom,
            im: -num * imagPart / denom
        };
    }

    getParameters() {
        return [this.w0, this.Q];
    }

    /**
     * Get s-plane pole coordinates
     */
    getPoles() {
        const w0 = this.w0.value;
        const Q = this.Q.value;

        // Characteristic equation: s^2 + (w0/Q)s + w0^2 = 0
        // Roots: s = (-w0/Q ± sqrt((w0/Q)^2 - 4w0^2)) / 2

        const alpha = w0 / (2 * Q);
        const discriminant = (w0 * w0) / (4 * Q * Q) - w0 * w0;

        if (discriminant < 0) {
            // Underdamped (Complex conjugate pair)
            const beta = Math.sqrt(-discriminant);
            return [
                { re: -alpha, im: beta },
                { re: -alpha, im: -beta }
            ];
        } else {
            // Overdamped or critically damped (Two real poles)
            const root = Math.sqrt(discriminant);
            return [
                { re: -alpha + root, im: 0 },
                { re: -alpha - root, im: 0 }
            ];
        }
    }
}

/**
 * FilterCascade - Chain of filter stages
 */
class FilterCascade {
    constructor() {
        this.stages = [];
        this.animationSpeed = 1.0;  // Oscillations per second
        this.globalGainDb = 0.0;    // Added global system gain
    }

    addStage(stage) {
        this.stages.push(stage);
        return stage;
    }

    removeStage(id) {
        this.stages = this.stages.filter(s => s.id !== id);
    }

    clearStages() {
        this.stages = [];
        this.globalGainDb = 0.0; // Reset gain on clear
    }

    /**
     * Get combined frequency response
     */
    getResponse(omega) {
        let re = 1, im = 0;

        for (const stage of this.stages) {
            if (!stage.active) continue;

            const h = stage.getResponse(omega);
            // Complex multiplication: (a + bi)(c + di) = (ac - bd) + (ad + bc)i
            const newRe = re * h.re - im * h.im;
            const newIm = re * h.im + im * h.re;
            re = newRe;
            im = newIm;
        }

        // Apply linear offset from logarithmic global gain
        const linearGain = Math.pow(10, this.globalGainDb / 20);
        return { re: re * linearGain, im: im * linearGain };
    }

    getMagnitude(omega) {
        const h = this.getResponse(omega);
        return Math.sqrt(h.re * h.re + h.im * h.im);
    }

    getMagnitudeDb(omega) {
        const mag = this.getMagnitude(omega);
        return mag > 1e-10 ? 20 * Math.log10(mag) : -200;
    }

    /**
     * Generate frequency response array for plotting
     */
    getFrequencyResponse(freqMin, freqMax, numPoints = 500) {
        const response = [];
        // Support normalized frequencies below 1 (e.g. 0.1 rad/s)
        const logMin = Math.log10(Math.max(0.001, freqMin));
        const logMax = Math.log10(freqMax);

        for (let i = 0; i <= numPoints; i++) {
            const logFreq = logMin + (i / numPoints) * (logMax - logMin);
            const freq = Math.pow(10, logFreq);
            // In normalized space, freq IS omega. We don't convert to 2*PI*f.
            const omega = freq;

            response.push({
                freq,
                omega,
                magnitude: this.getMagnitude(omega),
                magnitudeDb: this.getMagnitudeDb(omega)
            });
        }

        return response;
    }

    /**
     * Update all animated parameters
     */
    updateAnimations(deltaTime) {
        for (const stage of this.stages) {
            for (const param of stage.getParameters()) {
                param.update(deltaTime, this.animationSpeed);
            }
        }
    }

    /**
     * Start all animations
     */
    playAll() {
        for (const stage of this.stages) {
            for (const param of stage.getParameters()) {
                param.startAnimation();
            }
        }
    }

    /**
     * Pause all animations
     */
    pauseAll() {
        for (const stage of this.stages) {
            for (const param of stage.getParameters()) {
                param.stopAnimation();
            }
        }
    }
}

/**
 * ChebyshevSolver - Calculates optimal Chebyshev Type I filter
 */
class ChebyshevSolver {
    /**
     * Calculate minimum order for given specs
     * @param {number} wp - Passband edge (rad/s)
     * @param {number} ws - Stopband edge (rad/s)
     * @param {number} Ap - Passband ripple (dB)
     * @param {number} As - Stopband attenuation (dB)
     */
    static getMinOrder(wp, ws, Ap, As) {
        const epsilon = Math.sqrt(Math.pow(10, Ap / 10) - 1);
        const A = Math.pow(10, As / 20);

        const ratio = ws / wp;
        const n = Math.acosh(Math.sqrt(A * A - 1) / epsilon) / Math.acosh(ratio);

        return Math.ceil(n);
    }

    /**
     * Get Chebyshev poles for given order and ripple
     */
    static getPoles(n, epsilon, wp) {
        const poles = [];
        const gamma = Math.asinh(1 / epsilon) / n;

        for (let k = 1; k <= n; k++) {
            const theta = Math.PI * (2 * k - 1) / (2 * n);
            const sigma = -wp * Math.sinh(gamma) * Math.sin(theta);
            const omega = wp * Math.cosh(gamma) * Math.cos(theta);
            poles.push({ sigma, omega });
        }

        return poles;
    }

    /**
     * Get frequency response of optimal Chebyshev filter
     */
    static getResponse(omega, n, epsilon, wp) {
        // |H(jω)|² = 1 / (1 + ε² * Tn²(ω/wp))
        // where Tn is Chebyshev polynomial

        const x = omega / wp;
        let Tn;

        if (x <= 1) {
            Tn = Math.cos(n * Math.acos(x));
        } else {
            Tn = Math.cosh(n * Math.acosh(x));
        }

        const magSq = 1 / (1 + epsilon * epsilon * Tn * Tn);
        return Math.sqrt(magSq);
    }

    /**
     * Generate full frequency response
     */
    static getFrequencyResponse(wp, ws, Ap, As, freqMin, freqMax, numPoints = 500) {
        const n = this.getMinOrder(wp, ws, Ap, As);
        const epsilon = Math.sqrt(Math.pow(10, Ap / 10) - 1);

        const response = [];
        // Support normalized frequencies below 1 (e.g. 0.1 rad/s)
        const logMin = Math.log10(Math.max(0.001, freqMin));
        const logMax = Math.log10(freqMax);

        for (let i = 0; i <= numPoints; i++) {
            const logFreq = logMin + (i / numPoints) * (logMax - logMin);
            const freq = Math.pow(10, logFreq);
            // In normalized space, freq IS omega. We don't convert to 2*PI*f.
            const omega = freq;
            const mag = this.getResponse(omega, n, epsilon, wp);

            response.push({
                freq,
                omega,
                magnitude: mag,
                magnitudeDb: mag > 1e-10 ? 20 * Math.log10(mag) : -200
            });
        }

        return { response, order: n, epsilon };
    }

    /**
     * Convert theoretical Chebyshev poles into tangible stage classes and compute required DC compensation gain.
     */
    static getBestSolutionStages(wp, ws, Ap, As) {
        const n = this.getMinOrder(wp, ws, Ap, As);
        const epsilon = Math.sqrt(Math.pow(10, Ap / 10) - 1);
        const poles = this.getPoles(n, epsilon, wp);

        const stages = [];
        // Only need half the poles since they are conjugate pairs
        for (let i = 0; i < Math.floor(n / 2); i++) {
            const p = poles[i];
            const w0 = Math.sqrt(p.sigma * p.sigma + p.omega * p.omega);
            const Q = w0 / (-2 * p.sigma);
            stages.push(new SecondOrderLowPass(w0, Q));
        }

        // If order is odd, the middle pole is purely real (no imaginary component)
        if (n % 2 !== 0) {
            const p = poles[Math.floor(n / 2)];
            const w0 = -p.sigma;
            stages.push(new FirstOrderLowPass(w0));
        }

        // Chebyshev Type-I even order passes DC at -Ap dB. 
        // Biquads pass DC at 0dB. Therefore, to match Chebyshev precisely, we subtract Ap from global gain.
        let globalGainDb = 0;
        if (n % 2 === 0) {
            globalGainDb = -Ap;
        }

        return { stages, globalGainDb };
    }
}
