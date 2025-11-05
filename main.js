/* =========================
  修正版 main.js
  - 可視20行 x 10列を厳守（playfield=ROWS）
  - Next プレビューは CSS で 1cm x 1cm（キャンバス内部はスケールして描画）
  - Hold を左に表示、Hold 下に B2B / T-spin 表示
  - ゲーム中ページスクロール抑止（矢印・Space等の preventDefault）
  - 回転/移動は既存仕様（Z/X/A/Shift/C、DAS/ARR）
========================= */

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d', { alpha: false });

// 固定の可視サイズ
const COLS = 10;
const ROWS = 20;

// ブロックサイズ：canvas の高さ / ROWS で算出（レスポンシブ）
function computeBlockSize() {
  const h = canvas.height;
  return Math.floor(h / ROWS);
}
let BLOCK = computeBlockSize();
// 保証：キャンバス幅も BLOCK に合わせて調整
canvas.width = BLOCK * COLS;
canvas.height = BLOCK * ROWS;

// Hold canvas
const holdCanvas = document.getElementById('hold');
const holdCtx = holdCanvas.getContext('2d');
holdCanvas.width = 120;
holdCanvas.height = 120;

// UI nodes
const scoreNode = document.getElementById('score');
const linesNode = document.getElementById('lines');
const levelNode = document.getElementById('level');
const b2bNode = document.getElementById('b2b');
const tspinNode = document.getElementById('tspin');
const nextList = document.getElementById('next-list');
const restartBtn = document.getElementById('restart');

restartBtn.addEventListener('click', () => init(true));

// tetromino templates
const TETROMINO = {
  I: { shape: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], color: '#00f0f0' },
  O: { shape: [[1,1],[1,1]], color: '#ffff00' },
  T: { shape: [[0,1,0],[1,1,1],[0,0,0]], color: '#aa00ff' },
  S: { shape: [[0,1,1],[1,1,0],[0,0,0]], color: '#00ff00' },
  Z: { shape: [[1,1,0],[0,1,1],[0,0,0]], color: '#ff0000' },
  J: { shape: [[1,0,0],[1,1,1],[0,0,0]], color: '#0000ff' },
  L: { shape: [[0,0,1],[1,1,1],[0,0,0]], color: '#ff7f00' }
};

// SRS-ish kick tables (same as以前)
const KICK_TABLE = { /* same table as previous (omitted here for brevity) */ };

// helpers (clone/rotate) - 同じ実装
function cloneMatrix(m){ return m.map(r=>r.slice()); }
function rotateMatrixCW(m){ const n=m.length; const out=Array.from({length:n},()=>Array(n).fill(0)); for(let y=0;y<n;y++) for(let x=0;x<n;x++) out[x][n-1-y]=m[y][x]; return out; }
function rotateMatrixCCW(m){ const n=m.length; const out=Array.from({length:n},()=>Array(n).fill(0)); for(let y=0;y<n;y++) for(let x=0;x<n;x++) out[n-1-x][y]=m[y][x]; return out; }
function rotateMatrix180(m){ return m.map(r=>r.slice().reverse()).reverse(); }

function makeBag(){
  const keys = Object.keys(TETROMINO);
  const bag = keys.slice();
  for (let i = bag.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

// GAME STATE
let playfield, current, holdPieceObj, canHoldFlag, bag, nextQueue;
let score=0, lines=0, level=1, combo=0, back2back=false, tspinCount=0;
let gravityMS = 1000, dropTimer=0, lastTime=0, lockDelay=500, lockTimer=0;

// DAS/ARR
const DAS = 170, ARR = 30;
let dasTimer = null, arrTimer = null;
let keyHeld = {left:false,right:false};

// UI update
function uiUpdate(){
  scoreNode.textContent = score;
  linesNode.textContent = lines;
  levelNode.textContent = level;
  b2bNode.textContent = back2back ? 'YES' : 'NO';
  tspinNode.textContent = tspinCount;
}

// init
function init(restart=false){
  // playfield は可視 20 行のみ
  playfield = Array.from({length: ROWS}, ()=>Array(COLS).fill(null));
  bag = [];
  nextQueue = [];
  refillQueue();
  current = spawnPiece();
  holdPieceObj = null;
  canHoldFlag = true;
  score = 0; lines = 0; level = 1; combo = 0; back2back = false; tspinCount = 0;
  lockTimer = 0;
  lastTime = performance.now();
  updateNextUI();
  uiUpdate();
  enableScrollLock(); // ゲーム開始でスクロールロックON
  // focus the board to capture keys
  canvas.focus();
}

// refill queue
function refillQueue(){
  while(bag.length < 7) bag = bag.concat(makeBag());
  while(nextQueue.length < 6) nextQueue.push(bag.shift());
}

// spawn piece: y を負にしても衝突チェックは py >=0 のときだけ参照する
function spawnPiece(){
  refillQueue();
  const type = nextQueue.shift();
  refillQueue();
  const template = TETROMINO[type];
  let shape;
  if (type === 'I') shape = cloneMatrix(template.shape);
  else if (type === 'O') shape = [[0,0,0],[0,1,1],[0,1,1]];
  else {
    shape = cloneMatrix(template.shape);
    if (shape.length < 3){
      const padded = Array.from({length:3},()=>Array(3).fill(0));
      for(let y=0;y<shape.length;y++) for(let x=0;x<shape[y].length;x++) padded[y][x] = shape[y][x];
      shape = padded;
    }
  }
  const spawnX = Math.floor((COLS - shape[0].length)/2);
  const spawnY = -2; // 可視20行仕様でも負の座標で出現させる（下の衝突判定はpy>=0でチェック）
  const obj = { type, shape, x: spawnX, y: spawnY, rotation: 0, color: template.color };
  updateNextUI();
  return obj;
}

// collision: playfield範囲外は py<0 のとき無視
function collides(shape, x, y){
  for(let r=0;r<shape.length;r++){
    for(let c=0;c<shape[r].length;c++){
      if(shape[r][c]){
        const py = y + r;
        const px = x + c;
        if(px < 0 || px >= COLS || py >= ROWS) return true;
        if(py >= 0 && playfield[py][px] !== null) return true;
      }
    }
  }
  return false;
}

// lock, clear lines, scoring (簡易)
function lockPiece(){
  const p = current;
  for(let r=0;r<p.shape.length;r++){
    for(let c=0;c<p.shape[r].length;c++){
      if(p.shape[r][c]){
        const py = p.y + r;
        const px = p.x + c;
        if(py >= 0) playfield[py][px] = p.color;
      }
    }
  }

  const cleared = clearLines();
  let scored = 0;
  let isTSpin = detectTSpin(p);
  let b2bEvent = false;

  if(cleared > 0){
    const lineScores = {1:100,2:300,3:500,4:800};
    if(isTSpin){
      const tspinScores = {1:800,2:1200,3:1600};
      scored += tspinScores[cleared] || (150 * cleared);
      b2bEvent = true;
      tspinCount++;
    } else {
      scored += (lineScores[cleared] || (100 * cleared));
      if(cleared === 4) b2bEvent = true;
    }

    if(b2bEvent && back2back) scored = Math.floor(scored * 1.5);
    back2back = b2bEvent;

    if(combo > 0) scored += combo * 50;
    combo++;
  } else {
    if(isTSpin){
      combo = 0;
      back2back = false;
    } else {
      combo = 0;
    }
  }

  score += scored;
  lines += cleared;
  level = Math.floor(lines / 10) + 1;
  gravityMS = Math.max(100, 1000 - (level - 1) * 60);

  uiUpdate();

  current = spawnPiece();
  canHoldFlag = true;

  // spawn collision => game over
  if(collides(current.shape, current.x, current.y)){
    // ゲームオーバー簡易処理：盤面クリアしてスコアペナルティ
    playfield = Array.from({length: ROWS}, ()=>Array(COLS).fill(null));
    score = Math.max(0, score - 1000);
    uiUpdate();
    disableScrollLock(); // ゲーム終了でスクロール戻す
  }
  lockTimer = 0;
}

function clearLines(){
  let cleared = 0;
  for(let y = 0; y < playfield.length; y++){
    if(playfield[y].every(cell => cell !== null)){
      playfield.splice(y, 1);
      playfield.unshift(Array(COLS).fill(null));
      cleared++;
      y--;
    }
  }
  return cleared;
}

function detectTSpin(piece){
  if(piece.type !== 'T') return false;
  const cx = piece.x + 1;
  const cy = piece.y + 1;
  let corners = 0;
  const checks = [[0,0],[0,2],[2,0],[2,2]];
  for(let ch of checks){
    const py = cy + (ch[0]-1);
    const px = cx + (ch[1]-1);
    if(py < 0 || px < 0 || px >= COLS || py >= ROWS || playfield[py][px] !== null) corners++;
  }
  return corners >= 3;
}

function hold(){
  if(!canHoldFlag) return;
  if(!holdPieceObj){
    holdPieceObj = {...current};
    current = spawnPiece();
  } else {
    const tmp = {...holdPieceObj};
    holdPieceObj = {...current};
    tmp.x = Math.floor((COLS - tmp.shape[0].length)/2);
    tmp.y = -2;
    current = tmp;
  }
  canHoldFlag = false;
  drawHold();
  updateNextUI();
}

// rotation with SRS kicks (簡易的にキック使用)
function rotate(dir){
  const p = current;
  let newShape;
  if(dir === 1) newShape = rotateMatrixCW(p.shape);
  else if(dir === -1) newShape = rotateMatrixCCW(p.shape);
  else newShape = rotateMatrix180(p.shape);

  // simple wall kick: try small offsets (more complete table can be plugged)
  const kicks = [[0,0],[0,-1],[0,1],[-1,0],[1,0],[0,-2],[0,2]];
  for(let k of kicks){
    const nx = p.x + k[1];
    const ny = p.y + k[0];
    if(!collides(newShape, nx, ny)){
      p.shape = newShape;
      p.x = nx; p.y = ny;
      lockTimer = 0;
      return true;
    }
  }
  return false;
}

// ghost piece
function computeGhost(){
  const ghost = { shape: current.shape, x: current.x, y: current.y, color: current.color };
  while(!collides(ghost.shape, ghost.x, ghost.y + 1)) ghost.y++;
  return ghost;
}

// rendering
function draw(){
  // block size recalc (in case canvas resized)
  BLOCK = computeBlockSize();
  canvas.width = BLOCK * COLS;
  canvas.height = BLOCK * ROWS;

  ctx.fillStyle = '#0b1218';
  ctx.fillRect(0,0,canvas.width,canvas.height);

  // draw grid / placed blocks
  for(let y=0;y<ROWS;y++){
    for(let x=0;x<COLS;x++){
      const color = playfield[y][x];
      if(color) drawBlock(x,y,color);
      else {
        ctx.fillStyle = 'rgba(255,255,255,0.02)';
        ctx.fillRect(x*BLOCK, y*BLOCK, BLOCK-1, BLOCK-1);
      }
    }
  }

  // ghost
  const ghost = computeGhost();
  ctx.globalAlpha = 0.25;
  for(let r=0;r<ghost.shape.length;r++){
    for(let c=0;c<ghost.shape[r].length;c++){
      if(ghost.shape[r][c]){
        const gx = ghost.x + c;
        const gy = ghost.y + r;
        if(gy >= 0) drawBlock(gx, gy, '#ffffff');
      }
    }
  }
  ctx.globalAlpha = 1.0;

  // current
  const p = current;
  for(let r=0;r<p.shape.length;r++){
    for(let c=0;c<p.shape[r].length;c++){
      if(p.shape[r][c]){
        const x = p.x + c;
        const y = p.y + r;
        if(y >= 0) drawBlock(x,y, p.color);
      }
    }
  }
}

function drawBlock(x,y,color){
  const px = x * BLOCK;
  const py = y * BLOCK;
  ctx.fillStyle = color;
  ctx.fillRect(px, py, BLOCK-1, BLOCK-1);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(px+2, py+2, Math.max(0, BLOCK-5), Math.min(6, BLOCK-2));
}

// draw hold preview
function drawHold(){
  holdCtx.clearRect(0,0,holdCanvas.width,holdCanvas.height);
  holdCtx.fillStyle = '#081518';
  holdCtx.fillRect(0,0,holdCanvas.width,holdCanvas.height);
  if(!holdPieceObj) return;
  const s = holdPieceObj.shape;
  const color = holdPieceObj.color;
  const rows = s.length, cols = s[0].length;
  const size = Math.min(holdCanvas.width / cols, holdCanvas.height / rows) * 0.8;
  const ox = (holdCanvas.width - size * cols) / 2;
  const oy = (holdCanvas.height - size * rows) / 2;
  for(let r=0;r<rows;r++){
    for(let c=0;c<cols;c++){
      if(s[r][c]){
        holdCtx.fillStyle = color;
        holdCtx.fillRect(ox + c*size, oy + r*size, size - 4, size - 4);
      }
    }
  }
}

// next UI: create small canvases, CSS forces 1cm x 1cm
function updateNextUI(){
  nextList.innerHTML = '';
  for(let i=0;i<5;i++){
    const type = nextQueue[i] || null;
    const canvasEl = document.createElement('canvas');
    // internal pixel size; CSS will scale it to 1cm x 1cm
    canvasEl.width = 80; canvasEl.height = 80;
    canvasEl.className = 'next-canvas';
    canvasEl.style.width = '1cm';
    canvasEl.style.height = '1cm';
    const cctx = canvasEl.getContext('2d');
    cctx.fillStyle = '#071018';
    cctx.fillRect(0,0,canvasEl.width,canvasEl.height);
    if(type){
      const template = TETROMINO[type];
      const shape = cloneMatrix(template.shape);
      const rows = shape.length, cols = shape[0].length;
      const size = Math.min(canvasEl.width / cols, canvasEl.height / rows) * 0.8;
      const ox = (canvasEl.width - size*cols)/2;
      const oy = (canvasEl.height - size*rows)/2;
      for(let r=0;r<rows;r++){
        for(let c=0;c<cols;c++){
          if(shape[r][c]){
            cctx.fillStyle = template.color;
            cctx.fillRect(ox + c*size, oy + r*size, size - 3, size - 3);
          }
        }
      }
    }
    nextList.appendChild(canvasEl);
  }
  drawHold();
}

// DAS/ARR input
function startDAS(dir){
  stopDAS();
  if(dir === -1) keyHeld.left = true;
  if(dir === 1) keyHeld.right = true;
  tryMove(dir);
  dasTimer = setTimeout(()=>{ arrTimer = setInterval(()=>tryMove(dir), ARR); }, DAS);
}
function stopDAS(){
  if(dasTimer){ clearTimeout(dasTimer); dasTimer = null; }
  if(arrTimer){ clearInterval(arrTimer); arrTimer = null; }
  keyHeld.left = keyHeld.right = false;
}
function tryMove(dir){
  current.x += dir;
  if(collides(current.shape, current.x, current.y)) current.x -= dir;
  else lockTimer = 0;
}

// soft/hard drop
function softDrop(){
  current.y += 1;
  if(collides(current.shape, current.x, current.y)) current.y -= 1;
  else { score += 1; uiUpdate(); }
}
function hardDrop(){
  while(!collides(current.shape, current.x, current.y + 1)){ current.y++; score += 2; }
  lockPiece();
  lockTimer = 0;
}

// Key handling - prevent page scroll for relevant keys
function preventScrollKeys(e){
  const k = e.key.toLowerCase();
  if(['arrowleft','arrowright','arrowdown',' ',' '].includes(e.key.toLowerCase()) || k===' '){
    e.preventDefault();
  }
}
document.addEventListener('keydown', (e)=>{
  // always prevent scroll for arrow keys and space
  if(['ArrowLeft','ArrowRight','ArrowDown',' '].includes(e.key)) e.preventDefault();

  const k = e.key.toLowerCase();
  if(k === 'arrowleft') startDAS(-1);
  else if(k === 'arrowright') startDAS(1);
  else if(k === 'arrowdown') { softDrop(); }
  else if(k === ' ') { e.preventDefault(); hardDrop(); }
  else if(k === 'z') { rotate(-1); }
  else if(k === 'x') { rotate(1); }
  else if(k === 'a') { rotate(2); }
  else if(k === 'shift' || k === 'c') { hold(); }
});

document.addEventListener('keyup', (e)=>{
  const k = e.key.toLowerCase();
  if(k === 'arrowleft' || k === 'arrowright') stopDAS();
});

// Prevent touchpad / space scrolling when board focused
canvas.addEventListener('focus', ()=>{ disableBodyScroll(); });
canvas.addEventListener('blur', ()=>{ enableBodyScroll(); });

// body scroll control
let _savedOverflow = '';
function disableBodyScroll(){ _savedOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
function enableBodyScroll(){ document.body.style.overflow = _savedOverflow || ''; }

// Also expose functions to explicitly enable/disable when game starts/over
function enableScrollLock(){ disableBodyScroll(); }
function disableScrollLock(){ enableBodyScroll(); }

// main loop
function update(time){
  const dt = time - lastTime;
  lastTime = time;
  dropTimer += dt;
  lockTimer += dt;

  if (dropTimer >= gravityMS){
    dropTimer = 0;
    current.y += 1;
    if(collides(current.shape, current.x, current.y)){
      current.y -= 1;
      if(lockTimer >= lockDelay){
        lockPiece();
        lockTimer = 0;
      }
    } else {
      lockTimer = 0;
    }
  }

  if(collides(current.shape, current.x, current.y + 1)){
    if(lockTimer >= lockDelay){
      lockPiece();
      lockTimer = 0;
    }
  } else {
    lockTimer = 0;
  }

  draw();
  requestAnimationFrame(update);
}

// Start
init();
requestAnimationFrame(update);

// expose debug
window._tetr = { playfield, current, holdPieceObj, nextQueue };
