const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const app = express();
const port = 3000;

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

// Configure multer for chunk storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const chunkDir = path.join(uploadsDir, file.originalname.split('_chunk_')[0]);
        if (!fs.existsSync(chunkDir)) {
            fs.mkdirSync(chunkDir, { recursive: true });
        }
        cb(null, chunkDir);
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname);
    }
});

const upload = multer({ storage: storage });

// Serve static files
app.use(express.static(__dirname));
app.use('/uploads', express.static('uploads'));

// Handle chunk upload
app.post('/upload-chunk', upload.single('chunk'), (req, res) => {
    try {
        const { filename, chunkIndex, totalChunks } = req.body;
        const chunkDir = path.join(uploadsDir, filename);
        const chunkPath = path.join(chunkDir, `${filename}_chunk_${chunkIndex}`);

        // Check if all chunks are uploaded
        const uploadedChunks = fs.readdirSync(chunkDir)
            .filter(file => file.startsWith(`${filename}_chunk_`))
            .length;

        if (uploadedChunks === parseInt(totalChunks)) {
            // Combine chunks
            const filePath = path.join(uploadsDir, filename);
            const writeStream = fs.createWriteStream(filePath);

            for (let i = 0; i < totalChunks; i++) {
                const chunkPath = path.join(chunkDir, `${filename}_chunk_${i}`);
                const chunkBuffer = fs.readFileSync(chunkPath);
                writeStream.write(chunkBuffer);
                // Delete chunk after combining
                fs.unlinkSync(chunkPath);
            }

            writeStream.end();
            // Remove chunk directory after combining
            fs.rmdirSync(chunkDir);

            res.json({ 
                success: true, 
                message: 'File upload complete',
                filePath: `/uploads/${filename}`
            });
        } else {
            res.json({ 
                success: true, 
                message: 'Chunk uploaded successfully',
                uploadedChunks: uploadedChunks,
                totalChunks: totalChunks
            });
        }
    } catch (error) {
        console.error('Error handling chunk upload:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error uploading chunk' 
        });
    }
});

// Get list of uploaded files
app.get('/files', (req, res) => {
    try {
        const files = fs.readdirSync(uploadsDir)
            .filter(file => !file.includes('_chunk_'))
            .map(file => ({
                name: file,
                size: fs.statSync(path.join(uploadsDir, file)).size,
                path: `/uploads/${file}`
            }));
        res.json(files);
    } catch (error) {
        console.error('Error getting files:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error getting files' 
        });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
}); 