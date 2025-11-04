/* =========================
   TETR.IO-LIKE — Single Player
   Features:
   - 7-bag RNG
   - SRS rotation + wall kicks
   - 180-degree rotation
   - Ghost piece
   - Hold, Next (5)
   - DAS / ARR (customizable)
   - Soft drop / Hard drop
   - Lock delay (SD, lock-in handling)
   - T-spin detection, Back-to-back, combo, scoring
   - Simple UI: hold canvas, next canvases, score display
   Controls (per request):
   ← → : move (DAS/ARR)
   ↓ : soft drop
   Space : hard drop
   Z : rotate left
   X : rotate right
   A : 180°
   Shift/C : hold
   ========================= */

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d', { alpha: false });

// board dimensions
const COLS = 10;
const ROWS = 20;
const VISIBLE_ROWS = 20;
const BLOCK = Math.floor(canvas.width / 10); // 300px -> 30px blocks
canvas.width = BLOCK * COLS;
canvas.height = BLOCK * VISIBLE_ROWS;

// small canvases
const holdCanvas = document.getElementById('hold');
const holdCtx = holdCanvas.getContext('2d');
holdCanvas.width = 120;
holdCanvas.height = 120;

// UI nodes
const scoreNode = document.getElementById('score');
const linesNode = document.getElementById('lines');
const levelNode = document.getElementById('level');
const b2bNode = document.getElementById('b2b');
const comboNode = document.getElementById('combo');
const nextList = document.getElementById('next-list');
const restartBtn = document.getElementById('restart');

restartBtn.addEventListener('click', () => init(true));

// COLOR & SHAPES (SRS-friendly)
const TETROMINO = {
  I: { shape: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], color: '#00f0f0' },
  O: { shape: [[1,1],[1,1]], color: '#ffff00' },
  T: { shape: [[0,1,0],[1,1,1],[0,0,0]], color: '#aa00ff' },
  S: { shape: [[0,1,1],[1,1,0],[0,0,0]], color: '#00ff00' },
  Z: { shape: [[1,1,0],[0,1,1],[0,0,0]], color: '#ff0000' },
  J: { shape: [[1,0,0],[1,1,1],[0,0,0]], color: '#0000ff' },
  L: { shape: [[0,0,1],[1,1,1],[0,0,0]], color: '#ff7f00' }
};

// SRS Wall Kick data (for standard SRS)
// For I piece, separate kicks
const KICK_TABLE = {
  'normal': {
    '0->R': [[0,0],[0,-1],[0,1],[-1,-1],[2,0]],
    'R->0': [[0,0],[0,1],[0,-1],[1,1],[-2,0]],
    'R->2': [[0,0],[0,1],[0,-1],[1,1],[-2,0]],
    '2->R': [[0,0],[0,-1],[0,1],[-1,-1],[2,0]],
    '2->L': [[0,0],[0,1],[0,-1],[1,1],[-2,0]],
    'L->2': [[0,0],[0,-1],[0,1],[-1,-1],[2,0]],
    'L->0': [[0,0],[0,-1],[0,1],[-1,-1],[2,0]],
    '0->L': [[0,0],[0,1],[0,-1],[1,1],[-2,0]]
  },
  'I': {
    '0->R': [[0,0],[0,-2],[0,1],[-2,-1],[1,2]],
    'R->0': [[0,0],[0,2],[0,-1],[2,1],[-1,-2]],
    'R->2': [[0,0],[0,-1],[0,2],[-1,2],[2,-1]],
    '2->R': [[0,0],[0,1],[0,-2],[1,-2],[-2,1]],
    '2->L': [[0,0],[0,2],[0,-1],[2,1],[-1,-2]],
    'L->2': [[0,0],[0,-2],[0,1],[-2,-1],[1,2]],
    'L->0': [[0,0],[0,1],[0,-2],[1,-2],[-2,1]],
    '0->L': [[0,0],[0,-1],[0,2],[-1,2],[2,-1]]
  }
};

// handy helpers
function cloneMatrix(m){ return m.map(r=>r.slice()); }
function rotateMatrixCW(m){
  const n = m.length;
  const out = Array.from({length:n},()=>Array(n).fill(0));
  for(let y=0;y<n;y++) for(let x=0;x<n;x++) out[x][n-1-y] = m[y][x];
  return out;
}
function rotateMatrixCCW(m){
  const n = m.length;
  const out = Array.from({length:n},()=>Array(n).fill(0));
  for(let y=0;y<n;y++) for(let x=0;x<n;x++) out[n-1-x][y] = m[y][x];
  return out;
}
function rotateMatrix180(m){
  return m.map(r=>r.slice().reverse()).reverse();
}
function shapeSize(shape){ return shape.length; }

// 7-bag RNG
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
let score=0, lines=0, level=1, combo=0, back2back=false;
let gravityMS = 1000; // base gravity (we'll speed by level)
let dropTimer=0, lastTime=0;
let lockDelay = 500; // ms
let lockTimer = 0;
let isLocked = false;

// DAS / ARR settings
const DAS = 170; // ms before auto-repeat starts
const ARR = 30;  // ms between auto moves when holding
let dasTimer = null;
let arrTimer = null;
let keyHeld = {left:false,right:false};

// UI helpers
function uiUpdate(){
  scoreNode.textContent = score;
  linesNode.textContent = lines;
  levelNode.textContent = level;
  b2bNode.textContent = back2back? 'YES' : 'NO';
  comboNode.textContent = combo;
}

// INIT
function init(restart=false){
  playfield = Array.from({length: ROWS + 4}, ()=>Array(COLS).fill(null)); // extra hidden rows for spawn
  bag = [];
  nextQueue = [];
  refillQueue();
  current = spawnPiece();
  holdPieceObj = null;
  canHoldFlag = true;
  score = 0; lines = 0; level = 1; combo = 0; back2back = false;
  lockTimer = 0; isLocked = false;
  lastTime = performance.now();
  updateNextUI();
  uiUpdate();
}

// refill next queue to at least 6 pieces (so next display shows 5)
function refillQueue(){
  while(bag.length < 7) bag = bag.concat(makeBag());
  while(nextQueue.length < 6) nextQueue.push(bag.shift());
}

// spawn
function spawnPiece(){
  refillQueue();
  const type = nextQueue.shift();
  refillQueue();
  const template = TETROMINO[type];
  // centralize into 3x or 4x matrix
  let shape;
  if (type === 'I') {
    shape = cloneMatrix(template.shape); // 4x4
  } else if (type === 'O') {
    // convert to 3x3 to keep rotations trivial (but O doesn't rotate effectively)
    shape = [[0,0,0],[0,1,1],[0,1,1]];
  } else {
    // ensure 3x3
    shape = cloneMatrix(template.shape);
    // pad to 3x3 if needed
    if (shape.length < 3) {
      const padded = Array.from({length:3},()=>Array(3).fill(0));
      for(let y=0;y<shape.length;y++) for(let x=0;x<shape[y].length;x++) padded[y][x]=shape[y][x];
      shape = padded;
    }
  }
  const spawnX = Math.floor((COLS - shape[0].length)/2);
  const spawnY = - (shape.length - 2); // spawn slightly above
  const obj = { type, shape, x: spawnX, y: spawnY, rotation: 0, color: template.color };
  updateNextUI();
  return obj;
}

// collision check
function collides(shape, x, y){
  for(let r=0;r<shape.length;r++){
    for(let c=0;c<shape[r].length;c++){
      if(shape[r][c]){
        const py = y + r;
        const px = x + c;
        if(px < 0 || px >= COLS || py >= ROWS + 4) return true;
        if(py >= 0 && playfield[py][px] !== null) return true;
      }
    }
  }
  return false;
}

// place piece into playfield
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

  // line clears and scoring (detect T-spin, B2B, combos)
  const cleared = clearLines();
  let scored = 0;
  let isTSpin = detectTSpin(p);
  let b2bEvent = false;

  if(cleared > 0){
    // scoring table roughly like modern guideline (simplified)
    const lineScores = {1:100,2:300,3:500,4:800};
    if(isTSpin){
      // T-spin singles/doubles/triples scoring (simplified)
      const tspinScores = {1:800,2:1200,3:1600};
      scored += tspinScores[cleared] || (150*cleared);
      b2bEvent = true;
    } else {
      scored += (lineScores[cleared] || (100*cleared));
      if(cleared === 4) b2bEvent = true; // tetris -> B2B
    }

    // back-to-back bonus
    if(b2bEvent && back2back){
      scored = Math.floor(scored * 1.5);
    }
    back2back = b2bEvent;

    // combo
    if(combo > 0) {
      scored += combo * 50;
    }
    combo++;
  } else {
    // no line clear
    if(isTSpin) {
      // T-spin no-line (zero) is not common but could be; treat as no clear -> reset combo
      combo = 0;
      back2back = false;
    } else {
      combo = 0;
    }
  }

  score += scored;
  lines += cleared;
  // level progression: simple: every 10 lines increases level
  level = Math.floor(lines / 10) + 1;
  // adjust gravity by level (faster)
  gravityMS = Math.max(100, 1000 - (level - 1) * 60);

  uiUpdate();

  // spawn next piece
  current = spawnPiece();
  canHoldFlag = true;

  // check spawn collision -> game over (reset field)
  if(collides(current.shape, current.x, current.y)){
    // game over: clear board and reset
    playfield = Array.from({length: ROWS + 4}, ()=>Array(COLS).fill(null));
    score = Math.max(0, score - 1000);
    uiUpdate();
  }
  lockTimer = 0;
}

// clear lines, returns number cleared
function clearLines(){
  let cleared = 0;
  for(let y = 0; y < playfield.length; y++){
    if(playfield[y].every(cell => cell !== null)){
      playfield.splice(y, 1);
      playfield.unshift(Array(COLS).fill(null));
      cleared++;
      y--; // recheck this index
    }
  }
  return cleared;
}

// detect T-spin (simple: last move was rotate and T piece and 3 of 4 corners occupied)
// We track last action via a flag; here we approximate: if piece type T and rotation caused lock, check corners
function detectTSpin(piece){
  if(piece.type !== 'T') return false;
  // check 4 corners around center of piece
  // center of T in 3x3 at (1,1) relative to piece origin
  const cx = piece.x + 1;
  const cy = piece.y + 1;
  let corners = 0;
  const checks = [[0,0],[0,2],[2,0],[2,2]];
  for(let ch of checks){
    const py = cy + (ch[0]-1);
    const px = cx + (ch[1]-1);
    if(py < 0 || px < 0 || px >= COLS || py >= playfield.length || playfield[py][px] !== null) corners++;
  }
  return corners >= 3;
}

// hold
function hold(){
  if(!canHoldFlag) return;
  if(!holdPieceObj){
    holdPieceObj = {...current};
    current = spawnPiece();
  } else {
    const tmp = {...holdPieceObj};
    holdPieceObj = {...current};
    tmp.x = Math.floor((COLS - tmp.shape[0].length)/2);
    tmp.y = - (tmp.shape.length - 2);
    current = tmp;
  }
  canHoldFlag = false;
  drawHold();
  updateNextUI();
}

// rotation with SRS kicks
function rotate(dir){ // dir = 1 (CW) or -1 (CCW) or 2 (180)
  const p = current;
  let newShape, id;
  if(dir === 1){
    newShape = rotateMatrixCW(p.shape);
    id = 'R';
  } else if (dir === -1){
    newShape = rotateMatrixCCW(p.shape);
    id = 'L';
  } else {
    newShape = rotateMatrix180(p.shape);
    id = '2';
  }

  const from = rotationName(p.rotation);
  const to = rotationName((p.rotation + (dir===2?2: (dir===1?1:3))) % 4);

  const tableKey = (p.type === 'I' ? 'I' : 'normal');
  const kickKey = `${from}->${to}`;

  const kicks = KICK_TABLE[tableKey][kickKey] || [[0,0]];

  for(let k of kicks){
    const nx = p.x + k[1];
    const ny = p.y + k[0];
    if(!collides(newShape, nx, ny)){
      p.shape = newShape;
      p.x = nx; p.y = ny;
      p.rotation = (p.rotation + (dir===2?2:(dir===1?1:3))) % 4;
      // resetting lock timer on successful rotation
      lockTimer = 0;
      return true;
    }
  }
  return false;
}

function rotationName(rot){
  // 0 = 0, 1 = R, 2 = 2, 3 = L
  if(rot === 0) return '0';
  if(rot === 1) return 'R';
  if(rot === 2) return '2';
  return 'L';
}

// ghost piece
function computeGhost(){
  const ghost = {...current, x: current.x, y: current.y, shape: current.shape};
  while(!collides(ghost.shape, ghost.x, ghost.y + 1)) ghost.y++;
  return ghost;
}

// rendering
function draw(){
  // background
  ctx.fillStyle = '#0b1218';
  ctx.fillRect(0,0,canvas.width,canvas.height);

  // draw settled blocks
  for(let y=0;y<ROWS;y++){
    for(let x=0;x<COLS;x++){
      const color = playfield[y][x];
      if(color){
        drawBlock(x,y,color);
      } else {
        // grid faint lines
        ctx.fillStyle = 'rgba(255,255,255,0.02)';
        ctx.fillRect(x*BLOCK, y*BLOCK, BLOCK-1, BLOCK-1);
      }
    }
  }

  // draw ghost
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

  // draw current
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

// draw a single block with a slight 3D-ish look
function drawBlock(x,y,color){
  const px = x * BLOCK;
  const py = y * BLOCK;
  ctx.fillStyle = color;
  ctx.fillRect(px, py, BLOCK-1, BLOCK-1);
  // simple highlight
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(px+2, py+2, BLOCK-5, 6);
}

// draw hold canvas
function drawHold(){
  holdCtx.clearRect(0,0,holdCanvas.width,holdCanvas.height);
  holdCtx.fillStyle = '#081518';
  holdCtx.fillRect(0,0,holdCanvas.width,holdCanvas.height);
  if(!holdPieceObj) return;
  const s = holdPieceObj.shape;
  const color = holdPieceObj.color;
  const size = Math.min(holdCanvas.width / s[0].length, holdCanvas.height / s.length) * 0.8;
  const ox = (holdCanvas.width - size * s[0].length) / 2;
  const oy = (holdCanvas.height - size * s.length) / 2;
  for(let r=0;r<s.length;r++){
    for(let c=0;c<s[r].length;c++){
      if(s[r][c]){
        holdCtx.fillStyle = color;
        holdCtx.fillRect(ox + c*size, oy + r*size, size - 4, size - 4);
      }
    }
  }
}

// next UI
function updateNextUI(){
  // clear
  nextList.innerHTML = '';
  for(let i=0;i<5;i++){
    const type = nextQueue[i] || null;
    const canvasEl = document.createElement('canvas');
    canvasEl.width = 120; canvasEl.height = 60;
    canvasEl.className = 'next-canvas';
    const cctx = canvasEl.getContext('2d');
    cctx.fillStyle = '#071018';
    cctx.fillRect(0,0,canvasEl.width,canvasEl.height);
    if(type){
      const template = TETROMINO[type];
      const shape = cloneMatrix(template.shape);
      const rows = shape.length;
      const cols = shape[0].length;
      const size = Math.min(canvasEl.width / cols, canvasEl.height / rows) * 0.8;
      const ox = (canvasEl.width - size*cols)/2;
      const oy = (canvasEl.height - size*rows)/2;
      for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){
        if(shape[r][c]){
          cctx.fillStyle = template.color;
          cctx.fillRect(ox + c*size, oy + r*size, size - 3, size - 3);
        }
      }
    }
    nextList.appendChild(canvasEl);
  }
  drawHold();
}

// input handling with DAS/ARR
function startDAS(dir){
  stopDAS();
  keyHeld.left = (dir === -1);
  keyHeld.right = (dir === 1);
  // immediate move
  tryMove(dir);
  dasTimer = setTimeout(() => {
    arrTimer = setInterval(() => tryMove(dir), ARR);
  }, DAS);
}
function stopDAS(dir){
  if(dasTimer){ clearTimeout(dasTimer); dasTimer = null; }
  if(arrTimer){ clearInterval(arrTimer); arrTimer = null; }
  if(dir === -1) keyHeld.left = false;
  if(dir === 1) keyHeld.right = false;
}
function tryMove(dir){
  const p = current;
  p.x += dir;
  if(collides(p.shape, p.x, p.y)) p.x -= dir;
  else lockTimer = 0; // reset lock timer on successful move
}

// soft drop
function softDrop(){
  current.y += 1;
  if(collides(current.shape, current.x, current.y)){
    current.y -= 1;
  } else {
    // scoring: soft drop small points
    score += 1;
    uiUpdate();
  }
}

// hard drop
function hardDrop(){
  while(!collides(current.shape, current.x, current.y + 1)){
    current.y++;
    score += 2; // hard drop score per cell
  }
  lockPiece();
  lockTimer = 0;
}

// key handlers
document.addEventListener('keydown', (e)=>{
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
  if(k === 'arrowleft') stopDAS(-1);
  else if(k === 'arrowright') stopDAS(1);
});

// main loop
function update(time){
  const dt = time - lastTime;
  lastTime = time;
  dropTimer += dt;
  lockTimer += dt;

  // gravity tick
  if (dropTimer >= gravityMS){
    dropTimer = 0;
    current.y += 1;
    if(collides(current.shape, current.x, current.y)){
      current.y -= 1;
      // start lock delay
      if(lockTimer >= lockDelay){
        lockPiece();
        lockTimer = 0;
      }
    } else {
      lockTimer = 0;
    }
  }

  // if piece touches floor or block, start lock timer if not already
  if(collides(current.shape, current.x, current.y + 1)){
    // increment lockTimer externally by dt (already happens)
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

// start
init();
requestAnimationFrame(update);

// expose some for debugging
window._tetr = { playfield, current, holdPieceObj, nextQueue };

