// ==========================================
// CONFIGURAÇÕES INICIAIS & CONSTANTES
// ==========================================
const APP_ID = "4c9c4fb7982b4cd5ac29bc015496afbe"; 
let CHANNEL = "geral"; // Canal padrão inicial

// CONFIGURAÇÃO DO FIREBASE
const firebaseConfig = {
    apiKey: "AIzaSyAzb7QN1TGWeCJJjjOeVEupipvEbh0lii0",
    authDomain: "meu-servidor-voz.firebaseapp.com",
    databaseURL: "https://meu-servidor-voz-default-rtdb.firebaseio.com",
    projectId: "meu-servidor-voz",
    storageBucket: "meu-servidor-voz.firebasestorage.app",
    messagingSenderId: "706509676115",
    appId: "1:706509676115:web:b7d9937c61e1e6e038b0a6",
    measurementId: "G-P9Y0N3924Q"
};

// Inicializa Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// Cliente Principal RTC (Voz/Vídeo) e Cliente de Tela
const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
let screenClient = null;

// Variáveis de Mídia e Estado
let localAudioTrack = null;
let localScreenTrack = null;
let localScreenAudioTrack = null;
let isMuted = false;
let isJoined = false;
let userNick = localStorage.getItem('user_nickname') || `User_${Math.floor(Math.random() * 1000)}`;

const remoteAudioTracks = new Map();
const mutedUsers = new Set();
let userRef = null;

// Referências DOM
const btnJoin = document.getElementById('btn-join');
const btnMic = document.getElementById('btn-mic');
const btnScreen = document.getElementById('btn-screen');
const btnStopScreen = document.getElementById('btn-stop-screen');
const btnLeave = document.getElementById('btn-leave');
const videoGrid = document.getElementById('video-grid');
const inputNick = document.getElementById('input-nickname');
const usersList = document.getElementById('users-list');
const channelBtns = document.querySelectorAll('.channel-btn');

// Título do Canal no Topo
const channelTitleHeader = document.querySelector('.header h2') || document.querySelector('.header h3') || document.getElementById('current-channel-title');

const sidebar = document.getElementById('sidebar');
const btnCollapseSidebar = document.getElementById('btn-collapse-sidebar');
const btnExpandSidebar = document.getElementById('btn-expand-sidebar');

// ==========================================
// REQUISIÇÃO DE TOKEN (BACKEND NODE - RENDER)
// ==========================================
async function obterTokenAutomatico(canal, uidDesejado = userNick) {
    try {
        const response = await fetch(`https://dc-private.onrender.com/rtcToken?channelName=${canal}&uid=${uidDesejado}`);
        
        if (!response.ok) throw new Error(`HTTP status ${response.status}`);
        
        const dados = await response.json();
        return dados.token;
    } catch (erro) {
        console.error("Erro ao obter token automático do servidor Render:", erro);
        alert("Erro ao obter o token de acesso do servidor na nuvem.");
        return null;
    }
}

// ==========================================
// CONTROLE DE INTERFACE & SIDEBAR
// ==========================================
if (btnCollapseSidebar && sidebar) {
    btnCollapseSidebar.addEventListener('click', () => sidebar.classList.add('collapsed'));
}
if (btnExpandSidebar && sidebar) {
    btnExpandSidebar.addEventListener('click', () => sidebar.classList.remove('collapsed'));
}

if (inputNick) {
    inputNick.value = userNick;
    inputNick.addEventListener('change', () => {
        userNick = inputNick.value.trim() || 'Usuário';
        localStorage.setItem('user_nickname', userNick);
        registrarPresenciaLobby();
    });
}

// ==========================================
// SISTEMA DE PRESENÇA EM TEMPO REAL (FIREBASE)
// ==========================================
function registrarPresenciaLobby() {
    if (userRef) userRef.remove();

    userRef = db.ref(`presence/${userNick}`);
    
    userRef.set({
        nick: userNick,
        channel: CHANNEL,
        status: isJoined ? 'online_call' : 'lobby',
        muted: isMuted
    });

    userRef.onDisconnect().remove();
}

db.ref('presence').on('value', (snapshot) => {
    const users = snapshot.val() || {};
    renderizarListaSidebar(users);
    
    Object.values(users).forEach(u => {
        if (u.channel === CHANNEL) {
            atualizarStatusMuteVisual(u.nick, u.muted);
        }
    });
});

function renderizarListaSidebar(usersData) {
    if (!usersList) return;
    usersList.innerHTML = '';

    Object.values(usersData).forEach(u => {
        const item = document.createElement('div');
        item.className = 'user-item';
        item.id = `sidebar-${u.nick}`;
        
        const avatar = document.createElement('div');
        avatar.className = 'user-avatar';
        avatar.innerText = u.nick.charAt(0).toUpperCase();

        const nameSpan = document.createElement('span');
        nameSpan.innerText = u.nick;

        const statusTag = document.createElement('small');
        statusTag.style.marginLeft = 'auto';
        statusTag.style.fontSize = '0.75rem';
        statusTag.style.opacity = '0.7';

        if (u.status === 'online_call') {
            statusTag.innerText = ` 🟢 [${u.channel.toUpperCase()}]`;
            statusTag.style.color = '#4caf50';
        } else {
            statusTag.innerText = ' 🟡 No Lobby';
            statusTag.style.color = '#ffc107';
        }

        item.appendChild(avatar);
        item.appendChild(nameSpan);
        item.appendChild(statusTag);

        if (u.muted) {
            const muteBadge = document.createElement('span');
            muteBadge.innerText = ' 🔇';
            item.appendChild(muteBadge);
        }

        usersList.appendChild(item);
    });
}

registrarPresenciaLobby();

// ==========================================
// EFETOS VISUAIS & ÁUDIO DE NOTIFICAÇÃO
// ==========================================
function atualizarStatusMuteVisual(nick, mutado) {
    if (mutado) mutedUsers.add(nick);
    else mutedUsers.delete(nick);

    const card = document.getElementById(`card-${nick}`);
    if (card) {
        let cardMuteIcon = card.querySelector('.card-mute-icon');
        if (mutado) {
            if (!cardMuteIcon) {
                cardMuteIcon = document.createElement('div');
                cardMuteIcon.className = 'card-mute-icon';
                cardMuteIcon.innerText = '🔇';
                cardMuteIcon.style.position = 'absolute';
                cardMuteIcon.style.top = '10px';
                cardMuteIcon.style.right = '10px';
                cardMuteIcon.style.fontSize = '1.2rem';
                card.appendChild(cardMuteIcon);
            }
        } else if (cardMuteIcon) {
            cardMuteIcon.remove();
        }
    }
}

function tocarSomNotificacao(tipo) {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.connect(gain);
        gain.connect(audioCtx.destination);
        const agora = audioCtx.currentTime;

        if (tipo === 'entrar') {
            osc.frequency.setValueAtTime(440, agora);
            osc.frequency.setValueAtTime(880, agora + 0.08);
            gain.gain.setValueAtTime(0.1, agora);
            gain.gain.exponentialRampToValueAtTime(0.001, agora + 0.25);
            osc.start(agora);
            osc.stop(agora + 0.25);
        } else if (tipo === 'sair') {
            osc.frequency.setValueAtTime(600, agora);
            osc.frequency.setValueAtTime(300, agora + 0.08);
            gain.gain.setValueAtTime(0.1, agora);
            gain.gain.exponentialRampToValueAtTime(0.001, agora + 0.25);
            osc.start(agora);
            osc.stop(agora + 0.25);
        }
    } catch (e) {
        console.error("Erro ao reproduzir som de notificação:", e);
    }
}

function toggleFullscreenCard(card) {
    const jaMaximizado = card.classList.contains("maximized");
    document.querySelectorAll('.video-card.maximized').forEach(c => c.classList.remove("maximized"));
    if (!jaMaximizado) card.classList.add("maximized");
}

function criarUserCard(uid, nickName) {
    const placeholder = videoGrid.querySelector('.placeholder');
    if (placeholder) placeholder.remove();

    let card = document.getElementById(`card-${uid}`);
    if (!card) {
        card = document.createElement("div");
        card.id = `card-${uid}`;
        card.className = "video-card";
        card.addEventListener('dblclick', () => toggleFullscreenCard(card));

        const profileContainer = document.createElement("div");
        profileContainer.className = "user-profile-card";
        
        const avatar = document.createElement("div");
        avatar.className = "user-profile-avatar";
        avatar.innerText = nickName.charAt(0).toUpperCase();

        profileContainer.appendChild(avatar);
        card.appendChild(profileContainer);

        const badge = document.createElement("div");
        badge.className = "card-badge";
        badge.innerText = nickName;
        card.appendChild(badge);

        const isLocalScreen = (uid === `${userNick}-screen`);
        if (uid !== userNick && !isLocalScreen) {
            const volContainer = document.createElement("div");
            volContainer.className = "volume-control-container";
            volContainer.addEventListener('dblclick', (e) => e.stopPropagation());

            const volIcon = document.createElement("span");
            volIcon.innerText = "🔊";

            const volSlider = document.createElement("input");
            volSlider.type = "range";
            volSlider.min = "0";
            volSlider.max = "100";
            volSlider.value = "100";
            volSlider.className = "volume-slider";

            volSlider.addEventListener('input', (e) => {
                const newVolume = parseInt(e.target.value, 10);
                const audioTrack = remoteAudioTracks.get(uid);
                if (audioTrack) audioTrack.setVolume(newVolume);
            });

            volContainer.appendChild(volIcon);
            volContainer.appendChild(volSlider);
            card.appendChild(volContainer);
        }

        const btnClose = document.createElement("button");
        btnClose.className = "btn-close-fullscreen";
        btnClose.innerHTML = "✕";
        btnClose.title = "Sair da Tela Cheia";
        btnClose.addEventListener('click', (e) => {
            e.stopPropagation();
            card.classList.remove("maximized");
        });
        card.appendChild(btnClose);

        videoGrid.appendChild(card);

        if (mutedUsers.has(uid)) {
            atualizarStatusMuteVisual(uid, true);
        }
    }
    return card;
}

function removerUserCard(uid) {
    const card = document.getElementById(`card-${uid}`);
    if (card) card.remove();
    remoteAudioTracks.delete(uid);
    mutedUsers.delete(uid);
    verificarPlaceholder();
}

function verificarPlaceholder() {
    if (videoGrid.querySelectorAll('.video-card').length === 0) {
        videoGrid.innerHTML = `<div class="placeholder"><p>Nenhuma transmissão ao vivo na sala #${CHANNEL}.</p></div>`;
    }
}

// ==========================================
// MONITOR DE VOZ / INDICADOR DE FALA
// ==========================================
client.enableAudioVolumeIndicator();
client.on("volume-indicator", volumes => {
    volumes.forEach(volume => {
        const uid = volume.uid === 0 ? userNick : String(volume.uid);
        const isSpeaking = volume.level > 5;

        const card = document.getElementById(`card-${uid}`);
        const sidebarItem = document.getElementById(`sidebar-${uid}`);

        if (card) {
            if (isSpeaking && !mutedUsers.has(uid)) card.classList.add("speaking");
            else card.classList.remove("speaking");
        }

        if (sidebarItem) {
            if (isSpeaking && !mutedUsers.has(uid)) sidebarItem.classList.add("speaking");
            else sidebarItem.classList.remove("speaking");
        }
    });
});

// ==========================================
// TROCA DE CANAIS (SALAS DE VOZ)
// ==========================================
channelBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
        const novoCanal = btn.getAttribute('data-channel');
        if (novoCanal === CHANNEL) return;

        channelBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        CHANNEL = novoCanal;

        if (channelTitleHeader) {
            const nomeCanalFormatado = btn.innerText.trim();
            channelTitleHeader.innerText = `Sala de Voz - ${nomeCanalFormatado}`;
        }

        if (isJoined) {
            await sairDaSalaAtual();
            await entrarNaSalaAtual();
        } else {
            if (userRef) userRef.update({ channel: CHANNEL });
            verificarPlaceholder();
        }
    });
});

// ==========================================
// CONEXÃO / DESCONEXÃO DO CANAL (RTC)
// ==========================================
async function entrarNaSalaAtual() {
    try {
        btnJoin.disabled = true;

        userNick = inputNick && inputNick.value.trim() !== '' ? inputNick.value.trim() : 'Usuário';
        localStorage.setItem('user_nickname', userNick);

        const tokenAtual = await obterTokenAutomatico(CHANNEL, userNick);
        if (!tokenAtual) {
            btnJoin.disabled = false;
            return;
        }

        await client.join(APP_ID, CHANNEL, tokenAtual, userNick);

        localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack({
            encoderConfig: "speech_standard",
            AEC: true,
            ANS: true,
            AGC: true
        });

        await localAudioTrack.setMuted(isMuted);
        await client.publish([localAudioTrack]);

        tocarSomNotificacao('entrar');
        isJoined = true;

        if (userRef) userRef.update({ status: 'online_call', channel: CHANNEL, muted: isMuted });

        criarUserCard(userNick, userNick);

        // Inscreve-se nos usuários já presentes na sala
        for (const user of client.remoteUsers) {
            const remoteNick = String(user.uid);
            if (remoteNick === `${userNick}-screen`) continue; // Ignora própria tela se reconectado

            criarUserCard(remoteNick, remoteNick);

            if (user.hasVideo) {
                await client.subscribe(user, "video");
                const card = criarUserCard(remoteNick, remoteNick);
                card.classList.add("has-video");
                user.videoTrack.play(card, { fit: "contain" });
            }
            if (user.hasAudio) {
                await client.subscribe(user, "audio");
                remoteAudioTracks.set(remoteNick, user.audioTrack);
                user.audioTrack.play();
            }
        }

        if (inputNick) inputNick.disabled = true;
        btnMic.disabled = false;
        btnScreen.disabled = false;
        btnLeave.disabled = false;

    } catch (error) {
        console.error("Erro ao entrar na sala:", error);
        btnJoin.disabled = false;
        alert("Erro ao conectar na sala: " + error.message);
    }
}

async function sairDaSalaAtual() {
    tocarSomNotificacao('sair');

    if (localAudioTrack) {
        localAudioTrack.close();
        localAudioTrack = null;
    }

    await pararTransmissao();
    await client.leave();

    isJoined = false;
    videoGrid.innerHTML = `<div class="placeholder"><p>Nenhuma transmissão ao vivo na sala #${CHANNEL}.</p></div>`;

    btnJoin.disabled = false;
    if (inputNick) inputNick.disabled = false;
    btnMic.disabled = true;
    btnScreen.disabled = true;
    btnLeave.disabled = true;

    if (userRef) userRef.update({ status: 'lobby', channel: CHANNEL });
}

btnJoin.addEventListener('click', () => entrarNaSalaAtual());
btnLeave.addEventListener('click', () => sairDaSalaAtual());

btnMic.addEventListener('click', async () => {
    if (!localAudioTrack) return;
    isMuted = !isMuted;
    await localAudioTrack.setMuted(isMuted);
    btnMic.innerText = isMuted ? '🔇 Desmutar' : '🎙️ Mutar';

    if (userRef) {
        userRef.update({ muted: isMuted });
    }
});

// ==========================================
// COMPARTILHAMENTO DE TELA
// ==========================================
btnScreen.addEventListener('click', async () => {
    try {
        const screenUid = `${userNick}-screen`;
        const screenToken = await obterTokenAutomatico(CHANNEL, screenUid);
        if (!screenToken) return;

        // Captura da tela / aba com áudio do sistema (opcional)
        const screenTracks = await AgoraRTC.createScreenVideoTrack(
            {
                encoderConfig: "720p_2",
                optimizationMode: "detail"
            },
            "auto" // Permite capturar áudio do sistema se o usuário marcar a opção
        );

        if (Array.isArray(screenTracks)) {
            localScreenTrack = screenTracks[0];
            localScreenAudioTrack = screenTracks[1];
        } else {
            localScreenTrack = screenTracks;
        }

        screenClient = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

        await screenClient.join(APP_ID, CHANNEL, screenToken, screenUid);

        const tracksToPublish = [localScreenTrack];
        if (localScreenAudioTrack) {
            tracksToPublish.push(localScreenAudioTrack);
        }

        await screenClient.publish(tracksToPublish);

        const card = criarUserCard(screenUid, `${userNick} (Tela)`);
        card.classList.add("has-video");
        localScreenTrack.play(card, { fit: "contain" });

        btnScreen.disabled = true;
        btnScreen.style.display = 'none';
        btnStopScreen.style.display = 'inline-block';

        // Lida com encerramento nativo (quando o usuário clica em "Parar compartilhamento" no topo do navegador)
        localScreenTrack.on("track-ended", () => pararTransmissao());

    } catch (error) {
        console.error("Erro ao transmitir tela:", error);
        alert("Não foi possível iniciar a transmissão.");
    }
});

btnStopScreen.addEventListener('click', () => pararTransmissao());

async function pararTransmissao() {
    if (screenClient) {
        if (localScreenTrack) { 
            localScreenTrack.close(); 
            localScreenTrack = null; 
        }
        if (localScreenAudioTrack) { 
            localScreenAudioTrack.close(); 
            localScreenAudioTrack = null; 
        }
        await screenClient.leave();
        screenClient = null;
    }

    removerUserCard(`${userNick}-screen`);
    btnScreen.disabled = false;
    btnScreen.style.display = 'inline-block';
    btnStopScreen.style.display = 'none';
}

// ==========================================
// EVENTOS RTC AGORA DA SALA
// ==========================================
client.on("user-joined", (user) => {
    const remoteNick = String(user.uid);
    if (remoteNick === `${userNick}-screen`) return; // Ignora o cliente de tela do próprio usuário

    if (isJoined) {
        tocarSomNotificacao('entrar');
        criarUserCard(remoteNick, remoteNick);
    }
});

client.on("user-left", (user) => {
    const remoteNick = String(user.uid);
    if (isJoined && remoteNick !== `${userNick}-screen`) {
        tocarSomNotificacao('sair');
    }
    removerUserCard(remoteNick);
});

client.on("user-published", async (user, mediaType) => {
    const remoteNick = String(user.uid);

    // Evita se inscrever nas faixas da própria tela
    if (remoteNick === `${userNick}-screen`) return;

    await client.subscribe(user, mediaType);

    if (mediaType === "video" && isJoined) {
        const card = criarUserCard(remoteNick, remoteNick);
        card.classList.add("has-video");
        user.videoTrack.play(card, { fit: "contain" });
    }

    if (mediaType === "audio") {
        remoteAudioTracks.set(remoteNick, user.audioTrack);
        if (isJoined) {
            user.audioTrack.play();
        }
    }
});

client.on("user-unpublished", (user, mediaType) => {
    const remoteNick = String(user.uid);
    if (mediaType === "video") {
        const card = document.getElementById(`card-${remoteNick}`);
        if (card) {
            card.classList.remove("has-video");
            const playerDiv = card.querySelector('div[id^="agora-video-player"]');
            if (playerDiv) playerDiv.remove();
        }
    }
    if (mediaType === "audio") {
        remoteAudioTracks.delete(remoteNick);
    }
});

// LIMPEZA AO FECHAR A ABA
window.addEventListener('beforeunload', () => {
    if (userRef) userRef.remove();
    if (localAudioTrack) localAudioTrack.close();
    if (localScreenTrack) localScreenTrack.close();
    if (localScreenAudioTrack) localScreenAudioTrack.close();
    if (client) client.leave();
    if (screenClient) screenClient.leave();
});