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

// Helper function to generate room code
function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Helper function to validate number (pro rules)
function isValidProNumber(numStr) {
    if (!/^\d{3}$/.test(numStr)) return false;
    if (numStr[0] === '0') return false;
    let digits = numStr.split('');
    return new Set(digits).size === 3;
}

// Feedback function (left to right, shows T and V only)
function evaluateFeedbackLeftToRight(secret, guess) {
    if (secret.length !== 3 || guess.length !== 3) return '';
    
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

io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    // Create a new game room
    socket.on('createRoom', ({ username }) => {
        const roomCode = generateRoomCode();
        rooms[roomCode] = {
            players: [socket.id],
            usernames: {
                player1: username,
                player2: null
            },
            playerNumbers: {}, // maps socket.id to player number
            scores: {
                player1: 0,
                player2: 0
            },
            playerSecrets: {},
            guesses: {
                player1: [], // guesses made BY player1
                player2: []  // guesses made BY player2
            },
            currentTurn: null,
            gameStarted: false,
            playerReady: {},
            sockets: {
                player1: socket.id,
                player2: null
            }
        };
        
        socket.join(roomCode);
        rooms[roomCode].playerNumbers[socket.id] = 1;
        socketToPlayerInfo[socket.id] = { roomCode, playerKey: 'player1' };
        
        socket.emit('roomCreated', { 
            roomCode, 
            playerNumber: 1, 
            usernames: rooms[roomCode].usernames 
        });
        console.log(`Room created: ${roomCode} by ${socket.id} (${username})`);
    });

    // Join an existing room
    socket.on('joinRoom', ({ roomCode, username }) => {
        roomCode = roomCode.toUpperCase();
        const room = rooms[roomCode];
        
        if (!room) {
            socket.emit('error', 'Room not found');
            return;
        }
        
        if (room.players.length >= 2 && !Object.values(room.usernames).includes(username)) {
            socket.emit('error', 'Room is full');
            return;
        }
        
        // Prevent joining if username matches player1 to avoid conflicts
        if (room.usernames.player1 === username && room.players.length === 1) {
            socket.emit('error', 'Username already taken in this room');
            return;
        }

        room.players.push(socket.id);
        room.playerNumbers[socket.id] = 2;
        room.usernames.player2 = username;
        room.sockets.player2 = socket.id;
        
        socket.join(roomCode);
        socketToPlayerInfo[socket.id] = { roomCode, playerKey: 'player2' };
        
        socket.emit('roomJoined', { 
            roomCode, 
            playerNumber: 2, 
            usernames: room.usernames,
            scores: room.scores
        });
        
        // Notify player 1 that player 2 joined
        io.to(room.sockets.player1).emit('opponentJoined', {
            usernames: room.usernames,
            scores: room.scores
        });
        
        console.log(`Player 2 (${username}) joined room: ${roomCode}`);
    });

    // Rejoin an existing room (on page refresh)
    socket.on('rejoinRoom', ({ roomCode, username }) => {
        const room = rooms[roomCode];
        if (!room) {
            socket.emit('error', 'Room not found');
            return;
        }
        
        let playerKey = null;
        let playerNumber = null;
        
        if (room.usernames.player1 === username) {
            playerKey = 'player1';
            playerNumber = 1;
        } else if (room.usernames.player2 === username) {
            playerKey = 'player2';
            playerNumber = 2;
        } else {
            socket.emit('error', 'Could not authenticate to rejoin');
            return;
        }
        
        // Update socket references
        room.sockets[playerKey] = socket.id;
        room.playerNumbers[socket.id] = playerNumber;
        if (!room.players.includes(socket.id)) {
            room.players.push(socket.id);
        }
        socketToPlayerInfo[socket.id] = { roomCode, playerKey };
        
        socket.join(roomCode);
        
        // Construct sync state
        const opponentKey = playerKey === 'player1' ? 'player2' : 'player1';
        
        const state = {
            roomCode,
            playerNumber,
            usernames: room.usernames,
            scores: room.scores,
            gameStarted: room.gameStarted,
            currentTurn: room.currentTurn,
            mySecret: room.playerSecrets[playerKey] || null,
            opponentReady: !!room.playerReady[opponentKey],
            guesses: room.guesses
        };
        
        socket.emit('syncState', state);
        console.log(`Player ${playerNumber} (${username}) rejoined room: ${roomCode}`);
        
        // Notify other player that we're back potentially?
        // Not strictly necessary unless we showed them as offline, but good to ensure everything is smooth.
    });

    // Set player's secret number
    socket.on('setSecret', ({ roomCode, secret }) => {
        const room = rooms[roomCode];
        if (!room) return;
        
        if (!isValidProNumber(secret)) {
            socket.emit('error', 'Invalid secret number');
            return;
        }
        
        const playerNumber = room.playerNumbers[socket.id];
        const playerKey = `player${playerNumber}`;
        const opponentKey = playerNumber === 1 ? 'player2' : 'player1';
        
        room.playerSecrets[playerKey] = secret;
        room.playerReady[playerKey] = true;
        
        // Send the secret back to the player to display
        socket.emit('secretSet', { playerNumber, secret });
        
        // Notify opponent that secret is set
        if (room.sockets[opponentKey]) {
            io.to(room.sockets[opponentKey]).emit('opponentSecretSet');
        }
        
        // Check if both players are ready
        if (room.playerReady.player1 && room.playerReady.player2) {
            room.gameStarted = true;
            // The person who lost the last round (or P1) starts, but let's keep P1 for simplicity, 
            // or switch based on logic. We'll default to P1.
            if (!room.currentTurn) room.currentTurn = 'player1'; 
            
            io.to(roomCode).emit('gameStart', {
                turn: room.currentTurn,
                message: 'Game started! Player ' + (room.currentTurn === 'player1' ? '1' : '2') + ' goes first'
            });
        }
    });

    // Player makes a guess
    socket.on('makeGuess', ({ roomCode, guess }) => {
        const room = rooms[roomCode];
        if (!room || !room.gameStarted) return;
        
        const playerNumber = room.playerNumbers[socket.id];
        const currentPlayer = `player${playerNumber}`;
        const opponentNumber = playerNumber === 1 ? 2 : 1;
        const opponentKey = `player${opponentNumber}`;
        
        if (room.currentTurn !== currentPlayer) {
            socket.emit('error', 'Not your turn');
            return;
        }
        
        if (!isValidProNumber(guess)) {
            socket.emit('error', 'Invalid guess');
            return;
        }
        
        const opponentSecret = room.playerSecrets[opponentKey];
        if (!opponentSecret) {
            socket.emit('error', 'Opponent secret not set');
            return;
        }
        
        // Server generates the feedback
        const feedback = evaluateFeedbackLeftToRight(opponentSecret, guess);
        
        // Store the guess
        const guessEntry = {
            player: currentPlayer,
            guess: guess,
            feedback: feedback,
            timestamp: Date.now()
        };
        
        room.guesses[currentPlayer].push(guessEntry);
        
        // Broadcast the guess result to both players so they see the final guess
        io.to(roomCode).emit('guessResult', {
            guesser: currentPlayer,
            guess: guess,
            feedback: feedback,
            playerNumber: playerNumber
        });
        
        // Check win condition for the round
        if (feedback === 'TTT') {
            room.scores[currentPlayer]++;
            const winnerName = room.usernames[currentPlayer];
            
            if (room.scores[currentPlayer] >= 5) {
                // Game completely won
                io.to(roomCode).emit('gameWon', {
                    winner: currentPlayer,
                    winnerName: winnerName,
                    scores: room.scores,
                    message: `${winnerName} wins the game!`
                });
            } else {
                // Round won
                io.to(roomCode).emit('roundWon', {
                    winner: currentPlayer,
                    scores: room.scores,
                    message: `${winnerName} guessed the number correctly!`
                });
                
                // Reset round state
                room.gameStarted = false;
                room.playerSecrets = {};
                room.playerReady = {};
                room.guesses = { player1: [], player2: [] };
                
                // Loser of the round (opponent) goes first next round
                room.currentTurn = opponentKey; 
            }
            return;
        }
        
        // Switch turn
        room.currentTurn = opponentKey;
        io.to(roomCode).emit('turnChanged', {
            turn: room.currentTurn,
            message: `${room.usernames[room.currentTurn]}'s turn to guess`
        });
    });

    // Player leaves or disconnects
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        
        const info = socketToPlayerInfo[socket.id];
        if (info) {
            const room = rooms[info.roomCode];
            if (room) {
                const opponentKey = info.playerKey === 'player1' ? 'player2' : 'player1';
                
                // Notify opponent if they are online
                if (room.sockets[opponentKey]) {
                    io.to(room.sockets[opponentKey]).emit('opponentDisconnected');
                }
                
                // We do NOT delete the room so they can rejoin on refresh
                // But we clear the socket ID from the mapping
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