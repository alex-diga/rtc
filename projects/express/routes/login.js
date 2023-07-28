const express = require('express')
const jwt = require('jsonwebtoken')
const { TOKEN_SECRET_KEY } = require('../common/index')

const router = express.Router()

router.post('/', function (req, res) {
  const { username, password } = req.body
  if (username === 'admin' && password === '123456') {
    const token = jwt.sign({ username }, TOKEN_SECRET_KEY, { expiresIn: '12h' })
    res.send({
      code: 200,
      message: '登录成功',
      result: token
    })
  } else {
    res.send({
      code: 500,
      message: '登录失败',
      result: null
    })
  }
})

module.exports = router
