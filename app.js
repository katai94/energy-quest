const $ = id => document.getElementById(id);
const COLORS = ["#8fe3b0","#ffd36a","#85b8ff","#e6a0ff","#ff9c82","#a6e56d"];
const ICONS = {start:"⚡",question:"🔋",save:"🌱",luck:"🎁",challenge:"🚀"};
const TYPES = ["question","save","luck","challenge"];
const BOARD = [
 ["start","START"],["question","พลังงาน"],["save","ประหยัด"],["question","พลังงาน"],["luck","เสี่ยงโชค"],["question","พลังงาน"],
 ["question","พลังงาน"],["save","ประหยัด"],["question","พลังงาน"],["challenge","ท้าทาย"],["save","ประหยัด"],["question","พลังงาน"],
 ["question","พลังงาน"],["luck","เสี่ยงโชค"],["save","ประหยัด"],["question","พลังงาน"],["question","พลังงาน"],["save","ประหยัด"],
 ["save","ประหยัด"],["question","พลังงาน"],["challenge","ท้าทาย"],["question","พลังงาน"],["luck","เสี่ยงโชค"],["question","พลังงาน"]
];
let db=null, roomRef=null, room=null, roomCode="", role="", myTeamId="", unsubscribe=null, currentQuestion=null;
const validConfig = window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey && !window.FIREBASE_CONFIG.apiKey.startsWith("ใส่-");
if(validConfig){firebase.initializeApp(window.FIREBASE_CONFIG);db=firebase.database();$("connectionText").textContent="เชื่อมต่อระบบออนไลน์";}
else $("connectionText").textContent="โหมดเตรียมตั้งค่า Firebase";

function show(view){["homeView","lobbyView","gameView"].forEach(id=>$(id).classList.toggle("hidden",id!==view));}
function toast(msg){$("toast").textContent=msg;$("toast").classList.add("show");setTimeout(()=>$("toast").classList.remove("show"),2600);}
function code(){return String(Math.floor(100000+Math.random()*900000));}
function needFirebase(){if(!db){toast("กรุณาตั้งค่า Firebase ก่อนใช้งานออนไลน์ ดู README");return false;}return true;}
function subscribe(){
 if(unsubscribe) roomRef.off("value",unsubscribe);
 unsubscribe=snap=>{room=snap.val();if(!room){toast("ไม่พบห้องเกม");show("homeView");return;}render();};
 roomRef.on("value",unsubscribe);
}
function teamArray(){return Object.entries(room?.teams||{}).map(([id,t])=>({id,...t}));}
function createRoom(){
 if(!needFirebase())return;
 role="teacher";roomCode=code();roomRef=db.ref("rooms/"+roomCode);
 const initial={status:"lobby",createdAt:Date.now(),teams:{},turnIndex:0,activeTeamId:"",lastRoll:0,question:null,boardSize:BOARD.length};
 roomRef.set(initial).then(()=>{subscribe();$("roomCodeLabel").textContent=roomCode;$("teacherLobbyControls").classList.remove("hidden");$("studentJoinForm").classList.add("hidden");$("lobbyTitle").textContent="ห้องเกมของคุณพร้อมแล้ว";$("lobbyInstructions").textContent="แชร์รหัสห้องให้นักเรียน แล้วรอทีมเข้าร่วม";show("lobbyView");});
}
function joinRoom(){
 if(!needFirebase())return;
 const c=$("joinCode").value.trim();if(!/^\d{6}$/.test(c)){toast("กรอกรหัสห้อง 6 หลัก");return;}
 role="student";roomCode=c;roomRef=db.ref("rooms/"+roomCode);
 roomRef.once("value").then(s=>{if(!s.exists()){toast("ไม่พบรหัสห้องนี้");return;}if(s.val().status==="closed"){toast("ห้องนี้ปิดแล้ว");return;}
 $("roomCodeLabel").textContent=roomCode;$("teacherLobbyControls").classList.add("hidden");$("studentJoinForm").classList.remove("hidden");$("lobbyTitle").textContent="เข้าร่วมทีม";$("lobbyInstructions").textContent="กรอกชื่อทีมและสมาชิกเพื่อเข้าร่วมเกม";subscribe();show("lobbyView");});
}
function joinTeam(){
 const name=$("teamName").value.trim(),members=$("memberNames").value.split(",").map(x=>x.trim()).filter(Boolean);
 if(!name){toast("กรอกชื่อทีมก่อน");return;}if(members.length<1){toast("กรอกชื่อสมาชิกอย่างน้อย 1 คน");return;}if(members.length>6){toast("ทีมละไม่เกิน 6 คน");return;}if(teamArray().some(t=>t.name.toLowerCase()===name.toLowerCase())){toast("มีชื่อทีมนี้แล้ว กรุณาใช้ชื่ออื่น");return;}
 const id="t"+Date.now().toString(36)+Math.random().toString(36).slice(2,5);myTeamId=id;
 roomRef.child("teams/"+id).set({name,members,position:0,score:0,color:COLORS[Object.keys(room.teams||{}).length%COLORS.length],joinedAt:Date.now()}).then(()=>{toast("เข้าร่วมทีมสำเร็จ");$("studentJoinForm").classList.add("hidden");});
}
function render(){
 if(!room)return;
 $("roomCodeLabel").textContent=roomCode;$("gameRoomCode").textContent=roomCode;
 const teams=teamArray();
 $("teamCount").textContent=teams.length+" ทีม";
 $("teamList").innerHTML=teams.length?teams.map(t=>`<div class="team-item"><span><i class="team-dot" style="background:${t.color}"></i>${esc(t.name)}</span><small>${(t.members||[]).length} คน</small></div>`).join(""):'<div class="empty">กำลังรอทีมเข้าร่วม...</div>';
 $("startGame").disabled=teams.length<1;
 if(room.status==="game"){show("gameView");$("teacherControls").classList.toggle("hidden",role!=="teacher");$("studentControls").classList.toggle("hidden",role!=="student");}
 if(room.status==="lobby")show("lobbyView");
 if(room.status==="closed"){show("homeView");toast("ห้องเกมถูกปิดแล้ว");return;}
 renderScores(teams);renderBoard(teams);renderTeamSelect(teams);
 const active=teams.find(t=>t.id===room.activeTeamId);
 $("turnLabel").textContent=active?"ตาของ "+active.name:"รอเลือกทีม";
 $("diceResult").textContent=room.lastRoll?`ได้ ${room.lastRoll} แต้ม`:"พร้อมทอยเต๋า";
 $("diceFace").textContent=room.lastRoll?["⚀","⚁","⚂","⚃","⚄","⚅"][room.lastRoll-1]:"⚄";
 if(room.question)openQuestionUI(room.question);
 else $("questionModal").classList.add("hidden");
 if(role==="student")$("studentStatus").textContent=room.question?(room.question.submissions?.[myTeamId]?"ส่งคำตอบแล้ว รอครูตรวจ":"กำลังเปิดคำถาม: "+room.question.teamName):"รอครูเปิดคำถาม...";
}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function renderScores(teams){$("scoreList").innerHTML=teams.sort((a,b)=>(b.score||0)-(a.score||0)).map((t,i)=>`<div class="score-row"><span class="score-name"><i class="team-dot" style="background:${t.color}"></i><span>${i===0?"👑 ":""}${esc(t.name)}<small>${t.position||0}/${BOARD.length-1} ช่อง</small></span></span><strong>${t.score||0}</strong></div>`).join("")||'<div class="empty">ยังไม่มีทีม</div>';}
function renderTeamSelect(teams){const sel=$("activeTeam");const old=sel.value;sel.innerHTML=teams.map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join("");if(teams.some(t=>t.id===old))sel.value=old;else if(room.activeTeamId)sel.value=room.activeTeamId;}
function renderBoard(teams){
 const b=$("board");b.innerHTML="";
 // Arrange 24 spaces around a 6x6 perimeter, clockwise
 const coords=[];for(let c=0;c<6;c++)coords.push([0,c]);for(let r=1;r<6;r++)coords.push([r,5]);for(let c=4;c>=0;c--)coords.push([5,c]);for(let r=4;r>0;r--)coords.push([r,0]);
 const map={};coords.forEach((p,i)=>map[p.join(",")]=i);
 for(let r=0;r<6;r++)for(let c=0;c<6;c++){
  const idx=map[[r,c].join(",")];const tile=idx===undefined?null:BOARD[idx];const cell=document.createElement("div");
  if(!tile){cell.className="tile center-tile";if(r===2&&c===2){cell.style.gridArea="2 / 2 / 5 / 6";cell.style.background="radial-gradient(circle,#155447,#082b2b)";cell.style.border="1px solid #a2e9b533";cell.innerHTML='<div style="text-align:center;margin:auto"><div style="font-size:clamp(22px,4vw,44px)">🌍</div><b style="font:600 clamp(13px,2vw,21px) Kanit;color:#d5f36a">ENERGY QUEST</b><div style="font-size:11px;color:#a7c6b9;margin-top:6px">คิด • เล่น • เปลี่ยนโลก</div></div>';}else cell.style.visibility="hidden";
  }else{
   cell.className="tile "+tile[0];cell.innerHTML=`<span class="tile-num">${String(idx+1).padStart(2,"0")}</span><span class="tile-icon">${ICONS[tile[0]]}</span><span class="tile-name">${tile[1]}</span><div class="tokens">${teams.filter(t=>(t.position||0)===idx).map(t=>`<i class="token" style="background:${t.color}" title="${esc(t.name)}"></i>`).join("")}</div>`;
  }b.appendChild(cell);
 }
}
function startGame(){const teams=teamArray();if(!teams.length)return;const id=teams[0].id;roomRef.update({status:"game",activeTeamId:id,turnIndex:0});}
function rollDice(){
 const id=$("activeTeam").value;if(!id){toast("ยังไม่มีทีม");return;}
 const roll=Math.floor(Math.random()*6)+1;const t=room.teams[id];const pos=Math.min(BOARD.length-1,(t.position||0)+roll);const tile=BOARD[pos];
 roomRef.child("teams/"+id).update({position:pos});
 roomRef.update({activeTeamId:id,lastRoll:roll});
 if(tile[0]==="luck"||tile[0]==="challenge"||tile[0]==="question"||tile[0]==="save"){
  const pool=window.ENERGY_QUESTIONS.filter(q=>q.type===tile[0]);const used=room.usedQuestions||{};const available=pool.filter((q,i)=>!used[tile[0]+"_"+i]);const q=available.length?available[Math.floor(Math.random()*available.length)]:pool[Math.floor(Math.random()*pool.length)];
  const qi=window.ENERGY_QUESTIONS.indexOf(q);const question={...q,points:tile[0]==="challenge"?roll*2:q.points,id:"q"+Date.now(),teamId:id,teamName:t.name,usedKey:tile[0]+"_"+qi,submissions:{}};
  roomRef.update({question});toast("ตกช่อง "+tile[1]+" — เปิดคำถามแล้ว");
 }
}
function openQuestionUI(q){
 currentQuestion=q;$("questionCategory").textContent=q.category;$("questionNumber").textContent="QUESTION • "+q.id.slice(-5);$("questionText").textContent=q.q;
 const isTeacher=role==="teacher";$("teacherAnswer").classList.toggle("hidden",!isTeacher);$("studentAnswer").classList.toggle("hidden",isTeacher);
 $("answerArea").innerHTML=isTeacher?"":"";$("answerKey").textContent="แนวคำตอบ: "+q.a+(q.points>0?" • "+q.points+" คะแนน":"");
 if(!isTeacher){const sub=q.submissions?.[myTeamId];$("submittedMessage").textContent=sub?"ส่งแล้ว: "+sub.answer:"";$("submitAnswer").disabled=!!sub;}
 $("questionModal").classList.remove("hidden");
}
function submitAnswer(){const answer=$("answerInput").value.trim();if(!answer||!currentQuestion)return;roomRef.child("question/submissions/"+myTeamId).set({answer,at:Date.now()}).then(()=>{toast("ส่งคำตอบแล้ว");$("answerInput").value="";});}
function judge(correct){
 if(!currentQuestion)return;const q=currentQuestion;const teamId=q.teamId;const updates={question:null};
 if(correct){const old=room.teams[teamId].score||0;updates["teams/"+teamId+"/score"]=old+q.points;}
 if(q.usedKey){updates["usedQuestions/"+q.usedKey]=true;}
 if(q.move){const oldPos=room.teams[teamId].position||0;updates["teams/"+teamId+"/position"]=Math.min(BOARD.length-1,oldPos+q.move);}
 roomRef.update(updates).then(()=>toast(correct?"บันทึกคะแนนแล้ว":"บันทึกคำตอบไม่ถูกต้อง"));
}
function nextTurn(){const teams=teamArray();if(!teams.length)return;let i=teams.findIndex(t=>t.id===room.activeTeamId);i=(i+1)%teams.length;roomRef.update({activeTeamId:teams[i].id,lastRoll:0,question:null});$("activeTeam").value=teams[i].id;}
function resetGame(){if(!confirm("เริ่มเกมใหม่และล้างคะแนน/ตำแหน่งทุกทีมใช่หรือไม่?"))return;const teams={};teamArray().forEach(t=>teams[t.id]={...t,position:0,score:0});roomRef.update({teams,turnIndex:0,lastRoll:0,question:null,usedQuestions:{}});}
function closeRoom(){if(confirm("ปิดห้องเกมนี้ใช่หรือไม่?"))roomRef.update({status:"closed"});}
$("teacherStart").onclick=createRoom;$("studentStart").onclick=joinRoom;$("joinRoomBtn").onclick=joinTeam;$("startGame").onclick=startGame;$("rollDice").onclick=rollDice;$("nextTurn").onclick=nextTurn;$("resetGame").onclick=resetGame;$("closeRoom").onclick=closeRoom;$("submitAnswer").onclick=submitAnswer;$("markCorrect").onclick=()=>judge(true);$("markWrong").onclick=()=>judge(false);
$("closeQuestion").onclick=()=>{if(role==="teacher")toast("ตรวจคำตอบก่อนปิดคำถาม");else $("questionModal").classList.add("hidden");};
$("copyCode").onclick=()=>navigator.clipboard?.writeText(roomCode).then(()=>toast("คัดลอกรหัสห้องแล้ว"));
$("activeTeam").onchange=e=>roomRef.update({activeTeamId:e.target.value});
