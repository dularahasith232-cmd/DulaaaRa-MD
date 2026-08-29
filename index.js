const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require("@whiskeysockets/baileys");

const pino = require("pino");

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
      const code = await sock.requestPairingCode(phoneNumber);
      console.log("================================");
      console.log("📱 DULARA MD PAIRING CODE");
      console.log("🔑 " + code);
      console.log("================================");
    } catch (error) {
      console.log("❌ Pairing error:", error.message);
    }
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

    if (!msg.message || msg.key.fromMe) return;

    const from = msg.key.remoteJid;

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      "";

    const command = text.trim().toLowerCase();

    // PING
    if (command === ".ping") {
      await sock.sendMessage(from, {
        text: "🏓 Pong!\n\n🤖 Dulara MD\n⚡ Bot is Online!"
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
        text: "🤖 Dulara MD\n⚡ Version 1.0.0\n🟢 Online"
      });
    }
  });
}

startDularaMD();
