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

  // === 設定 ===
  const COLS = 10;
  const ROWS = 20;
  const BLOCK = 30;
  canvas.width = COLS * BLOCK;
  canvas.height = ROWS * BLOCK;

  // === ピース定義 ===
  const PIECES = {
    I: [[1, 1, 1, 1]],
    O: [[1, 1],
        [1, 1]],
    T: [[0, 1, 0],
        [1, 1, 1]],
    S: [[0, 1, 1],
        [1, 1, 0]],
    Z: [[1, 1, 0],
        [0, 1, 1]],
    J: [[1, 0, 0],
        [1, 1, 1]],
    L: [[0, 0, 1],
        [1, 1, 1]]
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

  // === 盤面 ===
  let board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));

  // === 状態 ===
  let current, nextQueue, holdPiece = null, canHold = true;
  let score = 0, lines = 0, b2b = 0, tspinCount = 0;
  let dropInterval = 800, lastDrop = 0;

  // === 初期化 ===
  restart();

  function restart() {
    board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    nextQueue = genBag();
    current = spawn();
    holdPiece = null;
    canHold = true;
    score = 0; lines = 0; b2b = 0; tspinCount = 0;
    updateStats();
    draw();
  }

  document.getElementById("restart").onclick = restart;

  // === 入力 ===
  document.addEventListener("keydown", e => {
    // ↓スクロール防止
    if (["ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)) e.preventDefault();

    switch (e.key) {
      case "ArrowLeft": move(-1); break;
      case "ArrowRight": move(1); break;
      case "ArrowDown": drop(); break;
      case " ": hardDrop(); break;
      case "z": rotate(-1); break;
      case "x": rotate(1); break;
      case "a": rotate180(); break;
      case "Shift":
      case "c": hold(); break;
    }
    draw();
  });

  // === メインループ ===
  function update(time = 0) {
    if (time - lastDrop > dropInterval) {
      lastDrop = time;
      if (!drop()) {
        fix();
        clearLines();
        canHold = true;
        current = spawn();
      }
      draw();
    }
    requestAnimationFrame(update);
  }
  requestAnimationFrame(update);

  // === ピース生成 ===
  function genBag() {
    const bag = Object.keys(PIECES);
    let q = [];
    while (bag.length) q.push(bag.splice(Math.floor(Math.random() * bag.length), 1)[0]);
    return q;
  }

  function spawn() {
    if (nextQueue.length < 7) nextQueue.push(...genBag());
    const type = nextQueue.shift();
    drawNext();
    const matrix = PIECES[type].map(r => [...r]);
    const piece = { type, matrix, x: 3, y: 0 };
    if (collide(piece)) restart();
    return piece;
  }

  // === 描画 ===
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBoard();
    drawPiece(current);
    drawHold();
  }

  function drawBoard() {
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (board[y][x]) {
          ctx.fillStyle = COLORS[board[y][x]];
          ctx.fillRect(x * BLOCK, y * BLOCK, BLOCK - 1, BLOCK - 1);
        }
      }
    }
  }

  function drawPiece(p) {
    ctx.fillStyle = COLORS[p.type];
    for (let y = 0; y < p.matrix.length; y++) {
      for (let x = 0; x < p.matrix[y].length; x++) {
        if (p.matrix[y][x]) ctx.fillRect((p.x + x) * BLOCK, (p.y + y) * BLOCK, BLOCK - 1, BLOCK - 1);
      }
    }
  }

  function drawHold() {
    holdCtx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
    if (!holdPiece) return;
    holdCtx.fillStyle = COLORS[holdPiece];
    const shape = PIECES[holdPiece];
    const bx = 2, by = 2;
    shape.forEach((r, y) =>
      r.forEach((v, x) => {
        if (v) holdCtx.fillRect(bx + x * 20, by + y * 20, 18, 18);
      })
    );
  }

  function drawNext() {
    nextCanvases.forEach((ctx, i) => {
      ctx.clearRect(0, 0, 100, 100);
      const type = nextQueue[i];
      if (!type) return;
      ctx.fillStyle = COLORS[type];
      const shape = PIECES[type];
      shape.forEach((r, y) =>
        r.forEach((v, x) => {
          if (v) ctx.fillRect(x * 15 + 10, y * 15 + 10, 14, 14);
        })
      );
    });
  }

  // === 移動・衝突 ===
  function move(dir) {
    current.x += dir;
    if (collide(current)) current.x -= dir;
  }

  function drop() {
    current.y++;
    if (collide(current)) {
      current.y--;
      fix();
      clearLines();
      canHold = true;
      current = spawn();
      return false;
    }
    return true;
  }

  function hardDrop() {
    while (!collide(current)) current.y++;
    current.y--;
    fix();
    clearLines();
    canHold = true;
    current = spawn();
  }

  function collide(p) {
    for (let y = 0; y < p.matrix.length; y++) {
      for (let x = 0; x < p.matrix[y].length; x++) {
        if (
          p.matrix[y][x] &&
          (board[p.y + y] && board[p.y + y][p.x + x]) !== undefined &&
          (p.y + y >= ROWS || p.x + x < 0 || p.x + x >= COLS || board[p.y + y][p.x + x])
        ) {
          return true;
        }
      }
    }
    return false;
  }

  function fix() {
    for (let y = 0; y < current.matrix.length; y++) {
      for (let x = 0; x < current.matrix[y].length; x++) {
        if (current.matrix[y][x] && current.y + y >= 0)
          board[current.y + y][current.x + x] = current.type;
      }
    }
  }

  function clearLines() {
    let linesCleared = 0;
    board = board.filter(r => r.some(v => !v));
    linesCleared = ROWS - board.length;
    while (board.length < ROWS) board.unshift(Array(COLS).fill(null));

    if (linesCleared > 0) {
      score += linesCleared * 100;
      lines += linesCleared;
      updateStats();
    }
  }

  // === 回転系 ===
  function rotate(dir) {
    const oldMatrix = current.matrix.map(r => [...r]);
    current.matrix = rotateMatrix(current.matrix, dir);
    if (collide(current)) {
      // SRS風壁蹴り
      const offsets = [1, -1, 2, -2];
      let moved = false;
      for (const o of offsets) {
        current.x += o;
        if (!collide(current)) {
          moved = true;
          break;
        }
        current.x -= o;
      }
      if (!moved) current.matrix = oldMatrix;
    } else if (current.type === "T") {
      checkTSpin(dir);
    }
  }

  function rotate180() {
    rotate(1);
    rotate(1);
  }

  function rotateMatrix(m, dir) {
    const N = m.length;
    const res = Array.from({ length: N }, () => Array(N).fill(0));
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        res[y][x] = dir > 0 ? m[N - x - 1][y] : m[x][N - y - 1];
      }
    }
    return res;
  }

  // === HOLD ===
  function hold() {
    if (!canHold) return;
    if (!holdPiece) {
      holdPiece = current.type;
      current = spawn();
    } else {
      [holdPiece, current] = [current.type, spawnPiece(holdPiece)];
    }
    canHold = false;
    draw();
  }

  function spawnPiece(type) {
    return { type, matrix: PIECES[type].map(r => [...r]), x: 3, y: 0 };
  }

  // === T-spin検出 ===
  function checkTSpin(dir) {
    const { x, y } = current;
    const corners = [
      board[y - 1]?.[x - 1],
      board[y - 1]?.[x + 1],
      board[y + 1]?.[x - 1],
      board[y + 1]?.[x + 1]
    ];
    const filled = corners.filter(Boolean).length;
    if (filled >= 3) showTSpin();
  }

  function showTSpin() {
    tspinCount++;
    tspinEl.textContent = tspinCount;
    tspinMsg.textContent = "T-SPIN!";
    tspinMsg.style.display = "block";
    setTimeout(() => (tspinMsg.style.display = "none"), 2000);
  }

  function updateStats() {
    scoreEl.textContent = score;
    linesEl.textContent = lines;
    b2bEl.textContent = b2b;
  }
});
