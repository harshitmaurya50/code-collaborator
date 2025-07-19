
const cors = require('cors');
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const ACTIONS = require('./Actions');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(cors());
app.use(express.static('build'));
app.use((req, res, next) => {
    res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

const userSocketMap = {}; // socketId -> username
const roomClients = {}; // roomId -> [{ socketId, username }]

function getAllConnectedClients(roomId) {
    return roomClients[roomId] || [];
}

io.on('connection', (socket) => {
    console.log('✅ Socket connected:', socket.id);

    // When a user joins a room
    socket.on(ACTIONS.JOIN, ({ roomId, username }) => {
        userSocketMap[socket.id] = username;

        if (!roomClients[roomId]) {
            roomClients[roomId] = [];
        }

        // ✅ Avoid duplicate usernames in the same room
        const alreadyExists = roomClients[roomId].some(
            (client) => client.username === username
        );

        if (!alreadyExists) {
            roomClients[roomId].push({ socketId: socket.id, username });
        }

        socket.join(roomId);

        const clients = getAllConnectedClients(roomId);

        // Notify all clients in the room
        clients.forEach(({ socketId }) => {
            io.to(socketId).emit(ACTIONS.JOINED, {
                clients,
                username,
                socketId: socket.id,
            });
        });

        console.log(`✅ ${username} joined room ${roomId}`);
    });

    // Handle real-time code changes
    socket.on(ACTIONS.CODE_CHANGE, ({ roomId, code }) => {
        socket.in(roomId).emit(ACTIONS.CODE_CHANGE, { code });
    });

    // Sync code to new user
    socket.on(ACTIONS.SYNC_CODE, ({ socketId, code }) => {
        io.to(socketId).emit(ACTIONS.CODE_CHANGE, { code });
    });

    // When user disconnects
    socket.on('disconnecting', () => {
        const rooms = [...socket.rooms];
        const username = userSocketMap[socket.id];

        rooms.forEach((roomId) => {
            if (roomClients[roomId]) {
                // Remove user from room list
                roomClients[roomId] = roomClients[roomId].filter(
                    (client) => client.socketId !== socket.id
                );

                // Notify others in the room
                socket.in(roomId).emit(ACTIONS.DISCONNECTED, {
                    socketId: socket.id,
                    username,
                });

                if (roomClients[roomId].length === 0) {
                    delete roomClients[roomId]; // cleanup empty rooms
                }
            }
        });

        delete userSocketMap[socket.id];
        console.log(`❌ ${username} disconnected`);
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
