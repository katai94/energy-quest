/* ENERGY QUEST - Firebase Realtime Database (Auto-Grading Version) */
const $ = id => document.getElementById(id);
const COLORS = ["#8fe3b0","#ffd36a","#85b8ff","#e6a0ff","#ff9c82","#a6e56d"];
const ICONS = {start:"⚡",question:"🔋",save:"🌱",luck:"🎁",challenge:"🚀"};
const BOARD = [
 ["start","START"],["question","พลังงาน"],["save","ประหยัด"],["question","พลังงาน"],["luck","เสี่ยงโชค"],["question","พลังงาน"],
 ["question","พลังงาน"],["save","ประหยัด"],["question","พลังงาน"],["challenge","ท้าทาย"],["save","ประหยัด"],["question","พลังงาน"],
 ["question","พลังงาน"],["luck","เสี่ยงโชค"],["save","ประหยัด"],["question","พลังงาน"],["question","พลังงาน"],["save","ประหยัด"],
 ["save","ประหยัด"],["question","พลังงาน"],["challenge","ท้าทาย"],["question","พลังงาน"],["luck","เสี่ยงโชค"],["question","พลังงาน"]
];

let db=null, auth=null, roomRef=null, room=null, roomCode="", role="", myTeamId="", myUid="";
let roomListener=null, submissionRef=null, submissionListener=null, currentQuestion=null, busy=false;
let currentSubmissions={};

const cfg=window.FIREBASE_CONFIG;
if(cfg && cfg.apiKey && !String(cfg.apiKey).startsWith("ใส่-")){
  firebase.initializeApp(cfg);
  db=firebase.database();
  auth=firebase.auth();
  auth.onAuthStateChanged(user=>{
    if(user){
      myUid=user.uid;
      const el=$("connectionText");
      if(el) el.textContent="เชื่อมต่อระบบออนไลน์แล้ว";
    } else {
      const el=$("connectionText");
      if(el) el.textContent="กำลังยืนยันตัวตน...";
    }
  });
} else {
  const el=$("connectionText");
  if(el) el.textContent="กรุณาตั้งค่า Firebase";
}

async function signIn(){
  if(!auth) throw new Error("ยังไม่ได้ตั้งค่า Firebase");
  if(auth.currentUser){ myUid=auth.currentUser.uid; return auth.currentUser; }
  const result=await auth.signInAnonymously();
  myUid=result.user.uid; 
  return result.user;
}

function toast(msg){
  const t=$("toast");
  if(!t) return;
  t.textContent=msg;
  t.classList.add("show");
  setTimeout(()=>t.classList.remove("show"), 2600);
}

function show(view){
  ["homeView","lobbyView","gameView"].forEach(id=>{
    const el=$(id);
    if(el) el.classList.toggle("hidden", id!==view);
  });
}

function esc(s){ return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function teams(){ return Object.entries(room?.teams||{}).map(([id,t])=>({id,...t})); }
function teacher(){ return role==="teacher" && !!myUid && room?.teacherUid===myUid; }
function roomPath(){ return "rooms/"+roomCode; }

function stopExtraListeners(){
  if(submissionRef && submissionListener) submissionRef.off("value",submissionListener);
  submissionRef=null; submissionListener=null; currentSubmissions={};
}

function listenRoom(){
  if(roomRef && roomListener) roomRef.off("value",roomListener);
  roomListener=snap=>{
    room=snap.val();
    if(!room){ toast("ไม่พบห้องเกม"); show("homeView"); return; }
    if(role==="student"){
      const own=teams().find(t=>t.uid===myUid);
      myTeamId=own?.id||"";
    }
    render();
    if(room.question) watchQuestion(room.question);
    else { stopExtraListeners(); $("questionModal")?.classList.add("hidden"); }
  };
  roomRef.on("value",roomListener);
}

function watchQuestion(q){
  if(currentQuestion?.id===q.id && submissionRef) return;
  stopExtraListeners();
  currentQuestion=q;
  const qid=q.id;
  if(teacher()){
    submissionRef=db.ref("submissions/"+roomCode+"/"+qid);
    submissionListener=s=>{ currentSubmissions=s.val()||{}; renderQuestion(); };
    submissionRef.on("value",submissionListener);
  } else if(role==="student" && myTeamId){
    submissionRef=db.ref("submissions/"+roomCode+"/"+qid+"/"+myTeamId);
    submissionListener=s=>{ currentSubmissions[myTeamId]=s.val()||null; renderQuestion(); };
    submissionRef.on("value",submissionListener);
  }
  renderQuestion();
}

async function createRoom(){
  if(!db||busy){ toast("ตรวจสอบการตั้งค่า Firebase ก่อน"); return; }
  busy=true;
  try{
    await signIn(); 
    role="teacher";
    roomCode=String(Math.floor(100000+Math.random()*900000));
    roomRef=db.ref(roomPath());
    await roomRef.child("teacherUid").set(myUid);
    await roomRef.update({
      status:"lobby",
      createdAt:Date.now(),
      turnIndex:0,
      activeTeamId:"",
      lastRoll:0,
      question:null,
      usedQuestions:{},
      boardSize:BOARD.length
    });
    
    if($("roomCodeLabel")) $("roomCodeLabel").textContent=roomCode;
    if($("lobbyTitle")) $("lobbyTitle").textContent="ห้องเกมของคุณพร้อมแล้ว";
    if($("lobbyInstructions")) $("lobbyInstructions").textContent="แชร์รหัสห้องให้นักเรียน แล้วรอทีมเข้าร่วม";
    if($("teacherLobbyControls")) $("teacherLobbyControls").classList.remove("hidden");
    if($("studentJoinForm")) $("studentJoinForm").classList.add("hidden");
    
    listenRoom();
    show("lobbyView");
    toast("สร้างห้องสำเร็จ");
  } catch(e){
    console.error(e);
    toast("สร้างห้องไม่สำเร็จ: "+e.message);
  } finally {
    busy=false;
  }
}

async function joinRoom(){
  if(!db||busy){ toast("ตรวจสอบการตั้งค่า Firebase ก่อน"); return; }
  const c=$("joinCode")?.value.trim()||"";
  if(!/^\d{6}$/.test(c)){ toast("กรอกรหัสห้อง 6 หลัก"); return; }
  busy=true;
  try{
    await signIn();
    roomCode=c;
    roomRef=db.ref(roomPath());
    const s=await roomRef.once("value");
    if(!s.exists()){ toast("ไม่พบรหัสห้องนี้"); return; }
    const data=s.val();
    if(data.status==="closed"){ toast("ห้องนี้ปิดแล้ว"); return; }
    
    role="student";
    const own=Object.entries(data.teams||{}).find(([,t])=>t.uid===myUid);
    myTeamId=own?.[0]||"";
    
    if($("roomCodeLabel")) $("roomCodeLabel").textContent=roomCode;
    if($("lobbyTitle")) $("lobbyTitle").textContent=myTeamId?"คุณเข้าร่วมทีมแล้ว":"เข้าร่วมทีม";
    if($("lobbyInstructions")) $("lobbyInstructions").textContent="กรอกชื่อทีมและสมาชิกเพื่อเข้าร่วมเกม";
    if($("teacherLobbyControls")) $("teacherLobbyControls").classList.add("hidden");
    if($("studentJoinForm")) $("studentJoinForm").classList.toggle("hidden",!!myTeamId);
    
    listenRoom();
    show(data.status==="game"?"gameView":"lobbyView");
  } catch(e){
    console.error(e);
    toast("เข้าห้องไม่สำเร็จ: "+e.message);
  } finally {
    busy=false;
  }
}

async function joinTeam(){
  if(!roomRef||role!=="student"||busy) return;
  const name=$("teamName")?.value.trim()||"";
  const members=($("memberNames")?.value||"").split(",").map(x=>x.trim()).filter(Boolean);
  if(!name){ toast("กรอกชื่อทีมก่อน"); return; }
  if(members.length<4||members.length>6){ toast("สมาชิกในทีมต้องมี 4–6 คน"); return; }
  if(room?.status!=="lobby"){ toast("ห้องปิดรับทีมแล้ว"); return; }
  if(teams().some(t=>t.name?.toLowerCase()===name.toLowerCase())){ toast("มีชื่อทีมนี้แล้ว"); return; }
  if(teams().some(t=>t.uid===myUid)){ toast("บัญชีนี้เข้าร่วมทีมแล้ว"); return; }
  
  busy=true;
  try{
    const id="t"+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
    const ref=roomRef.child("teams/"+id);
    await ref.child("uid").set(myUid);
    await ref.update({name,members,color:COLORS[teams().length%COLORS.length],joinedAt:Date.now(),position:0,score:0});
    myTeamId=id;
    if($("studentJoinForm")) $("studentJoinForm").classList.add("hidden");
    toast("เข้าร่วมทีมสำเร็จ");
  } catch(e){
    console.error(e);
    toast("เข้าร่วมไม่สำเร็จ: "+e.message);
  } finally {
    busy=false;
  }
}

function render(){
  if(!room) return;
  if($("roomCodeLabel")) $("roomCodeLabel").textContent=roomCode;
  if($("gameRoomCode")) $("gameRoomCode").textContent=roomCode;
  const list=teams();
  if($("teamCount")) $("teamCount").textContent=list.length+" ทีม";
  if($("teamList")) $("teamList").innerHTML=list.length
    ? list.map(t=>`<div class="team-item"><span><i class="team-dot" style="background:${esc(t.color)}"></i>${esc(t.name)}</span><small>${(t.members||[]).length} คน</small></div>`).join("")
    : '<div class="empty">กำลังรอทีมเข้าร่วม...</div>';
    
  if($("teacherLobbyControls")) $("teacherLobbyControls").classList.toggle("hidden",!teacher());
  if($("studentJoinForm")) $("studentJoinForm").classList.toggle("hidden",role!=="student"||!!myTeamId);
  if($("startGame")) $("startGame").disabled=!teacher()||list.length===0;
  
  if(room.status==="lobby") show("lobbyView");
  if(room.status==="game"){
    show("gameView");
    if($("teacherControls")) $("teacherControls").classList.toggle("hidden",!teacher());
    if($("studentControls")) $("studentControls").classList.toggle("hidden",role!=="student");
  }
  if(room.status==="closed"){ 
    show("homeView"); 
    if($("questionModal")) $("questionModal").classList.add("hidden"); 
    toast("ห้องเกมปิดแล้ว"); 
    return; 
  }
  
  renderScores(list);
  renderBoard(list);
  renderTeamSelect(list);
  
  const active=list.find(t=>t.id===room.activeTeamId);
  if($("turnLabel")) $("turnLabel").textContent=active?"ตาของ "+active.name:"รอเลือกทีม";
  if($("diceResult")) $("diceResult").textContent=room.lastRoll?"ได้ "+room.lastRoll+" แต้ม":"พร้อมทอยเต๋า";
  if($("diceFace")) $("diceFace").textContent=room.lastRoll?["⚀","⚁","⚂","⚃","⚄","⚅"][room.lastRoll-1]:"⚄";
  
  if(room.question) renderQuestion(); 
  else if($("questionModal")) $("questionModal").classList.add("hidden");
  
  if(role==="student" && $("studentStatus")){
    const q=room.question;
    $("studentStatus").textContent=!q?"รอครูเปิดคำถาม...":q.teamId===myTeamId?(currentSubmissions[myTeamId]?"ตอบคำถามแล้ว ระบบกำลังตรวจ...":"ถึงตาทีมของคุณ ตอบคำถามเพื่อเก็บแต้ม!"):"กำลังเล่นทีมอื่น รอคิวทีมของคุณ";
  }
}

function renderScores(list){
  const sorted=[...list].sort((a,b)=>(b.score||0)-(a.score||0));
  if($("scoreList")) $("scoreList").innerHTML=sorted.length
    ? sorted.map((t,i)=>`<div class="score-row"><span class="score-name"><i class="team-dot" style="background:${esc(t.color)}"></i><span>${i===0?"👑 ":""}${esc(t.name)}<small>${t.position||0}/${BOARD.length-1} ช่อง</small></span></span><strong>${t.score||0}</strong></div>`).join("")
    : '<div class="empty">ยังไม่มีทีม</div>';
}

function renderTeamSelect(list){
  const sel=$("activeTeam");
  if(!sel) return;
  const old=sel.value;
  sel.innerHTML=list.map(t=>`<option value="${esc(t.id)}">${esc(t.name)}</option>`).join("");
  if(list.some(t=>t.id===old)) sel.value=old; 
  else if(room.activeTeamId) sel.value=room.activeTeamId;
}

function renderBoard(list){
  const b=$("board"); 
  if(!b) return;
  b.innerHTML="";
  const coords=[];
  for(let c=0;c<6;c++) coords.push([0,c]);
  for(let r=1;r<6;r++) coords.push([r,5]);
  for(let c=4;c>=0;c--) coords.push([5,c]);
  for(let r=4;r>0;r--) coords.push([r,0]);
  
  const map={}; 
  coords.forEach((p,i)=>map[p.join(",")]=i);
  
  for(let r=0;r<6;r++) for(let c=0;c<6;c++){
    const idx=map[[r,c].join(",")], tile=idx===undefined?null:BOARD[idx], cell=document.createElement("div");
    if(!tile){
      cell.className="tile center-tile";
      if(r===2&&c===2){
        cell.style.gridArea="2 / 2 / 5 / 6";
        cell.style.background="radial-gradient(circle,#155447,#082b2b)";
        cell.style.border="1px solid #a2e9b533";
        cell.innerHTML='<div style="text-align:center;margin:auto"><div style="font-size:clamp(22px,4vw,44px)">🌍</div><b style="font:600 clamp(13px,2vw,21px) Kanit;color:#d5f36a">ENERGY QUEST</b><div style="font-size:11px;color:#a7c6b9;margin-top:6px">คิด • เล่น • เปลี่ยนโลก</div></div>';
      } else cell.style.visibility="hidden";
    } else {
      cell.className="tile "+tile[0];
      cell.innerHTML=`<span class="tile-num">${String(idx+1).padStart(2,"0")}</span><span class="tile-icon">${ICONS[tile[0]]}</span><span class="tile-name">${tile[1]}</span><div class="tokens">${list.filter(t=>(t.position||0)===idx).map(t=>`<i class="token" style="background:${esc(t.color)}" title="${esc(t.name)}"></i>`).join("")}</div>`;
    }
    b.appendChild(cell);
  }
}

async function startGame(){
  if(!teacher()||busy) return;
  const list=teams(); if(!list.length){ toast("ยังไม่มีทีม"); return; }
  try{ await roomRef.update({status:"game",activeTeamId:list[0].id,turnIndex:0,lastRoll:0}); toast("เริ่มเกมแล้ว"); }
  catch(e){ toast("เริ่มเกมไม่สำเร็จ: "+e.message); }
}

async function rollDice(){
  if(!teacher()||busy) return;
  if(room.question){ toast("รอตอบคำถามข้อปัจจุบันก่อน"); return; }
  const id=$("activeTeam")?.value, t=room.teams?.[id]; if(!t){ toast("เลือกทีมก่อน"); return; }
  busy=true;
  try{
    const roll=1+Math.floor(Math.random()*6), pos=Math.min(BOARD.length-1,(t.position||0)+roll), tile=BOARD[pos];
    const updates={["teams/"+id+"/position"]:pos,activeTeamId:id,lastRoll:roll};
    if(tile[0]!=="start"){
      const pool=(window.ENERGY_QUESTIONS||[]).filter(q=>q.type===tile[0]);
      if(!pool.length){ toast("ไม่มีคำถามประเภทนี้ใน questions.js"); return; }
      const used=room.usedQuestions||{};
      const available=pool.filter(q=>{const i=window.ENERGY_QUESTIONS.indexOf(q); return !used[tile[0]+"_"+i];});
      const q=(available.length?available:pool)[Math.floor(Math.random()*(available.length||pool.length))];
      const qi=window.ENERGY_QUESTIONS.indexOf(q), qid="q"+Date.now();
      
      const publicQ={
        id:qid,
        type:q.type,
        category:q.category,
        q:q.q,
        options:q.options||[],
        points:q.points??0,
        teamId:id,
        teamName:t.name,
        usedKey:tile[0]+"_"+qi,
        move:q.move||0
      };

      await db.ref("answerKeys/"+roomCode+"/"+qid).set({answer:q.a||""});
      updates.question=publicQ;
    }
    await roomRef.update(updates);
    toast("ทอยได้ "+roll);
  } catch(e){
    console.error(e);
    toast("ทอยเต๋าไม่สำเร็จ: "+e.message);
  } finally {
    busy=false;
  }
}

function renderQuestion(){
  const q=room?.question; if(!q) return;
  currentQuestion=q;
  if($("questionCategory")) $("questionCategory").textContent=q.category||"คำถามพลังงาน";
  if($("questionNumber")) $("questionNumber").textContent="QUESTION • "+q.id.slice(-5);
  if($("questionText")) $("questionText").textContent=q.q;
  
  const myTurn=role==="student"&&q.teamId===myTeamId;
  const container=$("optionsContainer");
  if(container){
    container.innerHTML="";
    const submitted=currentSubmissions[myTeamId];

    if(q.options && q.options.length > 0){
      q.options.forEach(opt=>{
        const btn=document.createElement("button");
        btn.className="btn btn-secondary full option-btn";
        btn.textContent=opt;
        if(!myTurn || submitted){
          btn.disabled=true;
        } else {
          btn.onclick=()=>selectOption(opt);
        }
        container.appendChild(btn);
      });
    }

    if($("submittedMessage")){
      $("submittedMessage").textContent=submitted
        ? "ทีมของคุณส่งคำตอบแล้ว: "+submitted.answer
        : (myTurn?"เลือกคำตอบของทีมคุณ":"กำลังรอทีม "+esc(q.teamName)+" ตอบคำถาม...");
    }
  }

  if($("questionModal")) $("questionModal").classList.remove("hidden");
}

async function selectOption(selectedAnswer){
  const q=room?.question;
  if(role!=="student"||!myTeamId||!q||q.teamId!==myTeamId){ toast("ยังไม่ถึงตาทีมของคุณ"); return; }
  if(currentSubmissions[myTeamId]||busy) return;

  busy=true;
  try{
    await db.ref("submissions/"+roomCode+"/"+q.id+"/"+myTeamId).set({
      answer:selectedAnswer,
      uid:myUid,
      at:Date.now()
    });

    const snap=await db.ref("answerKeys/"+roomCode+"/"+q.id).once("value");
    const key=snap.val();
    const isCorrect=key && key.answer===selectedAnswer;

    const id=q.teamId, t=room.teams?.[id];
    const updates={question:null};

    if(isCorrect){
      updates["teams/"+id+"/score"]=(t?.score||0)+(q.points||0);
      toast("ถูกต้อง! ได้รับ "+q.points+" คะแนน");
    } else {
      toast("คำตอบไม่ถูกต้อง!");
    }

    if(q.move){
      updates["teams/"+id+"/position"]=Math.min(BOARD.length-1,(t?.position||0)+q.move);
    }
    if(q.usedKey){
      updates["usedQuestions/"+q.usedKey]=true;
    }

    await roomRef.update(updates);
    await db.ref("answerKeys/"+roomCode+"/"+q.id).remove();

  } catch(e){
    console.error(e);
    toast("เกิดข้อผิดพลาดในการตรวจคำตอบ");
  } finally {
    busy=false;
  }
}

async function nextTurn(){
  if(!teacher()||busy) return;
  if(room.question){ toast("รอตอบคำถามก่อนเปลี่ยนทีม"); return; }
  const list=teams(); if(!list.length) return;
  let i=list.findIndex(t=>t.id===room.activeTeamId);
  i=(i+1)%list.length;
  try{ await roomRef.update({activeTeamId:list[i].id,lastRoll:0}); }
  catch(e){ toast("เปลี่ยนทีมไม่สำเร็จ"); }
}

async function resetGame(){
  if(!teacher()||busy) return;
  if(!confirm("เริ่มเกมใหม่และล้างคะแนน/ตำแหน่งทุกทีมใช่หรือไม่?")) return;
  busy=true;
  try{
    const updates={lastRoll:0,question:null,usedQuestions:{},turnIndex:0};
    teams().forEach(t=>{ updates["teams/"+t.id+"/position"]=0; updates["teams/"+t.id+"/score"]=0; });
    await roomRef.update(updates);
    toast("เริ่มเกมใหม่แล้ว");
  } catch(e){ toast("รีเซ็ตไม่สำเร็จ"); }
  finally { busy=false; }
}

async function closeRoom(){
  if(!teacher()||!confirm("ปิดห้องเกมนี้ใช่หรือไม่?")) return;
  try{ await roomRef.update({status:"closed",question:null}); toast("ปิดห้องแล้ว"); }
  catch(e){ toast("ปิดห้องไม่สำเร็จ"); }
}

window.addEventListener("DOMContentLoaded", ()=>{
  if($("teacherStart")) $("teacherStart").onclick=createRoom;
  if($("studentStart")) $("studentStart").onclick=joinRoom;
  if($("joinRoomBtn")) $("joinRoomBtn").onclick=joinTeam;
  if($("startGame")) $("startGame").onclick=startGame;
  if($("rollDice")) $("rollDice").onclick=rollDice;
  if($("nextTurn")) $("nextTurn").onclick=nextTurn;
  if($("resetGame")) $("resetGame").onclick=resetGame;
  if($("closeRoom")) $("closeRoom").onclick=closeRoom;
  if($("closeQuestion")) $("closeQuestion").onclick=()=>{ $("questionModal")?.classList.add("hidden"); };
  if($("copyCode")) $("copyCode").onclick=()=>navigator.clipboard?.writeText(roomCode).then(()=>toast("คัดลอกรหัสห้องแล้ว")).catch(()=>toast("คัดลอกไม่ได้"));
  if($("activeTeam")) $("activeTeam").onchange=e=>{ if(teacher()&&roomRef) roomRef.update({activeTeamId:e.target.value}); };
});
