const socket = io();

// Get game mode from URL parameter
const urlParams = new URLSearchParams(window.location.search);
const gameMode = urlParams.get('mode') || 'online'; // default to online

// State
let currentRoom = null;
let playerNumber = null;
let mySecret = null;
let gameStarted = false;
let eliminatedDigits = new Array(10).fill(false);
let username = sessionStorage.getItem('tv0_username') || '';

// Single Player State
let isSinglePlayer = gameMode === 'computer';
let computerSecret = null;
let singlePlayerAttempts = 0;

// DOM Elements - Landing
const landingPage = document.getElementById('landingPage');
const gamePage = document.getElementById('gamePage');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const roomCodeInput = document.getElementById('roomCodeInput');
const usernameInput = document.getElementById('usernameInput');
const timerSelect = document.getElementById('timerSelect');
const landingError = document.getElementById('landingError');
const backToHomeBtn = document.getElementById('backToHomeBtn');

if (username) usernameInput.value = username;

// DOM Elements - Game
const roomInfo = document.getElementById('roomInfo');
const quitGameBtn = document.getElementById('quitGameBtn');

// Avatars and Players
const myNameEl = document.getElementById('myName');
const opponentNameEl = document.getElementById('opponentName');
const myScoreEl = document.getElementById('myScore');
const opponentScoreEl = document.getElementById('opponentScore');
const myAvatar = document.getElementById('myAvatar');
const opponentAvatar = document.getElementById('opponentAvatar');
const myThinking = document.getElementById('myThinking');
const opponentThinking = document.getElementById('opponentThinking');

const secretSetup = document.getElementById('secretSetup');
const secretBanner = document.getElementById('secretBanner');
const mySecretDisplay = document.getElementById('mySecretDisplay');
const gameArea = document.getElementById('gameArea');
const secretInput = document.getElementById('secretInput');
const setSecretBtn = document.getElementById('setSecretBtn');
const secretError = document.getElementById('secretError');
const turnIndicator = document.getElementById('turnIndicator');

// Timer
const timerWrapper = document.getElementById('timerWrapper');
const timerBar = document.getElementById('timerBar');

// Panel references for timer
const myPanel = document.querySelector('.history-row .panel:first-child');
const opponentPanel = document.getElementById('opponentGuessesPanel');

// Current turn tracking
let currentTurnIsMine = false;

const myGuesses = document.getElementById('myGuesses');
const opponentGuesses = document.getElementById('opponentGuesses');
const guessInput = document.getElementById('guessInput');
const guessBtn = document.getElementById('guessBtn');
const gameError = document.getElementById('gameError');
const guessInputArea = document.getElementById('guessInputArea');
const nextRoundArea = document.getElementById('nextRoundArea');
const nextRoundBtn = document.getElementById('nextRoundBtn');

const winnerOverlay = document.getElementById('winnerOverlay');
const winnerText = document.getElementById('winnerText');
const playAgainBtn = document.getElementById('playAgainBtn');

// Digit eliminator
const digitGrid = document.getElementById('digitGrid');
const eliminatedCount = document.getElementById('eliminatedCount');
const resetEliminatorBtn = document.getElementById('resetEliminatorBtn');

function showError(el, msg) {
    el.textContent = msg;
    el.parentElement.classList.remove('shake');
    void el.parentElement.offsetWidth; // trigger reflow
    el.parentElement.classList.add('shake');
}

function getAvatarUrl(seed) {
    return `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(seed)}`;
}

// Initialize digit grid
function renderDigitGrid() {
    let html = '';
    for (let i = 0; i <= 9; i++) {
        const eliminatedClass = eliminatedDigits[i] ? 'eliminated' : '';
        html += `<div class="digit-btn ${eliminatedClass}" data-digit="${i}">${i}</div>`;
    }
    digitGrid.innerHTML = html;
    eliminatedCount.textContent = eliminatedDigits.filter(v => v).length;
}

// Validate number
function isValidProNumber(numStr) {
    if (!/^\d{3}$/.test(numStr)) return false;
    if (numStr[0] === '0') return false;
    return new Set(numStr.split('')).size === 3;
}

// Evaluate feedback locally
function evaluateFeedbackLeftToRight(secret, guess) {
    if (typeof secret !== 'string' || typeof guess !== 'string' || secret.length !== 3 || guess.length !== 3) return '';
    const secretArr = secret.split('');
    const guessArr = guess.split('');
    
    let usedInSecret = [false, false, false];
    let feedback = [];
    
    for (let i = 0; i < 3; i++) {
        if (guessArr[i] === secretArr[i]) {
            feedback[i] = 'T';
            usedInSecret[i] = true;
        } else {
            feedback[i] = null;
        }
    }
    
    for (let i = 0; i < 3; i++) {
        if (feedback[i] !== null) continue;
        let found = false;
        for (let j = 0; j < 3; j++) {
            if (!usedInSecret[j] && guessArr[i] === secretArr[j]) {
                found = true;
                usedInSecret[j] = true;
                break;
            }
        }
        feedback[i] = found ? 'V' : '';
    }
    return feedback.join('');
}

// Evaluate feedback locally
function evaluateFeedbackLeftToRight(secret, guess) {
    if (typeof secret !== 'string' || typeof guess !== 'string' || secret.length !== 3 || guess.length !== 3) return '';
    const secretArr = secret.split('');
    const guessArr = guess.split('');
    
    let usedInSecret = [false, false, false];
    let feedback = [];
    
    for (let i = 0; i < 3; i++) {
        if (guessArr[i] === secretArr[i]) {
            feedback[i] = 'T';
            usedInSecret[i] = true;
        } else {
            feedback[i] = null;
        }
    }
    
    for (let i = 0; i < 3; i++) {
        if (feedback[i] !== null) continue;
        let found = false;
        for (let j = 0; j < 3; j++) {
            if (!usedInSecret[j] && guessArr[i] === secretArr[j]) {
                found = true;
                usedInSecret[j] = true;
                break;
            }
        }
        feedback[i] = found ? 'V' : '';
    }
    return feedback.join('');
}

// Generate valid computer secret
function generateComputerSecret() {
    let digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    let secret = '';
    let firstIndex = Math.floor(Math.random() * digits.length);
    secret += digits.splice(firstIndex, 1)[0];
    
    digits.push(0);
    for (let i = 0; i < 2; i++) {
        let index = Math.floor(Math.random() * digits.length);
        secret += digits.splice(index, 1)[0];
    }
    return secret;
}

// --- Navigation and Event Listeners ---

// Navigation buttons
backToHomeBtn.addEventListener('click', () => {
    window.location.href = 'index.html';
});

quitGameBtn.addEventListener('click', () => {
    sessionStorage.removeItem('tv0_room');
    window.location.href = 'index.html';
});

// Create room
createRoomBtn.addEventListener('click', () => {
    username = usernameInput.value.trim();
    if (!username) {
        landingError.textContent = 'Please enter a username';
        return;
    }
    const timerDuration = parseInt(timerSelect.value) || 15;
    sessionStorage.setItem('tv0_username', username);
    socket.emit('createRoom', { username, timerDuration });
});

// Join room
joinRoomBtn.addEventListener('click', () => {
    username = usernameInput.value.trim();
    const roomCode = roomCodeInput.value.trim();
    if (!username) {
        landingError.textContent = 'Please enter a username';
        return;
    }
    if (roomCode) {
        sessionStorage.setItem('tv0_username', username);
        socket.emit('joinRoom', { roomCode, username });
    } else {
        landingError.textContent = 'Please enter a room code';
    }
});

// Set secret
setSecretBtn.addEventListener('click', () => {
    const secret = secretInput.value.trim();
    if (!isValidProNumber(secret)) {
        showError(secretError, 'Invalid: 3 digits, no leading zero, all unique');
        return;
    }
    mySecret = secret;
    socket.emit('setSecret', { roomCode: currentRoom, secret });
});

// Reset eliminator
resetEliminatorBtn.addEventListener('click', () => {
    eliminatedDigits = new Array(10).fill(false);
    renderDigitGrid();
});

// Digit eliminator click
digitGrid.addEventListener('click', (e) => {
    const target = e.target.closest('.digit-btn');
    if (!target || target.classList.contains('eliminated')) return;
    const digit = parseInt(target.dataset.digit, 10);
    eliminatedDigits[digit] = true;
    renderDigitGrid();
});

// Make guess
guessBtn.addEventListener('click', () => {
    const guess = guessInput.value.trim();
    if (!isValidProNumber(guess)) {
        showError(gameError, 'Invalid guess');
        return;
    }

    if (isSinglePlayer) {
        singlePlayerAttempts++;
        myScoreEl.textContent = singlePlayerAttempts;
        
        const feedback = evaluateFeedbackLeftToRight(computerSecret, guess);
        addGuessToUI(guess, feedback, true);
        
        guessInput.value = '';
        guessInput.focus();
        
        if (feedback === 'TTT') {
            guessInput.disabled = true;
            guessBtn.disabled = true;
            turnIndicator.textContent = `You found the secret in ${singlePlayerAttempts} attempts! 🎉`;
            
            winnerText.textContent = 'You Win! 🏆';
            document.querySelector('.winner-content p').textContent = `Guessed in ${singlePlayerAttempts} tries`;
            winnerOverlay.style.display = 'flex';
        }
        return;
    }

    socket.emit('makeGuess', { roomCode: currentRoom, guess });
    guessInput.value = '';
    guessInput.disabled = true;
    guessBtn.disabled = true;
    socket.emit('typing', { roomCode: currentRoom, isTyping: false });
});

// Typing detection
let typingTimeout = null;
guessInput.addEventListener('input', () => {
    if (!guessInput.disabled) {
        socket.emit('typing', { roomCode: currentRoom, isTyping: true });
        if (typingTimeout) clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            socket.emit('typing', { roomCode: currentRoom, isTyping: false });
        }, 1000);
    }
});

// Enter key handlers
secretInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') setSecretBtn.click();
});
guessInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !guessBtn.disabled) guessBtn.click();
});

nextRoundBtn.addEventListener('click', () => {
    myGuesses.innerHTML = '';
    opponentGuesses.innerHTML = '';
    eliminatedDigits = new Array(10).fill(false);
    renderDigitGrid();

    mySecret = null;
    secretSetup.style.display = 'block';
    secretBanner.style.display = 'none';
    gameArea.style.display = 'none';
    turnIndicator.textContent = 'New round! Set your secret.';

    guessInputArea.style.display = 'flex';
    nextRoundArea.style.display = 'none';
});

playAgainBtn.addEventListener('click', () => {
    sessionStorage.removeItem('tv0_room');
    location.reload();
});

// Socket Events
socket.on('roomCreated', ({ roomCode, playerNumber: pNum, usernames }) => {
    setupGameUI(roomCode, pNum);
    updateScoreboard(usernames, { player1: 0, player2: 0 });
    turnIndicator.textContent = 'Waiting for opponent to join...';
});

socket.on('roomJoined', ({ roomCode, playerNumber: pNum, usernames, scores }) => {
    setupGameUI(roomCode, pNum);
    updateScoreboard(usernames, scores);
    turnIndicator.textContent = 'Opponent joined! Set your secret.';
});

socket.on('opponentJoined', ({ usernames, scores }) => {
    updateScoreboard(usernames, scores);
    turnIndicator.textContent = 'Opponent joined! Set your secret.';
});

socket.on('syncState', (state) => {
    setupGameUI(state.roomCode, state.playerNumber);
    updateScoreboard(state.usernames, state.scores);

    const myKey = `player${state.playerNumber}`;
    if (state.mySecret) {
        mySecret = state.mySecret;
        secretSetup.style.display = 'none';
        secretBanner.style.display = 'flex';
        mySecretDisplay.textContent = mySecret;
        gameArea.style.display = 'flex';
        guessInputArea.style.display = 'flex';
        nextRoundArea.style.display = 'none';
    } else {
        secretSetup.style.display = 'block';
        secretBanner.style.display = 'none';
        gameArea.style.display = 'none';
    }

    myGuesses.innerHTML = '';
    opponentGuesses.innerHTML = '';
    const opponentKey = state.playerNumber === 1 ? 'player2' : 'player1';

    state.guesses[myKey].forEach(g => addGuessToUI(g.guess, g.feedback, true));
    state.guesses[opponentKey].forEach(g => addGuessToUI(g.guess, g.feedback, false));

    if (state.gameStarted) {
        gameStarted = true;
        updateTurnUI(state.currentTurn);
    } else {
        gameStarted = false;
        turnIndicator.textContent = 'Waiting for game to start...';
        if (!state.mySecret) turnIndicator.textContent = 'Set your secret.';
        else if (!state.opponentReady) turnIndicator.textContent = 'Waiting for opponent to set secret...';
    }
});

function setupGameUI(roomCode, pNum) {
    currentRoom = roomCode;
    playerNumber = pNum;
    sessionStorage.setItem('tv0_room', roomCode);

    roomInfo.textContent = `Room: ${roomCode}`;
    landingPage.style.display = 'none';
    gamePage.style.display = 'block';
}

function updateScoreboard(usernames, scores) {
    if (playerNumber === 1 || isSinglePlayer) {
        myNameEl.textContent = usernames.player1 || 'Player 1';
        myScoreEl.textContent = scores.player1 || 0;
        if (usernames.player1) {
            myAvatar.src = getAvatarUrl(usernames.player1);
            myAvatar.style.display = 'inline-block';
        }

        opponentNameEl.textContent = usernames.player2 || 'Waiting...';
        opponentScoreEl.textContent = scores.player2 || 0;
        if (usernames.player2) {
            opponentAvatar.src = getAvatarUrl(usernames.player2);
            opponentAvatar.style.display = 'inline-block';
        }
    } else {
        myNameEl.textContent = usernames.player2 || 'Player 2';
        myScoreEl.textContent = scores.player2 || 0;
        if (usernames.player2) {
            myAvatar.src = getAvatarUrl(usernames.player2);
            myAvatar.style.display = 'inline-block';
        }

        opponentNameEl.textContent = usernames.player1 || 'Waiting...';
        opponentScoreEl.textContent = scores.player1 || 0;
        if (usernames.player1) {
            opponentAvatar.src = getAvatarUrl(usernames.player1);
            opponentAvatar.style.display = 'inline-block';
        }
    }
}

socket.on('secretSet', ({ playerNumber: pNum, secret }) => {
    if (pNum === playerNumber) {
        secretSetup.style.display = 'none';
        secretBanner.style.display = 'flex';
        mySecretDisplay.textContent = secret;
        gameArea.style.display = 'flex';
        secretInput.value = '';
        turnIndicator.textContent = 'Waiting for opponent to set secret...';
    }
});

socket.on('opponentSecretSet', () => {
    turnIndicator.textContent = 'Opponent set their secret! Waiting for game to start...';
});

socket.on('gameStart', ({ turn, message }) => {
    gameStarted = true;
    turnIndicator.textContent = message;
    updateTurnUI(turn);
});

socket.on('timerStarted', ({ duration }) => {
    // Hide old timer bar
    timerWrapper.style.display = 'none';
    
    // Remove timer-active from both panels
    myPanel.classList.remove('timer-active');
    opponentPanel.classList.remove('timer-active');
    
    // Determine active panel
    const activePanel = currentTurnIsMine ? myPanel : opponentPanel;
    
    // Reset animation
    activePanel.classList.remove('timer-active');
    void activePanel.offsetWidth;
    
    // Set duration for the panel
    activePanel.style.animationDuration = `${duration}s`;
    
    // Set duration for the SVG rect inside the panel
    const svgRect = activePanel.querySelector('.timer-svg rect');
    if (svgRect) {
        svgRect.style.animationDuration = `${duration}s`;
    }
    
    // Add class to start animation
    activePanel.classList.add('timer-active');
});

socket.on('guessResult', ({ guesser, guess, feedback, playerNumber: pNum }) => {
    const isMyGuess = (playerNumber === pNum);
    addGuessToUI(guess, feedback, isMyGuess);
    if (!isMyGuess) {
        turnIndicator.textContent = `Opponent guessed ${guess} → ${feedback}`;
    }
    myThinking.style.display = 'none';
    opponentThinking.style.display = 'none';
});

function addGuessToUI(guess, feedback, isMyGuess) {
    const targetList = isMyGuess ? myGuesses : opponentGuesses;
    const guessRow = document.createElement('div');
    guessRow.className = 'guess-row';
    const guessNum = document.createElement('span');
    guessNum.className = 'guess-number';
    guessNum.textContent = guess;

    const guessFb = document.createElement('span');
    guessFb.className = 'guess-feedback';
    const fbHtml = feedback.split('').map(ch => {
        if (ch === 'T') return '<span class="feedback-t">T</span>';
        if (ch === 'V') return '<span class="feedback-v">V</span>';
        return '<span class="feedback-0">0</span>';
    }).join('');
    guessFb.innerHTML = fbHtml || '0';

    guessRow.appendChild(guessNum);
    guessRow.appendChild(guessFb);
    targetList.insertBefore(guessRow, targetList.firstChild);
    targetList.scrollTop = 0;
}

socket.on('turnChanged', ({ turn, message }) => {
    turnIndicator.textContent = message;
    updateTurnUI(turn);
});

socket.on('turnTimeout', ({ player, message }) => {
    turnIndicator.textContent = message;
});

socket.on('drawChance', ({ player, message }) => {
    turnIndicator.textContent = message;
    updateTurnUI(player);
});

socket.on('roundDraw', ({ message, scores }) => {
    endRound(message, scores);
});

socket.on('roundWon', ({ winner, message, scores }) => {
    endRound(`🎉 ${message} 🎉`, scores);
});

socket.on('gameWon', ({ winner, message, winnerName, scores }) => {
    gameStarted = false;
    guessInput.disabled = true;
    guessBtn.disabled = true;
    if (playerNumber === 1) {
        myScoreEl.textContent = scores.player1;
        opponentScoreEl.textContent = scores.player2;
    } else {
        myScoreEl.textContent = scores.player2;
        opponentScoreEl.textContent = scores.player1;
    }
    timerWrapper.style.display = 'none';
    myPanel.classList.remove('timer-active');
    opponentPanel.classList.remove('timer-active');

    winnerText.textContent = `${winnerName} Wins! 🏆`;
    winnerOverlay.style.display = 'flex';
});

function endRound(message, scores) {
    gameStarted = false;
    guessInput.disabled = true;
    guessBtn.disabled = true;
    if (playerNumber === 1) {
        myScoreEl.textContent = scores.player1;
        opponentScoreEl.textContent = scores.player2;
    } else {
        myScoreEl.textContent = scores.player2;
        opponentScoreEl.textContent = scores.player1;
    }
    turnIndicator.textContent = message;
    timerWrapper.style.display = 'none';
    myPanel.classList.remove('timer-active');
    opponentPanel.classList.remove('timer-active');
    guessInputArea.style.display = 'none';
    nextRoundArea.style.display = 'block';

    myAvatar.classList.remove('active-turn');
    opponentAvatar.classList.remove('active-turn');
}

socket.on('opponentTyping', ({ isTyping }) => {
    if (opponentThinking) opponentThinking.style.display = isTyping ? 'block' : 'none';
});

socket.on('opponentDisconnected', () => {
    turnIndicator.textContent = 'Opponent is offline. Waiting for them to reconnect...';
});

socket.on('error', (message) => {
    gameError.textContent = message;
    landingError.textContent = message;

    // Check if element exists before shaking
    if (gamePage.style.display === 'block') {
        showError(gameError, message);
    } else {
        showError(landingError, message);
    }

    if (message === 'Room not found' && sessionStorage.getItem('tv0_room')) {
        sessionStorage.removeItem('tv0_room');
        location.reload();
    }
});

function updateTurnUI(turn) {
    const isMyTurn = turn === `player${playerNumber}`;
    currentTurnIsMine = isMyTurn;
    guessInput.disabled = !isMyTurn;
    guessBtn.disabled = !isMyTurn;

    myAvatar.classList.remove('active-turn');
    opponentAvatar.classList.remove('active-turn');
    const activeAvatar = isMyTurn ? myAvatar : opponentAvatar;
    if (activeAvatar) activeAvatar.classList.add('active-turn');

    if (isMyTurn) {
        guessInput.focus();
    } else {
        guessInput.value = '';
    }
}

// Check auto-rejoin
const savedRoom = sessionStorage.getItem('tv0_room');
if (username && savedRoom && !isSinglePlayer) {
    socket.emit('rejoinRoom', { roomCode: savedRoom, username });
}

// Initialize based on game mode
function initializePage() {
    if (isSinglePlayer) {
        // Initialize computer game
        computerSecret = generateComputerSecret();
        singlePlayerAttempts = 0;
        
        secretSetup.style.display = 'none';
        secretBanner.style.display = 'none';
        gameArea.style.display = 'flex';
        timerWrapper.style.display = 'none';
        turnIndicator.textContent = "Computer has chosen a secret number!";
        
        guessInputArea.style.display = 'flex';
        nextRoundArea.style.display = 'none';
        
        guessInput.disabled = false;
        guessBtn.disabled = false;
        guessInput.focus();
        
        document.getElementById('opponentGuessesPanel').style.display = 'none';
        myNameEl.textContent = 'You';
        myScoreEl.textContent = '0';
        myAvatar.src = getAvatarUrl('You');
        myAvatar.style.display = 'inline-block';
        myAvatar.classList.add('active-turn');
        
        opponentNameEl.textContent = 'Computer';
        opponentScoreEl.textContent = '-';
        opponentAvatar.src = getAvatarUrl('Robot');
        opponentAvatar.style.display = 'inline-block';
        
        landingPage.style.display = 'none';
        gamePage.style.display = 'block';
    } else {
        // Initialize online game - show landing page
        landingPage.style.display = 'block';
        gamePage.style.display = 'none';
    }
}

// Initialize
renderDigitGrid();
initializePage();