const express = require('express')
const multiparty = require('multiparty')
const fs = require('fs')
const path = require('path')
const { Buffer } = require('buffer')

const router = express.Router()
const staticPath = path.join(process.cwd(), '/public/files')
const staticTemporary = path.join(process.cwd(), '/public/temporary')

/* GET users listing. */
router.get('/detail', function (req, res) {
  console.log(req.query.id, fs.existsSync(`${staticPath}/文档`))
  res.send(`${req.query.id} respond with a resource`)
})

router.post('/', function (req, res) {
  const form = new multiparty.Form()
  form.parse(req, function (err, fields, files) {
    if (err) {
      res.send({
        code: 500,
        message: `${err.message},切片上传失败`
      })
      return
    }
    const filename = fields.name[0]
    const hash = fields.hash[0]
    const chunk = files.chunk[0]
    const dir = `${staticTemporary}/${hash}`
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir)
      const buffer = fs.readFileSync(chunk.path)
      const stream = fs.createWriteStream(`${dir}/${filename}`)
      stream.write(buffer)
      stream.close()
      res.send({
        code: 200,
        message: `${filename}切片上传成功`
      })
    } catch (error) {
      res.send({ code: 500, message: `${filename}切片上传失败` })
    }
  })
})

router.get('/merge', function (req, res) {
  try {
    const { hash, filename } = req.query
    let len = 0
    const bufferList = fs
      .readdirSync(`${staticTemporary}/${hash}`)
      .map((chunk) => {
        const buffer = fs.readFileSync(`${staticTemporary}/${hash}/${chunk}`)
        len += buffer.length
        return buffer
      })
    const fileBuffer = Buffer.concat(bufferList, len)
    const stream = fs.createWriteStream(`${staticPath}/${filename}`)
    stream.write(fileBuffer)
    stream.close()
    res.send({ code: 200, message: `${filename}合并成功` })
  } catch (error) {
    res.send({ code: 500, message: `${filename}合并文件失败` })
  }
})
module.exports = router
