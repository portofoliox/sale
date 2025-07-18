const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');

const app = express();
const httpServer = http.createServer(app);
const io = require('socket.io')(httpServer);

const upload = multer({ dest: 'uploads/' });
const BOTS_DIR = path.join(__dirname, 'bots');
if(!fs.existsSync(BOTS_DIR)) fs.mkdirSync(BOTS_DIR);

app.use(express.static(path.join(__dirname, 'public')));
app.use('/views', express.static(path.join(__dirname, 'views')));

app.post('/upload', upload.single('file'), (req, res) => {
  const file = req.file;
  const name = file.originalname;
  const botName = path.parse(name).name;
  const botDir = path.join(BOTS_DIR, botName);
  if (!fs.existsSync(botDir)) fs.mkdirSync(botDir, { recursive: true });
  if (name.endsWith('.zip')) {
    const zip = new AdmZip(file.path);
    zip.getEntries().forEach(entry => {
      if (!entry.isDirectory && (entry.entryName.endsWith('.js')||entry.entryName.endsWith('.html'))) {
        fs.writeFileSync(path.join(botDir, path.basename(entry.entryName)), entry.getData());
      }
    });
  } else if (name.endsWith('.js')||name.endsWith('.html')) {
    fs.renameSync(file.path, path.join(botDir, name));
  }
  res.redirect('/');
});

app.get('/list', (req, res) => {
  const files = [];
  fs.readdirSync(BOTS_DIR).forEach(dir => {
    const dirPath = path.join(BOTS_DIR, dir);
    fs.readdirSync(dirPath).forEach(file => {
      if(file.endsWith('.js')||file.endsWith('.html')){
        files.push(path.join(dir, file));
      }
    });
  });
  res.json(files);
});

io.on('connection', socket => {
  socket.on('run', data => {
    if (socket.proc) socket.proc.kill();
    const cwd = path.join(BOTS_DIR, path.dirname(data.file));
    let proc;
    if (data.file.endsWith('.html')) {
      proc = spawn('npx', ['http-server', cwd, '-p', data.port], { cwd });
    } else {
      proc = spawn('node', [path.basename(data.file)], { cwd, env: { ...process.env, PORT: data.port } });
    }
    socket.proc = proc;
    proc.stdout.on('data', d => socket.emit('output', d.toString()));
    proc.stderr.on('data', d => socket.emit('output', d.toString()));
    proc.on('close', code => socket.emit('output', `Process exited with code ${code}
`));
  });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'views', 'bot.ejs')));

httpServer.listen(3000, () => console.log('ADPanel running on port 3000'));
