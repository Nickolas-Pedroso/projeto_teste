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
const homeBtn = $("home-btn");
const microphoneBtn = $("microphone-btn");
const cameraBtn = $("camera-btn");
const cameraGrid = $("camera-grid");
const chatToggle = $("chat-toggle");
const content = document.querySelector(".content");

let myId = null;
let myName = "Visitante";
let currentRoom = "";
let peers = new Map();
let connections = new Map();
let peerStreamTypes = new Map();
let remoteStreams = new Map();
let localScreen = null;
let localMedia = new MediaStream();
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
function currentStreamTypes() {
  const types = {};
  if (localScreen?.getTracks().length) types[localScreen.id] = "screen";
  if (localMedia.getTracks().length) types[localMedia.id] = "camera";
  return types;
}
function syncLocalTracks(pc) {
  const tracks = [...(localScreen?.getTracks() || []), ...localMedia.getTracks()];
  const senders = pc.getSenders();
  senders.forEach((sender) => {
    if (sender.track && !tracks.includes(sender.track)) pc.removeTrack(sender);
  });
  const sentTracks = pc.getSenders().map((sender) => sender.track);
  tracks.forEach((track) => {
    if (!sentTracks.includes(track)) {
      const stream = localScreen?.getTracks().includes(track) ? localScreen : localMedia;
      pc.addTrack(track, stream);
    }
  });
}
function updateCameraGrid() {
  cameraGrid.classList.toggle("hidden", cameraGrid.childElementCount === 0);
}
function updateMediaTile(id, stream, username, isLocal = false) {
  let tile = cameraGrid.querySelector(`[data-peer-id="${CSS.escape(id)}"]`);
  if (!tile) {
    tile = document.createElement("div");
    tile.className = "camera-tile";
    tile.dataset.peerId = id;
    const tileVideo = document.createElement("video");
    tileVideo.autoplay = true;
    tileVideo.playsInline = true;
    tileVideo.muted = isLocal;
    const label = document.createElement("span");
    label.className = "camera-label";
    tile.append(tileVideo, label);
    cameraGrid.appendChild(tile);
  }
  const tileVideo = tile.querySelector("video");
  tileVideo.srcObject = stream;
  tileVideo.classList.toggle("hidden", stream.getVideoTracks().length === 0);
  const label = tile.querySelector(".camera-label");
  const mediaState = isLocal
    ? { camera: localMedia.getVideoTracks().length > 0, microphone: localMedia.getAudioTracks().length > 0 }
    : peers.get(id)?.mediaState || {};
  const isCameraOn = stream.getVideoTracks().some((track) => track.readyState === "live" && track.enabled)
    && mediaState.camera !== false;
  const isMicrophoneOn = stream.getAudioTracks().some((track) => track.readyState === "live" && track.enabled)
    && mediaState.microphone !== false;
  label.textContent = `${username}${isCameraOn ? "" : " · câmera desligada"}${isMicrophoneOn ? "" : " · microfone desligado"}`;
  tileVideo.play().catch(() => {});
  updateCameraGrid();
}
function removeMediaTile(id) {
  cameraGrid.querySelector(`[data-peer-id="${CSS.escape(id)}"]`)?.remove();
  updateCameraGrid();
}
function updateMediaControls() {
  const microphoneOn = localMedia.getAudioTracks().some((track) => track.enabled && track.readyState === "live");
  const cameraOn = localMedia.getVideoTracks().some((track) => track.enabled && track.readyState === "live");
  microphoneBtn.title = microphoneOn ? "Desativar microfone" : "Ativar microfone";
  cameraBtn.title = cameraOn ? "Desativar câmera" : "Ativar câmera";
  microphoneBtn.setAttribute("aria-label", microphoneBtn.title);
  cameraBtn.setAttribute("aria-label", cameraBtn.title);
  microphoneBtn.classList.toggle("active", microphoneOn);
  cameraBtn.classList.toggle("active", cameraOn);
  microphoneBtn.querySelector(".muted-indicator").classList.toggle("hidden", microphoneOn);
  cameraBtn.querySelector(".muted-indicator").classList.toggle("hidden", cameraOn);
  microphoneBtn.setAttribute("aria-pressed", String(microphoneOn));
  cameraBtn.setAttribute("aria-pressed", String(cameraOn));
  $("media-status").textContent = microphoneOn || cameraOn
    ? `Microfone ${microphoneOn ? "ligado" : "desligado"} · câmera ${cameraOn ? "ligada" : "desligada"}`
    : "Microfone e câmera desligados";
}
function setChatOpen(isOpen) {
  content.classList.toggle("chat-open", isOpen);
  content.classList.toggle("chat-collapsed", !isOpen);
  app.classList.toggle("chat-hidden", !isOpen);
  chatToggle.setAttribute("aria-expanded", String(isOpen));
  chatToggle.setAttribute("aria-label", isOpen ? "Fechar chat" : "Abrir chat");
  chatToggle.title = isOpen ? "Fechar chat" : "Abrir chat";
  chatToggle.querySelector(".chat-bubble-icon").classList.toggle("hidden", isOpen);
  chatToggle.querySelector(".chat-close-icon").classList.toggle("hidden", !isOpen);
}
function makeConnection(peerId) {
  if (connections.has(peerId)) return connections.get(peerId);
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  });
  pc.polite = myId.localeCompare(peerId) > 0;
  pc.makingOffer = false;
  pc.ignoreOffer = false;
  pc.settingRemoteAnswer = false;
  connections.set(peerId, pc);
  pc.onicecandidate = (event) => {
    if (event.candidate) sendSignal(peerId, { candidate: event.candidate });
  };
  pc.onnegotiationneeded = async () => {
    try {
      pc.makingOffer = true;
      await pc.setLocalDescription();
      sendSignal(peerId, {
        description: pc.localDescription,
        streamTypes: currentStreamTypes()
      });
    } catch (err) {
      console.error(err);
      toast("Não foi possível iniciar o áudio ou vídeo com um participante.");
    } finally {
      pc.makingOffer = false;
    }
  };
  pc.ontrack = (event) => {
    const stream = event.streams[0] || new MediaStream([event.track]);
    const streamType = peerStreamTypes.get(peerId)?.get(stream.id)
      || (screenOwnerId === peerId && event.track.kind === "video" ? "screen" : "camera");
    if (streamType === "screen") {
      if (screenOwnerId && screenOwnerId !== peerId) return;
      screenOwnerId = peerId;
      screenOwnerName = peers.get(peerId)?.username || "Alguém";
      video.srcObject = stream;
      video.classList.remove("hidden");
      placeholder.classList.add("hidden");
      shareStatus.textContent = `Transmitindo: ${screenOwnerName}`;
      $("video-caption").textContent = `Assistindo à tela de ${screenOwnerName}`;
      $("video-caption").classList.remove("hidden");
      video.play().catch(() => {});
      return;
    }
    remoteStreams.set(peerId, stream);
    updateMediaTile(peerId, stream, peers.get(peerId)?.username || "Participante");
  };
  pc.onconnectionstatechange = () => {
    if (["failed", "closed"].includes(pc.connectionState)) {
      pc.close();
      connections.delete(peerId);
    }
  };
  syncLocalTracks(pc);
  return pc;
}
async function handleSignal({ from, data }) {
  try {
    const pc = makeConnection(from);
    if (data.description) {
      const readyForOffer = !pc.makingOffer
        && (pc.signalingState === "stable" || pc.settingRemoteAnswer);
      const offerCollision = data.description.type === "offer" && !readyForOffer;
      pc.ignoreOffer = !pc.polite && offerCollision;
      if (pc.ignoreOffer) return;
      const streamTypes = peerStreamTypes.get(from) || new Map();
      Object.entries(data.streamTypes || {}).forEach(([id, type]) => streamTypes.set(id, type));
      peerStreamTypes.set(from, streamTypes);
      pc.settingRemoteAnswer = data.description.type === "answer";
      await pc.setRemoteDescription(data.description);
      pc.settingRemoteAnswer = false;
      if (data.description.type === "offer") {
        await pc.setLocalDescription();
        sendSignal(from, {
          description: pc.localDescription,
          streamTypes: currentStreamTypes()
        });
      }
    } else if (data.candidate) {
      try {
        if (!pc.ignoreOffer) await pc.addIceCandidate(data.candidate);
      } catch (err) {
        console.warn(err);
      }
    }
  } catch (err) {
    console.error(err);
    toast("Não foi possível conectar o áudio ou vídeo.");
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
function showJoinScreen() {
  clearRemoteScreen();
  cameraGrid.replaceChildren();
  updateCameraGrid();
  currentRoom = "";
  peers.clear();
  peerStreamTypes.clear();
  remoteStreams.clear();
  screenOwnerId = null;
  screenOwnerName = "";
  $("room").value = "";
  $("room-name").textContent = "# sala";
  $("header-room").textContent = "# sala";
  usersEl.replaceChildren();
  messagesEl.replaceChildren();
  joinScreen.classList.remove("hidden");
  app.classList.add("hidden");
  history.replaceState(null, "", window.location.pathname);
}
function connectLocalMediaToPeers() {
  peers.forEach((_person, peerId) => {
    const pc = makeConnection(peerId);
    syncLocalTracks(pc);
  });
}
async function toggleMedia(kind) {
  const trackKind = kind === "microphone" ? "audio" : "video";
  const track = localMedia.getTracks().find((item) => item.kind === trackKind);
  if (track) {
    track.stop();
    localMedia.removeTrack(track);
    localMedia.getTracks().forEach((item) => item.kind === trackKind && item.stop());
    connections.forEach((pc) => syncLocalTracks(pc));
    updateMediaControls();
    if (localMedia.getTracks().length) updateMediaTile(myId, localMedia, `${myName} (você)`, true);
    else removeMediaTile(myId);
    socket.emit("media-state", {
      microphone: localMedia.getAudioTracks().length > 0,
      camera: localMedia.getVideoTracks().length > 0
    });
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    toast("Seu navegador não permite usar microfone ou câmera neste contexto. Acesse o site por HTTPS.");
    return;
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: kind === "microphone"
        ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        : false,
      video: kind === "camera"
    });
    stream.getTracks().forEach((mediaTrack) => localMedia.addTrack(mediaTrack));
    connectLocalMediaToPeers();
    updateMediaControls();
    updateMediaTile(myId, localMedia, `${myName} (você)`, true);
    socket.emit("media-state", {
      microphone: localMedia.getAudioTracks().length > 0,
      camera: localMedia.getVideoTracks().length > 0
    });
    if (kind === "microphone") {
      toast("Microfone ligado com cancelamento de eco. Fones de ouvido também ajudam a evitar retorno.");
    }
    stream.getTracks().forEach((mediaTrack) => {
      mediaTrack.addEventListener("ended", () => {
        if (!localMedia.getTracks().includes(mediaTrack)) return;
        localMedia.removeTrack(mediaTrack);
        connections.forEach((pc) => syncLocalTracks(pc));
        updateMediaControls();
        if (localMedia.getTracks().length) updateMediaTile(myId, localMedia, `${myName} (você)`, true);
        else removeMediaTile(myId);
        socket.emit("media-state", {
          microphone: localMedia.getAudioTracks().length > 0,
          camera: localMedia.getVideoTracks().length > 0
        });
      }, { once: true });
    });
  } catch (err) {
    console.error(err);
    if (stream) stream.getTracks().forEach((mediaTrack) => mediaTrack.stop());
    toast(err.name === "NotAllowedError"
      ? "Permita o acesso ao microfone ou à câmera nas configurações do navegador."
      : "Não foi possível acessar o microfone ou a câmera.");
  }
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
      audio: $("system-audio").checked
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
    shareBtn.title = "Parar transmissão ao vivo";
    shareBtn.setAttribute("aria-label", shareBtn.title);
    shareBtn.setAttribute("aria-pressed", "true");
    shareBtn.classList.add("is-live");
    $("live-banner").classList.remove("hidden");
    $("live-detail").textContent = $("system-audio").checked
      ? "Tela e áudio do sistema"
      : "Tela (áudio do sistema desligado para evitar eco)";
    localScreen.getVideoTracks()[0].addEventListener("ended", stopScreenShare);
    connectLocalMediaToPeers();
  } catch (err) {
    if (err.name !== "NotAllowedError") toast("Não foi possível compartilhar a tela.");
    if (stream) stream.getTracks().forEach((track) => track.stop());
    localScreen = null;
  }
}
function stopScreenShare() {
  if (!localScreen) return;
  const stoppedTracks = localScreen.getTracks();
  stoppedTracks.forEach((track) => track.stop());
  localScreen = null;
  socket.emit("screen-stopped");
  shareBtn.title = "Iniciar transmissão ao vivo";
  shareBtn.setAttribute("aria-label", shareBtn.title);
  shareBtn.setAttribute("aria-pressed", "false");
  shareBtn.classList.remove("is-live");
  $("live-banner").classList.add("hidden");
  video.srcObject = null;
  video.classList.add("hidden");
  placeholder.classList.remove("hidden");
  $("video-caption").classList.add("hidden");
  shareStatus.textContent = "Ninguém transmitindo";
  screenOwnerId = null;
  screenOwnerName = "";
  connections.forEach((pc) => {
    pc.getSenders().forEach((sender) => {
      if (stoppedTracks.includes(sender.track)) pc.removeTrack(sender);
    });
  });
}
shareBtn.addEventListener("click", () => localScreen ? stopScreenShare() : startScreenShare());
microphoneBtn.addEventListener("click", () => toggleMedia("microphone"));
cameraBtn.addEventListener("click", () => toggleMedia("camera"));
chatToggle.addEventListener("click", () => setChatOpen(chatToggle.getAttribute("aria-expanded") !== "true"));
$("chat-close").addEventListener("click", () => setChatOpen(false));
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
homeBtn.addEventListener("click", () => {
  homeBtn.disabled = true;
  if (localScreen) stopScreenShare();
  localMedia.getTracks().forEach((track) => track.stop());
  localMedia = new MediaStream();
  updateMediaControls();
  removeMediaTile(myId);
  closeConnections();

  if (!socket.connected) {
    showJoinScreen();
    homeBtn.disabled = false;
    return;
  }
  socket.timeout(5000).emit("leave-room", (error, response) => {
    homeBtn.disabled = false;
    if (error || !response?.ok) {
      console.error(error || new Error("O servidor não confirmou a saída da sala."));
      toast("Não foi possível sair da sala. Tente novamente.");
      return;
    }
    showJoinScreen();
  });
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
  peers.clear();
  list.forEach((person) => peers.set(person.id, person));
  $("room-name").textContent = `# ${room}`;
  $("header-room").textContent = `# ${room}`;
  joinScreen.classList.add("hidden");
  app.classList.remove("hidden");
  renderUsers();
  messagesEl.replaceChildren();
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
  if (localScreen || localMedia.getTracks().length) {
    const pc = makeConnection(person.id);
    syncLocalTracks(pc);
  }
});
socket.on("user-left", ({ id }) => {
  peers.delete(id);
  const pc = connections.get(id);
  if (pc) pc.close();
  connections.delete(id);
  peerStreamTypes.delete(id);
  remoteStreams.delete(id);
  removeMediaTile(id);
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
    clearRemoteScreen();
    addSystem("A transmissão foi encerrada.");
  }
});
socket.on("media-state", ({ id, microphone, camera }) => {
  if (id !== myId) {
    const person = peers.get(id);
    if (person) person.mediaState = { microphone, camera };
  }
  const stream = id === myId ? localMedia : remoteStreams.get(id);
  const person = id === myId ? `${myName} (você)` : peers.get(id)?.username;
  if (stream && person) updateMediaTile(id, stream, person);
  if (!microphone && !camera) removeMediaTile(id);
});
socket.on("app-error", toast);
window.addEventListener("beforeunload", () => {
  if (localScreen) localScreen.getTracks().forEach((track) => track.stop());
  localMedia.getTracks().forEach((track) => track.stop());
});
setChatOpen(false);
updateMediaControls();