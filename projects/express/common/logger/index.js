const fs = require('fs')
const path = require('path')
const fileStreamRotator = require('file-stream-rotator')
const { createLogger, format, transports } = require('winston')

const { combine, timestamp, printf } = format
const logDirectory = path.join(process.cwd(), 'logs')
const myFormat = printf(({ level, message, timestamp }) => {
  return `${timestamp} ${level}: ${message}`
})

// 收集错误日志
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

// 创建日志文件流
// 使用---
// app.use(logger('combined', { stream: { write: logWriteStream() } }))
const logWriteStream = () => {
  const stream = fs.createWriteStream(path.join(logDirectory, 'access.log'), {
    flags: 'a'
  })
  return (line) => {
    stream && stream.write(line)
  }
}

// 日志切割-按天分日志
// 使用---
// app.use(morgan('combined', { stream: rotateLogStream }))
const rotateLogStream = fileStreamRotator.getStream({
  date_format: 'YYYYMMDD', //日期类型
  filename: path.join(logDirectory, '%DATE%-access.log'), //文件名
  frequency: 'daily', //每天的频率
  verbose: false,
  max_logs: 60
})

module.exports = {
  rotateLogStream,
  logWriteStream,
  logger
}
