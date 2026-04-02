// Home Page Navigation
const howToPlayBtn = document.getElementById('howToPlayBtn');
const playComputerBtn = document.getElementById('playComputerBtn');
const playOnlineBtn = document.getElementById('playOnlineBtn');
const instructionsModal = document.getElementById('instructionsModal');
const closeInstructionsBtn = document.getElementById('closeInstructionsBtn');

// Show instructions modal
howToPlayBtn.addEventListener('click', () => {
    instructionsModal.style.display = 'flex';
});

// Close instructions modal
closeInstructionsBtn.addEventListener('click', () => {
    instructionsModal.style.display = 'none';
});

// Redirect to game page for computer play
playComputerBtn.addEventListener('click', () => {
    window.location.href = 'game.html?mode=computer';
});

// Redirect to game page for online play
playOnlineBtn.addEventListener('click', () => {
    window.location.href = 'game.html?mode=online';
});
