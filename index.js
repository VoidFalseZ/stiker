const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, downloadMediaMessage } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const { Readable } = require('stream');
const os = require('os');

// Set FFmpeg path based on OS
const isWindows = os.platform() === 'win32';
const ffmpegPath = isWindows
    ? path.join(__dirname, 'ffmpeg', 'bin', 'ffmpeg.exe')
    : path.join(__dirname, 'ffmpeg', 'bin', 'ffmpeg');

ffmpeg.setFfmpegPath(ffmpegPath);

const TEMP_DIR = path.join(__dirname, 'temp');

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('./session');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: 'silent' })
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed. Reconnecting:', shouldReconnect);
            if (shouldReconnect) {
                setTimeout(() => {
                    connectToWhatsApp();
                }, 5000); // Wait 5 seconds before reconnecting
            }
        } else if (connection === 'open') {
            console.log('WhatsApp bot connected!');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        const chatId = msg.key.remoteJid;

        // Only process if it's a quoted message with !sticker command
        if (text.toLowerCase() === '!s' && msg.message.extendedTextMessage?.contextInfo?.quotedMessage) {
            try {
                const quotedMsg = msg.message.extendedTextMessage.contextInfo.quotedMessage;
                const quotedKey = {
                    remoteJid: chatId,
                    id: msg.message.extendedTextMessage.contextInfo.stanzaId,
                    participant: msg.message.extendedTextMessage.contextInfo.participant
                };

                let mediaType = null;
                let buffer = null;

                // Check if quoted message is image
                if (quotedMsg.imageMessage) {
                    mediaType = 'image';
                    buffer = await downloadMediaMessage(
                        { key: quotedKey, message: quotedMsg },
                        'buffer',
                        {},
                        { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage }
                    );
                }
                // Check if quoted message is video
                else if (quotedMsg.videoMessage) {
                    const duration = quotedMsg.videoMessage.seconds || 0;
                    if (duration > 10) {
                        await sock.sendMessage(chatId, { text: 'Video must be 10 seconds or less!' });
                        return;
                    }
                    mediaType = 'video';
                    buffer = await downloadMediaMessage(
                        { key: quotedKey, message: quotedMsg },
                        'buffer',
                        {},
                        { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage }
                    );
                } else {
                    await sock.sendMessage(chatId, { text: 'Please reply to an image or video!' });
                    return;
                }

                if (buffer) {
                    const inputFile = path.join(TEMP_DIR, `input_${Date.now()}.${mediaType === 'image' ? 'jpg' : 'mp4'}`);
                    const outputFile = path.join(TEMP_DIR, `sticker_${Date.now()}.webp`);

                    fs.writeFileSync(inputFile, buffer);

                    await convertToSticker(inputFile, outputFile, mediaType);

                    const stickerBuffer = fs.readFileSync(outputFile);
                    await sock.sendMessage(chatId, {
                        sticker: stickerBuffer
                    });

                    // Cleanup
                    fs.unlinkSync(inputFile);
                    fs.unlinkSync(outputFile);
                }
            } catch (error) {
                console.error('Error processing sticker:', error);
                await sock.sendMessage(chatId, { text: 'Failed to create sticker. Please try again.' });
            }
        }
    });
}

function convertToSticker(inputPath, outputPath, mediaType) {
    return new Promise((resolve, reject) => {
        if (mediaType === 'video') {
            // Animated sticker for video - WhatsApp compatible
            // For very short videos, we need to loop them to ensure animation
            ffmpeg(inputPath)
                .inputOptions(['-stream_loop', '3'])  // Loop 3 times for short clips
                .outputOptions([
                    '-vcodec', 'libwebp',
                    '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,fps=15,pad=512:512:-1:-1:color=0x00000000,format=rgba',
                    '-loop', '0',
                    '-preset', 'picture',
                    '-an',
                    '-vsync', '0',
                    '-t', '3',  // Limit output to 3 seconds
                    '-quality', '75'
                ])
                .toFormat('webp')
                .save(outputPath)
                .on('end', () => resolve())
                .on('error', (err) => reject(err));
        } else {
            // Static sticker for image
            ffmpeg(inputPath)
                .outputOptions([
                    '-vcodec', 'libwebp',
                    '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:-1:-1:color=0x00000000,format=rgba',
                    '-preset', 'picture',
                    '-quality', '90'
                ])
                .toFormat('webp')
                .save(outputPath)
                .on('end', () => resolve())
                .on('error', (err) => reject(err));
        }
    });
}

// Start bot
connectToWhatsApp().catch(err => console.error('Failed to start bot:', err));
