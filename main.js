const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const ROWS = 20, COLS = 10, BLOCK = 30;

document.addEventListener("keydown", e => {
  if(["ArrowDown","ArrowUp"," "].includes(e.key)) e.preventDefault();
});

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

let field = Array.from({length: ROWS}, () => Array(COLS).fill(0));
let current = randomPiece(), next = randomPiece(), hold = null;
let canHold = true, dropCounter = 0, dropInterval = 500, lastTime = 0;
let tspinText = "", tspinTimer = 0;

function randomPiece() {
  const types = Object.keys(SHAPES);
  const t = types[Math.floor(Math.random()*types.length)];
  return {shape: SHAPES[t].map(r=>[...r]), color: COLORS[t], x:3, y:0, type:t, rotated:false};
}

function drawBlock(x,y,color){ctx.fillStyle=color;ctx.fillRect(x*BLOCK,y*BLOCK,BLOCK-1,BLOCK-1);}
function drawField(){for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++)if(field[y][x])drawBlock(x,y,field[y][x]);}
function drawPiece(p){p.shape.forEach((r,dy)=>r.forEach((v,dx)=>v&&drawBlock(p.x+dx,p.y+dy,p.color)));}

function collide(p){
  for(let y=0;y<p.shape.length;y++){
    for(let x=0;x<p.shape[y].length;x++){
      if(p.shape[y][x]){
        let ny=p.y+y,nx=p.x+x;
        if(nx<0||nx>=COLS||ny>=ROWS||ny>=0&&field[ny]&&field[ny][nx])return true;
      }
    }
  }
  return false;
}

function merge(p){p.shape.forEach((r,dy)=>r.forEach((v,dx)=>v&&p.y+dy>=0&&(field[p.y+dy][p.x+dx]=p.color)));}

function rotate(piece,dir){
  const s = piece.shape;
  const N = s.length;
  let newShape = Array.from({length:N},()=>Array(N).fill(0));
  for(let y=0;y<N;y++)for(let x=0;x<N;x++)newShape[x][N-1-y]=s[y][x];
  if(dir===-1)newShape=newShape[0].map((_,i)=>newShape.map(r=>r[i])).reverse();
  const oldX=piece.x, oldY=piece.y;
  const kicks = [[0,0],[1,0],[-1,0],[0,1],[0,-1]];
  for(const [kx,ky] of kicks){
    piece.shape=newShape; piece.x=oldX+kx; piece.y=oldY+ky;
    if(!collide(piece))return true;
  }
  piece.shape=s; piece.x=oldX; piece.y=oldY;
  return false;
}

function rotate180(p){p.shape=p.shape.map(r=>[...r]).reverse().map(r=>r.reverse());}

function drop(){current.y++;if(collide(current)){current.y--;lockPiece();}dropCounter=0;}
function hardDrop(){while(!collide(current))current.y++;current.y--;lockPiece();dropCounter=0;}

function lockPiece(){
  merge(current);
  let cleared = clearLines();
  checkTspin(current, cleared);
  resetPiece();
}

function checkTspin(p, cleared){
  if(p.type!=="T"||!p.rotated)return;
  let corners=0;
  const check=[[0,0],[2,0],[0,2],[2,2]];
  for(const [dx,dy] of check){
    const x=p.x+dx,y=p.y+dy;
    if(y>=ROWS||x<0||x>=COLS||field[y]&&field[y][x])corners++;
  }
  if(corners>=3){
    if(cleared===0)tspinText="T-SPIN";
    else if(cleared===1)tspinText="T-SPIN SINGLE";
    else if(cleared===2)tspinText="T-SPIN DOUBLE";
    else if(cleared===3)tspinText="T-SPIN TRIPLE";
    tspinTimer=120; // 約2秒
  }
}

function clearLines(){
  let before=field.length;
  field=field.filter(r=>r.some(v=>!v));
  let cleared=before-field.length;
  while(field.length<ROWS)field.unshift(Array(COLS).fill(0));
  return cleared;
}

function resetPiece(){
  current=next;next=randomPiece();canHold=true;
  if(collide(current))field=Array.from({length:ROWS},()=>Array(COLS).fill(0));
}

function holdPiece(){
  if(!canHold)return;
  if(hold){[hold,current]=[current,hold];current.x=3;current.y=0;}
  else{hold=current;current=next;next=randomPiece();}
  canHold=false;
}

document.addEventListener("keydown",e=>{
  switch(e.key.toLowerCase()){
    case"arrowleft":current.x--;if(collide(current))current.x++;break;
    case"arrowright":current.x++;if(collide(current))current.x--;break;
    case"arrowdown":current.y++;if(collide(current))current.y--;break;
    case" ":hardDrop();break;
    case"z":current.rotated=rotate(current,-1);break;
    case"x":current.rotated=rotate(current,1);break;
    case"a":current.rotated=true;rotate180(current);break;
    case"shift":case"c":holdPiece();break;
  }
});

function update(time=0){
  const delta=time-lastTime;lastTime=time;dropCounter+=delta;
  if(dropCounter>dropInterval)drop();
  ctx.clearRect(0,0,canvas.width,canvas.height);
  drawField();drawPiece(current);
  if(tspinTimer>0){
    tspinTimer--;
    ctx.font="2cm Arial Black";
    ctx.fillStyle="#fff";
    ctx.fillText(tspinText,10,550);
  }
  requestAnimationFrame(update);
}
update();
