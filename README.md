# 🟠 WHOAP

<div align="center">

### The Next Level Minecraft Launcher

![Version](https://img.shields.io/badge/version-2.3.7-orange?style=for-the-badge)
![License](https://img.shields.io/badge/license-ISC-blue?style=for-the-badge)
![Platform](https://img.shields.io/badge/platform-Windows-blue?style=for-the-badge)

---

![Whoap Launcher Preview](./public/home_page.png)

---

**Whoap** is a modern Minecraft launcher built with Electron and React, featuring a stunning dark UI, intelligent instance management, and seamless offline support.

[🌐 Website](https://github.com/justdreno/Whoap-Launcer) ·
[📜 Roadmap](./roadmap.md) ·
[💬 Discord](https://dsc.gg/whoap) ·
[🐛 Report Bug](https://github.com/justdreno/Whoap-Launcer/issues)

</div>

---

## ✨ Features

### 🎮 Instance Management
- **Multiple Instances** - Create, duplicate, and manage separate game instances
- **Instance Isolation** - Each instance has its own mods, saves, and configurations
- **Import External Versions** - Import from TLauncher or other launchers
- **Export Instances** - Export instances as .zip archives

### 🛠️ Mod Support
- **Mod Manager** - Browse and install mods easily
- **Modpack Browser** - Browse and install modpacks
- **Resource Packs** - Manage resource packs per instance
- **Shader Packs** - Configure shader packs
- **CustomSkinLoader** - Support for custom skins and capes
- **Local Skins** - Import and use your own skin files

### 🎨 User Experience
- **Modern Dark UI** - Stunning glassmorphism design with blur effects
- **Animations** - Smooth transitions (toggleable in settings)
- **Resizable Window** - Flexible window sizing
- **3D Skin Viewer** - Preview your skin in 3D
- **Server Status** - Check any server's status

### ⚙️ Performance
- **JVM Presets** - Instant optimization profiles:
  - 🥔 **Potato** - Low-end, max 2GB RAM
  - 📦 **Standard** - Balanced, 4GB RAM
  - 🚀 **Pro** - Power user, 8GB RAM
  - ⚡ **Extreme** - Peak power, 12GB+ RAM
- **Custom JVM** - Full manual control for advanced users
- **Java Manager** - Auto-detect and configure Java runtimes (8, 11, 16, 17, 21)

### ☁️ Cloud Features
- **Cloud Saves** - Sync your saves across devices (Whoap accounts)
- **Screenshot Upload** - Upload and share screenshots
- **Settings Sync** - Sync launcher settings

### 🔗 Integrations
- **Discord RPC** - Show what you're playing on Discord
- **Proxy Support** - HTTP and SOCKS5 proxy support
- **Microsoft Auth** - Official Microsoft account login
- **Offline Mode** - Play without internet connection

---

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher)
- [Git](https://git-scm.com/)
- Windows 10/11

### Installation

```bash
# Clone the repository
git clone https://github.com/justdreno/Whoap-Launcer.git
cd Whoap-Launcer

# Install dependencies
npm install

# Start development server
npm run dev
```

### Building

```bash
# Build for production
npm run build
```

The installer will be generated in the `dist` folder.

---

## 📁 Project Structure

```
Whoap-Launcer/
├── electron/           # Electron main process
│   ├── main.ts         # App entry point
│   ├── managers/       # Manager classes (updates, skins, etc.)
│   └── launcher/       # Minecraft launch logic
├── public/             # Static assets
├── src/                # React frontend
│   ├── api/           # API definitions
│   ├── components/    # Reusable UI components
│   ├── context/       # React contexts
│   ├── layouts/       # Page layouts
│   ├── pages/         # Page components
│   ├── services/      # Business logic
│   ├── utils/         # Utility functions
│   └── assets/        # Images and icons
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 🛠️ Tech Stack

| Technology | Purpose |
|------------|---------|
| **React 19** | UI Framework |
| **TypeScript** | Type Safety |
| **Electron** | Desktop App Shell |
| **Vite** | Build Tool |
| **CSS Modules** | Styling |
| **Supabase** | Cloud Backend |
| **Minecraft Launcher Core** | Game Launching |

---

## 📝 Configuration

### Game Path
By default, Whoap uses `~/.minecraft` for game data. You can change this in Settings.

### Java
Whoap auto-detects installed Java versions. You can also manually configure paths for each version (8, 11, 16, 17, 21) in Settings.

### JVM Arguments
Choose from preset configurations or customize your own JVM arguments for optimal performance.

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📜 Roadmap

Check out our [Roadmap](./roadmap.md) to see what's coming next!

---

## 📧 Contact

**Navidu** - [@justdreno](https://github.com/justdreno/whoap-Launcer)

- 💬 **Discord**: https://dsc.gg/whoap
- 🐛 **Issues**: https://github.com/justdreno/Whoap-Launcer/issues

---

<div align="center">

**Built with ❤️ by Navidu**

*The Next Level Minecraft Launcher*

</div>
