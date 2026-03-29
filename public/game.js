const socket = io();

// State
let currentRoom = null;
let playerNumber = null;
let mySecret = null;
let gameStarted = false;
let eliminatedDigits = new Array(10).fill(false);
let username = sessionStorage.getItem('tv0_username') || '';

// DOM Elements - Landing
const landingPage = document.getElementById('landingPage');
const gamePage = document.getElementById('gamePage');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const roomCodeInput = document.getElementById('roomCodeInput');
const usernameInput = document.getElementById('usernameInput');
const landingError = document.getElementById('landingError');

if (username) usernameInput.value = username;

// DOM Elements - Game
const roomInfo = document.getElementById('roomInfo');
const player1NameEl = document.getElementById('player1Name');
const player2NameEl = document.getElementById('player2Name');
const player1ScoreEl = document.getElementById('player1Score');
const player2ScoreEl = document.getElementById('player2Score');
const secretSetup = document.getElementById('secretSetup');
const secretBanner = document.getElementById('secretBanner');
const mySecretDisplay = document.getElementById('mySecretDisplay');
const gameArea = document.getElementById('gameArea');
const secretInput = document.getElementById('secretInput');
const setSecretBtn = document.getElementById('setSecretBtn');
const secretError = document.getElementById('secretError');
const turnIndicator = document.getElementById('turnIndicator');
const myGuesses = document.getElementById('myGuesses');
const opponentGuesses = document.getElementById('opponentGuesses');
const guessInput = document.getElementById('guessInput');
const guessBtn = document.getElementById('guessBtn');
const turnMessage = document.getElementById('turnMessage');
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

// Create room
createRoomBtn.addEventListener('click', () => {
    username = usernameInput.value.trim();
    if (!username) {
        landingError.textContent = 'Please enter a username';
        return;
    }
    sessionStorage.setItem('tv0_username', username);
    socket.emit('createRoom', { username });
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
        secretError.textContent = 'Invalid: 3 digits, no leading zero, all unique';
        return;
    }
    mySecret = secret;
    socket.emit('setSecret', {
        roomCode: currentRoom,
        secret
    });
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
        gameError.textContent = 'Invalid guess';
        return;
    }
    
    socket.emit('makeGuess', {
        roomCode: currentRoom,
        guess
    });
    
    guessInput.value = '';
    guessInput.disabled = true;
    guessBtn.disabled = true;
    turnMessage.textContent = 'Waiting for result...';
});

// Enter key handlers
secretInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') setSecretBtn.click();
});

guessInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !guessBtn.disabled) guessBtn.click();
});

nextRoundBtn.addEventListener('click', () => {
    // Reset board for next round
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

// Socket event handlers
socket.on('roomCreated', ({ roomCode, playerNumber: pNum, usernames }) => {
    setupGameUI(roomCode, pNum);
    updateScoreboard(usernames, {player1: 0, player2: 0});
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
    // Fired on rejoin
    setupGameUI(state.roomCode, state.playerNumber);
    updateScoreboard(state.usernames, state.scores);
    
    const myKey = `player${state.playerNumber}`;
    
    // Restore my secret if already set
    if (state.mySecret) {
        mySecret = state.mySecret;
        secretSetup.style.display = 'none';
        secretBanner.style.display = 'flex';
        mySecretDisplay.textContent = mySecret;
        gameArea.style.display = 'flex';
        gameArea.style.flexDirection = 'column';
        guessInputArea.style.display = 'flex';
        nextRoundArea.style.display = 'none';
    } else {
        secretSetup.style.display = 'block';
        secretBanner.style.display = 'none';
        gameArea.style.display = 'none';
    }
    
    // Restore guesses history
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
        if (!state.mySecret) {
            turnIndicator.textContent = 'Set your secret.';
        } else if (!state.opponentReady) {
            turnIndicator.textContent = 'Waiting for opponent to set secret...';
        }
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
    player1NameEl.textContent = usernames.player1 || 'Player 1';
    player2NameEl.textContent = usernames.player2 || 'Waiting...';
    player1ScoreEl.textContent = scores.player1 || 0;
    player2ScoreEl.textContent = scores.player2 || 0;
}

socket.on('secretSet', ({ playerNumber: pNum, secret }) => {
    if (pNum === playerNumber) {
        // Hide setup, show secret banner
        secretSetup.style.display = 'none';
        secretBanner.style.display = 'flex';
        mySecretDisplay.textContent = secret;
        gameArea.style.display = 'flex';
        gameArea.style.flexDirection = 'column';
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

socket.on('guessResult', ({ guesser, guess, feedback, playerNumber: pNum }) => {
    const isMyGuess = (playerNumber === pNum);
    addGuessToUI(guess, feedback, isMyGuess);
    
    if (!isMyGuess) {
        turnIndicator.textContent = `Opponent guessed ${guess} → ${feedback}`;
    }
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

socket.on('roundWon', ({ winner, message, scores }) => {
    gameStarted = false;
    guessInput.disabled = true;
    guessBtn.disabled = true;
    
    // Update scores
    player1ScoreEl.textContent = scores.player1;
    player2ScoreEl.textContent = scores.player2;
    
    turnIndicator.textContent = `🎉 ${message} 🎉`;
    
    guessInputArea.style.display = 'none';
    nextRoundArea.style.display = 'block';
});

socket.on('gameWon', ({ winner, message, winnerName, scores }) => {
    gameStarted = false;
    guessInput.disabled = true;
    guessBtn.disabled = true;
    
    // Update scores
    player1ScoreEl.textContent = scores.player1;
    player2ScoreEl.textContent = scores.player2;
    
    winnerText.textContent = `${winnerName} Wins! 🏆`;
    winnerOverlay.style.display = 'flex';
});

socket.on('opponentDisconnected', () => {
    // Only show simple message, do not reset game (we allow refresh/rejoin)
    turnIndicator.textContent = 'Opponent is offline. Waiting for them to reconnect...';
});

socket.on('error', (message) => {
    landingError.textContent = message;
    gameError.textContent = message;
    
    // If it's a join error and we were auto-rejoining, clear session
    if (message === 'Room not found' && sessionStorage.getItem('tv0_room')) {
        sessionStorage.removeItem('tv0_room');
        location.reload();
    }
});

function updateTurnUI(turn) {
    const isMyTurn = turn === `player${playerNumber}`;
    guessInput.disabled = !isMyTurn;
    guessBtn.disabled = !isMyTurn;
    
    if (isMyTurn) {
        turnMessage.textContent = 'Your turn to guess!';
        guessInput.focus();
    } else {
        turnMessage.textContent = "Opponent's turn...";
    }
}

// Check auto-rejoin
const savedRoom = sessionStorage.getItem('tv0_room');
if (username && savedRoom) {
    socket.emit('rejoinRoom', { roomCode: savedRoom, username });
}

// Initialize
renderDigitGrid();