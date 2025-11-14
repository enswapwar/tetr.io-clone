// === ALL-IN-ONE main.js ===
// T-Spin精密判定 / Lock Delay (1s, 回転で最大3s延長) / 先行入力 / DAS+ARR / SRS-ish 回転入れ / ゴースト / Hold / Next
window.addEventListener("load", () => {
  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");
  const holdCanvas = document.getElementById("hold");
  const holdCtx = holdCanvas.getContext("2d");
  const tspinMsg = document.getElementById("tspin-message");
  const scoreEl = document.getElementById("score");
  const linesEl = document.getElementById("lines");
  const b2bEl = document.getElementById("b2b");
  const tspinEl = document.getElementById("tspin");

  // Next canvases (IDs: next1..next5 in HTML)
  const nextCanvases = [
    document.getElementById("next1"),
    document.getElementById("next2"),
    document.getElementById("next3"),
    document.getElementById("next4"),
    document.getElementById("next5")
  ].map(c => c.getContext("2d"));

  const COLS = 10, ROWS = 20, BLOCK = 30;
  canvas.width = COLS * BLOCK;
  canvas.height = ROWS * BLOCK;

  const PIECES = {
    I: [[1,1,1,1]],
    O: [[1,1],[1,1]],
    T: [[0,1,0],[1,1,1]],
    S: [[0,1,1],[1,1,0]],
    Z: [[1,1,0],[0,1,1]],
    J: [[1,0,0],[1,1,1]],
    L: [[0,0,1],[1,1,1]]
  };

  const COLORS = {
    I:"#00ffff", O:"#ffff00", T:"#a000f0",
    S:"#00ff00", Z:"#ff0000", J:"#0000ff", L:"#ff8000"
  };

  // game state
  let board, current, nextQueue, holdPiece = null, canHold = true;
  let score = 0, lines = 0, b2b = 0, tspinCount = 0;
  let dropInterval = 800, lastDrop = 0, gameOver = false;

  // lock delay (仕様: 地面に触れて 1s で設置。回転したら最大 3s まで増やせる。カウンターはリセットしない)
  let lockTimer = null;
  let lockStartTime = null;
  let lockExtended = false;
  const lockBase = 1000; // 1s
  const lockMax = 3000; // 3s (最大)

  // DAS / ARR handling
  let moveLeftPressTime = 0;
  let moveRightPressTime = 0;
  let lastMoveLeft = 0;
  let lastMoveRight = 0;
  const DAS = 500; // 0.5s before autorepeat
  const ARR = 50;  // repeat interval when holding after DAS

  // input state (for hold keys, rotation, etc)
  let keyState = {};

  // init
  restart();

  // ---- public hooks
  document.getElementById("restart").onclick = restart;

  // ---- keyboard input
  document.addEventListener("keydown", e => {
    if (["ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)) e.preventDefault();
    keyState[e.key] = true;
  });
  document.addEventListener("keyup", e => {
    keyState[e.key] = false;
    // reset DAS timers for that direction on keyup
    if (e.key === "ArrowLeft") { moveLeftPressTime = 0; lastMoveLeft = 0; }
    if (e.key === "ArrowRight") { moveRightPressTime = 0; lastMoveRight = 0; }
  });

  // main loop
  function update(time = 0) {
    processInput(time);
    if (!gameOver && current) {
      if (time - lastDrop > dropInterval) {
        lastDrop = time;
        drop();
      }
      draw();
    }
    requestAnimationFrame(update);
  }
  requestAnimationFrame(update);

  // -------------------
  // game lifecycle
  // -------------------
  function restart() {
    board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    nextQueue = genBag();
    current = spawn();
    score = 0; lines = 0; b2b = 0; tspinCount = 0;
    gameOver = false; canHold = true;
    clearLockTimerImmediate();
    updateStats();
    draw();
    drawNext();
  }

  function genBag() {
    const keys = Object.keys(PIECES);
    const bag = [];
    const pool = keys.slice();
    while (pool.length) {
      const idx = Math.floor(Math.random() * pool.length);
      bag.push(pool.splice(idx, 1)[0]);
    }
    return bag;
  }

  function ensureQueue() {
    while (!nextQueue || nextQueue.length < 7) nextQueue.push(...genBag());
  }

  function spawn() {
    ensureQueue();
    const type = nextQueue.shift();
    drawNext();
    const matrix = PIECES[type].map(r => [...r]);
    const piece = {
      type,
      matrix,
      x: Math.floor((COLS - matrix[0].length) / 2),
      y: -2,
      rotated: false,
      lastRotate: false
    };
    if (collide(piece)) {
      gameOver = true;
      drawGameOver();
      return null;
    }
    // reset lock timers when new piece spawns
    clearLockTimerImmediate();
    return piece;
  }

  // -------------------
  // collision / utilities
  // -------------------
  function collide(p) {
    for (let y = 0; y < p.matrix.length; y++) {
      for (let x = 0; x < p.matrix[y].length; x++) {
        if (!p.matrix[y][x]) continue;
        const px = p.x + x;
        const py = p.y + y;
        if (px < 0 || px >= COLS || py >= ROWS) return true;
        if (py >= 0 && board[py][px]) return true;
      }
    }
    return false;
  }

  function isOnGround(p) {
    p.y++;
    const hit = collide(p);
    p.y--;
    return hit;
  }

  // -------------------
  // input processing (DAS/ARR, rotations, hold, drops)
  // -------------------
  function processInput(now = performance.now()) {
    if (gameOver || !current) return;

    // LEFT handling (tap vs hold)
    if (keyState["ArrowLeft"]) {
      if (moveLeftPressTime === 0) {
        moveLeftPressTime = now;
        // instant single move on keydown
        move(-1);
        lastMoveLeft = now;
      } else {
        const held = now - moveLeftPressTime;
        if (held >= DAS && now - lastMoveLeft >= ARR) {
          move(-1);
          lastMoveLeft = now;
        }
      }
    } else {
      // not pressed
      moveLeftPressTime = 0;
      lastMoveLeft = 0;
    }

    // RIGHT handling
    if (keyState["ArrowRight"]) {
      if (moveRightPressTime === 0) {
        moveRightPressTime = now;
        move(1);
        lastMoveRight = now;
      } else {
        const held = now - moveRightPressTime;
        if (held >= DAS && now - lastMoveRight >= ARR) {
          move(1);
          lastMoveRight = now;
        }
      }
    } else {
      moveRightPressTime = 0;
      lastMoveRight = 0;
    }

    // SOFT DROP (hold for continuous)
    if (keyState["ArrowDown"]) {
      softDrop();
    }

    // HARD DROP (one-shot)
    if (keyState[" "]) {
      hardDrop();
      keyState[" "] = false;
    }

    // ROTATIONS (one-shot per keydown)
    if (keyState["z"]) { rotate(-1); keyState["z"] = false; }
    if (keyState["x"]) { rotate(1);  keyState["x"] = false; }
    if (keyState["a"]) { rotate180(); keyState["a"] = false; }

    // HOLD
    if (keyState["Shift"] || keyState["c"]) {
      hold();
      keyState["Shift"] = keyState["c"] = false;
    }
  }

  // -------------------
  // movement / rotation / drop behavior
  // -------------------
  function move(dir) {
    if (!current) return;
    current.x += dir;
    if (collide(current)) {
      current.x -= dir;
    } else {
      // if piece is on ground after move, and lock hasn't started, start lock timer
      if (isOnGround(current) && !lockStartTime) startLockTimer();
    }
  }

  // SRS-ish rotation with simple kick table + floor kick attempts
  function rotate(dir = 1) {
    if (!current) return;
    const old = current.matrix.map(r => [...r]);
    const oldX = current.x, oldY = current.y;
    const m = current.matrix;

    // rotate matrix (clockwise if dir>0)
    const N = m.length;
    // produce NxN rotated
    const rotated = Array.from({ length: N }, () => Array(N).fill(0));
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (dir > 0) rotated[x][N - 1 - y] = m[y][x];
      else rotated[N - 1 - x][y] = m[y][x];
    }
    current.matrix = rotated;

    // try kicks (a compact set including basic SRS-like offsets and small floor kicks)
    const kicks = [
      [0,0],
      [1,0], [-1,0],
      [0,-1], [0,1],
      [2,0], [-2,0],
      [0,-2], [0,2]
    ];

    let success = false;
    for (const [kx, ky] of kicks) {
      current.x = oldX + kx;
      current.y = oldY + ky;
      if (!collide(current)) { success = true; break; }
    }

    if (!success) {
      // additional simple floor kick attempt (try one up, two up)
      current.x = oldX; current.y = oldY - 1;
      if (!collide(current)) success = true;
      if (!success) {
        current.x = oldX; current.y = oldY - 2;
        if (!collide(current)) success = true;
      }
    }

    if (!success) {
      // fail: revert
      current.matrix = old;
      current.x = oldX;
      current.y = oldY;
      current.lastRotate = false;
      return;
    }

    // success
    current.rotated = true;
    current.lastRotate = true;

    // If piece was on ground and lock timer already started, extend up to lockMax but DO NOT reset the elapsed counter.
    if (isOnGround(current) && lockStartTime && !lockExtended) {
      const elapsed = performance.now() - lockStartTime;
      const remaining = lockMax - elapsed;
      if (remaining > 0) {
        clearTimeout(lockTimer);
        lockTimer = setTimeout(() => { lockPiece(); }, remaining);
        lockExtended = true;
      }
    } else if (isOnGround(current) && !lockStartTime) {
      // If rotation causes piece to be on ground and lock hasn't started, start lock timer
      startLockTimer();
    }
  }

  function rotate180() {
    if (!current) return;
    const old = current.matrix.map(r => [...r]);
    // 180 rotate
    current.matrix = current.matrix.map(r => [...r].reverse()).reverse();
    if (collide(current)) {
      current.matrix = old;
      return;
    }
    current.rotated = true;
    current.lastRotate = true;
    // extend lock if on ground
    if (isOnGround(current) && lockStartTime && !lockExtended) {
      const elapsed = performance.now() - lockStartTime;
      const remaining = lockMax - elapsed;
      if (remaining > 0) {
        clearTimeout(lockTimer);
        lockTimer = setTimeout(() => { lockPiece(); }, remaining);
        lockExtended = true;
      }
    } else if (isOnGround(current) && !lockStartTime) {
      startLockTimer();
    }
  }

  function softDrop() {
    if (!current) return;
    current.y++;
    if (collide(current)) {
      current.y--;
      if (!lockStartTime && isOnGround(current)) startLockTimer();
    } else {
      // reward small score? (optional)
      score += 1;
      updateStats();
    }
  }

  function hardDrop() {
    if (!current) return;
    while (!collide(current)) current.y++;
    current.y--;
    lockPiece();
  }

  function drop() {
    if (!current) return;
    current.y++;
    if (collide(current)) {
      current.y--;
      if (!lockStartTime && isOnGround(current)) startLockTimer();
    }
  }

  // -------------------
  // Lock timer management
  // -------------------
  function startLockTimer() {
    // don't start if already started
    if (lockStartTime) return;
    lockStartTime = performance.now();
    lockExtended = false;
    clearTimeout(lockTimer);
    lockTimer = setTimeout(() => { lockPiece(); }, lockBase);
  }

  function lockPiece() {
    clearTimeout(lockTimer);
    lockTimer = null;
    lockStartTime = null;
    lockExtended = false;
    fixAndCheck();
    canHold = true;
    current = spawn();
  }

  function clearLockTimerImmediate() {
    if (lockTimer) { clearTimeout(lockTimer); lockTimer = null; }
    lockStartTime = null;
    lockExtended = false;
  }

  // -------------------
  // fix / clear / tspin
  // -------------------
  function fixAndCheck() {
    if (!current) return;
    for (let y = 0; y < current.matrix.length; y++) {
      for (let x = 0; x < current.matrix[y].length; x++) {
        if (current.matrix[y][x] && current.y + y >= 0) {
          board[current.y + y][current.x + x] = current.type;
        }
      }
    }

    // clear lines
    let linesCleared = 0;
    for (let y = ROWS - 1; y >= 0; y--) {
      if (board[y].every(v => v)) {
        board.splice(y, 1);
        board.unshift(Array(COLS).fill(null));
        linesCleared++;
        y++; // recheck this row index after splice
      }
    }

    // detect T-spin (uses lastRotate flag set during rotation)
    const tspin = detectTSpin(current, linesCleared);
    if (tspin) showTSpinMessage(tspin);

    if (linesCleared > 0) {
      score += linesCleared * 100;
      lines += linesCleared;
    }
    // reset rotation flags on placed piece to avoid sticky T-spin
    if (current) {
      current.rotated = false;
      current.lastRotate = false;
    }
    updateStats();
  }

  function detectTSpin(p, linesCleared) {
    if (!p || p.type !== "T" || !p.lastRotate) return null;
    // center of 3x3
    const cx = p.x + 1;
    const cy = p.y + 1;
    const corners = [[0,0],[0,2],[2,0],[2,2]];
    let occupied = 0;
    for (const [dy, dx] of corners) {
      const px = cx + (dx - 1);
      const py = cy + (dy - 1);
      if (py < 0 || py >= ROWS || px < 0 || px >= COLS || board[py][px]) occupied++;
    }
    if (occupied >= 3) {
      if (linesCleared === 0) return "T-SPIN";
      if (linesCleared === 1) return "T-SPIN SINGLE";
      if (linesCleared === 2) return "T-SPIN DOUBLE";
      if (linesCleared >= 3) return "T-SPIN TRIPLE";
    }
    return null;
  }

  function showTSpinMessage(text) {
    tspinCount++;
    tspinEl.textContent = tspinCount;
    tspinMsg.textContent = text;
    tspinMsg.style.display = "block";
    tspinMsg.style.fontSize = "0.5cm";
    setTimeout(() => {
      tspinMsg.style.display = "none";
      tspinMsg.textContent = "";
    }, 2000);
  }

  // -------------------
  // hold
  // -------------------
  function hold() {
    if (!canHold || !current) return;
    if (!holdPiece) {
      holdPiece = current.type;
      current = spawn();
    } else {
      const tmp = holdPiece;
      holdPiece = current.type;
      current = {
        type: tmp,
        matrix: PIECES[tmp].map(r => [...r]),
        x: Math.floor((COLS - PIECES[tmp][0].length) / 2),
        y: -2,
        rotated: false,
        lastRotate: false
      };
      clearLockTimerImmediate();
    }
    canHold = false;
    drawHold();
  }

  // -------------------
  // drawing
  // -------------------
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
          // faint grid
          ctx.fillStyle = 'rgba(255,255,255,0.02)';
          ctx.fillRect(x * BLOCK, y * BLOCK, BLOCK - 1, BLOCK - 1);
        }
      }
    }
  }

  function drawPiece(p) {
    ctx.fillStyle = COLORS[p.type];
    for (let y = 0; y < p.matrix.length; y++) {
      for (let x = 0; x < p.matrix[y].length; x++) {
        if (p.matrix[y][x] && p.y + y >= 0) {
          ctx.fillRect((p.x + x) * BLOCK, (p.y + y) * BLOCK, BLOCK - 1, BLOCK - 1);
        }
      }
    }
  }

  function drawGhost(p) {
    const g = { ...p, y: p.y };
    while (!collide(g)) g.y++;
    g.y--;
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    for (let y = 0; y < g.matrix.length; y++) {
      for (let x = 0; x < g.matrix[y].length; x++) {
        if (g.matrix[y][x] && g.y + y >= 0) {
          ctx.fillRect((g.x + x) * BLOCK, (g.y + y) * BLOCK, BLOCK - 1, BLOCK - 1);
        }
      }
    }
  }

  function drawHold() {
    holdCtx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
    if (!holdPiece) return;
    holdCtx.fillStyle = COLORS[holdPiece];
    const s = PIECES[holdPiece];
    const size = Math.min(holdCanvas.width / s[0].length, holdCanvas.height / s.length) * 0.6;
    const ox = (holdCanvas.width - size * s[0].length) / 2;
    const oy = (holdCanvas.height - size * s.length) / 2;
    s.forEach((r, y) => r.forEach((v, x) => {
      if (v) holdCtx.fillRect(ox + x * size, oy + y * size, size - 2, size - 2);
    }));
  }

  function drawNext() {
    // ensure canvas internal size for clarity
    nextCanvases.forEach((ctx2d, i) => {
      const c = ctx2d.canvas;
      // if canvas sized small by HTML, maintain existing size; drawing formula handles it.
      ctx2d.clearRect(0, 0, c.width, c.height);
      const type = nextQueue && nextQueue[i];
      if (!type) return;
      ctx2d.fillStyle = COLORS[type];
      const s = PIECES[type];
      const size = Math.min(c.width / s[0].length, c.height / s.length) * 0.6;
      const ox = (c.width - size * s[0].length) / 2;
      const oy = (c.height - size * s.length) / 2;
      s.forEach((r, y) => r.forEach((v, x) => {
        if (v) ctx2d.fillRect(ox + x * size, oy + y * size, size - 2, size - 2);
      }));
    });
  }

  function drawGameOver() {
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#fff";
    ctx.font = "30px sans-serif";
    ctx.fillText("GAME OVER", 25, canvas.height / 2);
  }

  function updateStats() {
    scoreEl.textContent = score;
    linesEl.textContent = lines;
    b2bEl.textContent = b2b;
    tspinEl.textContent = tspinCount;
  }

  // expose for debugging if necessary
  window._tetr = {
    board, get current() { return current; }, get nextQueue() { return nextQueue; }, get hold() { return holdPiece; }
  };
});
