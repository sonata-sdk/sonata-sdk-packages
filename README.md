<div align="center">
  <h1>📦 sonata-sdk-packages</h1>
  <p><strong>Official SDK packages for the Sonata ecosystem</strong></p>
  <p>
    <img src="https://img.shields.io/github/license/sonata-sdk/sonata-sdk-packages?color=blue" alt="License" />
    <img src="https://img.shields.io/github/last-commit/sonata-sdk/sonata-sdk-packages?color=green" alt="Last Commit" />
    <img src="https://img.shields.io/npm/v/@sonata-sdk/plugin-sdk?color=blueviolet" alt="npm" />
    <img src="https://img.shields.io/badge/node-20%2B-339933?logo=node.js" alt="Node" />
  </p>
  <p>
    <a href="#-packages">Packages</a> •
    <a href="#-usage">Usage</a> •
    <a href="#-development">Development</a> •
    <a href="#-contributing">Contributing</a>
  </p>
  <br />
  <hr />
</div>

> Monorepo for all Sonata SDK packages. These packages let you build plugins, extend functionality, and integrate with [**Sonata**](https://github.com/sonata-sdk/sonata) — the high-performance Lavalink-compatible audio server.

---

## 📦 Packages

| Package | Version | Description |
|---------|---------|-------------|
| [**plugin-sdk**](./packages/plugin-sdk) | [![npm](https://img.shields.io/npm/v/@sonata-sdk/plugin-sdk)](https://npmjs.com/package/@sonata-sdk/plugin-sdk) | Types, `register()` helper, and base class for creating Sonata plugins |
| [**voice**](./packages/voice) | [![npm](https://img.shields.io/npm/v/@sonata-sdk/voice)](https://npmjs.com/package/@sonata-sdk/voice) | Discord voice connection — WebSocket gateway, UDP, RTP, encryption, DAVE/MLS |
| [**decoder**](./packages/decoder) | [![npm](https://img.shields.io/npm/v/@sonata-sdk/decoder)](https://npmjs.com/package/@sonata-sdk/decoder) | Audio decoders — MP3, FLAC, AAC with bundled FAAD2 WASM |
| [**ws**](./packages/ws) | [![npm](https://img.shields.io/npm/v/@sonata-sdk/ws)](https://npmjs.com/package/@sonata-sdk/ws) | Zero-dependency WebSocket client with auto-reconnect |

---

## 🚀 Usage

```bash
npm install @sonata-sdk/plugin-sdk
```

```js
import { register } from '@sonata-sdk/plugin-sdk'

export default register({
  name: 'my-plugin',
  version: '1.0.0',
  install(ctx) {
    ctx.onTrackStart((guildId, track) => {
      ctx.log('info', `Now playing: ${track.info.title}`)
    })

    ctx.registerRoute('GET', '/my-plugin/stats', (req, res) => {
      res.end(JSON.stringify({ ok: true }))
    })
  },
})
```

Then load it in your Sonata config:

```js
// config.js
export default {
  plugins: {
    npm: ['@sonata-sdk/plugin-sdk'],
    paths: ['./my-plugin.js'],
  }
}
```

---

## 🛠️ Development

```bash
git clone https://github.com/sonata-sdk/sonata-sdk-packages.git
cd sonata-sdk-packages
cd packages/plugin-sdk
npm install
npm run build
```

### Adding a new package

1. Create `packages/<name>/` with a `package.json` scoped to `@sonata-sdk/`
2. Implement and build your package
3. Add it to the packages table in this README
4. Open a pull request

---

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

---

## 🎵 Related

- [**Sonata**](https://github.com/sonata-sdk/sonata) — Lavalink-compatible audio server

---

<div align="center">
  <sub>MIT License · Built with ❤️</sub>
</div>
