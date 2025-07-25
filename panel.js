const express = require("express");
const path = require("path");
const fs = require("fs");
const AdmZip = require("adm-zip");
const multer = require("multer");
const { spawn } = require("child_process");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

const BOTS_DIR = path.join(__dirname, "bots");
const UPLOADS_DIR = path.join(__dirname, "uploads");
const upload = multer({ dest: "uploads/" });
const nodeVersions = ["14", "16", "18", "20"];

[BOTS_DIR, UPLOADS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

app.set("view engine", "ejs");
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use("/", require("./routes/upload"));

function findRoot(dir) {
  const entries = fs.readdirSync(dir);
  if (entries.some((f) => f.endsWith(".js") || f.endsWith(".html"))) return dir;
  for (const entry of entries) {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) {
      const found = findRoot(full);
      if (found) return found;
    }
  }
  return null;
}

const LOG_BUFFER_SIZE = 500;
const buffers = {};
function initBuffer(bot) {
  if (!buffers[bot]) buffers[bot] = [];
}
function pushBuffer(bot, line) {
  initBuffer(bot);
  const buf = buffers[bot];
  buf.push(line);
  if (buf.length > LOG_BUFFER_SIZE) buf.shift();
}

app.get("/", (req, res) => {
  const bots = fs.readdirSync(BOTS_DIR);
  res.render("index", { bots });
});

app.post("/upload", upload.single("file"), (req, res) => {
  const botName = req.query.bot;
  if (!req.file || !botName) return res.redirect("/");

  try {
    const zip = new AdmZip(req.file.path);
    const tempDir = path.join(UPLOADS_DIR, Date.now().toString());
    zip.extractAllTo(tempDir, true);
    const src = findRoot(tempDir);
    if (!src) throw new Error("No .js/.html in archive");

    const dest = path.join(BOTS_DIR, botName);
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });

    fs.readdirSync(src).forEach((item) => {
      const from = path.join(src, item);
      const to = path.join(dest, item);
      if (fs.existsSync(to)) fs.rmSync(to, { recursive: true, force: true });
      fs.renameSync(from, to);
    });

    fs.rmSync(req.file.path, { force: true });
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (e) {
    console.error("Upload error:", e);
  }

  res.redirect("/bot/" + botName);
});

app.get("/bot/:bot", (req, res) => {
  const botDir = path.join(BOTS_DIR, req.params.bot);
  if (!fs.existsSync(botDir)) return res.redirect("/");
  res.render("bot", {
    bot: req.params.bot,
    nodeVersions,
  });
});

app.get("/explore/:bot", (req, res) => {
  const bot = req.params.bot;
  const rel = req.query.path || "";
  const dir = path.join(BOTS_DIR, bot, rel);
  if (!fs.existsSync(dir)) return res.json({ error: "No such dir" });
  const entries = fs.readdirSync(dir).map((n) => {
    const full = path.join(dir, n);
    return { name: n, isDir: fs.statSync(full).isDirectory() };
  });
  res.json({ path: rel, entries });
});

const processes = {};

io.on("connection", (socket) => {
  socket.on("join", (bot) => {
    socket.join(bot);
    initBuffer(bot);
    buffers[bot].forEach((line) => socket.emit("output", line));
  });

  socket.on("readFile", ({ bot, path: rel }) => {
    const full = path.join(BOTS_DIR, bot, rel);
    const c = fs.readFileSync(full, "utf8");
    socket.emit("fileData", { path: rel, content: c });
  });

  socket.on("writeFile", ({ bot, path: rel, content }) => {
    fs.writeFileSync(path.join(BOTS_DIR, bot, rel), content);
    socket.emit("output", `Saved ${rel}\n`);
  });

  socket.on("deleteFile", ({ bot, path: rel, isDir }) => {
    fs.rmSync(path.join(BOTS_DIR, bot, rel), { recursive: isDir, force: true });
    socket.emit("output", `Deleted ${rel}\n`);
  });

  socket.on("action", (data) => {
    const { bot, cmd, file, version, port } = data;
    const cwd = path.join(BOTS_DIR, bot);

    function logAndBroadcast(chunk) {
      const str = chunk.toString();
      pushBuffer(bot, str);
      io.to(bot).emit("output", str);
    }

    if (cmd === "run") {
      if (processes[bot]) processes[bot].kill("SIGKILL");
      initBuffer(bot);
      const ext = path.extname(file);

      if (ext === ".js") {
        processes[bot] = spawn(
          "node",
          [
            "--max-old-space-size=128",
            "--optimize_for_size",
            "--gc-global",
            "--no-warnings",
            "--lazy",
            "--jitless",
            "--no-deprecation",
            "--no-opt",
            "--no-incremental-marking",
            "--no-concurrent-recompilation",
            file,
          ],
          {
            cwd,
            env: { ...process.env, NODE_ENV: "production" },
            stdio: ["pipe", "pipe", "pipe"],
          },
        );
      } else {
        processes[bot] = spawn(
          "npx",
          ["http-server", ".", "-p", port || 3001],
          {
            cwd,
            env: { ...process.env, NODE_ENV: "production" },
          },
        );
      }

      processes[bot].stdout.on("data", logAndBroadcast);
      processes[bot].stderr.on("data", logAndBroadcast);
      processes[bot].on("exit", () => {
        delete processes[bot];
        const msg = "Bot process exited\n";
        pushBuffer(bot, msg);
        io.to(bot).emit("output", msg);
      });
    } else if (cmd === "stop") {
      if (processes[bot]) {
        try {
          const pid = processes[bot].pid;
          process.kill(pid, "SIGKILL");
          delete processes[bot];
          const msg = "Process forcefully stopped\n";
          pushBuffer(bot, msg);
          io.to(bot).emit("output", msg);
        } catch (err) {
          const msg = "Failed to stop process\n";
          pushBuffer(bot, msg);
          io.to(bot).emit("output", msg);
        }
      } else {
        io.to(bot).emit("output", "No running process to stop\n");
      }
    } else if (cmd === "install") {
      initBuffer(bot);
      const script = `wget -qO- https://deb.nodesource.com/setup_${version} | bash - && apt-get install -y nodejs`;
      const inst = spawn("bash", ["-c", script]);
      inst.stdout.on("data", logAndBroadcast);
      inst.stderr.on("data", logAndBroadcast);
    }
  });

  socket.on("command", ({ bot, command }) => {
    const proc = processes[bot];
    if (proc && !proc.killed && proc.stdin.writable) {
      proc.stdin.write(command + "\n");
      pushBuffer(bot, `> ${command}\n`);
      io.to(bot).emit("output", `> ${command}\n`);
    } else {
      socket.emit(
        "output",
        "Procesul nu rulează sau nu poate primi comenzi.\n",
      );
    }
  });
});

http.listen(3000, () => {
  console.log("ADPanel running on http://localhost:3000");
});
