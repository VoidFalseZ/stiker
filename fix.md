# WhatsApp Bot Connection Fix

## Problem
The bot was encountering a `Status: 405` (Method Not Allowed) error immediately upon connection, putting it into an infinite reconnection loop. This happens because WhatsApp Web regularly updates its backend protocols, and the `@whiskeysockets/baileys` connection was using an outdated default version or an unrecognized browser signature.

## Solution
To bypass the 405 error, the bot's connection logic in `index.js` was updated to explicitly fetch the latest WhatsApp Web version and imitate a standard desktop browser.

### 1. Updated Imports
Switched the import structure to correctly bring in all necessary variables from the `@whiskeysockets/baileys` package, as the default export (`makeWASocket`) behavior changed between versions.

```javascript
import baileysPkg from '@whiskeysockets/baileys';
const { 
  default: makeWASocket, 
  DisconnectReason, 
  useMultiFileAuthState, 
  downloadMediaMessage, 
  Browsers, 
  fetchLatestBaileysVersion 
} = baileysPkg;
```

### 2. Explicit Version Fetching & Browser Impersonation
Inside the `connectToWhatsApp()` function, we now fetch the latest required version from the WhatsApp servers before initializing the socket. Additionally, we use the `Browsers.macOS('Desktop')` config so WhatsApp recognizes the bot as a valid Desktop application login instead of rejecting it.

```javascript
    // 1. Fetch the exact version currently expected by WhatsApp servers
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`Using WA v${version.join('.')}, isLatest: ${isLatest}`);

    // 2. Pass the dynamic version and standard browser signature into the socket
    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: Browsers.macOS('Desktop'),
        printQRInTerminal: false
    });
```

These two changes ensure the bot connects using an up-to-date, recognizable handshake, preventing the 405 error loop.
