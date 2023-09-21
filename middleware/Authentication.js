const jwt = require('jsonwebtoken');
const User = require('../model/UserDetails');

const Authentication = async (req, res, next) => {
    try {
        // Extract the token from the Authorization header
        const authorizationHeader = req.headers.authorization;

        if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
            throw new Error('Unauthorized: No token provided');
        }

        const token = authorizationHeader.split(' ')[1];

        // Verify the token using your SECRET_KEY
        const verifyToken = jwt.verify(token, process.env.SECRET_KEY);

        // Find the user based on the token's _id and token value
        const rootUser = await User.findOne({
            _id: verifyToken._id,
            "tokens.token": token
        });

        if (!rootUser) {
            throw new Error('User not Found');
        }

        // Attach token and user information to the request
        req.token = token;
        req.rootUser = rootUser;
        res.userID = rootUser._id;

        next();
    } catch (err) {
        res.status(401).send("Unauthorized: No token provided");
        console.log(err);
    }
}

module.exports = Authentication;
