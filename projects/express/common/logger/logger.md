---
title: express log
---

## morgan

`express` 会用 `morgan` 作日志管理
我们正常使用：

```js
const app = express()
const logDirectory = path.join(__dirname, 'logs')

const logWriteStream = () => {
  const stream = fs.createWriteStream(path.join(logDirectory, 'access.log'), {
    flags: 'a'
  })
  return (line) => {
    stream && stream.write(line)
  }
}
app.use(logger('combined', { stream: { write: logWriteStream() } }))
```

由于日志会越来越多, 造成一定的浪费,可以通过 `file-stream-rotator` 对日志进行切割

```js
const rotateLogStream = fileStreamRotator.getStream({
  date_format: 'YYYYMMDD', //日期类型
  filename: path.join(logDirectory, '%DATE%-access.log'), //文件名
  frequency: 'daily', //每天的频率
  verbose: false,
  max_logs: 60 // 最多保存 log 文件数
})
app.use(morgan('combined', { stream: rotateLogStream }))
```

## winston

由于 `morgan` 只能记录 `http` 请求的日志，所以我们还需要 `winston` 来记录其它想记录的日志

```js
const { createLogger, format, transports } = require('winston')
const { combine, timestamp, printf } = format
const logDirectory = path.join(process.cwd(), 'logs')
const myFormat = printf(({ level, message, timestamp }) => {
  return `${timestamp} ${level}: ${message}`
})
const logger = createLogger({
  level: 'error',
  format: combine(timestamp(), myFormat),
  transports: [
    new transports.Console(),
    new transports.File({
      filename: path.join(logDirectory, 'error.log')
    })
  ]
})
```

## 参考

1. [morgan+file-stream-rotator 日志管理](https://juejin.cn/post/7107155976997830670)
2. [npm morgan](https://www.npmjs.com/search?q=morgan)
3. [npm file-stream-rotator](https://www.npmjs.com/package/file-stream-rotator)
4. [npm winston](https://www.npmjs.com/package/winston)
5. [Node.js 日志神器](https://juejin.cn/post/6865926810061045774)
