const express = require('express');
const cors = require('cors');
const { RtcTokenBuilder, RtcRole } = require('agora-access-token');

const APP = express();
APP.use(cors());

// CONFIGURAÇÕES DA AGORA
const APP_ID = "4c9c4fb7982b4cd5ac29bc015496afbe"; 
// COLE O SEU APP CERTIFICATE DO PAINEL DA AGORA AQUI ABAIXO
const APP_CERTIFICATE = "e4f95e5f279b454c8bbb35902c9ed2b2"; 

// Rota que gera o token sob demanda
APP.get('/rtcToken', (req, res) => {
    const channelName = req.query.channelName || "geral";
    const uid = req.query.uid || 0; // 0 aceita qualquer UID
    const role = RtcRole.PUBLISHER;
    
    // Tempo de expiração do token (ex: 2 horas / 7200 segundos)
    const expirationTimeInSeconds = 7200;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

    if (!APP_ID || !APP_CERTIFICATE) {
        return res.status(500).json({ error: "App ID ou App Certificate não configurados." });
    }

    // Gera o token dinâmico da Agora
    const token = RtcTokenBuilder.buildTokenWithUid(
        APP_ID, 
        APP_CERTIFICATE, 
        channelName, 
        uid, 
        role, 
        privilegeExpiredTs
    );

    return res.json({ token: token });
});

// Substitua o trecho final por este:
const PORT = process.env.PORT || 3000;
APP.listen(PORT, () => {
    console.log(`Servidor de Tokens rodando na porta ${PORT}`);
});