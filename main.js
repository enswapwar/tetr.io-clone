// === T-Spin精密判定・Lock Delay・先行入力対応版 ===
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

  const COLS = 10, ROWS = 20, BLOCK = 30;
  canvas.width = COLS * BLOCK; canvas.height = ROWS * BLOCK;

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
    I:"#00ffff",O:"#ffff00",T:"#a000f0",
    S:"#00ff00",Z:"#ff0000",J:"#0000ff",L:"#ff8000"
  };

  let board, current, nextQueue, holdPiece=null, canHold=true;
  let score=0, lines=0, b2b=0, tspinCount=0;
  let dropInterval=800, lastDrop=0, gameOver=false;
  let lockDelayTimer = null, lockDelayBase = 500, lockDelayExtended = 3000;
  let keyState = {}; // 先行入力保持

  restart();

  function restart(){
    board = Array.from({length:ROWS},()=>Array(COLS).fill(null));
    nextQueue = genBag();
    current = spawn();
    score=0; lines=0; b2b=0; tspinCount=0;
    gameOver=false; canHold=true;
    updateStats(); draw();
  }

  document.getElementById("restart").onclick = restart;

  // === 入力管理 ===
  document.addEventListener("keydown",e=>{
    if(["ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)) e.preventDefault();
    keyState[e.key]=true;
  });
  document.addEventListener("keyup",e=>{ keyState[e.key]=false; });

  function processInput(){
    if(gameOver) return;
    if(keyState["ArrowLeft"]) move(-1);
    if(keyState["ArrowRight"]) move(1);
    if(keyState["ArrowDown"]) softDrop();
    if(keyState[" "]) { hardDrop(); keyState[" "]=false; }
    if(keyState["z"]) { rotate(-1); keyState["z"]=false; }
    if(keyState["x"]) { rotate(1); keyState["x"]=false; }
    if(keyState["a"]) { rotate180(); keyState["a"]=false; }
    if(keyState["Shift"]||keyState["c"]) { hold(); keyState["Shift"]=keyState["c"]=false; }
  }

  function update(time=0){
    processInput();
    if(!gameOver && time-lastDrop>dropInterval){
      lastDrop=time; drop();
    }
    requestAnimationFrame(update);
  }
  requestAnimationFrame(update);

  // === 7Bag ===
  function genBag(){
    const bag = Object.keys(PIECES); const q=[];
    while(bag.length){ q.push(bag.splice(Math.floor(Math.random()*bag.length),1)[0]); }
    return q;
  }

  function ensureQueue(){ while(nextQueue.length<7) nextQueue.push(...genBag()); }

  function spawn(){
    ensureQueue();
    const type = nextQueue.shift();
    drawNext();
    const matrix = PIECES[type].map(r=>[...r]);
    const piece = {type, matrix, x:Math.floor((COLS-matrix[0].length)/2), y:-2, rotated:false, lockStart:null};
    if(collide(piece)){ gameOver=true; drawGameOver(); return null; }
    return piece;
  }

  function collide(p){
    for(let y=0;y<p.matrix.length;y++)
      for(let x=0;x<p.matrix[y].length;x++)
        if(p.matrix[y][x]){
          const nx=p.x+x, ny=p.y+y;
          if(nx<0||nx>=COLS||ny>=ROWS) return true;
          if(ny>=0 && board[ny][nx]) return true;
        }
    return false;
  }

  // === Lock Delay機構 ===
  function startLockDelay(){
    clearTimeout(lockDelayTimer);
    lockDelayTimer=setTimeout(()=>{
      fixAndCheck();
      canHold=true;
      current=spawn();
    },lockDelayBase);
  }

  function extendLockDelay(){
    clearTimeout(lockDelayTimer);
    lockDelayTimer=setTimeout(()=>{
      fixAndCheck();
      canHold=true;
      current=spawn();
    },lockDelayExtended);
  }

  // === 移動 ===
  function move(dir){
    if(!current) return;
    current.x+=dir;
    if(collide(current)) current.x-=dir;
    else if(isOnGround(current)) extendLockDelay();
  }

  function isOnGround(p){ p.y++; const hit=collide(p); p.y--; return hit; }

  // === 回転 ===
  function rotate(dir=1){
    if(!current) return;
    const old=current.matrix.map(r=>[...r]);
    const m=current.matrix;
    const rotated=m[0].map((_,i)=>m.map(r=>r[i]));
    current.matrix=dir>0?rotated.map(r=>r.reverse()):rotated.reverse();
    const kicks=[0,-1,1,-2,2];
    let valid=false;
    for(const dx of kicks){
      current.x+=dx;
      if(!collide(current)){ valid=true; break; }
      current.x-=dx;
    }
    if(valid){
      current.rotated=true;
      extendLockDelay(); // 回転で延長
    } else current.matrix=old;
  }

  function rotate180(){
    if(!current) return;
    const old=current.matrix.map(r=>[...r]);
    current.matrix=current.matrix.map(r=>[...r].reverse()).reverse();
    if(!collide(current)){ current.rotated=true; extendLockDelay(); }
    else current.matrix=old;
  }

  // === ドロップ ===
  function softDrop(){
    if(!current) return;
    current.y++;
    if(collide(current)){
      current.y--;
      if(!lockDelayTimer) startLockDelay();
    }
  }

  function hardDrop(){
    if(!current) return;
    while(!collide(current)) current.y++;
    current.y--;
    fixAndCheck(); canHold=true; current=spawn();
  }

  function drop(){
    if(!current) return;
    current.y++;
    if(collide(current)){
      current.y--;
      if(!lockDelayTimer) startLockDelay();
    }
  }

  // === 固定処理 ===
  function fixAndCheck(){
    clearTimeout(lockDelayTimer);
    for(let y=0;y<current.matrix.length;y++)
      for(let x=0;x<current.matrix[y].length;x++)
        if(current.matrix[y][x] && current.y+y>=0)
          board[current.y+y][current.x+x]=current.type;

    let linesCleared=0;
    for(let y=ROWS-1;y>=0;y--){
      if(board[y].every(v=>v)){ board.splice(y,1); board.unshift(Array(COLS).fill(null)); linesCleared++; y++; }
    }

    const tspin=detectTSpin(current,linesCleared);
    if(tspin) showTSpinMessage(tspin);
    if(linesCleared>0){ score+=linesCleared*100; lines+=linesCleared; }
    updateStats();
  }

  // === T-Spin判定 ===
  function detectTSpin(p,linesCleared){
    if(p.type!=="T"||!p.rotated) return null;
    const cx=p.x+1, cy=p.y+1;
    const corners=[[0,0],[0,2],[2,0],[2,2]];
    let occupied=0;
    for(const [dy,dx] of corners){
      const px=cx+(dx-1), py=cy+(dy-1);
      if(py<0||py>=ROWS||px<0||px>=COLS||board[py][px]) occupied++;
    }
    if(occupied>=3){
      if(linesCleared===0) return "T-SPIN";
      if(linesCleared===1) return "T-SPIN SINGLE";
      if(linesCleared===2) return "T-SPIN DOUBLE";
      if(linesCleared>=3) return "T-SPIN TRIPLE";
    }
    return null;
  }

  function showTSpinMessage(text){
    tspinCount++;
    tspinEl.textContent=tspinCount;
    tspinMsg.textContent=text;
    tspinMsg.style.display="block";
    tspinMsg.style.fontSize="0.5cm";
    setTimeout(()=>{ tspinMsg.style.display="none"; },2000);
  }

  // === HOLD ===
  function hold(){
    if(!canHold) return;
    if(!holdPiece){ holdPiece=current.type; current=spawn(); }
    else{
      const tmp=holdPiece; holdPiece=current.type;
      current={type:tmp,matrix:PIECES[tmp].map(r=>[...r]),x:Math.floor((COLS-PIECES[tmp][0].length)/2),y:-2,rotated:false};
    }
    canHold=false; drawHold();
  }

  // === 描画 ===
  function draw(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    drawBoard();
    if(current){ drawGhost(current); drawPiece(current); }
    drawHold();
  }

  function drawBoard(){
    ctx.fillStyle="#071018"; ctx.fillRect(0,0,canvas.width,canvas.height);
    for(let y=0;y<ROWS;y++)
      for(let x=0;x<COLS;x++)
        if(board[y][x]){
          ctx.fillStyle=COLORS[board[y][x]];
          ctx.fillRect(x*BLOCK,y*BLOCK,BLOCK-1,BLOCK-1);
        }
  }

  function drawPiece(p){
    ctx.fillStyle=COLORS[p.type];
    for(let y=0;y<p.matrix.length;y++)
      for(let x=0;x<p.matrix[y].length;x++)
        if(p.matrix[y][x]&&p.y+y>=0)
          ctx.fillRect((p.x+x)*BLOCK,(p.y+y)*BLOCK,BLOCK-1,BLOCK-1);
  }

  function drawGhost(p){
    const g={...p,y:p.y};
    while(!collide(g)) g.y++;
    g.y--;
    ctx.fillStyle="rgba(255,255,255,0.2)";
    for(let y=0;y<g.matrix.length;y++)
      for(let x=0;x<g.matrix[y].length;x++)
        if(g.matrix[y][x]&&g.y+y>=0)
          ctx.fillRect((g.x+x)*BLOCK,(g.y+y)*BLOCK,BLOCK-1,BLOCK-1);
  }

  function drawHold(){
    holdCtx.clearRect(0,0,holdCanvas.width,holdCanvas.height);
    if(!holdPiece) return;
    holdCtx.fillStyle=COLORS[holdPiece];
    const s=PIECES[holdPiece]; const size=holdCanvas.width/4;
    const ox=(holdCanvas.width-size*s[0].length)/2, oy=(holdCanvas.height-size*s.length)/2;
    s.forEach((r,y)=>r.forEach((v,x)=>{if(v)holdCtx.fillRect(ox+x*size,oy+y*size,size-2,size-2)}));
  }

  function drawNext(){/*略*/} // 省略：以前のままでOK
  function drawGameOver(){ctx.fillStyle="rgba(0,0,0,0.7)";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle="#fff";ctx.font="30px sans-serif";ctx.fillText("GAME OVER",25,canvas.height/2);}
  function updateStats(){scoreEl.textContent=score;linesEl.textContent=lines;b2bEl.textContent=b2b;}
});
