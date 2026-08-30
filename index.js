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

  // ================================
  // WHATSAPP PAIRING
  // ================================

  if (!state.creds.registered) {

    const phoneNumber = process.env.PHONE_NUMBER;

    if (!phoneNumber) {
      console.log("❌ PHONE_NUMBER is not set.");
      return;
    }

    try {

      console.log("⏳ Requesting WhatsApp pairing code...");

      await new Promise(resolve =>
        setTimeout(resolve, 10000)
      );

      const code =
        await sock.requestPairingCode(phoneNumber);

      console.log("================================");
      console.log("📱 DULARA MD PAIRING CODE");
      console.log("🔑 " + String(code));
      console.log("================================");

    } catch (error) {

      console.log(
        "❌ Pairing error:",
        error?.message || error
      );

    }
  }

  // ================================
  // CONNECTION
  // ================================

  sock.ev.on(
    "connection.update",
    ({ connection, lastDisconnect }) => {

      if (connection === "open") {
        console.log("================================");
        console.log("✅ DULARA MD CONNECTED!");
        console.log("================================");
      }

      if (connection === "close") {

        const statusCode =
          lastDisconnect?.error?.output?.statusCode;

        const shouldReconnect =
          statusCode !== DisconnectReason.loggedOut;

        if (shouldReconnect) {

          console.log(
            "🔄 Connection closed. Reconnecting..."
          );

          setTimeout(() => {
            startDularaMD();
          }, 5000);

        } else {

          console.log(
            "❌ WhatsApp logged out."
          );

        }
      }
    }
  );

  // ================================
  // MESSAGES
  // ================================

  sock.ev.on(
    "messages.upsert",
    async ({ messages }) => {

      const msg = messages[0];

      if (!msg || !msg.message) return;

      const from = msg.key.remoteJid;

      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        "";

      const command =
        text.trim().toLowerCase();

      // ================================
      // YOUTUBE SONG SEARCH
      // ================================

      if (command.startsWith(".song ")) {

        const query =
          command.slice(6).trim();

        if (!query) {

          await sock.sendMessage(from, {
            text:
              "🎵 *DULARA MD SONG SEARCH*\n\n" +
              "උදාහරණය:\n" +
              "`.song Deviyange Bare Rap`"
          });

          return;
        }

        if (!process.env.YOUTUBE_API_KEY) {

          await sock.sendMessage(from, {
            text:
              "❌ YouTube API Key එක setup කරලා නැහැ."
          });

          return;
        }

        try {

          await sock.sendMessage(from, {
            text:
              "🔎 YouTube එකේ search කරමින්...\n⏳ Please wait..."
          });

          const response =
            await axios.get(
              "https://www.googleapis.com/youtube/v3/search",
              {
                params: {
                  part: "snippet",
                  q: query,
                  type: "video",
                  maxResults: 5,
                  key:
                    process.env.YOUTUBE_API_KEY
                }
              }
            );

          const results =
            response.data.items;

          if (!results || !results.length) {

            await sock.sendMessage(from, {
              text:
                "❌ මේ නමට YouTube result එකක් හම්බුණේ නැහැ."
            });

            return;
          }

          let message =
            "╭───「 🎵 DULARA MD 」───╮\n\n";

          message +=
            "🔎 *YouTube Search Results*\n\n";

          results.forEach(
            (item, index) => {

              message +=
                `${index + 1}️⃣ *${item.snippet.title}*\n`;

              message +=
                `👤 ${item.snippet.channelTitle}\n`;

              message +=
                `🔗 https://youtu.be/${item.id.videoId}\n\n`;
            }
          );

          message +=
            "╰────────────────────╯\n\n";

          message +=
            `📌 *Reply කරන්න: 1 - ${results.length}*`;

          await sock.sendMessage(from, {
            text: message
          });

        } catch (error) {

          console.log(
            "❌ YouTube Search Error:",
            error?.message || error
          );

          await sock.sendMessage(from, {
            text:
              "❌ YouTube search කරන්න බැරි වුණා.\n\n" +
              "🔧 API Key / API quota එක check කරන්න."
          });
        }

        return;
      }

      // ================================
      // PING
      // ================================

      if (command === ".ping") {

        await sock.sendMessage(from, {
          text:
            "🏓 *Pong!*\n\n" +
            "🤖 Dulara MD\n" +
            "⚡ Bot is Online!\n" +
            "🟢 Status: Connected"
        });

        return;
      }

      // ================================
      // MENU
      // ================================

      if (command === ".menu") {

        await sock.sendMessage(from, {

          text:
`╭━━━「 🤖 DULARA MD 」━━━╮

⚡ *BOT COMMANDS*

🏓 .ping
📋 .menu
👑 .owner
ℹ️ .info

🎵 *MEDIA*

🎵 .song <song name>

🎬 *MOVIES*

🎥 .movie <movie name>

📥 *DOWNLOADS*

🎬 .video <YouTube link>
📁 .gdrive <link>
📁 .mediafire <link>

📱 *TELEGRAM*

📲 .telegram/<channel>

╰━━━━━━━━━━━━━━━━━━━━╯`

        });

        return;
      }

      // ================================
      // OWNER
      // ================================

      if (command === ".owner") {

        await sock.sendMessage(from, {
          text:
            "╭───「 👑 OWNER 」───╮\n\n" +
            "🤖 Dulara MD\n" +
            "👑 Bot Owner\n\n" +
            "╰──────────────────╯"
        });

        return;
      }

      // ================================
      // INFO
      // ================================

      if (command === ".info") {

        await sock.sendMessage(from, {
          text:
            "╭───「 ℹ️ DULARA MD 」───╮\n\n" +
            "🤖 Version: 1.0.0\n" +
            "🟢 Status: Online\n" +
            "⚡ Powered by Baileys\n\n" +
            "╰────────────────────╯"
        });

        return;
      }

    }
  );
}

// ================================
// START BOT
// ================================

startDularaMD();
