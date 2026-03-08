# VPS Deployment Commands

## 1. On VPS Terminal - Fix FFmpeg Setup

```bash
cd ~/botwa/ffmpeg/bin
rm -f ffmpeg
tar -xf ../../ffmpeg-master-latest-linux64-gpl.tar.xz --strip-components=2 --wildcards '*/bin/ffmpeg'
chmod +x ffmpeg
./ffmpeg -version
cd ~/botwa
```

## 2. On Windows - Transfer Files to VPS

Open a new PowerShell terminal and run:

```powershell
cd d:\botwa
scp -r index.js package.json root@84.247.150.83:~/botwa/
```

## 3. On VPS - Install Dependencies and Setup

```bash
cd ~/botwa
npm install
npm install -g pm2
```

## 4. Start Bot with PM2

```bash
pm2 start index.js --name botwa
pm2 logs whatsapp-bot
```

Scan the QR code that appears in the logs.

## 5. Configure Auto-Start on Reboot

```bash
pm2 save
pm2 startup
```

Run the command that PM2 outputs.

## PM2 Management Commands

- View logs: `pm2 logs whatsapp-bot`
- Restart: `pm2 restart whatsapp-bot`
- Stop: `pm2 stop whatsapp-bot`
- Status: `pm2 status`
- Monitor: `pm2 monit`
