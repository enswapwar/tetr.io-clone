// === 死亡判定・ゴーストピース・Hold描画・T-spin表示対応 ===
window.addEventListener("load", () => {
  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");

  const holdCanvas = document.getElementById("hold");
  const holdCtx = holdCanvas.getContext("2d");

  const nextCanvases = [
    document.getElementById("next1"),
    document.getElementById("next2"),
    document.getElementById("next3"),
    document.getElementById("next4"),
    document.getElementById("next5")
  ].map(c => c.getContext("2d"));

  const tspinMsg = document.getElementById("tspin-message");
  const scoreEl = document.getElementById("score");
  const linesEl = document.getElementById("lines");
  const b2bEl = document.getElementById("b2b");
  const tspinEl = document.getElementById("tspin");

  const COLS = 10;
  const ROWS = 20;
  const BLOCK = 30;
  canvas.width = COLS * BLOCK;
  canvas.height = ROWS * BLOCK;

  const PIECES = {
    I: [[1, 1, 1, 1]],
    O: [[1, 1],[1, 1]],
    T: [[0, 1, 0],[1, 1, 1]],
    S: [[0, 1, 1],[1, 1, 0]],
    Z: [[1, 1, 0],[0, 1, 1]],
    J: [[1, 0, 0],[1, 1, 1]],
    L: [[0, 0, 1],[1, 1, 1]]
  };

  const COLORS = {
    I: "#00ffff",
    O: "#ffff00",
    T: "#a000f0",
    S: "#00ff00",
    Z: "#ff0000",
    J: "#0000ff",
    L: "#ff8000"
  };

  let board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  let current, nextQueue, holdPiece = null, canHold = true;
  let score = 0, lines = 0, b2b = 0, tspinCount = 0;
  let dropInterval = 800, lastDrop = 0;
  let gameOver = false;

  restart();

  function restart() {
    board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    nextQueue = genBag();
    current = spawn();
    holdPiece = null;
    canHold = true;
    score = 0; lines = 0; b2b = 0; tspinCount = 0;
    gameOver = false;
    updateStats();
    draw();
  }

  document.getElementById("restart").onclick = restart;

  document.addEventListener("keydown", e => {
    if (["ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)) e.preventDefault();
    if (gameOver) return;
    switch (e.key) {
      case "ArrowLeft": move(-1); break;
      case "ArrowRight": move(1); break;
      case "ArrowDown": softDrop(); break;
      case " ": hardDrop(); break;
      case "z": rotate(-1); break;
      case "x": rotate(1); break;
      case "a": rotate180(); break;
      case "Shift":
      case "c": hold(); break;
    }
    draw();
  });

  function update(time = 0) {
    if (!gameOver && time - lastDrop > dropInterval) {
      lastDrop = time;
      drop();
      draw();
    }
    requestAnimationFrame(update);
  }
  requestAnimationFrame(update);

  function genBag() {
    const bag = Object.keys(PIECES);
    const q = [];
    while (bag.length) {
      const idx = Math.floor(Math.random() * bag.length);
      q.push(bag.splice(idx, 1)[0]);
    }
    return q;
  }

  function ensureQueue() {
    while (nextQueue.length < 7) nextQueue.push(...genBag());
  }

  function spawn() {
    ensureQueue();
    const type = nextQueue.shift();
    drawNext();
    const matrix = PIECES[type].map(r => [...r]);
    const piece = { type, matrix, x: Math.floor((COLS - matrix[0].length) / 2), y: -2, lastWasRotate: false };
    if (collide(piece)) {
      gameOver = true;
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#fff";
      ctx.font = "30px sans-serif";
      ctx.fillText("GAME OVER", 25, canvas.height / 2);
      return null;
    }
    return piece;
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBoard();
    if (current) {
      drawGhost(current);
      drawPiece(current);
    }
    drawHold();
  }

  function drawBoard() {
    ctx.fillStyle = "#071018";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (board[y][x]) {
          ctx.fillStyle = COLORS[board[y][x]];
          ctx.fillRect(x * BLOCK, y * BLOCK, BLOCK - 1, BLOCK - 1);
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.02)';
          ctx.fillRect(x * BLOCK, y * BLOCK, BLOCK - 1, BLOCK - 1);
        }
      }
    }
  }

  function drawPiece(p) {
    ctx.fillStyle = COLORS[p.type];
    for (let y = 0; y < p.matrix.length; y++)
      for (let x = 0; x < p.matrix[y].length; x++)
        if (p.matrix[y][x] && p.y + y >= 0)
          ctx.fillRect((p.x + x) * BLOCK, (p.y + y) * BLOCK, BLOCK - 1, BLOCK - 1);
  }

  function drawGhost(p) {
    const ghost = { ...p, y: p.y };
    while (!collide(ghost)) ghost.y++;
    ghost.y--;
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    for (let y = 0; y < ghost.matrix.length; y++)
      for (let x = 0; x < ghost.matrix[y].length; x++)
        if (ghost.matrix[y][x] && ghost.y + y >= 0)
          ctx.fillRect((ghost.x + x) * BLOCK, (ghost.y + y) * BLOCK, BLOCK - 1, BLOCK - 1);
  }

  function drawHold() {
    holdCtx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
    if (!holdPiece) return;
    holdCtx.fillStyle = COLORS[holdPiece];
    const shape = PIECES[holdPiece];
    const size = Math.min(holdCanvas.width / shape[0].length, holdCanvas.height / shape.length) * 0.6;
    const ox = (holdCanvas.width - size * shape[0].length) / 2;
    const oy = (holdCanvas.height - size * shape.length) / 2;
    shape.forEach((r, y) =>
      r.forEach((v, x) => {
        if (v) holdCtx.fillRect(ox + x * size, oy + y * size, size - 2, size - 2);
      })
    );
  }

  function collide(p) {
    for (let r = 0; r < p.matrix.length; r++) {
      for (let c = 0; c < p.matrix[r].length; c++) {
        if (!p.matrix[r][c]) continue;
        const py = p.y + r, px = p.x + c;
        if (px < 0 || px >= COLS || py >= ROWS) return true;
        if (py >= 0 && board[py][px] !== null) return true;
      }
    }
    return false;
  }

  function move(dir) {
    current.x += dir;
    if (collide(current)) current.x -= dir;
  }

  function drop() {
    if (!current) return;
    current.y++;
    if (collide(current)) {
      current.y--;
      fixAndCheck();
      canHold = true;
      current = spawn();
    }
  }

  function fixAndCheck() {
    for (let y = 0; y < current.matrix.length; y++)
      for (let x = 0; x < current.matrix[y].length; x++)
        if (current.matrix[y][x] && current.y + y >= 0)
          board[current.y + y][current.x + x] = current.type;

    let linesCleared = 0;
    for (let y = ROWS - 1; y >= 0; y--) {
      if (board[y].every(c => c)) {
        board.splice(y, 1);
        board.unshift(Array(COLS).fill(null));
        linesCleared++; y++;
      }
    }

    const tspinResult = detectTSpinOnFix(current, linesCleared);
    if (tspinResult) showTSpinMessage(tspinResult);
    if (linesCleared > 0) {
      score += linesCleared * 100;
      lines += linesCleared;
      updateStats();
    }
  }

  function detectTSpinOnFix(piece, linesCleared) {
    if (piece.type !== 'T' || !piece.lastWasRotate) return null;
    const cx = piece.x + 1;
    const cy = piece.y + 1;
    const checks = [[0,0],[0,2],[2,0],[2,2]];
    let occupied = 0;
    for (const ch of checks) {
      const py = cy + (ch[0] - 1);
      const px = cx + (ch[1] - 1);
      if (py < 0 || px < 0 || px >= COLS || py >= ROWS || board[py][px] !== null) occupied++;
    }
    if (occupied >= 3) {
      if (linesCleared === 0) return 'T-SPIN';
      if (linesCleared === 1) return 'T-SPIN SINGLE';
      if (linesCleared === 2) return 'T-SPIN DOUBLE';
      if (linesCleared >= 3) return 'T-SPIN TRIPLE';
    }
    return null;
  }

  function showTSpinMessage(text) {
    tspinCount++;
    tspinEl.textContent = tspinCount;
    tspinMsg.textContent = text;
    tspinMsg.style.display = "block";
    tspinMsg.style.fontSize = "2cm";
    setTimeout(() => {
      tspinMsg.style.display = "none";
      tspinMsg.textContent = "";
    }, 2000);
  }

  function updateStats() {
    scoreEl.textContent = score;
    linesEl.textContent = lines;
    b2bEl.textContent = b2b;
    tspinEl.textContent = tspinCount;
  }

  nextCanvases.forEach(ctx2d => {
    const el = ctx2d.canvas;
    el.width = 80; el.height = 80;
  });
  drawNext();

  function drawNext() {
    nextCanvases.forEach((ctx2d, i) => {
      const canvasEl = ctx2d.canvas;
      ctx2d.clearRect(0, 0, canvasEl.width, canvasEl.height);
      const type = nextQueue[i];
      if (!type) return;
      ctx2d.fillStyle = COLORS[type];
      const shape = PIECES[type];
      const size = Math.min(canvasEl.width / shape[0].length, canvasEl.height / shape.length) * 0.6;
      const ox = (canvasEl.width - size * shape[0].length) / 2;
      const oy = (canvasEl.height - size * shape.length) / 2;
      shape.forEach((r, y) =>
        r.forEach((v, x) => {
          if (v) ctx2d.fillRect(ox + x * size, oy + y * size, size - 2, size - 2);
        })
      );
    });
  }

  // === 回転 ===
  function rotate(dir = 1) {
    if (!current) return;
    const old = current.matrix.map(r => [...r]);
    current.lastWasRotate = true;
    const m = current.matrix;
    const rotated = m[0].map((_, i) => m.map(r => r[i]));
    current.matrix = dir > 0 ? rotated.map(r => r.reverse()) : rotated.reverse();
    const kicks = [0, -1, 1, -2, 2];
    let valid = false;
    for (const dx of kicks) {
      current.x += dx;
      if (!collide(current)) { valid = true; break; }
      current.x -= dx;
    }
    if (!valid) current.matrix = old;
  }

  // === 180°回転 ===
  function rotate180() {
    if (!current) return;
    const old = current.matrix.map(r => [...r]);
    current.matrix = current.matrix.map(r => [...r].reverse()).reverse();
    current.lastWasRotate = true;
    if (collide(current)) current.matrix = old;
  }

  // === ソフトドロップ ===
  function softDrop() {
    if (!current) return;
    current.y++;
    if (collide(current)) {
      current.y--;
      fixAndCheck();
      canHold = true;
      current = spawn();
    }
  }

  // === ハードドロップ ===
  function hardDrop() {
    if (!current) return;
    while (!collide(current)) current.y++;
    current.y--;
    fixAndCheck();
    canHold = true;
    current = spawn();
  }

  // === HOLD ===
  function hold() {
    if (!canHold) return;
    if (!holdPiece) {
      holdPiece = current.type;
      current = spawn();
    } else {
      const temp = holdPiece;
      holdPiece = current.type;
      current = {
        type: temp,
        matrix: PIECES[temp].map(r => [...r]),
        x: Math.floor((COLS - PIECES[temp][0].length) / 2),
        y: -2,
        lastWasRotate: false
      };
    }
    canHold = false;
    drawHold();
  }

}); // ←これが最後の1個だけ
