# React Native 的旧架构

在 React Native 旧的架构下（相对基于 Fabric 的新架构而言），JS 和 Native 的通信都是通过 Bridge 进行的。Bridge 作为通信的桥梁，JS 端和 Native 端的信息都会先进行序列化后，传给 Bridge，再传给对方。因此要深入的了解 React Native 旧的架构，需要先搞清楚 Bridge 的运行原理。

![React Native.jpg](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/df050f09c8d049ea9a6819432f369d59~tplv-k3u1fbpfcp-watermark.image?)

# 一个简单的 Demo
先来看一个简单的 RN 应用：
```javascript
import React from 'react';
import {SafeAreaView, Text, AppRegistry} from 'react-native';

const App = () => {
  return (
    <SafeAreaView
      style={{
        height: 800,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center'
      }}>
      <Text style={{fontSize: 20}}>Hello World</Text>
    </SafeAreaView>
  );
};

AppRegistry.registerComponent('demo', () => App);
```

同时开启 MessageQueue 的 spy 监听，开启监听后会在控制台打印出 Bridge 的通信内容。

```javascript
import MessageQueue from 'react-native/Libraries/BatchedBridge/MessageQueue';

MessageQueue.spy(true);
```

运行后可以在控制台看到如图的信息：

![Untitled.png](https://p9-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/2eb264b204b14b1185d9cb547ae44e9f~tplv-k3u1fbpfcp-watermark.image?)

*N→JS 代表从 Native 侧传给 JS 侧的信息，JS→N 代表从 JS 侧传给 Native 侧的信息。*

红线框出的两处：

1.  N→JS: AppRegistry.runApplication() 可以看到 Native 侧发送了开始运行应用的指令。从这看出决定应用开始运行的是 Native 端。
1.  JS→N: UIManager.creatView()/UIManager.setChildren() 可以看到 JS 侧在 React 框架下解析好页面组件后，开始像 Native 端发送创建 ShadowTree 的指令，并且最终在 Native 端渲染到屏幕上。

因此一个简单 RN 应用的启动过程可以用下面的流程图总结。


![RN .jpg](https://p9-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/335f846f677a47d188bb97802024f779~tplv-k3u1fbpfcp-watermark.image?)

# JS → Native 的 Bridge 源码分析

Bridge 在 JS 侧的实现主要在 `/Libraries/BatchedBridge` 目录下。

```
Libraries
└───BatchedBridge
│   │   BatchedBridge.js
│   │   MessageQueue.js
│   │   NativeModules.js
```

其中 MessageQueue 是 Bridge 的定义类，大部分逻辑在这个类中。BatchedBridge 是 MessageQueue 类的一个实例，作为一个 bridge 全局实例。NativeModules.js 中会用 BatchedBridge 封装一下 Native 提供的原生模块。接下来会先重点分析 MessageQueue 的内容。

```
// 简化的代码
class MessageQueue {
    _queue: [number[], number[], mixed[], number];

    enqueueNativeCall() {
        //...
    }

    invokeCallbackAndReturnFlushedQueue() {
        //...
    }

    flushedQueue() {
        //...
    }
    //...
}
```

这是简化的 MessageQueue 的结构，主要抽取了和 JS → Native 发送消息相关的部分。可以看到其中一个重要的数据结构是一个 `_queue` 数组，JS → Native 的消息一般（也存在直接调用 Native 执行的情况，本文不作介绍）都会先推入到这个队列中，在一定情况下被取出执行。在 JS → Native 发送消息时，可以分为两种类型：带返回结果的和不带返回结果的。

> 不带返回结果的消息


![JS -_ Native.drawio.png](https://p6-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/23f8614aa31b413098095bd1946b1a5b~tplv-k3u1fbpfcp-watermark.image?)

调用 Native 的 modules 后首先会执行 `enqueueNativeCall` 将需要执行的函数和参数序列化后存在 `_queue` 队列中。进入队列后，并不会立即被 Native 侧执行，而是等到一定的条件后，Native 侧进行一次 `flushQueue` 的操作，将这段时间内 `_queue` 一次性挨个执行。这里 `flushQueue` 发生的条件可以分为三种情况：

1.  JS → Native 时进行 `enqueNativeCall` 发现距离上次 `flushQueue` 的时间已经超过 5ms，此时会立即执行 `flushQueue` 操作。
1.  Native → JS 触发 `invokeCallbackAndReturnFlushedQueue` 时，会执行 `flushQueue` 。
1.  Native → JS 触发 `callFunctionReturnFlushedQueue` 时，会执行 `flushQueue` 。

第 1 种情况是上面介绍的场景经常发生的情况。第 2，3 种情况涉及到 Native 侧调用 JS 侧，会在下文进行介绍。

> 带返回结果的消息

对于不带返回结果的消息，只要 Native 侧执行对应的函数后，就宣告结束了。但对于带返回结果的消息而言，Native 侧还需要一种方式能够将返回的结果通知给 JS 侧。


![JS -_ Native 2.drawio.png](https://p6-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/267969f0763d4c86a4baa200fa107fe0~tplv-k3u1fbpfcp-watermark.image?)

对于带返回结果的消息，Native 侧在执行完相应的函数后，需要再调用 JS 侧的 `invokeCallbackAndReturnFlushedQueue` 将函数返回的结果传给 JS 侧。与此同时，Native 侧会拿到最新的 `_queue` 的队列，进行执行。

# Native → JS 的 Bridge 源码分析

相对于 JS → Native 的消息传送，Native → JS 的过程就简单很多。

```
// 简化的代码
class MessageQueue {
    this._lazyCallableModules = {};
	
    callFunctionReturnFlushedQueue() {
            //...
    }
    //...
}
```

在 JS 侧启动的时候会注册一些可以调用的 module 存入 `this._lazyCallableModules` 对象中，当 Native 侧调用 `callFunctionReturnFlushedQueue` 方法，最终根据 moduleName 和 methodName，执行 `this._lazyCallableModules` 中存入模块对应的方法。


![Copy of JS -_ Native.drawio.png](https://p1-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/d1321e96fba74a48bc9abaa14f32c75f~tplv-k3u1fbpfcp-watermark.image?)

流程图如上图所示，这里需要注意的是 Native 侧调用 JS 侧的过程相对简单的原因有两点：

1.  Native 侧没有一个队列，而是每次调用时立即调用。
1.  Native 侧调用 JS 侧的函数都是默认不需要返回结果的。

同时上文中也提到，执行 `callFunctionReturnFlushedQueue` 时也会执行 `flushQueue`，这也会清空一次 JS 侧的 `_queue` 队列。

# 小结

本文从 JS 侧 MessageQueue 的实现介绍了 React Native 旧的架构中重要的 Bridge 通信方式。其中的 JS 侧向 Native 侧发送消息采用 `批量` 的方式，这也是大家挑战旧架构带来性能问题的重要原因之一。这也给后续推出 Fabric 架构解决这个问题埋下了伏笔。