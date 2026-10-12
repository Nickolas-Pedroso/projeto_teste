const socket = io(window.GAMECHAT_SERVER_URL);
const $ = (id) => document.getElementById(id);
const joinScreen = $("join-screen");
const app = $("app");
const usersEl = $("users");
const messagesEl = $("messages");
const video = $("screen-video");
const placeholder = $("video-placeholder");
const shareStatus = $("share-status");
const shareBtn = $("share-btn");
const inviteBtn = $("invite-btn");

let myId = null;
let myName = "Visitante";
let currentRoom = "";
let peers = new Map();
let connections = new Map();
let localScreen = null;
let screenOwnerId = null;
let screenOwnerName = "";
let toastTimer = null;

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 3500);
}
function addSystem(text) {
  const el = document.createElement("div");
  el.className = "system-message";
  el.textContent = text;
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}
function addMessage({ id, username, text, at }) {
  const welcome = messagesEl.querySelector(".welcome");
  if (welcome) welcome.remove();
  const row = document.createElement("div");
  row.className = "message";
  const avatar = document.createElement("span");
  avatar.className = "avatar";
  avatar.textContent = (username || "?").slice(0, 1).toUpperCase();
  const body = document.createElement("div");
  body.className = "message-body";
  const head = document.createElement("div");
  head.className = "message-head";
  const name = document.createElement("span");
  name.textContent = username || "Visitante";
  const time = document.createElement("time");
  time.textContent = at ? new Date(at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
  const msg = document.createElement("div");
  msg.className = "message-text";
  msg.textContent = text;
  head.append(name, time);
  body.append(head, msg);
  row.append(avatar, body);
  messagesEl.appendChild(row);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}
function renderUsers() {
  usersEl.replaceChildren();
  const all = [{ id: myId, username: `${myName} (você)` }, ...peers.values()];
  all.forEach((person) => {
    const li = document.createElement("li");
    const avatar = document.createElement("span");
    avatar.className = "avatar";
    avatar.textContent = (person.username || "?").slice(0, 1).toUpperCase();
    const label = document.createElement("span");
    label.textContent = person.username;
    li.append(avatar, label);
    usersEl.appendChild(li);
  });
}
function sendSignal(to, data) {
  socket.emit("signal", { to, data });
}
function makeConnection(peerId, initiator) {
  if (connections.has(peerId)) return connections.get(peerId);
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  });
  connections.set(peerId, pc);
  pc.onicecandidate = (event) => {
    if (event.candidate) sendSignal(peerId, { candidate: event.candidate });
  };
  pc.ontrack = (event) => {
    if (screenOwnerId && screenOwnerId !== peerId) return;
    screenOwnerId = peerId;
    screenOwnerName = peers.get(peerId)?.username || "Alguém";
    video.srcObject = event.streams[0];
    video.classList.remove("hidden");
    placeholder.classList.add("hidden");
    shareStatus.textContent = `Transmitindo: ${screenOwnerName}`;
    $("video-caption").textContent = `Assistindo à tela de ${screenOwnerName}`;
    $("video-caption").classList.remove("hidden");
    video.play().catch(() => {});
  };
  pc.onconnectionstatechange = () => {
    if (["failed", "closed"].includes(pc.connectionState)) {
      pc.close();
      connections.delete(peerId);
    }
  };
  if (localScreen && initiator) {
    localScreen.getTracks().forEach((track) => pc.addTrack(track, localScreen));
  }
  return pc;
}
async function startOffer(peerId) {
  try {
    const pc = makeConnection(peerId, true);
    if (localScreen) {
      const senders = pc.getSenders();
      localScreen.getTracks().forEach((track) => {
        if (!senders.some((sender) => sender.track === track)) pc.addTrack(track, localScreen);
      });
    }
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendSignal(peerId, { description: pc.localDescription });
  } catch (err) {
    console.error(err);
    toast("Não foi possível iniciar a transmissão para um participante.");
  }
}
async function handleSignal({ from, data }) {
  try {
    const pc = makeConnection(from, false);
    if (data.description) {
      await pc.setRemoteDescription(data.description);
      if (data.description.type === "offer") {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal(from, { description: pc.localDescription });
      }
    } else if (data.candidate) {
      try { await pc.addIceCandidate(data.candidate); } catch (e) { console.warn(e); }
    }
  } catch (err) {
    console.error(err);
  }
}
function clearRemoteScreen() {
  if (screenOwnerId === myId && localScreen) return;
  video.srcObject = null;
  video.classList.add("hidden");
  placeholder.classList.remove("hidden");
  $("video-caption").classList.add("hidden");
  shareStatus.textContent = "Ninguém transmitindo";
  screenOwnerId = null;
  screenOwnerName = "";
}
function closeConnections() {
  connections.forEach((pc) => pc.close());
  connections.clear();
}
async function startScreenShare() {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    toast("Seu navegador não permite compartilhar tela neste contexto. Use Chrome/Edge em HTTPS ou localhost.");
    return;
  }
  let stream = null;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30 },
      audio: true
    });
    const result = await new Promise((resolve, reject) => {
      socket.timeout(5000).emit("screen-started", (error, response) => {
        if (error) reject(error);
        else resolve(response);
      });
    });
    if (!result?.ok) {
      stream.getTracks().forEach((track) => track.stop());
      toast(result?.message || "Não foi possível iniciar a transmissão.");
      return;
    }
    localScreen = stream;
    screenOwnerId = myId;
    screenOwnerName = myName;
    video.srcObject = localScreen;
    video.classList.remove("hidden");
    placeholder.classList.add("hidden");
    shareStatus.textContent = `Você está transmitindo`;
    $("video-caption").textContent = "Sua tela está sendo compartilhada";
    $("video-caption").classList.remove("hidden");
    shareBtn.textContent = "■ Parar compartilhamento";
    localScreen.getVideoTracks()[0].addEventListener("ended", stopScreenShare);
    for (const peerId of peers.keys()) await startOffer(peerId);
  } catch (err) {
    if (err.name !== "NotAllowedError") toast("Não foi possível compartilhar a tela.");
    if (stream) stream.getTracks().forEach((track) => track.stop());
    localScreen = null;
  }
}
function stopScreenShare() {
  if (!localScreen) return;
  localScreen.getTracks().forEach((track) => track.stop());
  localScreen = null;
  socket.emit("screen-stopped");
  shareBtn.textContent = "▣ Compartilhar tela";
  video.srcObject = null;
  video.classList.add("hidden");
  placeholder.classList.remove("hidden");
  $("video-caption").classList.add("hidden");
  shareStatus.textContent = "Ninguém transmitindo";
  screenOwnerId = null;
  screenOwnerName = "";
  closeConnections();
}
shareBtn.addEventListener("click", () => localScreen ? stopScreenShare() : startScreenShare());
inviteBtn.addEventListener("click", async () => {
  const inviteUrl = new URL(window.location.href);
  inviteUrl.searchParams.set("room", currentRoom);
  try {
    await navigator.clipboard.writeText(inviteUrl.toString());
    toast("Link de convite copiado!");
  } catch (err) {
    console.error(err);
    toast("Não foi possível copiar o link. Verifique as permissões do navegador.");
  }
});

const inviteRoom = new URLSearchParams(window.location.search).get("room");
if (inviteRoom) $("room").value = inviteRoom.slice(0, 40);

$("join-form").addEventListener("submit", (event) => {
  event.preventDefault();
  myName = $("username").value.trim() || "Visitante";
  currentRoom = $("room").value.trim();
  if (!currentRoom) return;
  socket.emit("join-room", { room: currentRoom, username: myName });
});
$("chat-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = $("message-input");
  const text = input.value.trim();
  if (!text) return;
  socket.emit("chat-message", text);
  input.value = "";
  input.focus();
});
socket.on("connect", () => { myId = socket.id; });
socket.on("room-joined", ({ room, peers: list, screenOwner }) => {
  currentRoom = room;
  list.forEach((person) => peers.set(person.id, person));
  $("room-name").textContent = `# ${room}`;
  $("header-room").textContent = `# ${room}`;
  joinScreen.classList.add("hidden");
  app.classList.remove("hidden");
  renderUsers();
  addSystem(`Você entrou na sala ${room}.`);
  if (screenOwner) {
    screenOwnerId = screenOwner.id;
    screenOwnerName = screenOwner.username;
    shareStatus.textContent = `${screenOwnerName} está transmitindo`;
    addSystem(`${screenOwnerName} já está compartilhando a tela.`);
  }
});
socket.on("user-joined", (person) => {
  peers.set(person.id, person);
  renderUsers();
  if (localScreen) startOffer(person.id);
});
socket.on("user-left", ({ id }) => {
  peers.delete(id);
  const pc = connections.get(id);
  if (pc) pc.close();
  connections.delete(id);
  if (screenOwnerId === id) clearRemoteScreen();
  renderUsers();
});
socket.on("chat-message", addMessage);
socket.on("system-message", addSystem);
socket.on("signal", handleSignal);
socket.on("screen-started", ({ id, username }) => {
  if (id !== myId) {
    screenOwnerId = id;
    screenOwnerName = username;
    shareStatus.textContent = `${username} está iniciando a transmissão…`;
    addSystem(`${username} começou a compartilhar a tela.`);
  }
});
socket.on("screen-stopped", ({ id }) => {
  if (screenOwnerId === id) {
    closeConnections();
    clearRemoteScreen();
    addSystem("A transmissão foi encerrada.");
  }
});
socket.on("app-error", toast);
window.addEventListener("beforeunload", () => {
  if (localScreen) localScreen.getTracks().forEach((track) => track.stop());
});