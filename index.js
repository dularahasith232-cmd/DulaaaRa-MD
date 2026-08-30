const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require("@whiskeysockets/baileys");

const pino = require("pino");
const axios = require("axios");

const songSelections = new Map();
let isConnecting = false;

async function startDularaMD() {

  if (isConnecting) return;
  isConnecting = true;

  try {

    const { state, saveCreds } =
      await useMultiFileAuthState("./session");

    const sock = makeWASocket({
      auth: state,
      logger: pino({ level: "silent" }),
      printQRInTerminal: false
    });

    sock.ev.on("creds.update", saveCreds);

    // ========================================
    // 📱 WHATSAPP PAIRING
    // ========================================

    if (!state.creds.registered) {

      const phoneNumber = process.env.PHONE_NUMBER;

      if (!phoneNumber) {
        console.log("❌ PHONE_NUMBER is not set.");
        isConnecting = false;
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

        isConnecting = false;
        return;
      }
    }

    isConnecting = false;

    // ========================================
    // 🔌 CONNECTION
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

          console.log(
            "❌ Connection closed. Status:",
            statusCode
          );

          // Do NOT reconnect while waiting for pairing
          if (!state.creds.registered) {

            console.log(
              "📱 Waiting for WhatsApp pairing..."
            );

            return;
          }

          if (
            statusCode ===
            DisconnectReason.loggedOut
          ) {

            console.log(
              "❌ WhatsApp logged out."
            );

            return;
          }

          console.log(
            "🔄 Reconnecting in 5 seconds..."
          );

          setTimeout(() => {

            isConnecting = false;
            startDularaMD();

          }, 5000);
        }
      }
    );

    // ========================================
    // 💬 MESSAGE HANDLER
    // ========================================

    sock.ev.on(
      "messages.upsert",
      async ({ messages }) => {

        try {

          const msg = messages[0];

          if (!msg || !msg.message) return;

          const from =
            msg.key.remoteJid;

          const text =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            "";

          const command =
            text.trim().toLowerCase();

          // ==================================
          // 🎵 YOUTUBE SONG SEARCH
          // ==================================

          if (command.startsWith(".song ")) {

            const query =
              command.slice(6).trim();

            if (!query) {

              await sock.sendMessage(from, {
                text:
`╭───「 🎵 DULARA MD 」───╮

❌ Song name එකක් දෙන්න.

📌 Example:
.song Deviyange Bare Rap

╰────────────────────╯`
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
                  "🤖 🔎 YouTube search කරමින්...\n\n⏳ Please wait..."
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
                response.data.items || [];

              if (!results.length) {

                await sock.sendMessage(from, {
                  text:
                    "❌ Song එක හම්බුණේ නැහැ."
                });

                return;
              }

              songSelections.set(
                from,
                results
              );

              let message =
`╭───「 🎵 DULARA MD 」───╮

🔎 *YouTube Search Results*

`;

              results.forEach(
                (item, index) => {

                  const title =
                    item.snippet.title;

                  const channel =
                    item.snippet.channelTitle;

                  const videoId =
                    item.id.videoId;

                  message +=
`${index + 1}️⃣ *${title}*
👤 ${channel}
🔗 https://youtu.be/${videoId}

`;
                }
              );

              message +=
`╰────────────────────╯

📌 *Reply කරන්න: 1 - ${results.length}*

🤖 Number එක විතරක් යවන්න.`;

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
                  "❌ YouTube search කරන්න බැරි වුණා."
              });
            }

            return;
          }

          // ==================================
          // 🔢 SONG RESULT SELECTION
          // ==================================

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
`╭───「 🎵 SELECTED 」───╮

🎵 *${title}*

👤 Channel: ${channel}

🔗 https://youtu.be/${videoId}

⏳ Selected successfully!

╰────────────────────╯`
            });

            songSelections.delete(from);

            return;
          }

          // ==================================
          // 🏓 PING
          // ==================================

          if (command === ".ping") {

            await sock.sendMessage(from, {
              text:
`🏓 *Pong!*

🤖 *Dulara MD*
⚡ Bot is Online!
🟢 Status: Connected`
            });

            return;
          }

          // ==================================
          // 📋 MENU
          // ==================================

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

          // ==================================
          // 👑 OWNER
          // ==================================

          if (command === ".owner") {

            await sock.sendMessage(from, {
              text:
`╭───「 👑 OWNER 」───╮

🤖 Dulara MD
👑 Bot Owner

╰──────────────────╯`
            });

            return;
          }

          // ==================================
          // ℹ️ INFO
          // ==================================

          if (command === ".info") {

            await sock.sendMessage(from, {
              text:
`╭───「 ℹ️ DULARA MD 」───╮

🤖 Dulara MD
⚡ Version: 1.0.0
🟢 Status: Online

╰────────────────────╯`
            });

            return;
          }

        } catch (error) {

          console.log(
            "❌ Message Error:",
            error?.message || error
          );

        }
      }
    );

  } catch (error) {

    console.log(
      "❌ Start Error:",
      error?.message || error
    );

    isConnecting = false;
  }
}

// ========================================
// 🚀 START BOT
// ========================================

console.log("================================");
console.log("🚀 Starting DULARA MD...");
console.log("================================");

startDularaMD();
