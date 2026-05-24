# sonata-sdk-packages

SDK packages for [Sonata](https://github.com/sonata-sdk/sonata) plugin development.

## Packages

| Package | Description | npm |
|---------|-------------|-----|
| [plugin-sdk](./packages/plugin-sdk) | Types, `register()`, and helpers for creating Sonata plugins | [`@sonata-sdk/plugin-sdk`](https://npmjs.com/package/@sonata-sdk/plugin-sdk) |

## Usage

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
      ctx.log('info', `Playing: ${track.info.title}`)
    })
  },
})
```

## License

[MIT](./LICENSE)
