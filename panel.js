const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const { spawn, exec } = require('child_process');

const upload = multer({ dest: 'uploads/' });
const BOTS_DIR = path.join(__dirname, 'bots');
if (!fs.existsSync(BOTS_DIR)) fs.mkdirSync(BOTS_DIR);

app.set('view engine','ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// Find first .js file excluding node_modules
function listJsFiles(folder) {
  let files = [];
  fs.readdirSync(folder).forEach(file => {
    const full = path.join(folder, file);
    if (fs.statSync(full).isFile() && file.endsWith('.js')) files.push(file);
  });
  return files;
}

app.get('/', (req, res) => {
  const bots = fs.readdirSync(BOTS_DIR);
  res.render('index', { bots });
});

app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.redirect('/');
  try {
    const zip = new AdmZip(req.file.path);
    const name = path.parse(req.file.originalname).name.replace(/[^\w-]/g,'');
    const tempDir = path.join(__dirname,'uploads',name);
    zip.extractAllTo(tempDir,true);
    // find root folder containing js
    function findRoot(folder) {
      const js = listJsFiles(folder);
      if (js.length) return folder;
      for (const e of fs.readdirSync(folder)) {
        const full = path.join(folder,e);
        if (fs.statSync(full).isDirectory()) {
          const found = findRoot(full);
          if (found) return found;
        }
      }
      return null;
    }
    const srcDir = findRoot(tempDir);
    if(!srcDir) throw 'No js';
    const dest = path.join(BOTS_DIR,name);
    if (fs.existsSync(dest)) fs.rmSync(dest,{recursive:true,force:true});
    fs.renameSync(srcDir,dest);
    fs.rmSync(req.file.path,{force:true});
    fs.rmSync(tempDir,{recursive:true,force:true});
  } catch (e) {
    console.error(e);
  }
  res.redirect('/');
});

app.get('/bot/:bot', (req, res) => {
  const bot = req.params.bot;
  const botDir = path.join(BOTS_DIR,bot);
  if (!fs.existsSync(botDir)) return res.redirect('/');
  const scripts = listJsFiles(botDir);
  res.render('bot', { bot, scripts });
});

io.on('connection', socket => {
  let proc = null;
  socket.on('action', data => {
    const { bot, cmd, file } = data;
    const botDir = path.join(BOTS_DIR, bot);
    if (proc) {
      proc.kill();
      proc = null;
    }
    if (cmd === 'run') {
      const script = path.join(botDir, file);
      proc = spawn('node', [script], { cwd: botDir });
      proc.stdout.on('data', d=> socket.emit('output', d.toString()));
      proc.stderr.on('data', d=> socket.emit('output', d.toString()));
    } else if (cmd === 'stop') {
      // kill proc
      if (proc) proc.kill();
      socket.emit('output', 'Process stopped\n');
    }
  });
});

http.listen(3000, ()=>console.log('ADPanel_Final_v7 on http://localhost:3000'));
