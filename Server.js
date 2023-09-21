// server/server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const GenerateNumber = require('./routes/auth');
const cors = require('cors');
const multer = require('multer');

const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

//Enable CORS for all origins
app.use(cors());

// Parse JSON body
app.use(express.json());

// MongoDB configuration (replace YOUR_MONGODB_URI with your actual MongoDB connection string)
const DB = process.env.ATLAS_URI

mongoose.connect(DB, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
}).then(() => {
    console.log('connection succesfull');
}).catch((err) => console.log('Error in connecting to DataBase', err.message));

// Routes
const authRoutes = require('./routes/auth');
app.use(authRoutes);

// Define a ChatMessage schema
const chatRoomSchema = new mongoose.Schema({
    room: { type: String, required: true, unique: true },
    messages: [{
        sender: { type: String, required: true },
        recipient: { type: String, required: true },
        message: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
    }],
});
const ChatRoom = mongoose.model('ChatRoom', chatRoomSchema);

let userCount = 0;

io.on('connection', (socket) => {
    userCount++; // Increment the user count when a user connects
    console.log(`A user connected (Total users: ${userCount})`);

    // Route for joining a private chat room
    socket.on('joinRoom', (data) => {
        const { sender, recipient } = data;

        // Create a unique room name based on user IDs
        const room = [sender, recipient].sort().join('-');

        // Join the private room
        socket.join(room);
    });

    // Route for sending a chat message
    socket.on('send', async (data) => {
        const { sender, recipient, message } = data;

        try {
            // Create a unique room name for this chat
            const room = [sender, recipient].sort().join('-');

            // Find the chat room by room name
            let chatRoom = await ChatRoom.findOne({ room });

            if (!chatRoom) {
                // If the chat room does not exist, create a new one
                chatRoom = new ChatRoom({ room, messages: [] });
            }

            // Append the new message to the messages array
            chatRoom.messages.push({ sender, recipient, message });

            // Save the updated chat room
            await chatRoom.save();

            // Emit the message to all users in the room (sender and recipient)
            io.to(room).emit('message', { sender, recipient, message });
        } catch (error) {
            console.error('Error saving message:', error);
        }
    });

    // Route for retrieving chat messages for a specific room
    socket.on('getMessages', async (data) => {
        const { sender, recipient } = data;

        try {
            // Create a unique room name for this chat
            const room = [sender, recipient].sort().join('-');

            // Find the chat room by room name and retrieve messages
            const chatRoom = await ChatRoom.findOne({ room });

            if (chatRoom) {
                const messages = chatRoom.messages;

                // Emit the retrieved messages to the client
                socket.emit('messages', messages);
            } else {
                // If the chat room does not exist, emit an empty array
                socket.emit('messages', []);
            }
        } catch (error) {
            console.error('Error retrieving messages:', error);
        }
    });

    // Add a new route or event for message deletion
    socket.on('deleteMessages', async (data) => {
        const { room } = data;

        try {
            // Find the chat room by room name
            const chatRoom = await ChatRoom.findOne({ room });

            if (chatRoom) {
                // Remove all messages from the chat room
                chatRoom.messages = [];

                // Save the updated chat room
                await chatRoom.save();

                // Emit a confirmation or success message
                socket.emit('messagesDeleted', { room });
            } else {
                // If the chat room does not exist, emit an error message
                socket.emit('deleteError', { room, error: 'Chat room not found' });
            }
        } catch (error) {
            console.error('Error deleting messages:', error);

            // Emit an error message if an error occurs during deletion
            socket.emit('deleteError', { room, error: 'An error occurred while deleting messages' });
        }
    });


    socket.on('disconnect', () => {
        userCount--; // Decrement the user count when a user disconnects
        console.log(`A user disconnected (Total users: ${userCount})`);
    });
});


// io.on('connection', (socket) => {
//     console.log('A user connected');
//   // Route for joining a private chat room
//   socket.on('joinRoom', (data) => {
//     const { sender, recipient } = data;

//     // Create a unique room name based on user IDs
//     const room = [sender, recipient].sort().join('-');

//     // Join the private room
//     socket.join(room);
// });

// // Route for sending a chat message
// socket.on('send', async (data) => {
//     const { sender, recipient, message } = data;

//     try {
//         // Create a unique room name for this chat
//         const room = [sender, recipient].sort().join('-');

//         // Find the chat room by room name
//         let chatRoom = await ChatRoom.findOne({ room });

//         if (!chatRoom) {
//             // If the chat room does not exist, create a new one
//             chatRoom = new ChatRoom({ room, messages: [] });
//         }

//         // Append the new message to the messages array
//         chatRoom.messages.push({ sender, recipient, message });

//         // Save the updated chat room
//         await chatRoom.save();

//         // Emit the message to all users in the room (sender and recipient)
//         io.to(room).emit('message', { sender, recipient, message });
//     } catch (error) {
//         console.error('Error saving message:', error);
//     }
// });

// // Route for retrieving chat messages for a specific room
// socket.on('getMessages', async (data) => {
//     const { sender, recipient } = data;

//     try {
//         // Create a unique room name for this chat
//         const room = [sender, recipient].sort().join('-');

//         // Find the chat room by room name and retrieve messages
//         const chatRoom = await ChatRoom.findOne({ room });

//         if (chatRoom) {
//             const messages = chatRoom.messages;

//             // Emit the retrieved messages to the client
//             socket.emit('messages', messages);
//         } else {
//             // If the chat room does not exist, emit an empty array
//             socket.emit('messages', []);
//         }
//     } catch (error) {
//         console.error('Error retrieving messages:', error);
//     }
// });


// });

// Start the server with Socket.io support
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});


// Start the server
// const PORT = process.env.PORT || 5000;
// app.listen(PORT, () => {
//     console.log(`Server running on port ${PORT}`);
// });

