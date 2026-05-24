# @sonata-sdk/plugin-sdk

SDK for creating plugins for [Sonata](https://github.com/sonata-sdk/sonata) — the Lavalink-compatible audio server.

## Install

```bash
npm install @sonata-sdk/plugin-sdk
```

## Usage

```js
import { register } from '@sonata-sdk/plugin-sdk'

export default register({
  name: 'my-plugin',
  version: '1.0.0',
  install(ctx) {
    ctx.onTrackStart((guildId, track) => {
      ctx.log('info', `Tocando: ${track.info.title}`)
    })

    ctx.registerRoute('GET', '/my-plugin/status', (req, res) => {
      res.end(JSON.stringify({ ok: true }))
    })
  },
})
```

## API

### `register(plugin)`
Valida e retorna a definição do plugin.

### `PluginContext`
- `config` — configuração por plugin
- `onTrackStart`, `onTrackEnd`, `onTrackStuck`, `onTrackException`
- `onQueueEnd`, `onPlayerUpdate`, `onQueueEvent`
- `registerRoute(method, path, handler)`
- `log(level, message, ...args)`

### `SonataPlugin`
Classe base opcional:

```js
import { SonataPlugin } from '@sonata-sdk/plugin-sdk'

export default new (class extends SonataPlugin {
  constructor() { super('my-plugin', '1.0.0') }
  start() {
    this.onTrackStart((guildId, track) => {
      this.log('info', `Tocando: ${track.info.title}`)
    })
  }
})()
```

## Related

- [Sonata](https://github.com/sonata-sdk/sonata) — Lavalink-compatible audio server
- [sonata-sdk-packages](https://github.com/sonata-sdk/sonata-sdk-packages) — Monorepo for all Sonata SDK packages

## License

[MIT](./LICENSE)
