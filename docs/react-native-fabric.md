Fabric 是 React Native 新的架构中渲染器，是新架构的主要部分，也是新旧架构中变化最大的地方。了解新知识的一个重要方式是与已知的知识产生联系，形成对比。本文就沿着这个思路，从一张图入手，介绍什么是 Fabric。

这是关于 React Native 架构解析的系列文章：

-   [React Native 架构解析 - Bridge 通信篇](https://juejin.cn/post/7094283295835291656)[]()
-   [React Native 架构解析 - 揭秘 JSI](https://juejin.cn/post/7095271631689351175)

# 回顾 React-DOM

在使用 `react` 开发的时候，对于 `react-dom` ，我们都再熟悉不过。Web 端我们几乎都能看到 `ReactDOM.render` 作为 `react` 框架渲染的入口。为了方便理解 `Fabric` 的职责，我们先回顾下 `react-dom` 做了什么。


![Canvas 1.jpg](https://p9-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/d12401e8344b4012be0b23135943ca7d~tplv-k3u1fbpfcp-watermark.image?)

`react-dom` 作为一个独立的库，担起了 `react` 和 `Web` 之间的桥梁。在 `react` 的 render 和 commit 阶段， `react-dom` 会创建或更新 DOM 树，并且最终渲染到 `Web` 页面上。

# 了解 Fabric 的第一张图

针对 `Fabric` ，我们也有类似的流程图：


![Canvas 2.jpg](https://p1-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/b20adb22d4d1435cafb27e448a13e3e9~tplv-k3u1fbpfcp-watermark.image?)

> react-dom = react-native-renderer + fabric + native api

## React-Native-Renderer

在 `React-Native` 应用中，我们似乎并没有见到类似 `ReactDOM.render` 的入口，经常看到的是：

```
AppRegistry.registerComponent(appName, () => App);
```

如果我们在 `react-native` 源码中顺着 `AppRegistry.registerComponent` 看下去，可以找到这样一段代码：

```
// Libaries/ReactNative/renderApplication.js 

if (fabric) {
  require('../Renderer/shims/ReactFabric').render(
    renderable,
    rootTag,
    null,
    useConcurrentRoot,
  );
} else {
  require('../Renderer/shims/ReactNative').render(renderable, rootTag);
}
```

看到这里，就看到了熟悉的 `render` 方法。暴露这个 `render` 方法的是 `ReactFabric` 和 `ReactNative` 这两个文件。这两个也正分别是 React Native 新旧两种架构下的渲染器。

> 这里值得一提的是，在 `react-native` 仓库中的 `Renderer` 下的源码实际上在 `react` 库下的 `react-native-renderer`，这里只是打包后的代码。想进一步参考源码的可以前往 `react` 仓库。

回到上图，到这里我们就找到了粉红色部分代表的 `react-native-renderer` 部分作为 JS 侧的 render 入口了。 `react-native-renderer` 和 `react` 配合，在 `react` 的 render 和 commit 阶段共同工作，但是这次不同的是，针对 Native(Android/iOS) 环境，不需要 `react-native-renderer` 去生成 DOM 树，而是转换为 Native 能理解的树形结构，我们称之为 `Shadow Tree` 。因为 `Shadow Tree` 要依赖 `Yoga(C++ 库)` 去计算 `layout`，因此 `Shadow Tree` 要维护在 C++ 侧或原生侧。这就迎来了我们的主角 `Fabric` 。

## Fabric

Fabric 渲染器承担起了生成 `Shadow Tree` 和调用 `Yoga` 计算 layout 的主要工作。 `react-native-renderer` 在与 `react` 配合时，会有创建和更新 `Shadow Tree` 节点的需要，这时就只需要调用 `Fabric` 暴露给 JS 侧的方法，就可以轻松的同步完成。 这里也可以再回顾下在旧架构下的流程图。


![Canvas 3.jpg](https://p6-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/5f3eed146cc74fa48b723369e0a0ad62~tplv-k3u1fbpfcp-watermark.image?)

可以看到 Fabric 的两大转变：

1.  告别 Bridge 异步通信。得益于 `JSI` 的存在， `react-native-renderer` 作为 JS 代码，能够畅通无阻的调用 `Fabric` 的 C++ 代码。关于 Bridge 通信和 JSI，可以参考之前的文章。
1.  将渲染逻辑从 Native(Android/iOS) 侧统一到 C++ 侧。这带来的好处是类似的逻辑无需在 Android 和 iOS 两侧各维护一份，同时也为将来接入更多的 Native 平台做好了准备。

## Native API

上面说到 Fabric 将存在于 Native 的渲染逻辑整合到了 C++ 侧。但是作为最终要渲染到 Native 的平台上，还是需要 Native 的 API 去完成最后的渲染到屏幕的工作。因此在整体的架构中还是需要基于 Native API 的协作。

# 小结

以上从一张与 `react-dom` 对比的一张图，对 React Native 新架构中 `Fabric` 扮演的角色作了宏观的介绍，其中先省去了很多细节。希望对大家对 `Fabric` 的认识有所帮助。