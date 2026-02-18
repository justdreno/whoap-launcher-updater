# Whoap Launcher

A modern, sleek Minecraft launcher built with React, TypeScript, and Electron. Designed with a minimal monochrome aesthetic and full offline support.

![Whoap Launcher](https://whoap.net/screenshot.png)

## ✨ Features

- **🎮 Modern UI** - Clean, minimal interface with dark theme
- **🌐 Full Offline Support** - Play without internet connection
- **☁️ Cloud Sync** - Sync profiles, skins, and settings across devices
- **📦 Mod Management** - Easy mod and modpack installation
- **🎨 Custom Themes** - Monochrome design with accent colors
- **👥 Multi-Account** - Switch between Microsoft, Whoap, and offline accounts
- **🔄 Auto-Update** - Automatic launcher updates
- **🎯 Discord Integration** - Rich presence support

## 🚀 Quick Start

```bash
# Clone the repository
git clone https://github.com/justdreno/whoap-launcher-updater.git
cd whoap-launcher-updater

# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build
```

## 🎨 Design System & UI Principles

### Color Palette

We use a **minimal monochrome** design philosophy with strategic use of accent colors.

#### Primary Colors
```css
--color-bg-primary: #000000;      /* Main background */
--color-bg-secondary: #0a0a0a;    /* Card backgrounds */
--color-bg-tertiary: #111111;     /* Elevated surfaces */
--color-border: #1a1a1a;          /* Borders and dividers */
--color-border-hover: #333333;    /* Hover states */
```

#### Text Colors
```css
--color-text-primary: #ffffff;    /* Headings, important text */
--color-text-secondary: #888888;  /* Body text, descriptions */
--color-text-tertiary: #666666;   /* Placeholders, hints */
--color-text-muted: #444444;      /* Disabled, subtle text */
```

#### Accent Colors (Use Sparingly)
```css
--color-accent: #ff8800;          /* Primary accent - orange */
--color-accent-hover: #ff5500;    /* Hover state */
--color-success: #4ade80;         /* Success states */
--color-error: #ff4444;           /* Error states */
--color-warning: #ffcc00;         /* Warning states */
```

**⚠️ IMPORTANT:** Only use accent colors for:
- Active states
- Primary actions (Play button)
- Success/error feedback
- Selected items

### Typography

#### Font Family
```css
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
```

#### Hierarchy
| Level | Size | Weight | Usage |
|-------|------|--------|-------|
| H1 | 28px | 800 | Page titles |
| H2 | 22px | 700 | Section headers |
| H3 | 18px | 600 | Card titles |
| Body | 14px | 400 | Regular text |
| Small | 12px | 500 | Labels, metadata |
| Tiny | 11px | 600 | Tags, badges (uppercase) |

### Spacing System

We use a **4px base grid** system:

```css
--space-1: 4px;   /* Tight spacing */
--space-2: 8px;   /* Compact */
--space-3: 12px;  /* Default */
--space-4: 16px;  /* Comfortable */
--space-5: 20px;  /* Loose */
--space-6: 24px;  /* Section padding */
--space-8: 32px;  /* Large sections */
--space-10: 40px; /* Page padding */
```

### Border Radius

```css
--radius-sm: 6px;   /* Small elements */
--radius-md: 10px;  /* Buttons, inputs */
--radius-lg: 12px;  /* Cards */
--radius-xl: 16px;  /* Modals, panels */
--radius-full: 9999px; /* Pills, avatars */
```

### Shadows

Use shadows sparingly for depth:

```css
--shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.2);
--shadow-md: 0 4px 12px rgba(0, 0, 0, 0.3);
--shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.4);
--shadow-glow: 0 4px 15px rgba(255, 136, 0, 0.3); /* Accent glow */
```

### Components

#### Buttons

**Primary Button (White on Dark)**
```css
background: #ffffff;
color: #000000;
border-radius: 12px;
padding: 14px 24px;
font-weight: 700;
```
- Use for main actions (Play, Create, Save)
- Hover: `background: #e5e5e5`
- Loading state: Show spinner, disable interaction

**Secondary Button (Transparent)**
```css
background: transparent;
border: 1px solid #333333;
color: #888888;
```
- Use for secondary actions
- Hover: `border-color: #555555; color: #ffffff`

**Danger Button**
```css
background: transparent;
border: 1px solid rgba(255, 68, 68, 0.3);
color: #ff5f56;
```
- Use for destructive actions (Delete, Remove)
- Hover: `background: rgba(255, 68, 68, 0.1)`

#### Cards

```css
background: #0a0a0a;
border: 1px solid #1a1a1a;
border-radius: 16px;
padding: 24px;
```
- Hover: `border-color: #333333`
- Use for containers, panels, modals

#### Inputs

```css
background: rgba(255, 255, 255, 0.05);
border: 1px solid rgba(255, 255, 255, 0.1);
border-radius: 12px;
padding: 14px 16px;
color: #ffffff;
```
- Focus: `border-color: #333333; background: rgba(255, 255, 255, 0.08)`
- Error: `border-color: #ff4444`
- Placeholder: `#555555`

#### Tabs

```css
/* Container */
background: rgba(255, 255, 255, 0.05);
border-radius: 12px;
padding: 4px;

/* Tab */
padding: 12px 20px;
border-radius: 10px;
color: #666666;

/* Active Tab */
background: #ffffff;
color: #000000;
```

### Animations

#### Transitions
```css
--transition-fast: 0.15s ease;
--transition-normal: 0.2s ease;
--transition-slow: 0.3s ease;
```

#### Hover Effects
- Buttons: `transform: translateY(-2px)` + shadow increase
- Cards: Border color change + subtle lift
- Links: Opacity change or underline

#### Loading States
- Spinner: Rotate 360deg infinite
- Skeleton: Pulse opacity 0.5-1.0
- Progress: Smooth width transition

## 📁 Project Structure

```
whoap-launcher/
├── electron/                 # Electron main process
│   ├── managers/            # Core managers (Auth, Instances, etc.)
│   ├── launcher/            # Game launching logic
│   ├── protocol-handlers/   # Custom URL protocols
│   └── main.ts              # Main entry point
├── src/                     # React frontend
│   ├── api/                 # API wrappers
│   ├── components/          # Reusable components
│   ├── context/             # React contexts
│   ├── layouts/             # Page layouts
│   ├── pages/               # Page components
│   ├── utils/               # Utility functions
│   ├── assets/              # Static assets
│   └── App.tsx              # Main app component
├── public/                  # Public assets
└── package.json
```

## 🔧 Architecture

### State Management
- **Local State**: React useState for component-level state
- **Global State**: Context API for app-wide state (User, Toast, etc.)
- **Persistent State**: 
  - electron-store for main process data
  - localStorage for renderer cache
  - Instance JSON files for profile data

### Communication
- **IPC (Inter-Process Communication)**:
  - `ipcMain.handle()` in main process
  - `window.ipcRenderer.invoke()` in renderer
- **Protocol Handlers**: Custom `whoap://` URLs for skins/assets

### Offline Strategy
1. **Cache Layer**: LocalStorage + filesystem caching
2. **Queue System**: Sync queue for offline actions
3. **Graceful Degradation**: Disable features when offline
4. **Conflict Resolution**: UI for resolving sync conflicts

## 🧪 Development Guidelines

### Code Style
- Use **TypeScript** for all new code
- Follow **ESLint** and **Prettier** config
- Use **functional components** with hooks
- Prefix private methods with `_`

### Naming Conventions
- Components: PascalCase (`LoginModal.tsx`)
- Utilities: camelCase (`formatDate.ts`)
- CSS Modules: `ComponentName.module.css`
- Constants: UPPER_SNAKE_CASE

### File Organization
- One component per file
- Co-locate styles: `Component.tsx` + `Component.module.css`
- Group related components in folders
- Index files for clean imports

### Performance
- Use `React.memo()` for expensive renders
- Lazy load non-critical pages
- Debounce search inputs (300ms)
- Virtualize long lists
- Cache API responses

### Accessibility
- Use semantic HTML elements
- Add `aria-labels` to icon buttons
- Ensure keyboard navigation
- Maintain color contrast ratios

## 🔐 Security

- Never commit credentials or API keys
- Use environment variables for sensitive data
- Validate all IPC inputs
- Sanitize user-generated content
- Use contextIsolation in Electron

## 📦 Building

### Development
```bash
npm run dev          # Start dev server with hot reload
```

### Production
```bash
npm run build        # Build for production
npm run dist         # Create distributable
```

### Platform-specific
```bash
npm run dist:win     # Windows
npm run dist:mac     # macOS
npm run dist:linux   # Linux
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

### Commit Message Format
```
type(scope): description

[optional body]

[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting
- `refactor`: Code restructuring
- `test`: Tests
- `chore`: Maintenance

## 📄 License

This project is proprietary software. All rights reserved.

## 🆘 Support

- Discord: [dsc.gg/whoap](https://dsc.gg/whoap)
- GitHub Issues: [Report a bug](https://github.com/justdreno/whoap-launcher-updater/issues)
- Email: support@whoap.net

---

Built with ❤️ by the Whoap Team
