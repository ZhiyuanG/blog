### 环境
pnpm: 8.3.1

### 安装依赖
```
pnpm install
```

### 构建
目前如果新增文章，放在 docs 目录下，然后修改 package.json 中 convert 指令（下一步改为自动的脚本）。

```
pnpm run css
pnpm run convert
pnpm run generate
```