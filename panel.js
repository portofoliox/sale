const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const { exec } = require('child_process');

const upload = multer({ dest: 'uploads/' });
const BOTS_DIR = path.join(__dirname, 'bots');

if (!fs.existsSync(BOTS_DIR)) fs.mkdirSync(BOTS_DIR);

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

function findBotJS(folder) {
  const files = fs.readdirSync(folder);
  for (const file of files) {
    const fullPath = path.join(folder, file);
    if (fs.statSync(fullPath).isFile() && file.toLowerCase() === 'bot.js') {
      return fullPath;
    }
  }
  for (const file of files) {
    const fullPath = path.join(folder, file);
    if (fs.statSync(fullPath).isDirectory()) {
      const found = findBotJS(fullPath);
      if (found) return found;
    }
  }
  return null;
}

app.get('/', (req, res) => {
  const bots = fs.readdirSync(BOTS_DIR).filter(d => fs.statSync(path.join(BOTS_DIR, d)).isDirectory());
  res.render('index', { bots });
});

app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).send('No file uploaded');
  const zip = new AdmZip(req.file.path);
  const botName = path.parse(req.file.originalname).name.replace(/[^a-zA-Z0-9-_]/g, '');
  const tempDir = path.join(__dirname, 'uploads', botName);
  zip.extractAllTo(tempDir, true);

  const botSource = findBotJS(tempDir);
  if (!botSource) return res.status(400).send('bot.js nu a fost găsit în arhivă');

  const targetDir = path.join(BOTS_DIR, botName);
  if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true });
  fs.mkdirSync(targetDir);
  fs.readdirSync(tempDir).forEach(file => {
    fs.renameSync(path.join(tempDir, file), path.join(targetDir, file));
  });
  fs.rmSync(req.file.path);
  fs.rmSync(tempDir, { recursive: true });
  res.redirect('/');
});

app.post('/start/:bot', (req, res) => {
  const bot = req.params.bot;
  const botPath = findBotJS(path.join(BOTS_DIR, bot));
  if (!botPath) return res.status(404).send('bot.js nu există');
  exec(`pm2 start ${botPath} --name "${bot}"`, () => res.redirect('/'));
});

app.post('/stop/:bot', (req, res) => {
  const bot = req.params.bot;
  exec(`pm2 stop ${bot}`, () => res.redirect('/'));
});

app.post('/restart/:bot', (req, res) => {
  const bot = req.params.bot;
  exec(`pm2 restart ${bot}`, () => res.redirect('/'));
});

app.get('/files/:bot', (req, res) => {
  const dir = path.join(BOTS_DIR, req.params.bot);
  if (!fs.existsSync(dir)) return res.status(404).send('Folder bot inexistent');
  const files = [];
  function walk(currentPath) {
    fs.readdirSync(currentPath).forEach(name => {
      const full = path.join(currentPath, name);
      if (fs.statSync(full).isDirectory()) {
        walk(full);
      } else {
        files.push(path.relative(dir, full));
      }
    });
  }
  walk(dir);
  res.json(files);
});

app.get('/file/:bot/*', (req, res) => {
  const relPath = req.params[0];
  const fullPath = path.join(BOTS_DIR, req.params.bot, relPath);
  if (!fs.existsSync(fullPath)) return res.status(404).send('File not found');
  res.sendFile(fullPath);
});

io.on('connection', socket => {
  socket.on('logs', bot => {
    const log = exec(`pm2 logs ${bot} --no-color --lines 100`);
    log.stdout.on('data', data => socket.emit('log', data));
  });
});

http.listen(3000, () => console.log('ADPanel Complete running on http://localhost:3000'));
