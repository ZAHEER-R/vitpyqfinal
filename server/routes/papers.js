const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const jwt = require('jsonwebtoken');
const supabase = require('../supabaseClient');

// Multer Config - Use Memory Storage for Supabase Upload
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Middleware to get user ID
const auth = (req, res, next) => {
    const token = req.header('x-auth-token');
    if (!token) return res.status(401).json({ msg: 'No token, authorization denied' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
        req.user = decoded.user;
        next();
    } catch (e) {
        res.status(400).json({ msg: 'Token is not valid' });
    }
};

// Upload Paper
router.post('/upload', [auth, upload.single('file')], async (req, res) => {
    try {
        const { subject, courseCode, examYear, examName, category } = req.body;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ msg: 'No file uploaded' });
        }

        // 1. Upload file to Supabase Storage
        const fileExt = path.extname(file.originalname);
        const fileName = `${Date.now()}${fileExt}`;
        const filePath = `${fileName}`; // Path in bucket

        const { data: storageData, error: storageError } = await supabase
            .storage
            .from('papers')
            .upload(filePath, file.buffer, {
                contentType: file.mimetype
            });

        if (storageError) {
            console.error('Storage Error:', storageError);
            return res.status(500).send('Error uploading file');
        }

        // Get Public URL
        const { data: publicUrlData } = supabase
            .storage
            .from('papers')
            .getPublicUrl(filePath);

        const publicUrl = publicUrlData.publicUrl;

        // 2. Insert metadata into Supabase Database
        const { data: newPaper, error: dbError } = await supabase
            .from('papers')
            .insert([
                {
                    subject,
                    course_code: courseCode,
                    exam_year: examYear,
                    exam_name: examName,
                    category,
                    file_path: publicUrl, // Store the full URL
                    uploader_id: req.user.id
                }
            ])
            .select()
            .single();

        if (dbError) {
            console.error('DB Error:', dbError);
            return res.status(500).send('Error saving paper metadata');
        }

        // 3. Update User Points
        // Fetch current points first
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('points, level')
            .eq('id', req.user.id)
            .single();

        if (!userError && user) {
            let newPoints = (user.points || 0) + 50;
            let newLevel = user.level;

            if (newPoints >= 4000) newLevel = 'Legendary';
            else if (newPoints >= 3000) newLevel = 'Diamond';
            else if (newPoints >= 2000) newLevel = 'Gold';
            else if (newPoints >= 1000) newLevel = 'Silver';

            await supabase
                .from('users')
                .update({ points: newPoints, level: newLevel })
                .eq('id', req.user.id);
        }

        // Map response to camelCase
        const responsePaper = {
            _id: newPaper.id,
            id: newPaper.id,
            subject: newPaper.subject,
            courseCode: newPaper.course_code,
            examYear: newPaper.exam_year,
            examName: newPaper.exam_name,
            category: newPaper.category,
            filePath: newPaper.file_path,
            uploader: newPaper.uploader_id
        };

        res.json(responsePaper);

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

// Search Papers
router.get('/search', async (req, res) => {
    try {
        const { query } = req.query;

        let supabaseQuery = supabase
            .from('papers')
            .select(`
                *,
                uploader:users (
                    first_name,
                    last_name,
                    profile_pic
                )
            `);

        if (query) {
            // ILIKE search on multiple columns
            supabaseQuery = supabaseQuery.or(`subject.ilike.%${query}%,course_code.ilike.%${query}%,exam_name.ilike.%${query}%`);
        }

        const { data: papers, error } = await supabaseQuery;

        if (error) throw error;

        // Map to camelCase for frontend
        const mappedPapers = papers.map(p => ({
            _id: p.id,
            id: p.id,
            subject: p.subject,
            courseCode: p.course_code,
            examYear: p.exam_year,
            examName: p.exam_name,
            category: p.category,
            filePath: p.file_path,
            uploader: p.uploader ? {
                firstName: p.uploader.first_name,
                lastName: p.uploader.last_name,
                profilePic: p.uploader.profile_pic
            } : null
        }));

        res.json(mappedPapers);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

module.exports = router;
