const createError = require('http-errors')
const express = require('express')
const expressWs = require('express-ws')
const cookieParser = require('cookie-parser')
const morgan = require('morgan')
const path = require('path')
const cors = require('cors')
const { expressjwt } = require('express-jwt')
const { logger, rotateLogStream } = require('./common/logger')
const iceRouter = require('./routes/ice')
const loginRouter = require('./routes/login')
const indexRouter = require('./routes/index')
const uploadRouter = require('./routes/upload')
const { TOKEN_SECRET_KEY } = require('./common/index')

const app = express()
app.use(cors())
expressWs(app)
app.use(morgan('combined', { stream: rotateLogStream }))
app.use(express.json())
app.use(express.urlencoded({ extended: false }))
app.use(cookieParser())
app.use('/static', express.static(path.join(__dirname, 'public')))

app.use(
  expressjwt({ secret: TOKEN_SECRET_KEY, algorithms: ['HS256'] }).unless({
    path: ['/login', '/ws', /^\/static\/.*/, /^(?!\/api).*/]
  })
)

app.use('/login', loginRouter)
app.use('/api', indexRouter)
app.use('/api/upload', uploadRouter)
app.use('/ws/ice', iceRouter)
// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404))
})

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message
  res.locals.error = req.app.get('env') === 'development' ? err : {}

  // render the error page
  const code = err.status || 500
  const message = err.message || '请求失败'
  logger.error(`"method: ${req.method}" api: [${req.url}] ${code}-${message}`)
  res.status(code)
  res.send({ code, message })
})

module.exports = app
