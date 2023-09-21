const mongoose = require('mongoose');
const jwt = require('jsonwebtoken')
const ContactList = new mongoose.Schema({


    userId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
    },
    Contacts: [
        {
            ContactUserId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Contact',
                required: true,
            },
            randomNumber: {
                type: String,
                required: true,
            },
            contactName: {
                type: String,
                required: true
            },
        }
    ],

    createdAt: {
        type: Date,
        default: Date.now
    },
});


const Contacts = mongoose.model('Contacts', ContactList);

module.exports = Contacts;