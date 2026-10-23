import nodemailer from 'nodemailer'
import type SMTPTransport from 'nodemailer/lib/smtp-transport'
import type { getAuthConfig } from './auth-config'

export function getMailTransportOptions(config: ReturnType<typeof getAuthConfig>): SMTPTransport.Options {
  const local = ['localhost', '127.0.0.1', '::1'].includes(config.SMTP_HOST)
  const secure = config.SMTP_SECURE === 'true'
  return {
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure,
    requireTLS: !local && !secure,
    tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
    auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD } : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000
  }
}

export function createMailTransport(config: ReturnType<typeof getAuthConfig>) {
  return nodemailer.createTransport(getMailTransportOptions(config))
}
