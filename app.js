/* ENERGY QUEST - Firebase Realtime Database */
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
let roomListener=null, submissionRef=null, submissionListener=null, answerKey=null, currentQuestion=null, busy=false;
let currentSubmissions={};

const cfg=window.FIREBASE_CONFIG;
if(cfg && cfg.apiKey && !String(cfg.apiKey).startsWith("ใส่-")){
  firebase.initializeApp(cfg);
  db=firebase.database();
  auth=firebase.auth();
  auth.onAuthStateChanged(user=>{
    if(user){myUid=user.uid;$("connectionText").textContent="เชื่อมต่อระบบออนไลน์แล้ว";}
    else $("connectionText").textContent="กำลังยืนยันตัวตน...";
  });
}else $("connectionText").textContent="กรุณาตั้งค่า Firebase";

async function signIn(){
  if(!auth) throw new Error("ยังไม่ได้ตั้งค่า Firebase");
  if(auth.currentUser){myUid=auth.currentUser.uid;return auth.currentUser;}
  const result=await auth.signInAnonymously();
  myUid=result.user.uid; return result.user;
}
function toast(msg){$("toast").textContent=msg;$("toast").classList.add("show");setTimeout(()=>$("toast").classList.remove("show"),2600);}
function show(view){["homeView","lobbyView","gameView"].forEach(id=>$(id).classList.toggle("hidden",id!==view));}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function teams(){return Object.entries(room?.teams||{}).map(([id,t])=>({id,...t}));}
function teacher(){return role==="teacher" && !!myUid && room?.teacherUid===myUid;}
function roomPath(){return "rooms/"+roomCode;}
function stopExtraListeners(){
  if(submissionRef && submissionListener) submissionRef.off("value",submissionListener);
  submissionRef=null;submissionListener=null;currentSubmissions={};answerKey=null;
}
function listenRoom(){
  if(roomRef && roomListener) roomRef.off("value",roomListener);
  roomListener=snap=>{
    room=snap.val();
    if(!room){toast("ไม่พบห้องเกม");show("homeView");return;}
    if(role==="student"){
      const own=teams().find(t=>t.uid===myUid);
      myTeamId=own?.id||"";
    }
    render();
    if(room.question) watchQuestion(room.question);
    else stopExtraListeners();
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
    submissionListener=s=>{currentSubmissions=s.val()||{};renderQuestion();};
    submissionRef.on("value",submissionListener);
    db.ref("answerKeys/"+roomCode+"/"+qid).once("value").then(s=>{
      answerKey=s.val();renderQuestion();
    }).catch(e=>console.error(e));
  }else if(role==="student" && myTeamId){
    submissionRef=db.ref("submissions/"+roomCode+"/"+qid+"/"+myTeamId);
    submissionListener=s=>{currentSubmissions[myTeamId]=s.val()||null;renderQuestion();};
    submissionRef.on("value",submissionListener);
  }
  renderQuestion();
}
async function createRoom(){
  if(!db||busy){toast("ตรวจสอบการตั้งค่า Firebase ก่อน");return;}
  busy=true;
  try{
    await signIn(); role="teacher";roomCode=String(Math.floor(100000+Math.random()*900000));
    roomRef=db.ref(roomPath());
    await roomRef.child("teacherUid").set(myUid);
    await roomRef.update({status:"lobby",createdAt:Date.now(),turnIndex:0,activeTeamId:"",lastRoll:0,question:null,usedQuestions:{},boardSize:BOARD.length});
    $("roomCodeLabel").textContent=roomCode;
    $("lobbyTitle").textContent="ห้องเกมของคุณพร้อมแล้ว";
    $("lobbyInstructions").textContent="แชร์รหัสห้องให้นักเรียน แล้วรอทีมเข้าร่วม";
    $("teacherLobbyControls").classList.remove("hidden");
    $("studentJoinForm").classList.add("hidden");
    listenRoom();show("lobbyView");toast("สร้างห้องสำเร็จ");
  }catch(e){console.error(e);toast("สร้างห้องไม่สำเร็จ: "+e.message);}
  finally{busy=false;}
}
async function joinRoom(){
  if(!db||busy){toast("ตรวจสอบการตั้งค่า Firebase ก่อน");return;}
  const c=$("joinCode").value.trim();
  if(!/^\d{6}$/.test(c)){toast("กรอกรหัสห้อง 6 หลัก");return;}
  busy=true;
  try{
    await signIn();roomCode=c;roomRef=db.ref(roomPath());
    const s=await roomRef.once("value");
    if(!s.exists()){toast("ไม่พบรหัสห้องนี้");return;}
    const data=s.val();
    if(data.status==="closed"){toast("ห้องนี้ปิดแล้ว");return;}
    role="student";
    const own=Object.entries(data.teams||{}).find(([,t])=>t.uid===myUid);
    myTeamId=own?.[0]||"";
    $("roomCodeLabel").textContent=roomCode;
    $("lobbyTitle").textContent=myTeamId?"คุณเข้าร่วมทีมแล้ว":"เข้าร่วมทีม";
    $("lobbyInstructions").textContent="กรอกชื่อทีมและสมาชิกเพื่อเข้าร่วมเกม";
    $("teacherLobbyControls").classList.add("hidden");
    $("studentJoinForm").classList.toggle("hidden",!!myTeamId);
    listenRoom();show(data.status==="game"?"gameView":"lobbyView");
  }catch(e){console.error(e);toast("เข้าห้องไม่สำเร็จ: "+e.message);}
  finally{busy=false;}
}
async function joinTeam(){
  if(!roomRef||role!=="student"||busy)return;
  const name=$("teamName").value.trim();
  const members=$("memberNames").value.split(",").map(x=>x.trim()).filter(Boolean);
  if(!name){toast("กรอกชื่อทีมก่อน");return;}
  if(members.length<4||members.length>6){toast("สมาชิกในทีมต้องมี 4–6 คน");return;}
  if(room?.status!=="lobby"){toast("ห้องปิดรับทีมแล้ว");return;}
  if(teams().some(t=>t.name?.toLowerCase()===name.toLowerCase())){toast("มีชื่อทีมนี้แล้ว");return;}
  if(teams().some(t=>t.uid===myUid)){toast("บัญชีนี้เข้าร่วมทีมแล้ว");return;}
  busy=true;
  try{
    const id="t"+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
    const ref=roomRef.child("teams/"+id);
    await ref.child("uid").set(myUid);
    await ref.update({name,members,color:COLORS[teams().length%COLORS.length],joinedAt:Date.now(),position:0,score:0});
    myTeamId=id;$("studentJoinForm").classList.add("hidden");toast("เข้าร่วมทีมสำเร็จ");
  }catch(e){console.error(e);toast("เข้าร่วมไม่สำเร็จ: "+e.message);}
  finally{busy=false;}
}
function render(){
  if(!room)return;
  $("roomCodeLabel").textContent=roomCode;$("gameRoomCode").textContent=roomCode;
  const list=teams();
  $("teamCount").textContent=list.length+" ทีม";
  $("teamList").innerHTML=list.length?list.map(t=>`<div class="team-item"><span><i class="team-dot" style="background:${esc(t.color)}"></i>${esc(t.name)}</span><small>${(t.members||[]).length} คน</small></div>`).join(""):'<div class="empty">กำลังรอทีมเข้าร่วม...</div>';
  $("teacherLobbyControls").classList.toggle("hidden",!teacher());
  $("studentJoinForm").classList.toggle("hidden",role!=="student"||!!myTeamId);
  $("startGame").disabled=!teacher()||list.length===0;
  if(room.status==="lobby")show("lobbyView");
  if(room.status==="game"){
    show("gameView");
    $("teacherControls").classList.toggle("hidden",!teacher());
    $("studentControls").classList.toggle("hidden",role!=="student");
  }
  if(room.status==="closed"){show("homeView");$("questionModal").classList.add("hidden");toast("ห้องเกมปิดแล้ว");return;}
  renderScores(list);renderBoard(list);renderTeamSelect(list);
  const active=list.find(t=>t.id===room.activeTeamId);
  $("turnLabel").textContent=active?"ตาของ "+active.name:"รอเลือกทีม";
  $("diceResult").textContent=room.lastRoll?"ได้ "+room.lastRoll+" แต้ม":"พร้อมทอยเต๋า";
  $("diceFace").textContent=room.lastRoll?["⚀","⚁","⚂","⚃","⚄","⚅"][room.lastRoll-1]:"⚄";
  if(room.question)renderQuestion();else $("questionModal").classList.add("hidden");
  if(role==="student"){
    const q=room.question;
    $("studentStatus").textContent=!q?"รอครูเปิดคำถาม...":q.teamId===myTeamId?(currentSubmissions[myTeamId]?"ส่งคำตอบแล้ว รอครูตรวจ":"ถึงตาทีมของคุณ"):"กำลังเล่นทีมอื่น รอคิวทีมของคุณ";
  }
}
function renderScores(list){
  const sorted=[...list].sort((a,b)=>(b.score||0)-(a.score||0));
  $("scoreList").innerHTML=sorted.length?sorted.map((t,i)=>`<div class="score-row"><span class="score-name"><i class="team-dot" style="background:${esc(t.color)}"></i><span>${i===0?"👑 ":""}${esc(t.name)}<small>${t.position||0}/${BOARD.length-1} ช่อง</small></span></span><strong>${t.score||0}</strong></div>`).join(""):'<div class="empty">ยังไม่มีทีม</div>';
}
function renderTeamSelect(list){
  const sel=$("activeTeam"),old=sel.value;
  sel.innerHTML=list.map(t=>`<option value="${esc(t.id)}">${esc(t.name)}</option>`).join("");
  if(list.some(t=>t.id===old))sel.value=old;else if(room.activeTeamId)sel.value=room.activeTeamId;
}
function renderBoard(list){
  const b=$("board");b.innerHTML="";
  const coords=[];for(let c=0;c<6;c++)coords.push([0,c]);for(let r=1;r<6;r++)coords.push([r,5]);for(let c=4;c>=0;c--)coords.push([5,c]);for(let r=4;r>0;r--)coords.push([r,0]);
  const map={};coords.forEach((p,i)=>map[p.join(",")]=i);
  for(let r=0;r<6;r++)for(let c=0;c<6;c++){
    const idx=map[[r,c].join(",")],tile=idx===undefined?null:BOARD[idx],cell=document.createElement("div");
    if(!tile){cell.className="tile center-tile";if(r===2&&c===2){cell.style.gridArea="2 / 2 / 5 / 6";cell.style.background="radial-gradient(circle,#155447,#082b2b)";cell.style.border="1px solid #a2e9b533";cell.innerHTML='<div style="text-align:center;margin:auto"><div style="font-size:clamp(22px,4vw,44px)">🌍</div><b style="font:600 clamp(13px,2vw,21px) Kanit;color:#d5f36a">ENERGY QUEST</b><div style="font-size:11px;color:#a7c6b9;margin-top:6px">คิด • เล่น • เปลี่ยนโลก</div></div>';}else cell.style.visibility="hidden";}
    else{cell.className="tile "+tile[0];cell.innerHTML=`<span class="tile-num">${String(idx+1).padStart(2,"0")}</span><span class="tile-icon">${ICONS[tile[0]]}</span><span class="tile-name">${tile[1]}</span><div class="tokens">${list.filter(t=>(t.position||0)===idx).map(t=>`<i class="token" style="background:${esc(t.color)}" title="${esc(t.name)}"></i>`).join("")}</div>`;}
    b.appendChild(cell);
  }
}
async function startGame(){
  if(!teacher()||busy)return;
  const list=teams();if(!list.length){toast("ยังไม่มีทีม");return;}
  try{await roomRef.update({status:"game",activeTeamId:list[0].id,turnIndex:0,lastRoll:0});toast("เริ่มเกมแล้ว");}
  catch(e){toast("เริ่มเกมไม่สำเร็จ: "+e.message);}
}
async function rollDice(){
  if(!teacher()||busy)return;
  if(room.question){toast("ตรวจคำตอบก่อน");return;}
  const id=$("activeTeam").value,t=room.teams?.[id];if(!t){toast("เลือกทีมก่อน");return;}
  busy=true;
  try{
    const roll=1+Math.floor(Math.random()*6),pos=Math.min(BOARD.length-1,(t.position||0)+roll),tile=BOARD[pos];
    const updates={["teams/"+id+"/position"]:pos,activeTeamId:id,lastRoll:roll};
    if(tile[0]!=="start"){
      const pool=(window.ENERGY_QUESTIONS||[]).filter(q=>q.type===tile[0]);
      if(!pool.length){toast("ไม่มีคำถามประเภทนี้ใน questions.js");return;}
      const used=room.usedQuestions||{};
      const available=pool.filter(q=>{const i=window.ENERGY_QUESTIONS.indexOf(q);return !used[tile[0]+"_"+i];});
      const q=(available.length?available:pool)[Math.floor(Math.random()*(available.length||pool.length))];
      const qi=window.ENERGY_QUESTIONS.indexOf(q),qid="q"+Date.now();
      const publicQ={id:qid,type:q.type,category:q.category,q:q.q,points:q.points??0,teamId:id,teamName:t.name,usedKey:tile[0]+"_"+qi,move:q.move||0};
      // เฉลยเก็บแยก path ที่นักเรียนไม่มีสิทธิ์อ่าน
      await db.ref("answerKeys/"+roomCode+"/"+qid).set({answer:q.a||"",eventText:q.q||""});
      updates.question=publicQ;
    }
    await roomRef.update(updates);toast("ทอยได้ "+roll);
  }catch(e){console.error(e);toast("ทอยเต๋าไม่สำเร็จ: "+e.message);}
  finally{busy=false;}
}
function renderQuestion(){
  const q=room?.question;if(!q)return;
  currentQuestion=q;
  $("questionCategory").textContent=q.category||"คำถามพลังงาน";
  $("questionNumber").textContent="QUESTION • "+q.id.slice(-5);
  $("questionText").textContent=q.q;
  const isT=teacher(),myTurn=role==="student"&&q.teamId===myTeamId;
  $("teacherAnswer").classList.toggle("hidden",!isT);
  $("studentAnswer").classList.toggle("hidden",!myTurn);
  if(isT){
    $("answerKey").textContent=answerKey?"แนวคำตอบ: "+answerKey.answer+" • "+q.points+" คะแนน":"กำลังโหลดแนวคำตอบ...";
    const entries=Object.entries(currentSubmissions||{});
    $("answerArea").innerHTML=entries.length?entries.map(([tid,s])=>`<div class="submission-item"><b>${esc(room.teams?.[tid]?.name||"ทีม")}</b><p>${esc(s?.answer||"")}</p></div>`).join(""):'<div class="hint">รอคำตอบจากทีม...</div>';
  }
  if(myTurn){
    const submitted=currentSubmissions[myTeamId];
    $("submittedMessage").textContent=submitted?"ส่งคำตอบแล้ว: "+submitted.answer:"";
    $("submitAnswer").disabled=!!submitted;
  }
  $("questionModal").classList.remove("hidden");
}
async function submitAnswer(){
  const q=room?.question,answer=$("answerInput").value.trim();
  if(role!=="student"||!myTeamId||!q||q.teamId!==myTeamId){toast("ยังไม่ถึงตาทีมของคุณ");return;}
  if(!answer){toast("พิมพ์คำตอบก่อน");return;}
  if(currentSubmissions[myTeamId]){toast("ส่งคำตอบแล้ว");return;}
  try{
    await db.ref("submissions/"+roomCode+"/"+q.id+"/"+myTeamId).set({answer,uid:myUid,at:Date.now()});
    $("answerInput").value="";toast("ส่งคำตอบให้ครูแล้ว");
  }catch(e){console.error(e);toast("ส่งคำตอบไม่สำเร็จ: "+e.message);}
}
async function judge(correct){
  if(!teacher()||!room.question||busy)return;
  busy=true;const q=room.question,id=q.teamId,t=room.teams?.[id];
  if(!t){busy=false;toast("ไม่พบทีม");return;}
  try{
    const updates={question:null};
    if(correct)updates["teams/"+id+"/score"]=(t.score||0)+(q.points||0);
    if(q.move)updates["teams/"+id+"/position"]=Math.min(BOARD.length-1,(t.position||0)+q.move);
    if(q.usedKey)updates["usedQuestions/"+q.usedKey]=true;
    await roomRef.update(updates);
    await db.ref("answerKeys/"+roomCode+"/"+q.id).remove();
    toast(correct?"บันทึกคะแนนแล้ว":"บันทึกคำตอบไม่ถูกต้อง");
  }catch(e){console.error(e);toast("บันทึกผลไม่สำเร็จ: "+e.message);}
  finally{busy=false;}
}
async function nextTurn(){
  if(!teacher()||busy)return;if(room.question){toast("ตรวจคำตอบก่อนเปลี่ยนทีม");return;}
  const list=teams();if(!list.length)return;let i=list.findIndex(t=>t.id===room.activeTeamId);i=(i+1)%list.length;
  try{await roomRef.update({activeTeamId:list[i].id,lastRoll:0});}catch(e){toast("เปลี่ยนทีมไม่สำเร็จ");}
}
async function resetGame(){
  if(!teacher()||busy)return;if(!confirm("เริ่มเกมใหม่และล้างคะแนน/ตำแหน่งทุกทีมใช่หรือไม่?"))return;
  busy=true;
  try{
    const updates={lastRoll:0,question:null,usedQuestions:{},turnIndex:0};
    teams().forEach(t=>{updates["teams/"+t.id+"/position"]=0;updates["teams/"+t.id+"/score"]=0;});
    await roomRef.update(updates);toast("เริ่มเกมใหม่แล้ว");
  }catch(e){toast("รีเซ็ตไม่สำเร็จ: "+e.message);}
  finally{busy=false;}
}
async function closeRoom(){
  if(!teacher()||!confirm("ปิดห้องเกมนี้ใช่หรือไม่?"))return;
  try{await roomRef.update({status:"closed",question:null});toast("ปิดห้องแล้ว");}
  catch(e){toast("ปิดห้องไม่สำเร็จ");}
}
$("teacherStart").onclick=createRoom;
$("studentStart").onclick=joinRoom;
$("joinRoomBtn").onclick=joinTeam;
$("startGame").onclick=startGame;
$("rollDice").onclick=rollDice;
$("nextTurn").onclick=nextTurn;
$("resetGame").onclick=resetGame;
$("closeRoom").onclick=closeRoom;
$("submitAnswer").onclick=submitAnswer;
$("markCorrect").onclick=()=>judge(true);
$("markWrong").onclick=()=>judge(false);
$("closeQuestion").onclick=()=>{if(teacher())toast("ตรวจคำตอบก่อนปิดคำถาม");else $("questionModal").classList.add("hidden");};
$("copyCode").onclick=()=>navigator.clipboard?.writeText(roomCode).then(()=>toast("คัดลอกรหัสห้องแล้ว")).catch(()=>toast("คัดลอกไม่ได้"));
$("activeTeam").onchange=e=>{if(teacher()&&roomRef)roomRef.update({activeTeamId:e.target.value});};
