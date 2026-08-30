const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require("@whiskeysockets/baileys");

const pino = require("pino");
const axios = require("axios");

// ========================================
// DULARA MD
// ========================================

const songSelections = new Map();

async function startDularaMD() {

  const { state, saveCreds } =
    await useMultiFileAuthState("./session");

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: "silent" })
  });

  sock.ev.on("creds.update", saveCreds);

  // ========================================
  // WHATSAPP PAIRING
  // ========================================

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

  // ========================================
  // CONNECTION
  // ========================================

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

  // ========================================
  // MESSAGE HANDLER
  // ========================================

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

      // ========================================
      // 🎵 SONG SEARCH
      // ========================================

      if (command.startsWith(".song ")) {

        const query =
          command.slice(6).trim();

        if (!query) {

          await sock.sendMessage(from, {
            text:
              "╭───「 🎵 DULARA MD 」───╮\n\n" +
              "❌ Song name එකක් දෙන්න.\n\n" +
              "📌 Example:\n" +
              ".song Deviyange Bare Rap\n\n" +
              "╰────────────────────╯"
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

          // Searching message
          await sock.sendMessage(from, {
            text:
              "🤖 🔎 YouTube එකේ search කරමින්...\n\n" +
              "⏳ Please wait..."
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

          if (!results || results.length === 0) {

            await sock.sendMessage(from, {
              text:
                "❌ මේ නමට YouTube result එකක් හම්බුණේ නැහැ."
            });

            return;
          }

          // Save results for 1 / 2 / 3 / 4 / 5 selection
          songSelections.set(from, results);

          let message =
            "╭───「 🎵 DULARA MD 」───╮\n\n";

          message +=
            "🔎 *YouTube Search Results*\n\n";

          results.forEach(
            (item, index) => {

              const title =
                item.snippet.title;

              const channel =
                item.snippet.channelTitle;

              const videoId =
                item.id.videoId;

              message +=
                `${index + 1}️⃣ *${title}*\n`;

              message +=
                `👤 ${channel}\n`;

              message +=
                `🔗 https://youtu.be/${videoId}\n\n`;
            }
          );

          message +=
            "╰────────────────────╯\n\n";

          message +=
            `📌 *Reply කරන්න: 1 - ${results.length}*\n`;

          message +=
            "🤖 Number එක විතරක් යවන්න.";

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

      // ========================================
      // 🎵 SONG RESULT SELECTION
      // ========================================

      if (
        /^[1-5]$/.test(command) &&
        songSelections.has(from)
      ) {

        const results =
          songSelections.get(from);

        const index =
          Number(command) - 1;

        const selected =
          results[index];

        if (!selected) {

          await sock.sendMessage(from, {
            text:
              "❌ ඒ number එකේ result එකක් නැහැ."
          });

          return;
        }

        const title =
          selected.snippet.title;

        const channel =
          selected.snippet.channelTitle;

        const videoId =
          selected.id.videoId;

        await sock.sendMessage(from, {
          text:
            "╭───「 🎵 SELECTED 」───╮\n\n" +
            `🎵 *${title}*\n\n` +
            `👤 Channel: ${channel}\n\n` +
            `🔗 https://youtu.be/${videoId}\n\n` +
            "✅ Song එක select කළා!\n\n" +
            "╰────────────────────╯"
        });

        // Clear selection
        songSelections.delete(from);

        return;
      }

      // ========================================
      // 🏓 PING
      // ========================================

      if (command === ".ping") {

        await sock.sendMessage(from, {
          text:
            "🏓 *Pong!*\n\n" +
            "🤖 *Dulara MD*\n" +
            "⚡ Bot is Online!\n" +
            "🟢 Status: Connected"
        });

        return;
      }

      // ========================================
      // 📋 MENU
      // ========================================

      if (command === ".menu") {

        await sock.sendMessage(from, {
          text:
`╭━━━「 🤖 DULARA MD 」━━━╮

⚡ *BOT COMMANDS*

🏓 .ping
📋 .menu
👑 .owner
ℹ️ .info

━━━━━━━━━━━━━━━━━━

🎵 *SONG*

🎵 .song <song name>

Example:
.song Deviyange Bare Rap

━━━━━━━━━━━━━━━━━━

🎬 *MOVIE*

🎬 .movie <movie name>

━━━━━━━━━━━━━━━━━━

📥 *DOWNLOAD*

🎥 .video <YouTube link>

📁 .gdrive <link>

📁 .mediafire <link>

━━━━━━━━━━━━━━━━━━

📱 *TELEGRAM*

📲 .telegram/<channel>

╰━━━━━━━━━━━━━━━━━━╯`
        });

        return;
      }

      // ========================================
      // 👑 OWNER
      // ========================================

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

      // ========================================
      // ℹ️ INFO
      // ========================================

      if (command === ".info") {

        await sock.sendMessage(from, {
          text:
            "╭───「 ℹ️ DULARA MD 」───╮\n\n" +
            "🤖 Dulara MD\n" +
            "⚡ Version: 1.0.0\n" +
            "🟢 Status: Online\n\n" +
            "╰────────────────────╯"
        });

        return;
      }

    }
  );
}

// ========================================
// START BOT
// ========================================

console.log("🚀 Starting DULARA MD...");

startDularaMD();
