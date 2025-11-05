window.addEventListener("load", () => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const holdCanvas = document.getElementById("hold");
  const holdCtx = holdCanvas.getContext("2d");

  const nextCanvas = document.getElementById("next");
  const nextCtx = nextCanvas.getContext("2d");

  const tspinText = document.getElementById("tspin-text");

  // スクロール抑制
  window.addEventListener("keydown", e => {
    if (["ArrowDown", "ArrowUp", "Space"].includes(e.code)) e.preventDefault();
  });

  const COLS = 10, ROWS = 20, BLOCK = 20;
  canvas.width = COLS * BLOCK;
  canvas.height = ROWS * BLOCK;

  const board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));

  const COLORS = [
    null,
    "#00f0f0", "#0000f0", "#f0a000",
    "#f0f000", "#00f000", "#a000f0", "#f00000"
  ];

  // ピース定義（I, J, L, O, S, T, Z）
  const SHAPES = {
    I: [[1, 1, 1, 1]],
    J: [[2, 0, 0], [2, 2, 2]],
    L: [[0, 0, 3], [3, 3, 3]],
    O: [[4, 4], [4, 4]],
    S: [[0, 5, 5], [5, 5, 0]],
    T: [[0, 6, 0], [6, 6, 6]],
    Z: [[7, 7, 0], [0, 7, 7]],
  };

  const PIECES = "IJLOSTZ";
  let piece = randomPiece();

  function randomPiece() {
    const type = PIECES[Math.floor(Math.random() * PIECES.length)];
    return {
      shape: SHAPES[type],
      x: 3,
      y: 0,
      type,
    };
  }

  function drawMatrix(matrix, offset) {
    matrix.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value !== 0) {
          ctx.fillStyle = COLORS[value];
          ctx.fillRect((x + offset.x) * BLOCK, (y + offset.y) * BLOCK, BLOCK, BLOCK);
          ctx.strokeStyle = "#111";
          ctx.strokeRect((x + offset.x) * BLOCK, (y + offset.y) * BLOCK, BLOCK, BLOCK);
        }
      });
    });
  }

  function drawBoard() {
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawMatrix(board, { x: 0, y: 0 });
  }

  function collide(board, piece) {
    for (let y = 0; y < piece.shape.length; ++y) {
      for (let x = 0; x < piece.shape[y].length; ++x) {
        if (
          piece.shape[y][x] !== 0 &&
          (board[y + piece.y] && board[y + piece.y][x + piece.x]) !== 0
        ) {
          return true;
        }
      }
    }
    return false;
  }

  function merge(board, piece) {
    piece.shape.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value !== 0) {
          board[y + piece.y][x + piece.x] = value;
        }
      });
    });
  }

  function rotate(matrix, dir) {
    const N = matrix.length;
    const res = Array.from({ length: N }, () => Array(N).fill(0));
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++)
        res[x][N - 1 - y] = dir > 0 ? matrix[y][x] : matrix[N - 1 - x][y];
    return res;
  }

  function drop() {
    piece.y++;
    if (collide(board, piece)) {
      piece.y--;
      merge(board, piece);
      piece = randomPiece();
    }
    dropCounter = 0;
  }

  let dropCounter = 0;
  let dropInterval = 1000;
  let lastTime = 0;

  function update(time = 0) {
    const delta = time - lastTime;
    lastTime = time;
    dropCounter += delta;
    if (dropCounter > dropInterval) drop();
    drawBoard();
    drawMatrix(piece.shape, { x: piece.x, y: piece.y });
    requestAnimationFrame(update);
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") {
      piece.x--;
      if (collide(board, piece)) piece.x++;
    } else if (e.key === "ArrowRight") {
      piece.x++;
      if (collide(board, piece)) piece.x--;
    } else if (e.key === "ArrowDown") {
      drop();
    } else if (e.key === "z") {
      piece.shape = rotate(piece.shape, -1);
      if (collide(board, piece)) piece.shape = rotate(piece.shape, 1);
    } else if (e.key === "x") {
      piece.shape = rotate(piece.shape, 1);
      if (collide(board, piece)) piece.shape = rotate(piece.shape, -1);
    } else if (e.key === "a") {
      piece.shape = rotate(piece.shape, 1);
      piece.shape = rotate(piece.shape, 1);
      if (collide(board, piece)) piece.shape = rotate(piece.shape, -1);
    } else if (e.code === "Space") {
      while (!collide(board, piece)) {
        piece.y++;
      }
      piece.y--;
      merge(board, piece);
      piece = randomPiece();
    }
  });

  update();

  // T-Spin表示関数（仮）
  function showTSpin(type) {
    tspinText.textContent = type;
    tspinText.style.visibility = "visible";
    setTimeout(() => tspinText.style.visibility = "hidden", 2000);
  }

  // showTSpin("T-Spin Double"); ←テストで呼べる
});
