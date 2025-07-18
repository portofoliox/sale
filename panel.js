const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const { exec } = require('child_process');

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
const upload = multer({ dest: 'uploads/' });

app.get('/', (req, res) => {
  const bots = fs.readdirSync('./bots').filter(d => fs.statSync('./bots/' + d).isDirectory());
  res.render('index', { bots });
});

app.post('/upload', upload.single('file'), (req, res) => {
  const zip = new AdmZip(req.file.path);
  const botName = path.parse(req.file.originalname).name;
  const extractPath = path.join(__dirname, 'bots', botName);
  zip.extractAllTo(extractPath, true);
  fs.unlinkSync(req.file.path);
  res.redirect('/');
});

app.post('/start/:bot', (req, res) => {
  const bot = req.params.bot;
  exec(`pm2 start ./bots/${bot}/bot.js --name="${bot}"`, () => res.redirect('/'));
});

app.post('/stop/:bot', (req, res) => {
  const bot = req.params.bot;
  exec(`pm2 stop ${bot}`, () => res.redirect('/'));
});

app.post('/restart/:bot', (req, res) => {
  const bot = req.params.bot;
  exec(`pm2 restart ${bot}`, () => res.redirect('/'));
});

io.on('connection', socket => {
  const logStream = exec('tail -f logs/bot.log');
  logStream.stdout.on('data', data => socket.emit('log', data));
  socket.on('disconnect', () => logStream.kill());
});

http.listen(3000, () => console.log("ADPanel v2 running on http://localhost:3000"));
