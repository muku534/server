const express = require('express')
const jwt = require('jsonwebtoken')
const router = express.Router();
const bcrypt = require('bcrypt')
const multer = require('multer');
const nodemailer = require('nodemailer');
const randomstring = require('randomstring');
const Authentication = require('../middleware/Authentication');
const cloudinary = require('cloudinary').v2;

const User = require('../model/UserDetails');
const Contacts = require('../model/ContactList');
const ChatRoom = require('../model/ChatRoom')

const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: process.env.EMAIL,
        pass: process.env.APP_PASSWORD,
    },
});

//setting up cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
})

// Initialize multer for file upload
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });



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

// Upload an image to Cloudinary and create/update the profile
router.post('/profile', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Convert the buffer data to a data URI
        const dataUri = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;

        // Define upload options including the folder
        const uploadOptions = {
            folder: 'avatar', // Specify the folder name in Cloudinary
        };

        // Upload the data URI to Cloudinary with the specified options
        const cloudinaryResponse = await cloudinary.uploader.upload(dataUri, uploadOptions);

        // Extract image URL from Cloudinary response
        const imageUrl = cloudinaryResponse.secure_url;
        console.log(imageUrl)

        const { randomNumber, name, bio, email } = req.body;

        // Check if randomNumber exists in the database
        const userData = await User.findOne({ randomNumber });

        if (userData) {
            // Update existing profile
            userData.name = name;
            userData.bio = bio;
            userData.email = email;
            userData.imageUrl = imageUrl;
            // Add other fields if needed

            await userData.save();
            return res.json({ message: 'Profile updated successfully', userData });
        } else {
            // Create a new profile if randomNumber is not found
            const newProfile = new User({
                randomNumber,
                name,
                bio,
                email,
                imageUrl,
                // Add other fields if needed
            });

            await newProfile.save();
            return res.json({ message: 'Profile created successfully', newProfile });
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
                const imageUrl = contactUser.imageUrl;

                // Create a new contact object
                const newContact = {
                    ContactUserId: user._id,
                    randomNumber,
                    contactName,
                    imageUrl,
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

        if (!contactList || !contactList.Contacts || contactList.Contacts.length === 0) {
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


// router.get('/AllChatUsers', async (req, res) => {
//     try {
//         const { userId } = req.query;

//         // Find all chat rooms where the user is either the sender or recipient
//         const chatRooms = await ChatRoom.find({
//             userId: userId,
//             $or: [{ sender: userId }, { recipient: userId }]
//         });
//         console.log('userId', userId);

//         if (!chatRooms || chatRooms.length === 0) {
//             return res.status(404).json({
//                 success: false,
//                 message: "No chat rooms found for the user"
//             });
//         }

//         // Initialize an array to store all unique user IDs
//         const uniqueUserIds = [];

//         // Iterate through the chat rooms and add user IDs to the array
//         chatRooms.forEach((room) => {
//             const [userId1, userId2] = room.room.split('-');
//             // Add user IDs to the array, excluding the current user's ID
//             if (userId1 !== userId) {
//                 uniqueUserIds.push(userId1);
//             }
//             if (userId2 !== userId) {
//                 uniqueUserIds.push(userId2);
//             }
//         });

//         // Remove duplicates from the array
//         const distinctUserIds = [...new Set(uniqueUserIds)];

//         // Find user documents for all unique users
//         const users = await User.find({ _id: { $in: distinctUserIds } });

//         // Return the users in all chat rooms
//         return res.status(200).json({
//             success: true,
//             chatRooms,
//             users
//         });

//     } catch (error) {
//         console.error('Error fetching AllChatUsers:', error);
//         return res.status(500).json({ success: false, message: 'Failed to fetch AllChatUsers' });
//     }
// });

// router.get('/AllChatUsers', async (req, res) => {
//     try {
//         const { userId } = req.query;

//         console.log('Received userId:', userId); // Log the userId received in the query parameter

//         // Check if userId is provided
//         if (!userId) {
//             return res.status(400).json({
//                 success: false,
//                 message: "userId is required as a query parameter"
//             });
//         }

//         // Find all chat rooms where the user is either the sender or recipient
//         const chatRooms = await ChatRoom.find({
//             $or: [{ sender: userId }, { recipient: userId }]
//         });

//         console.log('Found chatRooms:', chatRooms); // Log the chat rooms found

//         if (!chatRooms || chatRooms.length === 0) {
//             return res.status(404).json({
//                 success: false,
//                 message: "No chat rooms found for the user"
//             });
//         }



//         // Initialize an array to store all unique user IDs
//         const uniqueUserIds = [];

//         // Iterate through the chat rooms and add user IDs to the array
//         chatRooms.forEach((room) => {
//             const [userId1, userId2] = room.room.split('-');

//             // Add user IDs to the array, excluding the current user's ID
//             if (userId1 !== userId) {
//                 uniqueUserIds.push(userId1);
//             }
//             if (userId2 !== userId) {
//                 uniqueUserIds.push(userId2);
//             }
//         });

//         // Remove duplicates from the array
//         const distinctUserIds = [...new Set(uniqueUserIds)];

//         // Find user documents for all unique users
//         const users = await User.find({ _id: { $in: distinctUserIds } });

//         // Return the users in all chat rooms
//         return res.status(200).json({
//             success: true,
//             chatRooms,
//             users
//         });

//     } catch (error) {
//         console.error('Error fetching AllChatUsers:', error);
//         return res.status(500).json({ success: false, message: 'Failed to fetch AllChatUsers' });
//     }
// });

// router.get('/AllChatUsers', async (req, res) => {
//     try {
//         const { userId } = req.query;

//         // Find chat rooms where the user is either the sender or recipient
//         const chatRooms = await ChatRoom.find({
//             $or: [{ sender: userId }, { recipient: userId }]
//         });

//         // Initialize an array to store all unique user IDs
//         const uniqueUserIds = [];

//         // Iterate through the chat rooms and add user IDs to the array
//         chatRooms.forEach((room) => {
//             const [userId1, userId2] = room.room.split('-');
//             // Add user IDs to the array, excluding the current user's ID
//             if (userId1 !== userId) {
//                 uniqueUserIds.push(userId1);
//             }
//             if (userId2 !== userId) {
//                 uniqueUserIds.push(userId2);
//             }
//         });

//         // Remove duplicates from the array
//         const distinctUserIds = [...new Set(uniqueUserIds)];

//         // Find user documents for all unique users
//         const users = await User.find({ _id: { $in: distinctUserIds } });

//         if (chatRooms.length === 0) {
//             // No chat rooms found for the user, but return user data if available
//             return res.status(404).json({
//                 success: false,
//                 message: "No chat rooms found for the user",
//                 users
//             });
//         }

//         // Return the chat rooms and users
//         return res.status(200).json({
//             success: true,
//             chatRooms,
//             users
//         });

//     } catch (error) {
//         console.error('Error fetching AllChatUsers:', error);
//         return res.status(500).json({ success: false, message: 'Failed to fetch AllChatUsers' });
//     }
// });

// router.get('/AllChatUsers', async (req, res) => {
//     try {
//         const { userId } = req.query;

//         // Check if userId is provided
//         if (!userId) {
//             return res.status(400).json({
//                 success: false,
//                 message: "userId parameter is required"
//             });
//         }

//         // Find chat rooms where the user is either the sender or recipient
//         const chatRooms = await ChatRoom.find({
//             $or: [{ room: userId }, { room: { $regex: `.*-${userId}$` } }]
//         });

//         if (chatRooms.length === 0) {
//             // No chat rooms found for the user
//             return res.status(404).json({
//                 success: false,
//                 message: "No chat rooms found for the user"
//             });
//         }

//         // Initialize an array to store all unique user IDs from the chat rooms
//         const uniqueUserIds = [userId]; // Include the requested user ID

//         // Iterate through the chat rooms and add user IDs to the array
//         chatRooms.forEach((room) => {
//             const [userId1, userId2] = room.room.split('-');
//             // Add user IDs to the array, excluding the current user's ID
//             if (userId1 !== userId) {
//                 uniqueUserIds.push(userId1);
//             }
//             if (userId2 !== userId) {
//                 uniqueUserIds.push(userId2);
//             }
//         });

//         // Remove duplicates from the array
//         const distinctUserIds = [...new Set(uniqueUserIds)];

//         // Find user documents for all unique users
//         const users = await User.find({ _id: { $in: distinctUserIds } });

//         // Return the chat rooms and all users who are part of those chat rooms
//         return res.status(200).json({
//             success: true,
//             chatRooms,
//             users
//         });

//     } catch (error) {
//         console.error('Error fetching AllChatUsers:', error);
//         return res.status(500).json({ success: false, message: 'Failed to fetch AllChatUsers' });
//     }
// });

router.get('/AllChatRooms', async (req, res) => {
    try {
        const { userId } = req.query;

        // Check if userId is provided
        if (!userId) {
            return res.status(400).json({
                success: false,
                message: "userId parameter is required"
            });
        }

        // Find all chat rooms where the user is either the sender or recipient
        const chatRooms = await ChatRoom.find({
            room: { $regex: userId }
        });

        if (chatRooms.length === 0) {
            // No chat rooms found for the user
            return res.status(404).json({
                success: false,
                message: "No chat rooms found for the user"
            });
        }

        // Initialize an array to store all unique user IDs
        const uniqueUserIds = [];

        // Iterate through the chat rooms and add user IDs to the array
        chatRooms.forEach((room) => {
            const [userId1, userId2] = room.room.split('-');
            // Add user IDs to the array, excluding the current user's ID
            if (userId1 !== userId) {
                uniqueUserIds.push(userId1);
            }
            if (userId2 !== userId) {
                uniqueUserIds.push(userId2);
            }
        });


        // Remove duplicates from the array
        const distinctUserIds = [...new Set(uniqueUserIds)];

        // Find user documents for all unique users
        const users = await User.find({ _id: { $in: distinctUserIds } });

        // Return all matching chat rooms
        return res.status(200).json({
            success: true,
            chatRooms,
            users
        });

    } catch (error) {
        console.error('Error fetching AllChatRooms:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch AllChatRooms' });
    }
});




module.exports = router;