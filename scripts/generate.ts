import { JSDOM } from 'jsdom'
import fs from 'node:fs'
import path from 'node:path'

fs.readdirSync(path.resolve(__dirname, '../docs')).forEach(file => {
  if (file.endsWith('.html')) {
    console.log(file)
    const currentFileDiscriptor = path.resolve(__dirname, '../docs', file)
    const originalContent = fs.readFileSync(currentFileDiscriptor);

    const jsdom = new JSDOM(originalContent.toString());
    const { window } = jsdom;

    if (!window.document.head.innerHTML) {
      window.document.head.innerHTML = `
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/styles/default.min.css">
        <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/highlight.min.js"></script>
        <link href="../build/initial.css" rel="stylesheet">
        <script>hljs.highlightAll();</script>
      `
    }
    
    fs.writeFileSync(currentFileDiscriptor, jsdom.serialize())
  }
})

// const originalContent = fs.readFileSync(path.resolve(__dirname, '../docs/react-native-bridge.html'));

