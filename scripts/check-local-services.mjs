import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createConnection } from 'node:net'
import { S3Client, HeadBucketCommand, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import pg from 'pg'

const host = '127.0.0.1'
const number = (name, fallback) => Number(process.env[name] || fallback)

async function checkPostgres() {
  const client = new pg.Client({
    host,
    port: number('POSTGRES_PORT', 5432),
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB,
    connectionTimeoutMillis: 5000,
  })

  try {
    await client.connect()
    const result = await client.query('SELECT 1 AS ready')
    assert.equal(result.rows[0].ready, 1)
    console.log('PostgreSQL: подключение и запрос работают')
  } finally {
    await client.end()
  }
}

async function checkStorage() {
  const client = new S3Client({
    region: 'us-east-1',
    endpoint: `http://${host}:${number('S3_PORT', 8333)}`,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY,
      secretAccessKey: process.env.S3_SECRET_KEY,
    },
  })
  const Bucket = process.env.S3_BUCKET
  const Key = `smoke/${randomUUID()}.txt`

  try {
    await client.send(new HeadBucketCommand({ Bucket }))
    await client.send(new PutObjectCommand({ Bucket, Key, Body: 'petmemoreal-smoke' }))
    const response = await client.send(new GetObjectCommand({ Bucket, Key }))
    assert.equal(await response.Body.transformToString(), 'petmemoreal-smoke')
    console.log('S3: bucket доступен, запись и чтение работают')
  } finally {
    try {
      await client.send(new DeleteObjectCommand({ Bucket, Key }))
    } finally {
      client.destroy()
    }
  }
}

async function checkMailpit() {
  const web = await fetch(`http://${host}:${number('MAILPIT_WEB_PORT', 8025)}/api/v1/info`)
  assert.equal(web.ok, true, `Mailpit Web: HTTP ${web.status}`)

  await new Promise((resolve, reject) => {
    const socket = createConnection({ host, port: number('MAILPIT_SMTP_PORT', 1025) })
    socket.setTimeout(5000)
    socket.once('data', (data) => {
      if (!data.toString().startsWith('220')) {
        reject(new Error('Mailpit SMTP: неверное приветствие'))
      } else {
        resolve()
      }
      socket.end('QUIT\r\n')
    })
    socket.once('error', reject)
    socket.once('timeout', () => reject(new Error('Mailpit SMTP: превышено время ожидания')))
  })
  console.log('Mailpit: веб-интерфейс и SMTP доступны')
}

try {
  await checkPostgres()
  await checkStorage()
  await checkMailpit()
} catch (error) {
  console.error('Проверка локальных сервисов не прошла:', error.message)
  process.exitCode = 1
}
