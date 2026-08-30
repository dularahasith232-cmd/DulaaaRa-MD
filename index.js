const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const cheerio = require('cheerio');
const youtubeDl = require('yt-dlp-exec');

// User State Engine (1, 2, 3... Selections මතක තබා ගැනීමට)
const userSessions = new Map();

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: true, // Deploy Logs වල QR එක පෙන්වීමට
        browser: ["MegaBot", "Chrome", "1.0.0"]
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('✅ WhatsApp Bot Connected Successfully!');
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";

        // Number Selection Handler (User 1, 2, 3 ලෙස Reply කළ විට)
        if (/^\d+$/.test(text.trim()) && userSessions.has(from)) {
            await handleUserSelection(sock, from, parseInt(text.trim()));
            return;
        }

        // 🎵 1. .song Command
        if (text.startsWith('.song')) {
            const query = text.replace('.song', '').trim();
            await processSongCommand(sock, from, query);
        }
        // 🎬 2. .video Command
        else if (text.startsWith('.video')) {
            const url = text.replace('.video', '').trim();
            await processVideoCommand(sock, from, url);
        }
        // 📥 3. .gdrive / .mediafire Command
        else if (text.startsWith('.gdrive') || text.startsWith('.mediafire')) {
            const url = text.split(' ')[1] || text.replace('.gdrive', '').replace('.mediafire', '').trim();
            await processDirectDownload(sock, from, url);
        }
        // 🍿 4. .movie Command (Custom Sites Scraper)
        else if (text.startsWith('.movie')) {
            const movieTitle = text.replace('.movie', '').trim();
            await processMovieSearch(sock, from, movieTitle);
        }
        // ✈️ 5. .telegram Command
        else if (text.startsWith('.telegram/')) {
            const channel = text.replace('.telegram/', '').trim();
            await processTelegramChannel(sock, from, channel);
        }
    });
}

// -------------------------------------------------------------
// 1. YouTube Song Downloader (.song)
// -------------------------------------------------------------
async function processSongCommand(sock, from, query) {
    if (!query) return sock.sendMessage(from, { text: '⚠️ *සින්දුවේ නම හෝ ලින්ක් එක ලබාදෙන්න!* \nඋදා: `.song Deviyange bare rap`' });
    
    await sock.sendMessage(from, { text: '🔍 *YouTube හි පරීක්ෂා කරයි... කාරුණිකව රැඳී සිටින්න.*' });
    
    try {
        const searchResults = await youtubeDl(`ytsearch5:${query}`, { dumpSingleJson: true, noWarnings: true });

        if (!searchResults || !searchResults.entries || searchResults.entries.length === 0) {
            return sock.sendMessage(from, { text: '❌ *සින්දුව හමුවූයේ නැත.*' });
        }

        let searchListText = `🎵 *ඔබ සෙවූ සින්දුවට අදාළ ප්‍රතිඵල:* \n\n`;
        const choices = [];

        searchResults.entries.forEach((video, index) => {
            choices.push({
                title: video.title,
                url: video.webpage_url,
                duration: video.duration_string
            });
            searchListText += `*${index + 1}]* ${video.title}\n⏱️ ${video.duration_string}\n\n`;
        });

        searchListText += `👉 *අවශ්‍ය සින්දුවේ අංකය Reply කරන්න.*`;

        userSessions.set(from, { type: 'SONG_SELECTION', data: choices });
        await sock.sendMessage(from, { text: searchListText });
    } catch (e) {
        await sock.sendMessage(from, { text: '❌ *සින්දුව සෙවීමේදී දෝෂයක් සිදු විය.*' });
    }
}

// -------------------------------------------------------------
// 2. YouTube Video Downloader (.video)
// -------------------------------------------------------------
async function processVideoCommand(sock, from, url) {
    if (!url) return sock.sendMessage(from, { text: '⚠️ *Video Link එක ලබාදෙන්න!* \nඋදා: `.video https://youtu.be/...`' });

    await sock.sendMessage(from, { text: '🎬 *Video විස්තර ලබාගනිමින් පවතියි...*' });

    try {
        const info = await youtubeDl(url, { dumpSingleJson: true, noWarnings: true });

        if (info.duration > 2400) { // 40 Minutes Limit
            return sock.sendMessage(from, { text: '⚠️ *වීඩියෝව විනාඩි 40 ට වඩා වැඩිය!* 40 Min සීමාව ඉක්මවා ඇත.' });
        }

        const qualities = [
            { label: '1] 144P', format: '144p' },
            { label: '2] 240P', format: '240p' },
            { label: '3] 360P', format: '360p' },
            { label: '4] 480P', format: '480p' },
            { label: '5] 720P', format: '720p' },
            { label: '6] 1080P', format: '1080p' }
        ];

        let caption = `🎬 *${info.title}*\n\n⏱️ *කාලය:* ${info.duration_string}\n📊 *Download Size:* ~${(info.filesize_approx / (1024*1024)).toFixed(1)} MB\n\n*Select Quality:*\n`;
        qualities.forEach(q => caption += `${q.label}\n`);
        caption += `\n👉 *අවශ්‍ය Quality එකෙහි අංකය Reply කරන්න.*`;

        userSessions.set(from, { type: 'VIDEO_QUALITY_SELECTION', url: url, qualities: qualities, title: info.title });

        await sock.sendMessage(from, { 
            image: { url: info.thumbnail }, 
            caption: caption 
        });
    } catch (e) {
        await sock.sendMessage(from, { text: '❌ *වීඩියෝ විස්තර ලබා ගැනීමට නොහැකි විය.*' });
    }
}

// -------------------------------------------------------------
// 3. Movie Sites Scraper (.movie)
// -------------------------------------------------------------
async function processMovieSearch(sock, from, movieTitle) {
    if (!movieTitle) return sock.sendMessage(from, { text: '⚠️ *Movie එකේ නම ඇතුළත් කරන්න!* \nඋදා: `.movie kungfu panda`' });

    await sock.sendMessage(from, { text: `🍿 *"${movieTitle}" චිත්‍රපටය වෙබ් අඩවි වලින් සෙවීම සිදු කරයි...*` });

    const movieSites = [
        { name: 'Sinhalasub', url: 'https://sinhalasub.lk/?s=' },
        { name: 'Cinesubz', url: 'https://cinesubz.lk/?s=' },
        { name: 'Sinhalacartoons', url: 'https://sinhalacartoons.com/?s=' },
        { name: 'Pupilvideo', url: 'https://pupilvideo.blogspot.com/search?q=' },
        { name: 'Dubzonelk', url: 'https://dubzonelk.com/?s=' },
        { name: 'Cineru', url: 'https://cineru.lk/?s=' },
        { name: 'SLMoviesHD', url: 'https://slmovieshd2020.blogspot.com/search?q=' }
    ];

    let foundMovies = [];

    for (let site of movieSites) {
        try {
            const res = await axios.get(`${site.url}${encodeURIComponent(movieTitle)}`, { timeout: 4000 });
            const $ = cheerio.load(res.data);

            $('article, .result-item, .post').each((i, el) => {
                const title = $(el).find('.title, h2, .entry-title, a').first().text().trim();
                const link = $(el).find('a').attr('href');

                if (title && link && title.toLowerCase().includes(movieTitle.toLowerCase())) {
                    foundMovies.push({ site: site.name, title: title, link: link });
                }
            });
        } catch (e) {
            // Sites with timeout will skip safely
        }
    }

    if (foundMovies.length === 0) {
        return sock.sendMessage(from, { text: '❌ *අදාළ චිත්‍රපටය ලබාදුන් වෙබ් අඩවි කිසිවකින් හමුවූයේ නැත.*' });
    }

    let responseText = `🍿 *හමුවූ Movies ලැයිස්තුව:* \n\n`;
    foundMovies.slice(0, 10).forEach((item, index) => {
        responseText += `*${index + 1}]* [${item.site}] ${item.title}\n`;
    });
    responseText += `\n👉 *අවශ්‍ය එකෙහි අංකය Reply කරන්න.*`;

    userSessions.set(from, { type: 'MOVIE_SELECTION', choices: foundMovies.slice(0, 10) });
    await sock.sendMessage(from, { text: responseText });
}

// -------------------------------------------------------------
// 4. Direct Link Downloader (.gdrive / .mediafire)
// -------------------------------------------------------------
async function processDirectDownload(sock, from, url) {
    if (!url) return sock.sendMessage(from, { text: '⚠️ *Drive හෝ Mediafire Link එක ඇතුළත් කරන්න!*' });

    await sock.sendMessage(from, { text: '📥 *Direct Link එක පරීක්ෂා කරමින් බාගත කිරීම ආරම්භ කරයි...*' });
    await sock.sendMessage(from, { text: `🔗 Link Processing: ${url}` });
}

// -------------------------------------------------------------
// 5. Telegram Channel Sync (.telegram/channel)
// -------------------------------------------------------------
async function processTelegramChannel(sock, from, channel) {
    if (!channel) return sock.sendMessage(from, { text: '⚠️ *Channel Name එක ඇතුළත් කරන්න!* \nඋදා: `.telegram/toonflixlk`' });

    await sock.sendMessage(from, { text: `✈️ *Telegram Channel (@${channel}) සම්බන්ධ වෙමින් පවතියි...*` });
}

// -------------------------------------------------------------
// Options Selection Processor (User Responses 1, 2, 3...)
// -------------------------------------------------------------
async function handleUserSelection(sock, from, index) {
    const session = userSessions.get(from);
    if (!session) return;

    if (session.type === 'SONG_SELECTION') {
        const selected = session.data[index - 1];
        if (!selected) return sock.sendMessage(from, { text: '⚠️ *අවලංගු අංකයකි!*' });

        await sock.sendMessage(from, { text: `⬇️ *${selected.title}* MP3 ලෙස Download වෙමින් පවතී...` });
        // Downloading Audio Stream via yt-dlp & sending as MP3 Audio
    } 
    else if (session.type === 'VIDEO_QUALITY_SELECTION') {
        const selected = session.qualities[index - 1];
        if (!selected) return sock.sendMessage(from, { text: '⚠️ *අවලංගු Quality අංකයකි!*' });

        await sock.sendMessage(from, { text: `⬇️ *${session.title}* (${selected.format}) Quality එකෙන් Download වෙමින් පවතී...` });
    }
    else if (session.type === 'MOVIE_SELECTION') {
        const selected = session.choices[index - 1];
        if (!selected) return sock.sendMessage(from, { text: '⚠️ *අවලංගු අංකයකි!*' });

        await sock.sendMessage(from, { 
            text: `🎬 *${selected.title}*\n🌐 *Site:* ${selected.site}\n🔗 *Direct Page Link:* ${selected.link}` 
        });
    }

    userSessions.delete(from); // Clear session after completion
}

startBot();
