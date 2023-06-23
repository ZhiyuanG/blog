在 React Native 新架构下，一个重要的组成部分就是 `JSI`。在[之前的文章](https://juejin.cn/post/7094283295835291656)中介绍了旧架构下 Bridge 的通信机制，那么 `JSI` 的出现就是为了解决 Bridge 异步通信带来的性能问题。

# 什么是 JSI

JSI 的全称是 JavaScript Interfaces，[官网](https://reactnative.dev/architecture/glossary#javascript-interfaces-jsi)对它的介绍是：

> A lightweight API to embed a JavaScript engine in a C++ application. Fabric uses it to communicate between Fabric’s C++ core and React.

可以看到 `JSI` 是一个用于在 C++ 应用中嵌入 JavaScript 引擎的轻量 API。`Fabric` 用它进行 C++ 部分和 React 部分的通信。

这部分可以分为两点来理解：

1.  在 C++ 应用中嵌入 JavaScript 引擎的轻量 API。
1.  用于 C++ 和 JavaScript 的通信（因为 React 部分在 JavaScript 侧）。

## 嵌入 JavaScript 引擎的轻量 API

在 React Native 中，起初默认使用的是 JSC (JavaScriptCore) 作为 JavaScript 引擎。在 C++ 中嵌入使用 JSC 引擎时，需要在 C++ 侧做一些适配。比如在 Bridge 通信机制下，如果需要在 Javascript 运行环境下注入一些全局变量，那么就需要通过 C++ 侧适配 JSC 引擎进行。后来 Facebook 推出了 Hermes 引擎，那么 C++ 就需要增加一份对 Hermes 引擎的适配。

![Canvas 5.png](https://p9-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/94c5699653714c758d7eda34099bb1a6~tplv-k3u1fbpfcp-watermark.image?)

`JSI` 的出现给 JavaScript 引擎的接入提供了一套统一的接口，只要接入的引擎适配时继承这些接口并且完成自己的实现，那么就可以作为 React Native 的 JavaScript 引擎使用。这样一套统一接口，也给社区接入第三方引擎的可能性，出现了可以接入 [V8 引擎的库](https://github.com/Kudo/react-native-v8)。


![Canvas 4.png](https://p9-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/d838265bfc9e49099e6e594733500e16~tplv-k3u1fbpfcp-watermark.image?)

那么 `JSI` 中的接口具体包含什么内容呢？


![Canvas 6.png](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/acfd96426b1d4449aeb998b05bf427f5~tplv-k3u1fbpfcp-watermark.image?)

之前使用 Bridge 通信的一个主要原因就是 C++ 中的函数没办法完整映射到 JavaScript 中，让 JavaScript 直接调用，所以只能选择以序列化字符串的形式通过 Bridge 传输。而 `JSI` 做的事情就是将 C++ 中的常用类型一一映射到 JavaScript 中，这样带来的好处是在 C++ 中定义的对象和函数，就可以做到映射到 Javacript 中。这时再挂载在 JavaScript 侧的 global 对象上，那么就可以在 JavaScript 侧随时调用。

## 用于 C++ 和 JavaScript 的通信

我们先来回顾一下在 Bridge 通信情况下，如果 JavaScript 侧想要调用 Native 侧 TextModule 的 hello 方法的流程。JavaScript 侧会将调用序列化后传个 Bridge，Native 侧通过 Bridge 接收到消息后触发调用。

![Canvas 3.png](https://p6-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/6968a2b8de324be4ac64501f8ae9dcea~tplv-k3u1fbpfcp-watermark.image?)

有了 `JSI` 后，事情就变得简单了。因为提前在 JavaScript 侧通过 `JSI` 映射到了 C++ 侧的 TestModule 的实现。因此调用的时候就可以从 JavaScript 调用到 C++ 侧 TestModule 的 hello 方法。再由 C++ 去调用 Native 侧对应的方法。这样之前通过 Bridge 的异步通信，就成功的转变成了通过 `JSI` 的同步调用。如下图：


![Canvas 2.png](https://p1-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/0c8aaf3191124279879115a42d1cd802~tplv-k3u1fbpfcp-watermark.image?)

# JSI 带来的影响

## 调用原生模块性能提升

因为消除了 Bridge 带来的 `序列化` 和 `异步` 调用的开销，`JSI` 使得调用原生模块的性能提到了提高。社区中 [react-native-mmkv](<https://github.com/mrousavy/react-native-mmkv>) 库是一款基于 `JSI` 的键值对存储库，实现了所有的 API 都是同步调用。并且对比 `AsyncStorage` 库的读取性能得到了极大的提升。


![benchmark_1000_get.png](https://p6-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/ae3ccceb7773477cac1630f8ca919aa2~tplv-k3u1fbpfcp-watermark.image?)

***AsyncStorage vs MMKV**: Reading a value from Storage 1000 times.Measured in milliseconds on an iPhone 8, lower is better.*

## 开发原生模块增加了 C++ 侧的工作

可以看到由于 `JSI` 是连接 JavaScript 和 C++ 的桥梁，如果想再调用原生的方法，还需要从 C++ 侧去调用原生。因此一些原本在原生端就可以完成的模块开发，现在还需要在 C++ 侧做一层转接。需要注意的是在 iOS 开发时 C++ 和 Objective-C 互相调用是比较方便的，但是在 Android 开发时，C++ 和 Java 互相调用就没那么简单，还需要再加一层 `JNI`(Java Native Interface)。这个会在后续 `TurboModules` 的文章中详细介绍。

当然还有一种选择，将原本在原生 iOS 和 Android 侧的一些公共逻辑提取出来，写在 C++ 侧，这样就不用在两侧都写相似的逻辑。新架构下的 `Fabric` 渲染器就是将很大一部分渲染的逻辑，从 iOS 侧和 Android 侧抽取到了 C++ 侧。

# 总结

以上详细介绍了 React Native 新架构引入的 `JSI`。它作为新架构的重要一环，实现了对旧架构中依赖 Bridge 通信方式的替换。使得 JavaScript 侧可以同步调用原生模块，性能上带来了提升。但也给原生模块的开发带来了新的工作量。

理解 `JSI` 对于理解新架构中 `Fabric`，`TurboModules` 都有很大的帮助。后续也会一一进行介绍。