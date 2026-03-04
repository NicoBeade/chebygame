const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize SQLite database
const dbPath = path.resolve(__dirname, 'leaderboard.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        // Create scores table if it doesn't exist
        db.run(`CREATE TABLE IF NOT EXISTS scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            score INTEGER NOT NULL,
            date TEXT NOT NULL
        )`);
    }
});

// GET /api/leaderboard - Fetch top 10 scores
app.get('/api/leaderboard', (req, res) => {
    const sql = `SELECT name, score, date FROM scores ORDER BY score DESC LIMIT 10`;
    db.all(sql, [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// POST /api/leaderboard - Add a new score
app.post('/api/leaderboard', (req, res) => {
    const { name, score, date } = req.body;

    // Basic validation
    if (!name || typeof score !== 'number' || !date) {
        res.status(400).json({ error: 'Invalid payload: name, score (int), and date (string) are required.' });
        return;
    }

    // Only store it if it qualifies for the top 10 to keep the table clean
    db.all(`SELECT score FROM scores ORDER BY score DESC LIMIT 10`, [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }

        // If table has less than 10 rows, or the score beats the 10th place
        if (rows.length < 10 || score > rows[rows.length - 1].score) {
            const insertSql = `INSERT INTO scores (name, score, date) VALUES (?, ?, ?)`;
            db.run(insertSql, [name, score, date], function (err) {
                if (err) {
                    res.status(500).json({ error: err.message });
                    return;
                }

                // Optional: Delete rows outside the top 10 to maintain strictly 10 items in the DB
                if (rows.length >= 10) {
                    const keepTop10Sql = `
                        DELETE FROM scores 
                        WHERE id NOT IN (
                            SELECT id FROM scores ORDER BY score DESC LIMIT 10
                        )
                    `;
                    db.run(keepTop10Sql);
                }

                res.status(201).json({ success: true, id: this.lastID });
            });
        } else {
            // Score wasn't high enough
            res.status(200).json({ success: false, message: 'Score not high enough for Top 10.' });
        }
    });
});

// Start Server
app.listen(PORT, () => {
    console.log(`Neandertool Global Leaderboard API running on http://localhost:${PORT}`);
});
