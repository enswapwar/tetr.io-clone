const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const ROWS = 20;
const COLS = 10;
const BLOCK = 30;

// テトリミノ定義
const SHAPES = {
  I: [[1,1,1,1]],
  O: [[1,1],[1,1]],
  T: [[0,1,0],[1,1,1]],
  S: [[0,1,1],[1,1,0]],
  Z: [[1,1,0],[0,1,1]],
  J: [[1,0,0],[1,1,1]],
  L: [[0,0,1],[1,1,1]]
};

const COLORS = {
  I: "#00ffff", O: "#ffff00", T: "#aa00ff",
  S: "#00ff00", Z: "#ff0000", J: "#0000ff", L: "#ff7f00"
};

// フィールド
let field = Array.from({ length: ROWS }, () => Array(COLS).fill(0));

// 現在ピース
let current = randomPiece();
let next = randomPiece();
let hold = null;
let canHold = true;
let dropCounter = 0;
let dropInterval = 500;
let lastTime = 0;

function randomPiece() {
  const keys = Object.keys(SHAPES);
  const type = keys[Math.floor(Math.random() * keys.length)];
  return {
    shape: SHAPES[type].map(r => [...r]),
    color: COLORS[type],
    x: 3,
    y: 0,
    type
  };
}

function drawBlock(x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x * BLOCK, y * BLOCK, BLOCK - 1, BLOCK - 1);
}

function drawField() {
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (field[y][x]) drawBlock(x, y, field[y][x]);
    }
  }
}

function drawPiece(p) {
  p.shape.forEach((row, dy) => {
    row.forEach((v, dx) => {
      if (v) drawBlock(p.x + dx, p.y + dy, p.color);
    });
  });
}

function collide(p) {
  for (let y = 0; y < p.shape.length; y++) {
    for (let x = 0; x < p.shape[y].length; x++) {
      if (p.shape[y][x] &&
         (field[p.y + y] && field[p.y + y][p.x + x]) !== 0 ||
         p.x + x < 0 || p.x + x >= COLS || p.y + y >= ROWS) {
        return true;
      }
    }
  }
  return false;
}

function merge(p) {
  p.shape.forEach((row, dy) => {
    row.forEach((v, dx) => {
      if (v && p.y + dy >= 0) field[p.y + dy][p.x + dx] = p.color;
    });
  });
}

function rotate(piece, dir) {
  const s = piece.shape;
  const N = s.length;
  let newShape = Array.from({ length: N }, () => Array(N).fill(0));
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      newShape[x][N - 1 - y] = s[y][x];
    }
  }
  if (dir === -1) newShape = newShape[0].map((_, i) => newShape.map(r => r[i])).reverse();
  return newShape;
}

function rotate180(p) {
  return p.shape.map(r => [...r]).reverse().map(r => r.reverse());
}

function drop() {
  current.y++;
  if (collide(current)) {
    current.y--;
    merge(current);
    resetPiece();
    clearLines();
  }
  dropCounter = 0;
}

function hardDrop() {
  while (!collide(current)) current.y++;
  current.y--;
  merge(current);
  resetPiece();
  clearLines();
  dropCounter = 0;
}

function clearLines() {
  field = field.filter(r => r.some(v => !v));
  while (field.length < ROWS) field.unshift(Array(COLS).fill(0));
}

function resetPiece() {
  current = next;
  next = randomPiece();
  canHold = true;
  if (collide(current)) {
    field = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  }
}

function holdPiece() {
  if (!canHold) return;
  if (hold) {
    [hold, current] = [current, hold];
    current.x = 3; current.y = 0;
  } else {
    hold = current;
    current = next;
    next = randomPiece();
  }
  canHold = false;
}

document.addEventListener("keydown", e => {
  switch (e.key.toLowerCase()) {
    case "arrowleft": current.x--; if (collide(current)) current.x++; break;
    case "arrowright": current.x++; if (collide(current)) current.x--; break;
    case "arrowdown": current.y++; if (collide(current)) current.y--; break;
    case " ": hardDrop(); break;
    case "z": current.shape = rotate(current, -1); if (collide(current)) current.shape = rotate(current, 1); break;
    case "x": current.shape = rotate(current, 1); if (collide(current)) current.shape = rotate(current, -1); break;
    case "a": current.shape = rotate180(current); if (collide(current)) current.shape = rotate180(current); break;
    case "shift": case "c": holdPiece(); break;
  }
});

function update(time = 0) {
  const delta = time - lastTime;
  lastTime = time;
  dropCounter += delta;
  if (dropCounter > dropInterval) drop();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawField();
  drawPiece(current);
  requestAnimationFrame(update);
}

update();
