const mongoose = require('mongoose');

const chatRoomSchema = new mongoose.Schema({
    room: {
        type: String,
        required: true,
        unique: true
    },
    messages: [{
        sender: {
            type: String,
            required: true
        },
        recipient: {
            type: String,
            required: true
        },
        message: {
            type: String,
            required: true
        },
        image: {
            type: String,
        },
        timestamp: {
            type: Date,
            default: Date.now
        },
    }],
});
const ChatRoom = mongoose.model('ChatRoom', chatRoomSchema);

module.exports = ChatRoom;