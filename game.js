(() => {
  'use strict';
  const canvas = document.querySelector('#gameCanvas');
  const ctx = canvas.getContext('2d');
  const arena = document.querySelector('#arena');
  const ui = Object.fromEntries(['score','stage','lives','message','messageTitle','messageText','eyebrow','startButton','pauseButton','restartButton','soundButton','toast'].map(id => [id, document.querySelector('#'+id)]));
  const DESIGN_W=360, DESIGN_H=600;
  const colors=['#55e7ff','#8b7dff','#ff71bd','#ffb85c','#69f2aa'];
  let scale=1, width=DESIGN_W, height=DESIGN_H, raf=0, last=0, state='menu', score=0, stage=1, lives=3, sound=true, audio;
  let paddle, balls=[], bricks=[], particles=[], items=[], effects={wide:0,slow:0}, shake=0, pointer=false, keys={};

  const stages=[
    (r,c)=> r<4 && !(r===0&&(c===0||c===7)) ? 1:0,
    (r,c)=> r<5 && ((r+c)%2===0||r===2) ? (r===2?2:1):0,
    (r,c)=> r<6 && (c===r||c===7-r||r===0||r===5) ? (r===0||r===5?2:1):0,
    (r,c)=> r<6 && !((r===2||r===3)&&(c===3||c===4)) ? (r%2?2:1):0
  ];
  function resize(){const r=arena.getBoundingClientRect();canvas.width=Math.round(r.width*devicePixelRatio);canvas.height=Math.round(r.height*devicePixelRatio);canvas.style.width=r.width+'px';canvas.style.height=r.height+'px';width=DESIGN_W;height=DESIGN_W*r.height/r.width;scale=canvas.width/DESIGN_W;ctx.setTransform(scale,0,0,scale,0,0);if(paddle)paddle.y=height-45;}
  function updateHud(){ui.score.textContent=String(score).padStart(6,'0');ui.stage.textContent=String(stage).padStart(2,'0');ui.lives.textContent=Array(lives).fill('●').join(' ');ui.lives.setAttribute('aria-label',`残機${lives}`)}
  function makeStage(){bricks=[];const fn=stages[(stage-1)%stages.length], cols=8,gap=5,bw=(width-30-gap*7)/cols,bh=18;for(let r=0;r<6;r++)for(let c=0;c<cols;c++){let hp=fn(r,c);if(hp)bricks.push({x:15+c*(bw+gap),y:54+r*25,w:bw,h:bh,hp,max:hp,color:colors[r%colors.length],dead:0})}}
  function resetPaddle(){paddle={x:width/2-40,y:height-45,w:80,h:10,target:width/2};}
  function spawnBall(stuck=true,x=width/2){const speed=3.4+(stage-1)*.25;balls.push({x,y:height-60,r:5,vx:(Math.random()-.5)*1.5,vy:-speed,speed,stuck});}
  function begin(newGame=true){unlockAudio();if(newGame){score=0;stage=1;lives=3}effects={wide:0,slow:0};particles=[];items=[];balls=[];resetPaddle();makeStage();spawnBall(true);state='ready';hideMessage();updateHud();last=performance.now();cancelAnimationFrame(raf);raf=requestAnimationFrame(loop);}
  function launch(){if(state==='ready'){balls.forEach(b=>b.stuck=false);state='playing';tone('launch')}}
  function hideMessage(){ui.message.classList.remove('show')}
  function showMessage(title,text,button,eyebrow=''){ui.messageTitle.innerHTML=title;ui.messageText.innerHTML=text;ui.startButton.textContent=button;ui.eyebrow.textContent=eyebrow;ui.message.classList.add('show')}
  function pause(){if(state==='playing'||state==='ready'){state='paused';showMessage('PAUSED','ひと休み。準備ができたら戻ろう','ゲームに戻る','BREAK TIME')}else if(state==='paused'){state='playing';hideMessage();last=performance.now()}}
  function gameOver(){state='over';tone('over');showMessage('GAME<br>OVER',`SCORE ${String(score).padStart(6,'0')}<br>光はまだ消えていない`,'もう一度','TRY AGAIN')}
  function clearStage(){state='clear';score+=1000*stage;updateHud();tone('clear');showMessage('STAGE<br>CLEAR',`STAGE ${stage} COMPLETE<br>クリアボーナス +${1000*stage}`,'次のステージ','BRILLIANT!')}
  function nextStage(){stage++;effects={wide:0,slow:0};balls=[];items=[];particles=[];resetPaddle();makeStage();spawnBall(true);state='ready';hideMessage();updateHud()}
  function loseBall(){if(balls.length)return;lives--;updateHud();if(lives<=0)gameOver();else{resetPaddle();spawnBall(true);state='ready';flash(`LIFE × ${lives}`)}}
  function hitBrick(b,brick){brick.hp--;score+=brick.hp?35:100*brick.max;shake=brick.hp?1.5:3;emit(b.x,b.y,brick.color,brick.hp?4:9);tone('brick');if(!brick.hp){brick.dead=1;if(Math.random()<.095)dropItem(brick)}updateHud()}
  function emit(x,y,color,n){for(let i=0;i<n;i++)particles.push({x,y,vx:(Math.random()-.5)*3.5,vy:(Math.random()-.7)*3.5,life:1,color,size:1+Math.random()*2})}
  function dropItem(b){const types=['wide','multi','slow','score'];items.push({x:b.x+b.w/2,y:b.y,type:types[Math.floor(Math.random()*types.length)],vy:1.3,r:9})}
  function getItem(it){tone('item');emit(it.x,it.y,'#fff',15);if(it.type==='wide'){effects.wide=600;paddle.w=120;flash('WIDE PADDLE')}else if(it.type==='multi'){const base=balls[0];if(base)for(const dir of [-1,1])balls.push({...base,vx:dir*Math.max(2,Math.abs(base.vx)),vy:-Math.abs(base.vy),stuck:false});flash('MULTI BALL')}else if(it.type==='slow'){effects.slow=480;flash('TIME SLOW')}else{score+=750;flash('+750 BONUS');updateHud()}}
  function flash(text){ui.toast.textContent=text;ui.toast.classList.remove('pop');void ui.toast.offsetWidth;ui.toast.classList.add('pop')}
  function collideCircleRect(ball,r){const cx=Math.max(r.x,Math.min(ball.x,r.x+r.w)),cy=Math.max(r.y,Math.min(ball.y,r.y+r.h)),dx=ball.x-cx,dy=ball.y-cy;return dx*dx+dy*dy<ball.r*ball.r}
  function update(dt){
    if(state!=='playing'&&state!=='ready')return;
    if(keys.ArrowLeft)paddle.target-=6*dt;if(keys.ArrowRight)paddle.target+=6*dt;paddle.target=Math.max(paddle.w/2,Math.min(width-paddle.w/2,paddle.target));paddle.x+=(paddle.target-paddle.w/2-paddle.x)*Math.min(1,.28*dt);
    if(effects.wide>0&&--effects.wide<=0)paddle.w=80;if(effects.slow>0)effects.slow--;
    balls.forEach(ball=>{if(ball.stuck){ball.x=paddle.x+paddle.w/2;ball.y=paddle.y-8;return}const slow=effects.slow>0?.68:1;ball.x+=ball.vx*dt*slow;ball.y+=ball.vy*dt*slow;if(ball.x-ball.r<0){ball.x=ball.r;ball.vx=Math.abs(ball.vx)}if(ball.x+ball.r>width){ball.x=width-ball.r;ball.vx=-Math.abs(ball.vx)}if(ball.y-ball.r<0){ball.y=ball.r;ball.vy=Math.abs(ball.vy)}if(ball.vy>0&&collideCircleRect(ball,paddle)&&ball.y<paddle.y+paddle.h){const rel=(ball.x-(paddle.x+paddle.w/2))/(paddle.w/2);const speed=Math.min(6.2,Math.hypot(ball.vx,ball.vy)*1.015);ball.vx=rel*speed*.9;ball.vy=-Math.sqrt(Math.max(2,speed*speed-ball.vx*ball.vx));ball.y=paddle.y-ball.r;tone('paddle');emit(ball.x,ball.y,'#55e7ff',3)}for(const br of bricks){if(!br.dead&&collideCircleRect(ball,br)){const prevX=ball.x-ball.vx*dt,prevY=ball.y-ball.vy*dt;if(prevX<br.x||prevX>br.x+br.w)ball.vx*=-1;else ball.vy*=-1;hitBrick(ball,br);break}}});
    balls=balls.filter(b=>b.y-b.r<height+10);bricks=bricks.filter(b=>b.dead<1||++b.dead<8);if(!balls.length)loseBall();if(bricks.length===0&&state==='playing')clearStage();
    items.forEach(it=>{it.y+=it.vy*dt;if(collideCircleRect({x:it.x,y:it.y,r:it.r},paddle)){it.got=true;getItem(it)}});items=items.filter(i=>!i.got&&i.y<height+20);
    particles.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=.08*dt;p.life-=.035*dt});particles=particles.filter(p=>p.life>0);shake*=.78;
  }
  function rounded(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r)}
  function draw(){ctx.save();ctx.clearRect(0,0,width,height);if(shake)ctx.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake);ctx.strokeStyle='#5adfff10';for(let y=20;y<height;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(width,y);ctx.stroke()}
    bricks.forEach(b=>{ctx.save();if(b.dead)ctx.globalAlpha=1-b.dead/8;ctx.shadowBlur=10;ctx.shadowColor=b.color;ctx.fillStyle=b.hp===1?b.color:'#fff';rounded(b.x,b.y,b.w,b.h,4);ctx.fill();ctx.globalAlpha=.35;ctx.fillStyle='#fff';ctx.fillRect(b.x+4,b.y+3,b.w-8,2);if(b.hp>1){ctx.globalAlpha=.8;ctx.fillStyle=b.color;ctx.fillRect(b.x+b.w/2-6,b.y+7,12,3)}ctx.restore()});
    items.forEach(i=>{ctx.save();ctx.translate(i.x,i.y);ctx.rotate(performance.now()/500);ctx.shadowBlur=15;ctx.shadowColor='#fff';ctx.fillStyle={wide:'#69f2aa',multi:'#ff71bd',slow:'#55e7ff',score:'#ffcf5c'}[i.type];rounded(-8,-8,16,16,4);ctx.fill();ctx.restore()});
    particles.forEach(p=>{ctx.globalAlpha=p.life;ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,p.size,p.size)});ctx.globalAlpha=1;
    ctx.shadowBlur=16;ctx.shadowColor='#3fe6ff';const grad=ctx.createLinearGradient(paddle.x,0,paddle.x+paddle.w,0);grad.addColorStop(0,'#765df0');grad.addColorStop(.5,'#dffcff');grad.addColorStop(1,'#38dff4');ctx.fillStyle=grad;rounded(paddle.x,paddle.y,paddle.w,paddle.h,6);ctx.fill();balls.forEach(b=>{ctx.shadowBlur=18;ctx.shadowColor='#fff';ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#75eaff';ctx.beginPath();ctx.arc(b.x-1.5,b.y-1.5,1.5,0,Math.PI*2);ctx.fill()});ctx.restore();
  }
  function loop(now){const dt=Math.min(2,(now-last)/16.667||1);last=now;update(dt);draw();raf=requestAnimationFrame(loop)}
  function unlockAudio(){if(!audio)audio=new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume()}
  function tone(type){if(!sound)return;unlockAudio();const map={paddle:[230,.055,'sine'],brick:[460,.045,'square'],item:[720,.16,'sine'],clear:[520,.5,'triangle'],over:[120,.55,'sawtooth'],launch:[300,.08,'sine']},[f,d,w]=map[type];const o=audio.createOscillator(),g=audio.createGain();o.type=w;o.frequency.setValueAtTime(f,audio.currentTime);if(type==='clear')o.frequency.exponentialRampToValueAtTime(1040,audio.currentTime+d);if(type==='over')o.frequency.exponentialRampToValueAtTime(55,audio.currentTime+d);g.gain.setValueAtTime(.06,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+d);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+d)}
  function movePointer(e){const r=canvas.getBoundingClientRect();paddle.target=(e.clientX-r.left)*DESIGN_W/r.width}
  arena.addEventListener('pointerdown',e=>{pointer=true;arena.setPointerCapture(e.pointerId);movePointer(e);unlockAudio();launch()});arena.addEventListener('pointermove',e=>{if(pointer||e.pointerType==='mouse')movePointer(e)});arena.addEventListener('pointerup',()=>pointer=false);
  window.addEventListener('keydown',e=>{if(e.code==='ArrowLeft'||e.code==='ArrowRight'){keys[e.code]=true;e.preventDefault();launch()}if(e.code==='Space'){e.preventDefault();state==='paused'?pause():launch()}if(e.code==='KeyP')pause()});window.addEventListener('keyup',e=>keys[e.code]=false);
  ui.startButton.addEventListener('click',()=>{if(state==='menu'||state==='over')begin(true);else if(state==='clear')nextStage();else if(state==='paused')pause()});ui.pauseButton.addEventListener('click',pause);ui.restartButton.addEventListener('click',()=>begin(true));ui.soundButton.addEventListener('click',()=>{sound=!sound;if(sound)unlockAudio();ui.soundButton.textContent=sound?'♪':'×';ui.soundButton.setAttribute('aria-label',sound?'サウンドをオフにする':'サウンドをオンにする')});
  new ResizeObserver(resize).observe(arena);resetPaddle();makeStage();spawnBall(true);updateHud();resize();draw();
})();
