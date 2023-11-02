# Webpack 搭建服务端渲染开发环境

# 背景

Webpack 大家都再熟悉不过，平时我们的前端单页应用用 Webpack 构建的顺风顺水，开发环境指令一跑，webpack dev server 一启动，就可以开始愉快的调试了。但是有一天需求来了，要在现有的单页应用基础上加上服务端渲染。就要对本地开发环境的开启一轮改造了，需求可以细化为四点：

1. 一次启动同时构建 client 和 server 端
2. client 和 server 端复用同一个 html 的内容
3. client 和 server 端都要有热更新
4. server 端在 html 中插入 css 内容

接下来就来一一实现。

# 同时构建 client 和 server 端

因为 client 和 server 构建产物的目标环境不同，我们只能分开构建，这里有简化版的 config 配置。

```jsx
const clientConfig = {
	mode: 'development',
  entry: './client.js'
}

const serverConfig = {
	mode: 'development',
  target: 'node',
	entry: './server.js',
	plugins: [
    new StartServerPlugin({
      name: 'server.js'
    })
  ]
}
```

在同时构建两端的时候，我们可以有两种选择：

1. webpack 的 api 支持传入 config 数组。

```jsx
const compiler = webpack([clientConfig, serverConfig])
```

1. 为 client 和 server 分别创建各自的 compiler。

```jsx
const clientCompiler = webpack(clientConfig)
const serverCompiler = webpack(serverConfig)
```

第一种方式相比第二种方式区别在于每次构建和热更新的时候都要构建两端。但是考虑到我们在本地开发时，有时候只是想调试 client 端的代码，这时如果等待 client 和 server 端都刷新后才能看到结果其实是一种时间浪费。同时也考虑到分开构建 client 端可以继续使用 webpack-dev-server。因此我们选用第二种方式。

```jsx
// dev.js
const clientCompiler = webpack(clientConfig)
const serverCompiler = webpack(serverConfig)

const clientDevServer = new webpackDevServer(clientCompiler, { port: 3000 })

clientDevServer.listen(3000)
```

# client 和 server 端复用 html 的内容

在我们之前的应用中，在 html 中有不少共用的初始化逻辑。因此在 server 端直出的 html 内容中，除了增加的服务端渲染的内容之外，希望其他的都和之前保持一致。这就要求我们 server 端要使用 client 构建出来的 html 的内容。

这其中涵盖了两个问题：

1. server 端的构建需要在 client 端构建之后。
2. server 端如何获取到 client 端构建的 html 内容。

第一个问题比较好解决，利用 webpack compiler hooks 的 api，我们可以指定在 client 端构建完成后再触发 server 端的构建。

```jsx
// dev.js
let watching
clientCompiler.hooks.done.tap('mySSR', () => {
  if (watching) {
    return
  }

  if (serverCompiler) {
    watching = serverCompiler.watch({}, () => {})
  }
})
```

第二个问题稍微麻烦一点，因为在 server 端并不知道 client 端的构建产物。因此需要一个东西作为媒介，架起这个桥梁。这时可以使用 `WebpackManifestPlugin` 将构建产物的信息输出在一个文件中，这样就可以在 server 启动的过程中去加载这个文件。

```jsx
// config.js
const clientConfig = {
	mode: 'development',
  entry: './client.js',
	plugins: [
    new HtmlWebpackPlugin({
      inject: true,
      template: 'src/index.html',
      filename: 'index.html'
    }),
    new WebpackManifestPlugin({
      fileName: 'assets.json',
      writeToFileEmit: true
		})
  ]
}

// assets.json
{
	html: http://localhost:3000/index.html,
  bundle: http://localhost:3000/bundle.js
}

// serverApp.js
const express = require('express')
const { renderToString } = require('react-dom/server')

import App from './src/index.js'

const assets = require('./dist/assets.json')
const html = fetch(assets.html)

const app = express()

app.get('my-route', (req, res) => {
	res.send(html.replace('<-- SSR_CONTENT -->', renderToString(<App />)))
}

export default app
```

# client 和 server 端热更新

本地开发阶段，热更新对于开发体验来说非常重要，修改完成后能尽快的看到效果，对于开发效率提升很大。因为 client 端的热更新配置和之前单页应用一致，所以在这里不再赘述了。这里主要介绍下在 server 端怎么完成热更新的配置。

热更新的配置是基于 webpack 的 HotModuleReplacementPlugin 去实现的，具体是在 entry 配置加上热更新的入口文件，同时在代码里利用 [module.hot](http://module.hot) 去完成热更新的监听。

```jsx
// config.js
const serverConfig = {
	entry: ['webpack/hot/poll?1000', './server.js'],
}

// server.js
import app from './serverApp'

let server = app.listen(3001, () => {
  console.log('app listeng on port ', 3001)
})

if (module.hot) {
  module.hot.accept('./serverApp', () => {
    server.close(() => {
      server = app.listen(3001, () => {
        console.log('app listeng on port ', 3001)
      })
    })
  })
}
```

# server 端在 html 中插入 css 内容

在 client 端构建的时候，我们在开发环境常用 `style-loader` 插件去完成热更新，在生产环境常用 `mini-css-extract-plugin` 去抽离出 css 文件完成动态加载。但是在 server 端构建时， `style-loader` 没办法用了，因为其中使用到了 `document` , `window` 这种浏览器特有变量。谷歌了一番，发现了 `isomorphic-style-loader` 这款适用于 server 端的替代插件。但是看了它的使用说明后，只能遗憾放弃。它不仅要求 webpack 的配置修改，还要在代码中将每个使用了引用了 css 样式的组件套上 WithStyle 的高阶组件，这对我们这种现有的大型项目来说改造成本就很高了。因此只能依赖曲线救国的方式，采用和 html 相同的处理，让 client 端构建时候输出 css 文件，server 端去读取 css 文件并且插入到 html 中。