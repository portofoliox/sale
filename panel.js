const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const multer = require('multer');
const fs = require('fs');
const { exec } = require('child_process');

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

const upload = multer({ dest: 'uploads/' });

app.get('/', (req, res) => {
  res.render('index');
});

app.post('/upload', upload.single('file'), (req, res) => {
  res.redirect('/');
});

app.post('/start', (req, res) => {
  exec('pm2 start bot.js --name="bot"', () => res.redirect('/'));
});

app.post('/stop', (req, res) => {
  exec('pm2 stop bot', () => res.redirect('/'));
});

app.post('/restart', (req, res) => {
  exec('pm2 restart bot', () => res.redirect('/'));
});

io.on('connection', socket => {
  const botLog = exec('tail -f logs/bot.log');
  botLog.stdout.on('data', data => socket.emit('log', data));
  socket.on('disconnect', () => botLog.kill());
});

http.listen(3000, () => console.log('ADPanel is running on http://localhost:3000'));
