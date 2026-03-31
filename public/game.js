const socket = io();

// State
let currentRoom = null;
let playerNumber = null;
let mySecret = null;
let gameStarted = false;
let eliminatedDigits = new Array(10).fill(false);
let username = sessionStorage.getItem('tv0_username') || '';

// Single Player State
let isSinglePlayer = false;
let computerSecret = null;
let singlePlayerAttempts = 0;

// DOM Elements - Home
const homePage = document.getElementById('homePage');
const howToPlayBtn = document.getElementById('howToPlayBtn');
const playComputerBtn = document.getElementById('playComputerBtn');
const playOnlineBtn = document.getElementById('playOnlineBtn');
const instructionsModal = document.getElementById('instructionsModal');
const closeInstructionsBtn = document.getElementById('closeInstructionsBtn');

// DOM Elements - Landing
const landingPage = document.getElementById('landingPage');
const gamePage = document.getElementById('gamePage');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const roomCodeInput = document.getElementById('roomCodeInput');
const usernameInput = document.getElementById('usernameInput');
const landingError = document.getElementById('landingError');
const backToHomeBtn = document.getElementById('backToHomeBtn');

if (username) usernameInput.value = username;

// DOM Elements - Game
const roomInfo = document.getElementById('roomInfo');
const quitGameBtn = document.getElementById('quitGameBtn');

// Avatars and Players
const player1NameEl = document.getElementById('player1Name');
const player2NameEl = document.getElementById('player2Name');
const player1ScoreEl = document.getElementById('player1Score');
const player2ScoreEl = document.getElementById('player2Score');
const player1Avatar = document.getElementById('player1Avatar');
const player2Avatar = document.getElementById('player2Avatar');
const player1Thinking = document.getElementById('player1Thinking');
const player2Thinking = document.getElementById('player2Thinking');

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

// --- Home Page Navigation ---
howToPlayBtn.addEventListener('click', () => {
    instructionsModal.style.display = 'flex';
});
closeInstructionsBtn.addEventListener('click', () => {
    instructionsModal.style.display = 'none';
});
playOnlineBtn.addEventListener('click', () => {
    homePage.style.display = 'none';
    landingPage.style.display = 'block';
});
backToHomeBtn.addEventListener('click', () => {
    landingPage.style.display = 'none';
    homePage.style.display = 'block';
});
playComputerBtn.addEventListener('click', () => {
    isSinglePlayer = true;
    homePage.style.display = 'none';
    gamePage.style.display = 'block';
    
    computerSecret = generateComputerSecret();
    singlePlayerAttempts = 0;
    
    secretSetup.style.display = 'none';
    secretBanner.style.display = 'none';
    gameArea.style.display = 'flex';
    timerWrapper.style.display = 'none';
    turnIndicator.textContent = "Computer has chosen a secret number!";
    turnMessage.textContent = 'Your turn to guess!';
    
    guessInputArea.style.display = 'flex';
    nextRoundArea.style.display = 'none';
    
    guessInput.disabled = false;
    guessBtn.disabled = false;
    guessInput.focus();
    
    document.getElementById('opponentGuessesPanel').style.display = 'none';
    player1NameEl.textContent = 'You';
    player1ScoreEl.textContent = '0';
    player1Avatar.src = getAvatarUrl('You');
    player1Avatar.style.display = 'inline-block';
    player1Avatar.classList.add('active-turn');
    
    player2NameEl.textContent = 'Computer';
    player2ScoreEl.textContent = '-';
    player2Avatar.src = getAvatarUrl('Robot');
    player2Avatar.style.display = 'inline-block';
});
quitGameBtn.addEventListener('click', () => {
    sessionStorage.removeItem('tv0_room');
    location.reload();
});
// --- End Home Page Navigation ---

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
        player1ScoreEl.textContent = singlePlayerAttempts;
        
        const feedback = evaluateFeedbackLeftToRight(computerSecret, guess);
        addGuessToUI(guess, feedback, true);
        
        guessInput.value = '';
        guessInput.focus();
        
        if (feedback === 'TTT') {
            guessInput.disabled = true;
            guessBtn.disabled = true;
            turnIndicator.textContent = `You found the secret in ${singlePlayerAttempts} attempts! 🎉`;
            turnMessage.textContent = '';
            
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
    turnMessage.textContent = 'Waiting for result...';
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
    player1NameEl.textContent = usernames.player1 || 'Player 1';
    player1ScoreEl.textContent = scores.player1 || 0;
    if (usernames.player1) {
        player1Avatar.src = getAvatarUrl(usernames.player1);
        player1Avatar.style.display = 'inline-block';
    }

    player2NameEl.textContent = usernames.player2 || 'Waiting...';
    player2ScoreEl.textContent = scores.player2 || 0;
    if (usernames.player2) {
        player2Avatar.src = getAvatarUrl(usernames.player2);
        player2Avatar.style.display = 'inline-block';
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
    timerWrapper.style.display = 'block';
    timerBar.classList.remove('timer-active');
    void timerBar.offsetWidth; // reset animation
    timerBar.style.animationDuration = `${duration}s`;
    timerBar.classList.add('timer-active');
});

socket.on('guessResult', ({ guesser, guess, feedback, playerNumber: pNum }) => {
    const isMyGuess = (playerNumber === pNum);
    addGuessToUI(guess, feedback, isMyGuess);
    if (!isMyGuess) {
        turnIndicator.textContent = `Opponent guessed ${guess} → ${feedback}`;
    }
    player1Thinking.style.display = 'none';
    player2Thinking.style.display = 'none';
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
    player1ScoreEl.textContent = scores.player1;
    player2ScoreEl.textContent = scores.player2;
    timerWrapper.style.display = 'none';

    winnerText.textContent = `${winnerName} Wins! 🏆`;
    winnerOverlay.style.display = 'flex';
});

function endRound(message, scores) {
    gameStarted = false;
    guessInput.disabled = true;
    guessBtn.disabled = true;
    player1ScoreEl.textContent = scores.player1;
    player2ScoreEl.textContent = scores.player2;
    turnIndicator.textContent = message;
    timerWrapper.style.display = 'none';
    guessInputArea.style.display = 'none';
    nextRoundArea.style.display = 'block';

    player1Avatar.classList.remove('active-turn');
    player2Avatar.classList.remove('active-turn');
}

socket.on('opponentTyping', ({ isTyping }) => {
    const oppKey = playerNumber === 1 ? 'player2' : 'player1';
    const thinkEmote = document.getElementById(`${oppKey}Thinking`);
    if (thinkEmote) thinkEmote.style.display = isTyping ? 'block' : 'none';
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
    guessInput.disabled = !isMyTurn;
    guessBtn.disabled = !isMyTurn;

    player1Avatar.classList.remove('active-turn');
    player2Avatar.classList.remove('active-turn');
    const activeAvatar = turn === 'player1' ? player1Avatar : player2Avatar;
    activeAvatar.classList.add('active-turn');

    if (isMyTurn) {
        turnMessage.textContent = 'Your turn to guess!';
        guessInput.focus();
    } else {
        turnMessage.textContent = "Opponent's turn...";
        guessInput.value = '';
    }
}

// Check auto-rejoin
const savedRoom = sessionStorage.getItem('tv0_room');
if (username && savedRoom) {
    socket.emit('rejoinRoom', { roomCode: savedRoom, username });
}

// Initialize
renderDigitGrid();