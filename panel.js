const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');

const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server);

const upload = multer({ dest: 'uploads/' });
const BOTS_DIR = path.join(__dirname, 'bots');
if (!fs.existsSync(BOTS_DIR)) fs.mkdirSync(BOTS_DIR);

// Serve static files in public and views
app.use(express.static(path.join(__dirname, 'public')));
app.use('/views', express.static(path.join(__dirname, 'views')));

// Upload handler
app.post('/upload', upload.single('file'), (req, res) => {
  const file = req.file;
  const name = file.originalname;
  const botName = path.parse(name).name;
  const botDir = path.join(BOTS_DIR, botName);
  if (!fs.existsSync(botDir)) fs.mkdirSync(botDir, { recursive: true });

  if (name.toLowerCase().endsWith('.zip')) {
    const zip = new AdmZip(file.path);
    const tmp = path.join(__dirname, 'uploads', botName + '_tmp');
    if (fs.existsSync(tmp)) fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(tmp, { recursive: true });
    zip.extractAllTo(tmp, true);
    function copyFiles(dir) {
      fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return copyFiles(full);
        if (entry.name.toLowerCase().endsWith('.js') || entry.name.toLowerCase().endsWith('.html')) {
          fs.copyFileSync(full, path.join(botDir, entry.name));
        }
      });
    }
    copyFiles(tmp);
    fs.rmSync(tmp, { recursive: true, force: true });
  } else if (name.toLowerCase().endsWith('.js') || name.toLowerCase().endsWith('.html')) {
    fs.renameSync(file.path, path.join(botDir, name));
  }
  res.redirect('/');
});

// List available scripts
app.get('/list', (req, res) => {
  const result = [];
  fs.readdirSync(BOTS_DIR).forEach(dir => {
    const dirPath = path.join(BOTS_DIR, dir);
    fs.readdirSync(dirPath).forEach(file => {
      if (file.endsWith('.js') || file.endsWith('.html')) {
        result.push(path.join(dir, file));
      }
    });
  });
  res.json(result);
});

// Run handler
io.on('connection', socket => {
  socket.on('run', data => {
    if (socket.proc) socket.proc.kill();
    const cwd = path.join(BOTS_DIR, path.dirname(data.file));
    const fileName = path.basename(data.file);
    let proc;
    if (fileName.toLowerCase().endsWith('.html')) {
      proc = spawn('npx', ['http-server', cwd, '-p', data.port], { cwd });
    } else {
      proc = spawn('node', [fileName], { cwd, env: { ...process.env, PORT: data.port } });
    }
    socket.proc = proc;
    proc.stdout.on('data', d => socket.emit('output', d.toString()));
    proc.stderr.on('data', d => socket.emit('output', d.toString()));
    proc.on('close', c => socket.emit('output', `Process exited with code ${c}\n`));
  });
});

// Serve main UI
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'bot.ejs'));
});

// Start server
const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`ADPanel running at http://localhost:${port}`));
