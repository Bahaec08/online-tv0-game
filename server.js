const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// Game rooms storage
const rooms = {};

// Map socket id to { roomCode, playerKey } for disconnect logic
const socketToPlayerInfo = {};

// Garbage Collection for inactive rooms
setInterval(() => {
    const now = Date.now();
    for (const roomCode in rooms) {
        if (now - rooms[roomCode].lastActivity > 30 * 60 * 1000) { // 30 mins
            if (rooms[roomCode].timer) clearTimeout(rooms[roomCode].timer);
            delete rooms[roomCode];
            console.log(`Cleaned up inactive room: ${roomCode}`);
        }
    }
}, 10 * 60 * 1000);

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function isValidProNumber(numStr) {
    if (typeof numStr !== 'string') return false;
    if (!/^\d{3}$/.test(numStr)) return false;
    if (numStr[0] === '0') return false;
    let digits = numStr.split('');
    return new Set(digits).size === 3;
}

function evaluateFeedbackLeftToRight(secret, guess) {
    if (typeof secret !== 'string' || typeof guess !== 'string' || secret.length !== 3 || guess.length !== 3) return '';
    const secretArr = secret.split('');
    const guessArr = guess.split('');
    
    let usedInSecret = [false, false, false];
    let feedback = [];
    
    // Step 1: Identify exact matches (T)
    for (let i = 0; i < 3; i++) {
        if (guessArr[i] === secretArr[i]) {
            feedback[i] = 'T';
            usedInSecret[i] = true;
        } else {
            feedback[i] = null;
        }
    }
    
    // Step 2: Check for wrong position (V)
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

function updateActivity(roomCode) {
    if (rooms[roomCode]) {
        rooms[roomCode].lastActivity = Date.now();
    }
}

function clearRoomTimer(roomCode) {
    const room = rooms[roomCode];
    if (room && room.timer) {
        clearTimeout(room.timer);
        room.timer = null;
    }
}

function startRoundTimer(roomCode) {
    const room = rooms[roomCode];
    if (!room) return;
    
    clearRoomTimer(roomCode);
    
    const duration = room.timerDuration || 15;
    room.timer = setTimeout(() => {
        handleTurnTimeout(roomCode);
    }, duration * 1000 + 500); // duration + 500ms grace period
    
    io.to(roomCode).emit('timerStarted', { duration: duration });
}

function handleTurnTimeout(roomCode) {
    const room = rooms[roomCode];
    if (!room || !room.gameStarted) return;
    updateActivity(roomCode);
    
    const currentPlayer = room.currentTurn;
    const opponentKey = currentPlayer === 'player1' ? 'player2' : 'player1';
    
    io.to(roomCode).emit('turnTimeout', {
        player: currentPlayer,
        message: `${room.usernames[currentPlayer]} ran out of time! Turn skipped.`
    });
    
    if (room.pendingDrawChance === currentPlayer) {
        // Failed the draw chance
        const trueWinner = opponentKey;
        finishRound(roomCode, trueWinner);
    } else {
        room.currentTurn = opponentKey;
        io.to(roomCode).emit('turnChanged', {
            turn: room.currentTurn,
            message: `${room.usernames[room.currentTurn]}'s turn to guess`
        });
        startRoundTimer(roomCode);
    }
}

function resetRoundState(roomCode, nextStarter) {
    const room = rooms[roomCode];
    if (!room) return;
    room.gameStarted = false;
    room.playerSecrets = {};
    room.playerReady = {};
    room.guesses = { player1: [], player2: [] };
    room.pendingDrawChance = null;
    clearRoomTimer(roomCode);
    room.currentTurn = nextStarter || room.roundFirstPlayer || 'player1';
}

function finishRound(roomCode, winnerKey) {
    const room = rooms[roomCode];
    if (!room) return;
    
    room.scores[winnerKey]++;
    const winnerName = room.usernames[winnerKey];
    
    if (room.scores[winnerKey] >= 5) {
        io.to(roomCode).emit('gameWon', {
            winner: winnerKey,
            winnerName: winnerName,
            scores: room.scores,
            message: `${winnerName} wins the game!`
        });
    } else {
        io.to(roomCode).emit('roundWon', {
            winner: winnerKey,
            scores: room.scores,
            message: `${winnerName} guessed the number correctly!`
        });
        resetRoundState(roomCode, winnerKey === 'player1' ? 'player2' : 'player1');
    }
}

io.on('connection', (socket) => {
    // createRoom
    socket.on('createRoom', ({ username, timerDuration }) => {
        const roomCode = generateRoomCode();
        const duration = timerDuration && [10, 15, 20].includes(timerDuration) ? timerDuration : 15;
        rooms[roomCode] = {
            roomCode,
            players: [socket.id],
            usernames: { player1: username, player2: null },
            playerNumbers: {},
            scores: { player1: 0, player2: 0 },
            playerSecrets: {},
            guesses: { player1: [], player2: [] },
            currentTurn: null,
            roundFirstPlayer: null,
            gameStarted: false,
            playerReady: {},
            sockets: { player1: socket.id, player2: null },
            lastActivity: Date.now(),
            timer: null,
            timerDuration: duration,
            pendingDrawChance: null
        };
        rooms[roomCode].playerNumbers[socket.id] = 1;
        socketToPlayerInfo[socket.id] = { roomCode, playerKey: 'player1' };
        socket.join(roomCode);
        socket.emit('roomCreated', { roomCode, playerNumber: 1, usernames: rooms[roomCode].usernames });
    });

    // joinRoom
    socket.on('joinRoom', ({ roomCode, username }) => {
        roomCode = roomCode.toUpperCase();
        const room = rooms[roomCode];
        if (!room) return socket.emit('error', 'Room not found');
        if (room.players.length >= 2 && !Object.values(room.usernames).includes(username)) return socket.emit('error', 'Room is full');
        if (room.usernames.player1 === username && room.players.length === 1) return socket.emit('error', 'Username already taken');

        updateActivity(roomCode);
        room.players.push(socket.id);
        room.playerNumbers[socket.id] = 2;
        room.usernames.player2 = username;
        room.sockets.player2 = socket.id;
        socket.join(roomCode);
        socketToPlayerInfo[socket.id] = { roomCode, playerKey: 'player2' };
        
        socket.emit('roomJoined', { 
            roomCode, playerNumber: 2, usernames: room.usernames, scores: room.scores
        });
        io.to(room.sockets.player1).emit('opponentJoined', { usernames: room.usernames, scores: room.scores });
    });

    // rejoinRoom
    socket.on('rejoinRoom', ({ roomCode, username }) => {
        const room = rooms[roomCode];
        if (!room) return socket.emit('error', 'Room not found');
        
        updateActivity(roomCode);
        let playerKey = null, playerNumber = null;
        if (room.usernames.player1 === username) { playerKey = 'player1'; playerNumber = 1; }
        else if (room.usernames.player2 === username) { playerKey = 'player2'; playerNumber = 2; }
        else return socket.emit('error', 'Could not authenticate to rejoin');
        
        room.sockets[playerKey] = socket.id;
        room.playerNumbers[socket.id] = playerNumber;
        if (!room.players.includes(socket.id)) room.players.push(socket.id);
        socketToPlayerInfo[socket.id] = { roomCode, playerKey };
        socket.join(roomCode);
        
        const opponentKey = playerKey === 'player1' ? 'player2' : 'player1';
        socket.emit('syncState', {
            roomCode, playerNumber, usernames: room.usernames, scores: room.scores,
            gameStarted: room.gameStarted, currentTurn: room.currentTurn,
            mySecret: room.playerSecrets[playerKey] || null,
            opponentReady: !!room.playerReady[opponentKey],
            guesses: room.guesses,
            pendingDrawChance: room.pendingDrawChance
        });
    });

    // setSecret
    socket.on('setSecret', ({ roomCode, secret }) => {
        const room = rooms[roomCode];
        if (!room) return;
        updateActivity(roomCode);
        
        if (!isValidProNumber(secret)) return socket.emit('error', 'Invalid secret number');
        
        const playerNumber = room.playerNumbers[socket.id];
        const playerKey = `player${playerNumber}`;
        const opponentKey = playerNumber === 1 ? 'player2' : 'player1';
        
        room.playerSecrets[playerKey] = secret;
        room.playerReady[playerKey] = true;
        
        socket.emit('secretSet', { playerNumber, secret });
        if (room.sockets[opponentKey]) io.to(room.sockets[opponentKey]).emit('opponentSecretSet');
        
        if (room.playerReady.player1 && room.playerReady.player2) {
            room.gameStarted = true;
            if (!room.currentTurn) room.currentTurn = 'player1'; 
            room.roundFirstPlayer = room.currentTurn;
            
            io.to(roomCode).emit('gameStart', {
                turn: room.currentTurn,
                message: 'Game started! Player ' + (room.currentTurn === 'player1' ? '1' : '2') + ' goes first'
            });
            startRoundTimer(roomCode);
        }
    });

    // typing
    socket.on('typing', ({ roomCode, isTyping }) => {
        const room = rooms[roomCode];
        if (!room) return;
        updateActivity(roomCode);
        const playerNumber = room.playerNumbers[socket.id];
        const opponentKey = playerNumber === 1 ? 'player2' : 'player1';
        if (room.sockets[opponentKey]) {
            io.to(room.sockets[opponentKey]).emit('opponentTyping', { isTyping });
        }
    });

    // makeGuess
    socket.on('makeGuess', ({ roomCode, guess }) => {
        const room = rooms[roomCode];
        if (!room || !room.gameStarted) return;
        updateActivity(roomCode);
        
        const playerNumber = room.playerNumbers[socket.id];
        const currentPlayer = `player${playerNumber}`;
        const opponentKey = playerNumber === 1 ? 'player2' : 'player1';
        
        if (room.currentTurn !== currentPlayer) return socket.emit('error', 'Not your turn');
        if (!isValidProNumber(guess)) return socket.emit('error', 'Invalid guess');
        
        const opponentSecret = room.playerSecrets[opponentKey];
        if (!opponentSecret) return socket.emit('error', 'Opponent secret not set');
        
        clearRoomTimer(roomCode);
        
        const feedback = evaluateFeedbackLeftToRight(opponentSecret, guess);
        room.guesses[currentPlayer].push({ player: currentPlayer, guess, feedback, timestamp: Date.now() });
        
        io.to(roomCode).emit('guessResult', { guesser: currentPlayer, guess, feedback, playerNumber });
        
        if (feedback === 'TTT') {
            const playerTurnOrder = room.roundFirstPlayer === currentPlayer ? 1 : 2;
            
            if (playerTurnOrder === 1) {
                // First player won. Second player gets draw chance.
                room.pendingDrawChance = opponentKey;
                room.currentTurn = opponentKey;
                io.to(roomCode).emit('drawChance', {
                    player: opponentKey,
                    message: `${room.usernames[currentPlayer]} guessed the number! ${room.usernames[opponentKey]} gets one last chance to draw!`,
                });
                startRoundTimer(roomCode);
                return;
            } else {
                // Second player won
                if (room.pendingDrawChance === currentPlayer) {
                    // It's a draw!
                    io.to(roomCode).emit('roundDraw', {
                        scores: room.scores,
                        message: `Both players guessed correctly! Round is a DRAW!`
                    });
                    resetRoundState(roomCode, currentPlayer === 'player1' ? 'player2' : 'player1');
                    return;
                } else {
                    // Normal win
                    finishRound(roomCode, currentPlayer);
                    return;
                }
            }
        } else {
            if (room.pendingDrawChance === currentPlayer) {
                // Failed draw chance
                finishRound(roomCode, opponentKey);
                return;
            }
            
            // Switch turn properly
            room.currentTurn = opponentKey;
            io.to(roomCode).emit('turnChanged', {
                turn: room.currentTurn,
                message: `${room.usernames[room.currentTurn]}'s turn to guess`
            });
            startRoundTimer(roomCode);
        }
    });

    // disconnect
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        const info = socketToPlayerInfo[socket.id];
        if (info) {
            const room = rooms[info.roomCode];
            if (room) {
                updateActivity(info.roomCode);
                const opponentKey = info.playerKey === 'player1' ? 'player2' : 'player1';
                if (room.sockets[opponentKey]) {
                    io.to(room.sockets[opponentKey]).emit('opponentDisconnected');
                }
                if (room.sockets[info.playerKey] === socket.id) {
                    room.sockets[info.playerKey] = null;
                }
            }
            delete socketToPlayerInfo[socket.id];
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});