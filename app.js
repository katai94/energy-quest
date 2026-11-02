
const $ = id => document.getElementById(id);

const COLORS = [
  "#8fe3b0", "#ffd36a", "#85b8ff",
  "#e6a0ff", "#ff9c82", "#a6e56d"
];

const ICONS = {
  start: "⚡",
  question: "🔋",
  save: "🌱",
  luck: "🎁",
  challenge: "🚀"
};

const BOARD = [
  ["start", "START"],
  ["question", "พลังงาน"],
  ["save", "ประหยัด"],
  ["question", "พลังงาน"],
  ["luck", "เสี่ยงโชค"],
  ["question", "พลังงาน"],
  ["question", "พลังงาน"],
  ["save", "ประหยัด"],
  ["question", "พลังงาน"],
  ["challenge", "ท้าทาย"],
  ["save", "ประหยัด"],
  ["question", "พลังงาน"],
  ["question", "พลังงาน"],
  ["luck", "เสี่ยงโชค"],
  ["save", "ประหยัด"],
  ["question", "พลังงาน"],
  ["question", "พลังงาน"],
  ["save", "ประหยัด"],
  ["save", "ประหยัด"],
  ["question", "พลังงาน"],
  ["challenge", "ท้าทาย"],
  ["question", "พลังงาน"],
  ["luck", "เสี่ยงโชค"],
  ["question", "พลังงาน"]
];

let db = null;
let auth = null;
let roomRef = null;
let room = null;
let roomCode = "";
let role = "";
let myTeamId = "";
let myUid = "";
let unsubscribe = null;
let currentQuestion = null;
let busy = false;

// =====================================
// FIREBASE INITIALIZATION
// =====================================

const validConfig =
  window.FIREBASE_CONFIG &&
  window.FIREBASE_CONFIG.apiKey &&
  !window.FIREBASE_CONFIG.apiKey.startsWith("ใส่-");

if (validConfig) {
  firebase.initializeApp(window.FIREBASE_CONFIG);

  db = firebase.database();
  auth = firebase.auth();

  auth.onAuthStateChanged(user => {
    if (user) {
      myUid = user.uid;
      $("connectionText").textContent = "เชื่อมต่อระบบออนไลน์แล้ว";
    } else {
      $("connectionText").textContent = "กำลังยืนยันตัวตน...";
    }
  });
} else {
  $("connectionText").textContent = "กรุณาตั้งค่า Firebase";
}

// =====================================
// BASIC FUNCTIONS
// =====================================

function show(view) {
  ["homeView", "lobbyView", "gameView"].forEach(id => {
    $(id).classList.toggle("hidden", id !== view);
  });
}

function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("show");

  setTimeout(() => {
    $("toast").classList.remove("show");
  }, 2600);
}

function code() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function needFirebase() {
  if (!db || !auth) {
    toast("กรุณาตั้งค่า Firebase ก่อนใช้งาน");
    return false;
  }
  return true;
}

async function ensureSignedIn() {
  if (!auth) {
    throw new Error("ไม่พบ Firebase Authentication");
  }

  if (auth.currentUser) {
    myUid = auth.currentUser.uid;
    return auth.currentUser;
  }

  const result = await auth.signInAnonymously();
  myUid = result.user.uid;

  return result.user;
}

function isTeacher() {
  return role === "teacher" &&
    !!room &&
    room.teacherUid === myUid;
}

function teamArray() {
  return Object.entries(room?.teams || {}).map(([id, team]) => ({
    id,
    ...team
  }));
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function stopSubscription() {
  if (roomRef && unsubscribe) {
    roomRef.off("value", unsubscribe);
  }
  unsubscribe = null;
}

function subscribe() {
  stopSubscription();

  unsubscribe = snapshot => {
    room = snapshot.val();

    if (!room) {
      toast("ไม่พบห้องเกม");
      show("homeView");
      return;
    }

    render();
  };

  roomRef.on("value", unsubscribe);
}

// =====================================
// CREATE ROOM - TEACHER
// =====================================

async function createRoom() {
  if (!needFirebase() || busy) return;

  busy = true;

  try {
    const user = await ensureSignedIn();

    role = "teacher";
    roomCode = code();
    roomRef = db.ref("rooms/" + roomCode);

    const initial = {
      status: "lobby",
      teacherUid: user.uid,
      createdAt: Date.now(),
      teams: {},
      turnIndex: 0,
      activeTeamId: "",
      lastRoll: 0,
      question: null,
      usedQuestions: {},
      boardSize: BOARD.length
    };

    await roomRef.set(initial);

    subscribe();

    $("roomCodeLabel").textContent = roomCode;
    $("teacherLobbyControls").classList.remove("hidden");
    $("studentJoinForm").classList.add("hidden");

    $("lobbyTitle").textContent = "ห้องเกมของคุณพร้อมแล้ว";
    $("lobbyInstructions").textContent =
      "แชร์รหัสห้องให้นักเรียน แล้วรอทีมเข้าร่วม";

    show("lobbyView");
    toast("สร้างห้องเกมสำเร็จ");

  } catch (error) {
    console.error(error);
    toast("สร้างห้องไม่สำเร็จ: " + error.message);
  } finally {
    busy = false;
  }
}

// =====================================
// JOIN ROOM - STUDENT
// =====================================

async function joinRoom() {
  if (!needFirebase() || busy) return;

  const enteredCode = $("joinCode").value.trim();

  if (!/^\d{6}$/.test(enteredCode)) {
    toast("กรอกรหัสห้อง 6 หลัก");
    return;
  }

  busy = true;

  try {
    await ensureSignedIn();

    roomCode = enteredCode;
    roomRef = db.ref("rooms/" + roomCode);

    const snapshot = await roomRef.once("value");

    if (!snapshot.exists()) {
      toast("ไม่พบรหัสห้องนี้");
      return;
    }

    const data = snapshot.val();

    if (data.status !== "lobby") {
      toast("ห้องนี้ไม่ได้อยู่ในช่วงรับสมัครทีม");
      return;
    }

    role = "student";
    myTeamId = "";

    $("roomCodeLabel").textContent = roomCode;
    $("teacherLobbyControls").classList.add("hidden");
    $("studentJoinForm").classList.remove("hidden");

    $("lobbyTitle").textContent = "เข้าร่วมทีม";
    $("lobbyInstructions").textContent =
      "กรอกชื่อทีมและสมาชิกเพื่อเข้าร่วมเกม";

    subscribe();
    show("lobbyView");

  } catch (error) {
    console.error(error);
    toast("เข้าห้องไม่สำเร็จ: " + error.message);
  } finally {
    busy = false;
  }
}

// =====================================
// JOIN TEAM - STUDENT
// =====================================

async function joinTeam() {
  if (!roomRef || role !== "student" || busy) return;

  const name = $("teamName").value.trim();

  const members = $("memberNames").value
    .split(",")
    .map(name => name.trim())
    .filter(Boolean);

  if (!name) {
    toast("กรอกชื่อทีมก่อน");
    return;
  }

  if (members.length < 4 || members.length > 6) {
    toast("สมาชิกในทีมต้องมี 4–6 คน");
    return;
  }

  if (teamArray().some(team =>
    team.name.toLowerCase() === name.toLowerCase()
  )) {
    toast("มีชื่อทีมนี้แล้ว กรุณาใช้ชื่ออื่น");
    return;
  }

  if (room.status !== "lobby") {
    toast("ห้องนี้ปิดรับทีมแล้ว");
    return;
  }

  busy = true;

  try {
    const user = await ensureSignedIn();

    const id = "t" +
      Date.now().toString(36) +
      Math.random().toString(36).slice(2, 7);

    const teamData = {
      name,
      members,
      uid: user.uid,
      position: 0,
      score: 0,
      color: COLORS[teamArray().length % COLORS.length],
      joinedAt: Date.now()
    };

    await roomRef.child("teams/" + id).set(teamData);

    myTeamId = id;

    $("studentJoinForm").classList.add("hidden");

    toast("เข้าร่วมทีมสำเร็จ");

  } catch (error) {
    console.error(error);
    toast("เข้าร่วมทีมไม่สำเร็จ: " + error.message);
  } finally {
    busy = false;
  }
}

// =====================================
// RENDER ROOM
// =====================================

function render() {
  if (!room) return;

  $("roomCodeLabel").textContent = roomCode;
  $("gameRoomCode").textContent = roomCode;

  const teams = teamArray();

  $("teamCount").textContent = teams.length + " ทีม";

  $("teamList").innerHTML = teams.length
    ? teams.map(team => `
      <div class="team-item">
        <span>
          <i class="team-dot" style="background:${team.color}"></i>
          ${esc(team.name)}
        </span>
        <small>${(team.members || []).length} คน</small>
      </div>
    `).join("")
    : '<div class="empty">กำลังรอทีมเข้าร่วม...</div>';

  $("startGame").disabled =
    !isTeacher() || teams.length < 1;

  $("teacherLobbyControls").classList.toggle(
    "hidden",
    !isTeacher()
  );

  $("studentJoinForm").classList.toggle(
    "hidden",
    role !== "student" || !!myTeamId
  );

  if (room.status === "lobby") {
    show("lobbyView");
  }

  if (room.status === "game") {
    show("gameView");

    $("teacherControls").classList.toggle(
      "hidden",
      !isTeacher()
    );

    $("studentControls").classList.toggle(
      "hidden",
      role !== "student"
    );
  }

  if (room.status === "closed") {
    show("homeView");
    $("questionModal").classList.add("hidden");
    toast("ห้องเกมถูกปิดแล้ว");
    return;
  }

  renderScores(teams);
  renderBoard(teams);
  renderTeamSelect(teams);

  const active = teams.find(team =>
    team.id === room.activeTeamId
  );

  $("turnLabel").textContent = active
    ? "ตาของ " + active.name
    : "รอเลือกทีม";

  $("diceResult").textContent = room.lastRoll
    ? `ได้ ${room.lastRoll} แต้ม`
    : "พร้อมทอยเต๋า";

  $("diceFace").textContent = room.lastRoll
    ? ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"][room.lastRoll - 1]
    : "⚄";

  if (room.question) {
    openQuestionUI(room.question);
  } else {
    $("questionModal").classList.add("hidden");
    currentQuestion = null;
  }

  if (role === "student") {
    const isMyTeam = room.question?.teamId === myTeamId;
    const submitted = room.question?.submissions?.[myTeamId];

    $("studentStatus").textContent = !room.question
      ? "รอครูเปิดคำถาม..."
      : isMyTeam
        ? (submitted ? "ส่งคำตอบแล้ว รอครูตรวจ" : "ถึงตาทีมของคุณ")
        : "กำลังเล่นทีมอื่น รอคิวทีมของคุณ";
  }
}

// =====================================
// SCOREBOARD
// =====================================

function renderScores(teams) {
  const sorted = [...teams].sort(
    (a, b) => (b.score || 0) - (a.score || 0)
  );

  $("scoreList").innerHTML = sorted.length
    ? sorted.map((team, index) => `
      <div class="score-row">
        <span class="score-name">
          <i class="team-dot" style="background:${team.color}"></i>
          <span>
            ${index === 0 ? "👑 " : ""}
            ${esc(team.name)}
            <small>${team.position || 0}/${BOARD.length - 1} ช่อง</small>
          </span>
        </span>
        <strong>${team.score || 0}</strong>
      </div>
    `).join("")
    : '<div class="empty">ยังไม่มีทีม</div>';
}

function renderTeamSelect(teams) {
  const select = $("activeTeam");
  const oldValue = select.value;

  select.innerHTML = teams.map(team => `
    <option value="${team.id}">${esc(team.name)}</option>
  `).join("");

  if (teams.some(team => team.id === oldValue)) {
    select.value = oldValue;
  } else if (room.activeTeamId) {
    select.value = room.activeTeamId;
  }
}

// =====================================
// GAME BOARD
// =====================================

function renderBoard(teams) {
  const board = $("board");
  board.innerHTML = "";

  const coords = [];

  for (let c = 0; c < 6; c++) coords.push([0, c]);
  for (let r = 1; r < 6; r++) coords.push([r, 5]);
  for (let c = 4; c >= 0; c--) coords.push([5, c]);
  for (let r = 4; r > 0; r--) coords.push([r, 0]);

  const map = {};

  coords.forEach((point, index) => {
    map[point.join(",")] = index;
  });

  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 6; c++) {
      const index = map[[r, c].join(",")];
      const tile = index === undefined ? null : BOARD[index];
      const cell = document.createElement("div");

      if (!tile) {
        cell.className = "tile center-tile";

        if (r === 2 && c === 2) {
          cell.style.gridArea = "2 / 2 / 5 / 6";
          cell.style.background =
            "radial-gradient(circle,#155447,#082b2b)";
          cell.style.border = "1px solid #a2e9b533";

          cell.innerHTML = `
            <div style="text-align:center;margin:auto">
              <div style="font-size:clamp(22px,4vw,44px)">🌍</div>
              <b style="font:600 clamp(13px,2vw,21px) Kanit;color:#d5f36a">
                ENERGY QUEST
              </b>
              <div style="font-size:11px;color:#a7c6b9;margin-top:6px">
                คิด • เล่น • เปลี่ยนโลก
              </div>
            </div>
          `;
        } else {
          cell.style.visibility = "hidden";
        }

      } else {
        cell.className = "tile " + tile[0];

        cell.innerHTML = `
          <span class="tile-num">
            ${String(index + 1).padStart(2, "0")}
          </span>
          <span class="tile-icon">${ICONS[tile[0]]}</span>
          <span class="tile-name">${tile[1]}</span>
          <div class="tokens">
            ${teams
              .filter(team => (team.position || 0) === index)
              .map(team => `
                <i class="token"
                  style="background:${team.color}"
                  title="${esc(team.name)}">
                </i>
              `).join("")}
          </div>
        `;
      }

      board.appendChild(cell);
    }
  }
}

// =====================================
// START GAME
// =====================================

async function startGame() {
  if (!isTeacher() || !roomRef) return;

  const teams = teamArray();

  if (!teams.length) {
    toast("ยังไม่มีทีมเข้าร่วม");
    return;
  }

  try {
    await roomRef.update({
      status: "game",
      activeTeamId: teams[0].id,
      turnIndex: 0,
      lastRoll: 0,
      question: null
    });

    toast("เริ่มเกมแล้ว");

  } catch (error) {
    console.error(error);
    toast("เริ่มเกมไม่สำเร็จ");
  }
}

// =====================================
// ROLL DICE
// =====================================

async function rollDice() {
  if (!isTeacher() || !roomRef || busy) return;

  if (room.question) {
    toast("กรุณาตรวจคำตอบก่อน");
    return;
  }

  const id = $("activeTeam").value;

  if (!id || !room.teams?.[id]) {
    toast("ยังไม่มีทีม");
    return;
  }

  busy = true;

  try {
    const roll = Math.floor(Math.random() * 6) + 1;
    const team = room.teams[id];

    const position = Math.min(
      BOARD.length - 1,
      (team.position || 0) + roll
    );

    const tile = BOARD[position];

    const updates = {
      ["teams/" + id + "/position"]: position,
      activeTeamId: id,
      lastRoll: roll
    };

    const pool = (window.ENERGY_QUESTIONS || [])
      .filter(question => question.type === tile[0]);

    if (pool.length > 0) {
      const used = room.usedQuestions || {};

      const available = pool.filter((question, index) => {
        const questionIndex = window.ENERGY_QUESTIONS.indexOf(question);
        return !used[tile[0] + "_" + questionIndex];
      });

      const question = available.length
        ? available[Math.floor(Math.random() * available.length)]
        : pool[Math.floor(Math.random() * pool.length)];

      const questionIndex =
        window.ENERGY_QUESTIONS.indexOf(question);

      const questionData = {
        ...question,
        points: tile[0] === "challenge"
          ? roll * 2
          : question.points,
        id: "q" + Date.now(),
        teamId: id,
        teamName: team.name,
        usedKey: tile[0] + "_" + questionIndex,
        submissions: {}
      };

      updates.question = questionData;
    }

    await roomRef.update(updates);

    toast("ทอยได้ " + roll + " แต้ม");

  } catch (error) {
    console.error(error);
    toast("ทอยเต๋าไม่สำเร็จ");
  } finally {
    busy = false;
  }
}

// =====================================
// QUESTION MODAL
// =====================================

function openQuestionUI(question) {
  currentQuestion = question;

  $("questionCategory").textContent = question.category || "คำถามพลังงาน";
  $("questionNumber").textContent =
    "QUESTION • " + question.id.slice(-5);

  $("questionText").textContent = question.q;

  const teacher = isTeacher();
  const myTurn = role === "student" &&
    question.teamId === myTeamId;

  $("teacherAnswer").classList.toggle("hidden", !teacher);
  $("studentAnswer").classList.toggle("hidden", !myTurn);

  $("answerArea").innerHTML = "";

  $("answerKey").textContent = teacher
    ? "แนวคำตอบ: " + question.a +
      (question.points > 0 ? " • " + question.points + " คะแนน" : "")
    : "";

  if (myTurn) {
    const submission = question.submissions?.[myTeamId];

    $("submittedMessage").textContent = submission
      ? "ส่งแล้ว: " + submission.answer
      : "";

    $("submitAnswer").disabled = !!submission;
  }

  $("markCorrect").disabled = !teacher;
  $("markWrong").disabled = !teacher;

  $("questionModal").classList.remove("hidden");
}

// =====================================
// STUDENT SUBMIT ANSWER
// =====================================

async function submitAnswer() {
  if (
    role !== "student" ||
    !myTeamId ||
    !currentQuestion ||
    currentQuestion.teamId !== myTeamId
  ) {
    toast("ยังไม่ถึงตาทีมของคุณ");
    return;
  }

  const answer = $("answerInput").value.trim();

  if (!answer) {
    toast("กรุณาพิมพ์คำตอบ");
    return;
  }

  if (currentQuestion.submissions?.[myTeamId]) {
    toast("ทีมของคุณส่งคำตอบแล้ว");
    return;
  }

  try {
    await roomRef
      .child("question/submissions/" + myTeamId)
      .set({
        answer,
        uid: myUid,
        at: Date.now()
      });

    $("answerInput").value = "";
    toast("ส่งคำตอบแล้ว");

  } catch (error) {
    console.error(error);
    toast("ส่งคำตอบไม่สำเร็จ");
  }
}

// =====================================
// TEACHER JUDGE ANSWER
// =====================================

async function judge(correct) {
  if (!isTeacher() || !currentQuestion || busy) return;

  const question = currentQuestion;
  const teamId = question.teamId;

  if (!room.teams?.[teamId]) {
    toast("ไม่พบทีมที่กำลังตอบคำถาม");
    return;
  }

  busy = true;

  try {
    const updates = {
      question: null
    };

    if (correct) {
      const oldScore = room.teams[teamId].score || 0;

      updates["teams/" + teamId + "/score"] =
        oldScore + (question.points || 0);
    }

    if (question.usedKey) {
      updates["usedQuestions/" + question.usedKey] = true;
    }

    if (question.move) {
      const oldPosition = room.teams[teamId].position || 0;

      updates["teams/" + teamId + "/position"] =
        Math.min(
          BOARD.length - 1,
          oldPosition + question.move
        );
    }

    await roomRef.update(updates);

    toast(correct
      ? "บันทึกคะแนนแล้ว"
      : "บันทึกคำตอบไม่ถูกต้อง"
    );

  } catch (error) {
    console.error(error);
    toast("ตรวจคำตอบไม่สำเร็จ");
  } finally {
    busy = false;
  }
}

// =====================================
// NEXT TURN
// =====================================

async function nextTurn() {
  if (!isTeacher() || !roomRef) return;

  if (room.question) {
    toast("กรุณาตรวจคำตอบก่อนเปลี่ยนทีม");
    return;
  }

  const teams = teamArray();

  if (!teams.length) return;

  let index = teams.findIndex(team =>
    team.id === room.activeTeamId
  );

  index = (index + 1) % teams.length;

  try {
    await roomRef.update({
      activeTeamId: teams[index].id,
      lastRoll: 0,
      question: null
    });

  } catch (error) {
    console.error(error);
    toast("เปลี่ยนทีมไม่สำเร็จ");
  }
}

// =====================================
// RESET GAME
// =====================================

async function resetGame() {
  if (!isTeacher() || !roomRef) return;

  if (!confirm("เริ่มเกมใหม่และล้างคะแนน/ตำแหน่งทุกทีมใช่หรือไม่?")) {
    return;
  }

  const teams = {};

  teamArray().forEach(team => {
    teams[team.id] = {
      ...team,
      position: 0,
      score: 0
    };
  });

  try {
    await roomRef.update({
      teams,
      turnIndex: 0,
      lastRoll: 0,
      question: null,
      usedQuestions: {}
    });

    toast("เริ่มเกมใหม่แล้ว");

  } catch (error) {
    console.error(error);
    toast("เริ่มเกมใหม่ไม่สำเร็จ");
  }
}

// =====================================
// CLOSE ROOM
// =====================================

async function closeRoom() {
  if (!isTeacher() || !roomRef) return;

  if (!confirm("ปิดห้องเกมนี้ใช่หรือไม่?")) return;

  try {
    await roomRef.update({
      status: "closed",
      question: null
    });

    stopSubscription();
    toast("ปิดห้องเกมแล้ว");

  } catch (error) {
    console.error(error);
    toast("ปิดห้องไม่สำเร็จ");
  }
}

// =====================================
// BUTTON EVENTS
// =====================================

$("teacherStart").onclick = createRoom;
$("studentStart").onclick = joinRoom;
$("joinRoomBtn").onclick = joinTeam;

$("startGame").onclick = startGame;
$("rollDice").onclick = rollDice;
$("nextTurn").onclick = nextTurn;
$("resetGame").onclick = resetGame;
$("closeRoom").onclick = closeRoom;

$("submitAnswer").onclick = submitAnswer;

$("markCorrect").onclick = () => judge(true);
$("markWrong").onclick = () => judge(false);

$("closeQuestion").onclick = () => {
  if (isTeacher()) {
    toast("กรุณาตรวจคำตอบก่อนปิดคำถาม");
  } else {
    $("questionModal").classList.add("hidden");
  }
};

$("copyCode").onclick = async () => {
  try {
    await navigator.clipboard.writeText(roomCode);
    toast("คัดลอกรหัสห้องแล้ว");
  } catch (error) {
    toast("ไม่สามารถคัดลอกรหัสได้");
  }
};

$("activeTeam").onchange = event => {
  if (!isTeacher() || !roomRef) return;

  roomRef.update({
    activeTeamId: event.target.value
  });
};
