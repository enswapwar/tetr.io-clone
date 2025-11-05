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

  // === メインループ ===
  function update(time = 0) {
    if (time - lastDrop > dropInterval) {
      lastDrop = time;
      if (!drop()) {
        // 固定は drop() 内で行われるパスもあるが、確実にfixを呼ぶ安全ルート
        // (drop() が false を返したら既に fix が呼ばれているのでここでは不要だが二重防止はOK)
        // fix();
        // clearLines();
        // canHold = true;
        // current = spawn();
      }
      draw();
    }
    requestAnimationFrame(update);
  }
  requestAnimationFrame(update);

  // === ピース生成 ===
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
    while (nextQueue.length < 7) {
      nextQueue.push(...genBag());
    }
  }

  function spawn() {
    ensureQueue();
    const type = nextQueue.shift();
    drawNext();
    const matrix = PIECES[type].map(r => [...r]);
    // spawn at y = -2 (standard)
    const piece = { type, matrix, x: Math.floor((COLS - matrix[0].length) / 2), y: -2, lastWasRotate: false };
    // If immediate collision at spawn -> game over (restart)
    if (collide(piece)) {
      // simple game over behaviour: restart board
      restart();
    }
    return piece;
  }

  // === 描画 ===
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBoard();
    if (current) drawPiece(current);
    drawHold();
  }

  function drawBoard() {
    // background
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
        if (p.matrix[y][x]) {
          const drawY = p.y + y;
          if (drawY < 0) continue; // spawn above visible area: skip drawing
          ctx.fillRect((p.x + x) * BLOCK, drawY * BLOCK, BLOCK - 1, BLOCK - 1);
        }
      }
    }
  }

  function drawHold() {
    holdCtx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
    if (!holdPiece) return;
    holdCtx.fillStyle = COLORS[holdPiece];
    const shape = PIECES[holdPiece];
    const size = 18;
    const bx = 8, by = 8;
    shape.forEach((r, y) =>
      r.forEach((v, x) => {
        if (v) holdCtx.fillRect(bx + x * size, by + y * size, size - 2, size - 2);
      })
    );
  }

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

  // === 移動・衝突 ===
  // Strict collide: returns true if piece at (p.x,p.y) would overlap/leave bounds/bottom
  function collide(p) {
    for (let r = 0; r < p.matrix.length; r++) {
      for (let c = 0; c < p.matrix[r].length; c++) {
        if (!p.matrix[r][c]) continue;
        const py = p.y + r;
        const px = p.x + c;
        // wall or floor
        if (px < 0 || px >= COLS || py >= ROWS) return true;
        // only check board when inside visible rows
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

  function softDrop() {
    // soft drop: move down one and reward small score
    current.y++;
    if (collide(current)) {
      current.y--;
      // hitting floor - do not fix here; normal gravity handles lock / fix on next tick
    } else {
      score += 1;
      updateStats();
    }
  }

  function hardDrop() {
    // drop until would collide
    while (!collide(current)) {
      current.y++;
      score += 2;
    }
    current.y--;
    fix();
    clearLines();
    canHold = true;
    current = spawn();
  }

  function fix() {
    for (let y = 0; y < current.matrix.length; y++) {
      for (let x = 0; x < current.matrix[y].length; x++) {
        if (current.matrix[y][x] && current.y + y >= 0) {
          board[current.y + y][current.x + x] = current.type;
        }
      }
    }
  }

  function clearLines() {
    let linesCleared = 0;
    for (let y = ROWS - 1; y >= 0; y--) {
      if (board[y].every(cell => cell !== null)) {
        board.splice(y, 1);
        board.unshift(Array(COLS).fill(null));
        linesCleared++;
        y++; // recheck same index after splice
      }
    }
    if (linesCleared > 0) {
      score += linesCleared * 100;
      lines += linesCleared;
      updateStats();
    }
  }

  // === 回転系（簡易SRS風ウォールキック含む） ===
  function rotate(dir) {
    const old = current.matrix.map(r => [...r]);
    current.matrix = rotateMatrix(current.matrix, dir);
    // try kick offsets (including vertical shifts)
    const offsets = [
      [0,0], [1,0], [-1,0], [0,1], [0,-1],
      [2,0], [-2,0], [1,1], [-1,1], [1,-1], [-1,-1]
    ];
    let ok = false;
    for (const [dx, dy] of offsets) {
      current.x += dx;
      current.y += dy;
      if (!collide(current)) { ok = true; break; }
      current.x -= dx;
      current.y -= dy;
    }
    if (!ok) {
      current.matrix = old; // revert
      current.lastWasRotate = false;
    } else {
      current.lastWasRotate = true;
      // If T piece, check T-spin immediately (will show message on fix if lines cleared)
    }
  }

  function rotate180() {
    // rotate twice with kick attempts
    rotate(1);
    rotate(1);
  }

  function rotateMatrix(m, dir) {
    const N = m.length;
    const res = Array.from({ length: N }, () => Array(N).fill(0));
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (dir > 0) res[x][N - 1 - y] = m[y][x];
      else res[N - 1 - x][y] = m[y][x];
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
      const heldType = holdPiece;
      holdPiece = current.type;
      current = spawnPiece(heldType);
    }
    canHold = false;
    draw();
  }

  function spawnPiece(type) {
    return { type, matrix: PIECES[type].map(r => [...r]), x: Math.floor((COLS - PIECES[type][0].length) / 2), y: -2 };
  }

  // === T-spin検出・表示 ===
  function detectTSpinOnFix(piece, linesCleared) {
    if (piece.type !== 'T' || !piece.lastWasRotate) return null;
    // check corners around center of 3x3
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
    // 2秒で消す
    setTimeout(() => {
      tspinMsg.style.display = "none";
      tspinMsg.textContent = "";
    }, 2000);
  }

  // we need a version of fix/clear that returns lines cleared to detect T-spin type
  // revised drop flow: when collision occurs and we fix, check lines cleared and detect T-spin
  // So adjust drop() path to use this helper: fixAndCheck()
  function fixAndCheck() {
    // fix current into board
    for (let y = 0; y < current.matrix.length; y++) {
      for (let x = 0; x < current.matrix[y].length; x++) {
        if (current.matrix[y][x] && current.y + y >= 0) {
          board[current.y + y][current.x + x] = current.type;
        }
      }
    }
    // clear lines and count
    let linesCleared = 0;
    for (let y = ROWS - 1; y >= 0; y--) {
      if (board[y].every(cell => cell !== null)) {
        board.splice(y, 1);
        board.unshift(Array(COLS).fill(null));
        linesCleared++;
        y++;
      }
    }
    // detect T-spin
    const tspinResult = detectTSpinOnFix(current, linesCleared);
    if (tspinResult) showTSpinMessage(tspinResult);
    // scoring simplified
    if (linesCleared > 0) {
      score += linesCleared * 100;
      lines += linesCleared;
      updateStats();
    }
  }

  // replace previous drop flow to use fixAndCheck
  // redefine drop and hardDrop to use fixAndCheck
  function drop() {
    current.y++;
    if (collide(current)) {
      current.y--;
      fixAndCheck();
      canHold = true;
      current = spawn();
      return false;
    }
    return true;
  }

  function hardDrop() {
    while (!collide(current)) {
      current.y++;
      score += 2;
    }
    current.y--;
    fixAndCheck();
    canHold = true;
    current = spawn();
  }

  // === ステータス更新 ===
  function updateStats() {
    scoreEl.textContent = score;
    linesEl.textContent = lines;
    b2bEl.textContent = b2b;
    tspinEl.textContent = tspinCount;
  }

  // start with drawing next canvases sized appropriately (canvas elements in HTML maybe small)
  nextCanvases.forEach(ctx2d => {
    const el = ctx2d.canvas;
    // set internal pixel size for next previews
    el.width = 80; el.height = 80;
  });
  drawNext();

  // kick off initial draw
  draw();

  // expose for debug if needed
  window._tetr = { board, current, nextQueue, holdPiece };
});
