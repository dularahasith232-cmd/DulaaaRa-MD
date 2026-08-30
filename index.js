const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require("@whiskeysockets/baileys");

const pino = require("pino");
const axios = require("axios");
async function startDularaMD() {
  const { state, saveCreds } =
    await useMultiFileAuthState("./session");

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: "silent" })
  });

  sock.ev.on("creds.update", saveCreds);

  // WhatsApp Pairing Code
  if (!state.creds.registered) {
    const phoneNumber = process.env.PHONE_NUMBER;

    if (!phoneNumber) {
      console.log("❌ PHONE_NUMBER is not set.");
      return;
    }

    try {
  console.log("⏳ Requesting WhatsApp pairing code...");

  await new Promise(resolve => setTimeout(resolve, 10000));

  const code = await sock.requestPairingCode(phoneNumber);

  console.log("================================");
  console.log("📱 DULARA MD PAIRING CODE");
  console.log("🔑 " + String(code));
  console.log("================================");

} catch (error) {
  console.log("❌ Pairing error:", error?.message || error);
}

  sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {

    if (connection === "open") {
      console.log("✅ Dulara MD Connected!");
    }

    if (connection === "close") {

      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !==
        DisconnectReason.loggedOut;

      if (shouldReconnect) {
        console.log("🔄 Reconnecting...");
        startDularaMD();
      } else {
        console.log("❌ WhatsApp logged out.");
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {

    const msg = messages[0];

    if (!msg.message) return;

    const from = msg.key.remoteJid;

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      "";

    const command = text.trim().toLowerCase();
    // YOUTUBE SONG SEARCH
if (command.startsWith(".song ")) {
  const query = command.slice(6).trim();

  if (!query) {
    await sock.sendMessage(from, {
      text: "🎵 උදාහරණය:\n.song Deviyange Bare Rap"
    });
    return;
  }

  if (!process.env.YOUTUBE_API_KEY) {
    await sock.sendMessage(from, {
      text: "❌ YouTube API Key එක setup කරලා නැහැ."
    });
    return;
  }

  try {
    const response = await axios.get(
      "https://www.googleapis.com/youtube/v3/search",
      {
        params: {
          part: "snippet",
          q: query,
          type: "video",
          maxResults: 5,
          key: process.env.YOUTUBE_API_KEY
        }
      }
    );

    const results = response.data.items;

    if (!results.length) {
      await sock.sendMessage(from, {
        text: "❌ Song එක හම්බුණේ නැහැ."
      });
      return;
    }

    let message = `🎵 *DULARA MD — SONG SEARCH*\n\n`;

    results.forEach((item, index) => {
      message +=
        `${index + 1}️⃣ ${item.snippet.title}\n` +
        `👤 ${item.snippet.channelTitle}\n` +
        `🔗 https://youtu.be/${item.id.videoId}\n\n`;
    });

    message += `📌 Reply කරන්න: 1 - ${results.length}`;

    await sock.sendMessage(from, {
      text: message
    });

  } catch (error) {
    console.log("❌ YouTube Search Error:", error.message);

    await sock.sendMessage(from, {
      text: "❌ YouTube search කරන්න බැරි වුණා."
    });
  }

  return;
}
// SONG - Authorized audio URL only
if (command.startsWith(".song ")) {
  const songUrl = command.slice(6).trim();

  if (!songUrl.startsWith("https://")) {
    await sock.sendMessage(from, {
      text: "❌ Valid HTTPS audio URL එකක් දෙන්න."
    });
    return;
  }

  await sock.sendMessage(from, {
    text: "🎵 Song එක download කරමින්... ⏳"
  });

  try {
    await sock.sendMessage(from, {
      audio: { url: songUrl },
      mimetype: "audio/mpeg",
      ptt: false
    });

    await sock.sendMessage(from, {
      text: "✅ Song එක ලැබුණා! 🎵"
    });

  } catch (error) {
    console.log("❌ Song error:", error.message);

    await sock.sendMessage(from, {
      text: "❌ Audio එක send කරන්න බැරි වුණා."
    });
  }
}
    // PING
    if (command === ".ping") {
      await sock.sendMessage(from, {
        text:
          "🏓 Pong!\n\n🤖 Dulara MD\n⚡ Bot is Online!"
      });
    }

    // MENU
    if (command === ".menu") {
      await sock.sendMessage(from, {
        text: `╭───「 DULARA MD 」───╮

🤖 BOT COMMANDS

.ping
.menu
.owner
.info

🎬 MOVIE

.movie

╰────────────────────╯`
      });
    }

    // OWNER
    if (command === ".owner") {
      await sock.sendMessage(from, {
        text: "👑 Dulara MD Owner"
      });
    }

    // INFO
    if (command === ".info") {
      await sock.sendMessage(from, {
        text:
          "🤖 Dulara MD\n⚡ Version 1.0.0\n🟢 Online"
      });
    }

  });
}

startDularaMD();
