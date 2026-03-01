/**
 * Neandertool - Main Entry Point
 */

document.addEventListener('DOMContentLoaded', () => {
    // Initialize systems
    const cascade = new FilterCascade();
    const game = new GameManager();
    const ui = new UIManager(cascade, game);

    ui.init();

    let lastTime = performance.now();

    // Main loop
    function loop(currentTime) {
        const deltaTime = (currentTime - lastTime) / 1000;
        lastTime = currentTime;

        // Update animations
        cascade.updateAnimations(deltaTime);

        // Update parameter displays (sliders + value spans)
        ui.updateParameterDisplays();

        // Check constraints and render through UIManager
        ui.render();

        requestAnimationFrame(loop);
    }

    requestAnimationFrame(loop);

    // Default to Zen mode
    ui.setMode('zen');
});
