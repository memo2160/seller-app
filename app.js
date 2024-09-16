import express from 'express';
import mysql from 'mysql';
import passport from 'passport';
import LocalStrategy from 'passport-local';
import session from 'express-session';
import bcrypt from 'bcryptjs';
import bodyParser from 'body-parser';
import path from 'path';
import flash from "express-flash";
import { fileURLToPath } from 'url';
import env from "dotenv";

import authRoutes from './routes/auth.js';

const app = express();
env.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set view engine to EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views')); // Ensure 'views' directory exists

// Middleware
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files from 'public' directory
app.use(express.urlencoded({ extended: true })); // Parse form data
app.use(session({ secret: '77b8rthk!', resave: false, saveUninitialized: false }));
app.use(flash());

app.use(passport.initialize());
app.use(passport.session());
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));

// MySQL connection
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});
db.connect((err) => {
  if (err) throw err;
  console.log('Connected to MySQL database');
});

// Passport Local Strategy
passport.use(
  new LocalStrategy((username, password, done) => {
    db.query('SELECT * FROM users WHERE username = ?', [username], (err, results) => {
      if (err) return done(err);
      if (!results.length) return done(null, false, { message: 'Incorrect username' });

      const user = results[0];
      bcrypt.compare(password, user.password, (err, res) => {
        if (res) return done(null, user);
        return done(null, false, { message: 'Incorrect password' });
      });
    });
  })
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  db.query('SELECT * FROM users WHERE id = ?', [id], (err, results) => {
    done(err, results[0]);
  });
});


app.get('/', (req, res) => {
    console.log("entering and redirecting!");
    res.redirect('/login');
  });
  
  // Auth routes
  app.use(authRoutes); // Load authentication routes

// Start the server
app.listen(8445, () => {

  console.log('Server started on http://localhost:8445');
});

export { db };
