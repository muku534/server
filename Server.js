// server/server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const GenerateNumber = require('./routes/auth');
const cors = require('cors');
const multer = require('multer');
const ChatRoom = require('./model/ChatRoom')
const cloudinary = require('cloudinary').v2;

const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

//Enable CORS for all origins
app.use(cors());

// Parse JSON body
app.use(express.json());

//setting up cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
})

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


let userCount = 0;

io.on('connection', (socket) => {
    userCount++;

    // Handle reconnections with a maximum delay of 10 seconds
    socket.on('disconnect', () => {
        setTimeout(() => {
            if (socket.disconnected) {
                userCount--;
                console.log(`A user disconnected (Socket ID: ${socket.id}, Total users: ${userCount})`);
            }
        }, 10000);
    });

    // Log user connections only when a user actually connects
    console.log(`A user connected (Socket ID: ${socket.id}, Total users: ${userCount})`);

    // Route for joining a private chat room
    socket.on('joinRoom', (data) => {
        const { sender, recipient } = data;

        // Create unique room names for sender and recipient
        const room1 = [sender, recipient].sort().join('-');
        const room2 = [recipient, sender].sort().join('-');

        // Join both rooms
        socket.join(room1);
        socket.join(room2);
    });

    // Route for sending a chat message with file upload
    socket.on('send', async (data) => {
        const { sender, recipient, message, image } = data;
        console.log('Received File URI:', image);
        try {
            // Upload the file to Cloudinary
            const result = await cloudinary.uploader.upload(image, { folder: 'chatImages' }); // Replace 'your-folder-name' with the desired folder name in Cloudinary);

            // Create unique room names for sender and recipient
            const room1 = [sender, recipient].sort().join('-');
            const room2 = [recipient, sender].sort().join('-');

            // Check if the room already exists in the database
            const existingRoom = await ChatRoom.findOne({ room: room1 });

            if (!existingRoom) {
                // If the room does not exist, create it and initialize with empty messages
                const newChatRoom = new ChatRoom({ room: room1, messages: [] });
                await newChatRoom.save();
            }

            // Append the new message to the messages array
            // Save the updated chat room
            await Promise.all([
                ChatRoom.findOneAndUpdate({ room: room1 }, { $push: { messages: { sender, recipient, message, image: result.secure_url } } }, { upsert: true }),
                ChatRoom.findOneAndUpdate({ room: room2 }, { $push: { messages: { sender, recipient, message, image: result.secure_url } } }, { upsert: true }),
            ]);

            // Emit the message to both rooms (sender and recipient)
            io.to(room1).emit('message', { sender, recipient, message, image: result.secure_url });
            io.to(room2).emit('message', { sender, recipient, message, image: result.secure_url });
        } catch (error) {
            console.error('Error saving message:', error);
        }
    });

    // Route for retrieving chat messages for a specific room
    socket.on('getMessages', async (data) => {
        const { sender, recipient } = data;

        // Create unique room name for the conversation
        const room = [sender, recipient].sort().join('-');

        try {
            // Find the chat room by room name and retrieve messages
            const chatRoom = await ChatRoom.findOne({ room });

            if (chatRoom) {
                const messages = chatRoom.messages;

                // Emit the retrieved messages (including images) to the client in the same room
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
        userCount--;
        console.log(`A user disconnected (Socket ID: ${socket.id}, Total users: ${userCount})`);
    });
});



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

