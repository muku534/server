const express = require('express')
const jwt = require('jsonwebtoken')
const router = express.Router();
const bcrypt = require('bcrypt')
const multer = require('multer');
const nodemailer = require('nodemailer');
const randomstring = require('randomstring');
const Authentication = require('../middleware/Authentication');

const User = require('../model/UserDetails');
const Contacts = require('../model/ContactList');

const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: process.env.EMAIL,
        pass: process.env.APP_PASSWORD,
    },
});


// Define the storage for uploaded files
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/'); // Save files to the 'uploads' directory
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, file.fieldname + '-' + uniqueSuffix + '.' + file.mimetype.split('/')[1]);
    },
});


// POST request to save the generated number
router.post('/GenerateNumber', async (req, res) => {
    try {
        const randomNumber = Math.floor(Math.random() * 9000000000) + 1000000000;
        const newNumber = new User({ randomNumber: randomNumber.toString() });
        await newNumber.save();
        res.status(201).json({ success: true, randomNumber: newNumber.randomNumber });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Failed to generate and store number.' });
    }
});

router.post('/signin', async (req, res) => {
    try {
        const { randomNumber } = req.body;

        // Check if the number exists in the User Collection (MongoDB)
        const user = await User.findOne({ randomNumber });

        if (user) {
            // If the user exists, Generate a random OTP
            const otp = randomstring.generate({
                length: 6,
                charset: 'numeric',
            });

            // Store OTP in the User collection
            user.otp = otp;
            await user.save();

            // Send OTP via email
            const mailOptions = {
                from: process.env.EMAIL,
                to: user.email, // User's registered email address
                subject: 'OTP Verification',
                text: `Your OTP is: ${otp}`,
            };

            transporter.sendMail(mailOptions, (error, info) => {
                if (error) {
                    console.error('Error sending email:', error);
                    return res.status(500).json({ success: false, message: 'Email sending failed' });
                } else {
                    console.log('Email sent:', info.response);

                    // Generate JWT token and send it to the client
                    const token = jwt.sign({ phoneNumber: user.phoneNumber }, process.env.SECRET_KEY);
                    return res.json({ success: true, token });
                }
            });

        } else {
            // If the user doesn't exist, send a failure response
            return res.json({ success: false, message: 'User not found' });
        }
    } catch (error) {
        console.error('Error during login:', error);
        return res.status(500).json({ success: false, message: 'Login failed' });
    }
});

router.post('/verifyOTP', async (req, res) => {
    try {
        const { randomNumber, otp } = req.body;

        // Check if the number exists in the User Collection (MongoDB)
        const user = await User.findOne({ randomNumber });

        if (user) {
            // Verify the OTP
            if (user.otp === parseInt(otp)) {
                // If OTP is correct, generate a JWT token and send it to the client
                const token = jwt.sign({ phoneNumber: user.phoneNumber }, process.env.SECRET_KEY);

                // Store the token in the User Collection
                user.tokens.push({ token });

                // Save the updated user document
                await user.save();

                const userData = await User.findOne({ randomNumber })

                return res.json({ success: true, message: 'verified', token, userData });
            } else {
                // If OTP is incorrect, send a failure response
                return res.json({ success: false, message: 'Invalid OTP' });
            }
        } else {
            // If the user doesn't exist, send a failure response
            return res.json({ success: false, message: 'User not found' });
        }
    } catch (error) {
        console.error('Error during OTP verification:', error);
        return res.status(500).json({ success: false, message: 'OTP verification failed' });
    }
});

//logout 
router.post("/logout", async (req, res) => {

    res.cookie('token', null, {
        expires: new Date(Date.now()),
        httpOnly: true
    })

    res.status(200).json({
        success: true,
        message: 'logged out'
    })

})

// Create the multer middleware
const upload = multer({ storage: storage });


// POST request to save the user information 
router.post('/profile', async (req, res) => {
    try {
        const { randomNumber, name, bio, email } = req.body;

        // Check if randomNumber exists in the database
        const existingProfile = await User.findOne({ randomNumber });

        if (existingProfile) {
            // Update existing profile
            existingProfile.name = name;
            existingProfile.bio = bio;
            existingProfile.email = email;
            // Add other fields if needed

            await existingProfile.save();
            return res.json({ message: 'Profile updated successfully' });
        } else {
            // Create a new profile if randomNumber is not found
            const newProfile = new User({
                randomNumber,
                name,
                bio,
                email
                // Add other fields if needed
            });

            await newProfile.save();
            return res.json({ message: 'Profile created successfully' });
        }
    } catch (error) {
        console.error('Error saving profile:', error);
        return res.status(500).json({ message: 'Failed to save profile' });
    }
});

//POST request to add the new contacts 
router.post('/AddContacts', async (req, res) => {
    try {
        const { randomNumber, userRandomNumber, contactName } = req.body;

        // Check if the number exists in the User Collection
        const user = await User.findOne({ randomNumber });

        if (user) {
            const contactUser = await User.findOne({ randomNumber: userRandomNumber });

            if (contactUser) {

                // Get the userId of the user
                const userId = contactUser._id;

                // Create a new contact object
                const newContact = {
                    ContactUserId: user._id,
                    randomNumber,
                    contactName,
                };

                let contactlist = await Contacts.findOne({ userId });

                if (!contactlist) {
                    contactlist = new Contacts({
                        userId,
                        Contacts: []
                    });
                }

                contactlist.Contacts.push(newContact);

                await contactlist.save();


                return res.json({
                    success: true,
                    message: "Contact added successfully",
                    contacts: newContact
                    // userId: contactUser._id,
                    // randomNumber,
                    // userRandomNumber,
                    // contactUserId: user._id,
                    // contactName
                });
            } else {
                return res.json({
                    success: false,
                    message: "Contact number not found"
                });
            }
        } else {
            return res.json({
                success: false,
                message: "Number not found"
            });
        }
    } catch (error) {
        console.error('Error adding contact:', error);
        return res.status(500).json({ success: false, message: 'Failed to add contact' });
    }
});

//GET the Contacts 
router.get('/contacts', async (req, res) => {
    try {
        const { userRandomNumber } = req.query;

        // Check if the user with the provided randomNumber exists
        const user = await User.findOne({ randomNumber: userRandomNumber });
        console.log('userRandomNumber:', userRandomNumber);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        // Find the Contacts document associated with the user's _id
        const contactList = await Contacts.findOne({ userId: user._id });

        if (!contactList) {
            return res.status(404).json({
                success: false,
                message: "No contacts found for this user"
            });
        }

        // Return the list of contacts for the user
        return res.json({
            success: true,
            contacts: contactList.Contacts
        });
    } catch (error) {
        console.error('Error fetching contacts:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch contacts' });
    }
});



module.exports = router;