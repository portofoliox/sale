const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const { spawn } = require('child_process');

const upload = multer({ dest: 'uploads/' });
const BOTS_DIR = path.join(__dirname, 'bots');

if (!fs.existsSync(BOTS_DIR)) fs.mkdirSync(BOTS_DIR);

app.set('view engine','ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

function listJsFiles(folder) {
  return fs.readdirSync(folder).filter(f=>f.endsWith('.js'));
}

// Home
app.get('/', (req, res) => {
  const bots = fs.readdirSync(BOTS_DIR);
  res.render('index', { bots });
});

// Upload ZIP
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.redirect('/');
  try {
    const zip = new AdmZip(req.file.path);
    const name = path.parse(req.file.originalname).name.replace(/[^\w-]/g,'');
    const tempDir = path.join(__dirname,'uploads',name);
    zip.extractAllTo(tempDir,true);
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
  } catch(e){ console.error(e); }
  res.redirect('/');
});

// Manage page
app.get('/bot/:bot', (req, res) => {
  const bot = req.params.bot;
  const botDir = path.join(BOTS_DIR,bot);
  if (!fs.existsSync(botDir)) return res.redirect('/');
  const scripts = listJsFiles(botDir);
  const files = [];
  function walk(base, rel='') {
    fs.readdirSync(base).forEach(name=>{
      const full = path.join(base,name);
      const r = path.join(rel,name);
      if (fs.statSync(full).isDirectory()) walk(full,r);
      else files.push(r);
    });
  }
  walk(botDir);
  res.render('bot', { bot, scripts, files });
});

// Upload new file
app.post('/uploadfile/:bot', upload.single('newfile'), (req, res) => {
  const bot = req.params.bot;
  const botDir = path.join(BOTS_DIR, bot);
  if (!req.file || !fs.existsSync(botDir)) return res.redirect(`/bot/${bot}`);
  const destPath = path.join(botDir, req.file.originalname);
  fs.renameSync(req.file.path, destPath);
  res.redirect(`/bot/${bot}`);
});

// Socket.io for run/stop and file edits
io.on('connection', socket => {
  let proc = null;
  socket.on('action', data => {
    const { bot, cmd, file, editPath, content } = data;
    const botDir = path.join(BOTS_DIR, bot);
    if (cmd === 'run') {
      if (proc) proc.kill();
      proc = spawn('node', [file], { cwd: botDir });
      proc.stdout.on('data', d=> socket.emit('output', d.toString()));
      proc.stderr.on('data', d=> socket.emit('output', d.toString()));
    } else if (cmd === 'stop') {
      if (proc) proc.kill();
      socket.emit('output', 'Process stopped\n');
    } else if (cmd === 'read') {
      const full = path.join(botDir, editPath);
      const txt = fs.readFileSync(full, 'utf8');
      socket.emit('fileData', { path: editPath, content: txt });
    } else if (cmd === 'write') {
      const full = path.join(botDir, editPath);
      fs.writeFileSync(full, content);
      socket.emit('output', `File ${editPath} saved\n`);
    } else if (cmd === 'delete') {
      const full = path.join(botDir, editPath);
      fs.rmSync(full,{force:true});
      socket.emit('output', `File ${editPath} deleted\n`);
    }
  });
});

http.listen(3000,()=>console.log('ADPanel_Final_v8 on http://localhost:3000'));
