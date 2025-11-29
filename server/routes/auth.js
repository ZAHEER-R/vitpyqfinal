const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Import Supabase client (correct place)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY   // ✅ FULL PERMISSION KEY
);

module.exports = supabase;

// ================================
//  SIGNUP
// ================================
router.post('/signup', async (req, res) => {
    try {
        const { firstName, lastName, email, phone, password } = req.body;

        // Check if user exists
        const { data: existingUser } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .single();

        if (existingUser) return res.status(400).json({ msg: 'User already exists' });

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Insert new user
        const { data: newUser, error } = await supabase
            .from('users')
            .insert([
                {
                    first_name: firstName,
                    last_name: lastName,
                    email,
                    phone,
                    password: hashedPassword
                }
            ])
            .select()
            .single();

        if (error) throw error;

        // Create JWT token
        const payload = { user: { id: newUser.id } };
        jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' }, (err, token) => {
            if (err) throw err;
            res.json({ token });
        });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});


// ================================
//  LOGIN
// ================================
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const { data: user } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .single();

        if (!user) return res.status(400).json({ msg: 'Invalid Credentials' });

        // Compare passwords
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ msg: 'Invalid Credentials' });

        // Create JWT
        const payload = { user: { id: user.id } };
        jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' }, (err, token) => {
            if (err) throw err;
            res.json({ token });
        });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});


// ================================
//  SEND OTP
// ================================
router.post('/send-otp', async (req, res) => {
    try {
        const { email } = req.body;

        // 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        const { error } = await supabase
            .from('otp_codes')
            .insert({ email, otp });

        if (error) {
            console.error(error);
            return res.status(500).json({ msg: "Failed to send OTP" });
        }

        // NOTE: In production REMOVE otp from response
        res.json({ msg: "OTP sent successfully", otp });

    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server error");
    }
});


// ================================
//  VERIFY OTP
// ================================
router.post('/verify-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;

        const { data } = await supabase
            .from('otp_codes')
            .select('*')
            .eq('email', email)
            .eq('otp', otp)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (!data) return res.status(400).json({ msg: "Invalid OTP" });

        res.json({ msg: "OTP verified" });

    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server error");
    }
});


// ================================
//  RESET PASSWORD
// ================================
router.post('/reset-password', async (req, res) => {
    try {
        const { email, newPassword } = req.body;

        const hashed = await bcrypt.hash(newPassword, 10);

        const { error } = await supabase
            .from('users')
            .update({ password: hashed })
            .eq('email', email);

        if (error) {
            console.error(error);
            return res.status(500).json({ msg: "Failed to reset password" });
        }

        res.json({ msg: "Password reset successful" });

    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server error");
    }
});


// ================================
//  GET USER PROFILE
// ================================
router.get('/profile', async (req, res) => {
    try {
        const token = req.header('x-auth-token');
        if (!token) return res.status(401).json({ msg: 'No token, authorization denied' });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded.user;

        const { data: user } = await supabase
            .from('users')
            .select('id, first_name, last_name, email, phone, points, level, profile_pic')
            .eq('id', req.user.id)
            .single();

        if (!user) return res.status(404).json({ msg: "User not found" });

        const mapped = {
            id: user.id,
            firstName: user.first_name,
            lastName: user.last_name,
            email: user.email,
            phone: user.phone,
            points: user.points,
            level: user.level,
            profilePic: user.profile_pic
        };

        res.json(mapped);

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});


// Export router (IMPORTANT)
module.exports = router;
