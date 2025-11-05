// ===================== 基本設定 =====================
const COLS = 10;
const ROWS = 20;
const BLOCK = 20;

const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
canvas.width = COLS * BLOCK;
canvas.height = ROWS * BLOCK;

const tspinMsg = document.getElementById("tspin-message");

document.addEventListener("keydown", handleKey);

let board, piece, next, hold, canHold, score, lines, level;
let tspinFlag = false;
let lastKick = null; // 回転入れ方向記録

// ===================== 初期化 =====================
function restart() {
  board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  next = randomPiece();
  spawn();
  score = 0;
  lines = 0;
  level = 1;
  hold = null;
  canHold = true;
  tspinFlag = false;
  updateUI();
  draw();
}
restart();

// ===================== ピース定義 =====================
const SHAPES = {
  T: [
    [[0,1,0],[1,1,1],[0,0,0]],
    [[0,1,0],[0,1,1],[0,1,0]],
    [[0,0,0],[1,1,1],[0,1,0]],
    [[0,1,0],[1,1,0],[0,1,0]]
  ],
  I: [
    [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
    [[0,0,1,0],[0,0,1,0],[0,0,1,0],[0,0,1,0]],
  ],
  O: [[[1,1],[1,1]]],
  S: [[[0,1,1],[1,1,0],[0,0,0]],[[0,1,0],[0,1,1],[0,0,1]]],
  Z: [[[1,1,0],[0,1,1],[0,0,0]],[[0,0,1],[0,1,1],[0,1,0]]],
  J: [[[1,0,0],[1,1,1],[0,0,0]],[[0,1,1],[0,1,0],[0,1,0]],[[0,0,0],[1,1,1],[0,0,1]],[[0,1,0],[0,1,0],[1,1,0]]],
  L: [[[0,0,1],[1,1,1],[0,0,0]],[[0,1,0],[0,1,0],[0,1,1]],[[0,0,0],[1,1,1],[1,0,0]],[[1,1,0],[0,1,0],[0,1,0]]],
};

const COLORS = {
  T: "#AA00FF", I: "#00FFFF", O: "#FFFF00",
  S: "#00FF00", Z: "#FF0000", J: "#0000FF", L: "#FFA500",
};

// ===================== ユーティリティ =====================
function randomPiece() {
  const types = Object.keys(SHAPES);
  const t = types[Math.floor(Math.random() * types.length)];
  return { type: t, shape: SHAPES[t][0], rotation: 0, x: 3, y: 0 };
}

function collides(p) {
  return p.shape.some((row, dy) =>
    row.some((v, dx) =>
      v && (
        p.y + dy >= ROWS ||
        p.x + dx < 0 ||
        p.x + dx >= COLS ||
        board[p.y + dy]?.[p.x + dx]
      )
    )
  );
}

// ===================== ピース生成 =====================
function spawn() {
  piece = next;
  next = randomPiece();
  piece.x = 3;
  piece.y = 0;
  if (collides(piece)) {
    alert("Game Over");
    restart();
  }
  tspinFlag = false;
  lastKick = null;
}

// ===================== 回転（SRS風kick付き） =====================
function rotate(dir) {
  const prev = piece.rotation;
  piece.rotation = (piece.rotation + dir + 4) % SHAPES[piece.type].length;
  piece.shape = SHAPES[piece.type][piece.rotation];

  const kicks = [
    [0, 0], [1, 0], [-1, 0], [0, -1], [1, -1], [-1, -1]
  ];

  for (const [kx, ky] of kicks) {
    const test = { ...piece, x: piece.x + kx, y: piece.y + ky };
    if (!collides(test)) {
      piece.x += kx;
      piece.y += ky;
      lastKick = [kx, ky];
      return;
    }
  }

  // 戻す
  piece.rotation = prev;
  piece.shape = SHAPES[piece.type][piece.rotation];
  lastKick = null;
}

// ===================== T-spin判定 =====================
function detectTSpin() {
  if (piece.type !== "T") return false;
  if (!lastKick) return false;

  const corners = [
    [piece.x, piece.y],
    [piece.x + 2, piece.y],
    [piece.x, piece.y + 2],
    [piece.x + 2, piece.y + 2],
  ];

  const filled = corners.reduce((acc, [x, y]) => {
    if (y >= ROWS || y < 0 || x < 0 || x >= COLS) return acc + 1;
    return acc + (board[y][x] ? 1 : 0);
  }, 0);

  if (filled >= 3) {
    return true;
  }
  return false;
}

// ===================== 固定 =====================
function place() {
  piece.shape.forEach((row, dy) =>
    row.forEach((v, dx) => {
      if (v && piece.y + dy >= 0) {
        board[piece.y + dy][piece.x + dx] = COLORS[piece.type];
      }
    })
  );

  const tspin = detectTSpin();
  if (tspin) {
    tspinFlag = true;
    showTSpin("T-SPIN");
  }

  clearLines();
  spawn();
}

// ===================== 消去 =====================
function clearLines() {
  board = board.filter(row => row.some(v => !v));
  const cleared = ROWS - board.length;
  while (board.length < ROWS) board.unshift(Array(COLS).fill(0));
  if (cleared) {
    score += cleared * 100;
    lines += cleared;
  }
  updateUI();
}

// ===================== T-spin表示 =====================
function showTSpin(msg) {
  tspinMsg.style.fontSize = "0.5cm";
  tspinMsg.textContent = msg;
  setTimeout(() => tspinMsg.textContent = "", 2000);
}

// ===================== 入力処理 =====================
function handleKey(e) {
  if (["ArrowDown","ArrowUp","ArrowLeft","ArrowRight"," "].includes(e.key)) e.preventDefault();
  if (e.key === "ArrowLeft") { piece.x--; if (collides(piece)) piece.x++; }
  if (e.key === "ArrowRight") { piece.x++; if (collides(piece)) piece.x--; }
  if (e.key === "ArrowDown") { piece.y++; if (collides(piece)) { piece.y--; place(); } }
  if (e.key === " ") {
    while (!collides(piece)) piece.y++;
    piece.y--;
    place();
  }
  if (e.key === "z" || e.key === "Z") rotate(-1);
  if (e.key === "x" || e.key === "X") rotate(1);
  draw();
}

// ===================== 描画 =====================
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  board.forEach((row, y) =>
    row.forEach((v, x) => {
      if (v) {
        ctx.fillStyle = v;
        ctx.fillRect(x * BLOCK, y * BLOCK, BLOCK - 1, BLOCK - 1);
      }
    })
  );
  piece.shape.forEach((row, dy) =>
    row.forEach((v, dx) => {
      if (v) {
        ctx.fillStyle = COLORS[piece.type];
        ctx.fillRect((piece.x + dx) * BLOCK, (piece.y + dy) * BLOCK, BLOCK - 1, BLOCK - 1);
      }
    })
  );
}

function updateUI() {
  document.getElementById("score").textContent = score;
  document.getElementById("lines").textContent = lines;
  document.getElementById("level").textContent = level;
}
