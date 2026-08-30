const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require("@whiskeysockets/baileys");

const pino = require("pino");

let isConnecting = false;


// ========================================
// 🤖 DULARA MD
// ========================================

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


    sock.ev.on(
      "creds.update",
      saveCreds
    );


    // ========================================
    // 📱 WHATSAPP PAIRING
    // ========================================

    if (!state.creds.registered) {

      const phoneNumber =
        process.env.PHONE_NUMBER;

      if (!phoneNumber) {

        console.log(
          "❌ PHONE_NUMBER is not set."
        );

        isConnecting = false;
        return;
      }


      try {

        console.log(
          "⏳ Requesting WhatsApp pairing code..."
        );


        // Give the socket time to initialize
        await new Promise(resolve =>
          setTimeout(resolve, 15000)
        );


        const code =
          await sock.requestPairingCode(
            phoneNumber.replace(/\D/g, "")
          );


        console.log(
          "================================"
        );

        console.log(
          "📱 DULARA MD PAIRING CODE"
        );

        console.log(
          "🔑 " + code
        );

        console.log(
          "================================"
        );

        console.log(
          "WhatsApp → Linked devices → Link a device"
        );

        console.log(
          "Enter the code above."
        );


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

          console.log(
            "================================"
          );

          console.log(
            "✅ DULARA MD CONNECTED!"
          );

          console.log(
            "================================"
          );
        }


        if (connection === "close") {

          const statusCode =
            lastDisconnect?.error?.output?.statusCode;


          console.log(
            "❌ Connection closed. Status:",
            statusCode
          );


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


          if (
            !msg ||
            !msg.message ||
            msg.key.fromMe
          ) {
            return;
          }


          const from =
            msg.key.remoteJid;


          const text =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            "";


          const command =
            text.trim().toLowerCase();


          // ==================================
          // 🏓 PING
          // ==================================

          if (command === ".ping") {

            await sock.sendMessage(from, {

              text:
`🏓 *PONG!*

🤖 DULARA MD
⚡ Bot is Online
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

🎬 *VIDEO*

.video <direct-video-url>

Example:

.video https://example.com/video.mp4

━━━━━━━━━━━━━━━━━━

🎬 *MOVIE*

.movie <movie name>

Movie search/download automation
is not enabled in this version.

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

🤖 *DULARA MD*

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

🤖 DULARA MD
⚡ Version: 1.0.0
🟢 Status: Online
📱 WhatsApp: Connected

╰────────────────────╯`

            });

            return;
          }


          // ==================================
          // 🎬 DIRECT VIDEO
          // ==================================

          if (command.startsWith(".video ")) {

            const videoUrl =
              text.trim().slice(7).trim();


            if (!videoUrl) {

              await sock.sendMessage(from, {

                text:
`🎬 *VIDEO*

❌ Direct video URL එකක් දෙන්න.

Example:

.video https://example.com/video.mp4`

              });

              return;
            }


            if (
              !videoUrl.startsWith("https://")
            ) {

              await sock.sendMessage(from, {

                text:
                  "❌ HTTPS URL එකක් දෙන්න."

              });

              return;
            }


            try {

              await sock.sendMessage(from, {

                react: {
                  text: "⏳",
                  key: msg.key
                }

              });

            } catch {}


            await sock.sendMessage(from, {

              text:
`╭───「 🎬 VIDEO 」───╮

⏳ Video එක ලබාගනිමින්...

🤖 Please wait...

╰──────────────────╯`

            });


            try {

              await sock.sendMessage(from, {

                video: {
                  url: videoUrl
                },

                mimetype:
                  "video/mp4",

                caption:
`🎬 *DULARA MD*

✅ Video sent successfully!`

              });


              try {

                await sock.sendMessage(from, {

                  react: {
                    text: "✅",
                    key: msg.key
                  }

                });

              } catch {}


            } catch (error) {

              console.log(
                "❌ Video Error:",
                error?.message || error
              );


              await sock.sendMessage(from, {

                text:
`❌ Video එක send කරන්න බැරි වුණා.

🔧 Direct video URL එක valid ද බලන්න.`

              });

            }

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


    setTimeout(() => {

      startDularaMD();

    }, 5000);

  }
}


// ========================================
// 🚀 START BOT
// ========================================

console.log(
  "================================"
);

console.log(
  "🚀 Starting DULARA MD..."
);

console.log(
  "================================"
);


startDularaMD();
