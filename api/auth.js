import type { VercelRequest, VercelResponse } from '@vercel/node'

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY
const DOMAIN = process.env.DOMAIN || 'hollywood-ai-agent.xyz'

const users = new Map<string, { email: string; name: string; plan: string; paid: boolean; stripeCustomerId?: string }>()
const sessions = new Map<string, string>()

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const path = req.query.path || ''

  if (path === 'google-login') {
    const redirectUri = `https://${DOMAIN}/api/auth/callback/google`
    const scope = 'email profile'
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline`
    return res.redirect(url)
  }

  if (path === 'callback/google') {
    const { code } = req.query
    if (!code) {
      return res.status(400).json({ error: 'No code provided' })
    }
    try {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: code as string,
          client_id: GOOGLE_CLIENT_ID || '',
          client_secret: GOOGLE_CLIENT_SECRET || '',
          redirect_uri: `https://${DOMAIN}/api/auth/callback/google`,
          grant_type: 'authorization_code',
        }),
      })
      const tokenData = await tokenRes.json()
      const accessToken = tokenData.access_token

      const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const userData = await userRes.json()

      const userId = userData.id
      const email = userData.email
      const name = userData.name
      
      if (!users.has(userId)) {
        users.set(userId, { email, name, plan: 'starter', paid: false })
      }

      const sessionToken = Math.random().toString(36).substring(2)
      sessions.set(sessionToken, userId)

      res.setHeader('Set-Cookie', `session=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`)
      return res.redirect(`/ai?welcome=${encodeURIComponent(name)}`)
    } catch (e) {
      return res.status(500).json({ error: 'Auth failed' })
    }
  }

  if (path === 'signup') {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' })
    }
    const { email, plan, name } = req.body
    if (!email) {
      return res.status(400).json({ error: 'Missing email' })
    }

    const userId = 'user_' + Math.random().toString(36).substring(2, 12)
    users.set(userId, { email, name: name || email.split('@')[0], plan: plan || 'starter', paid: false })

    const sessionToken = Math.random().toString(36).substring(2)
    sessions.set(sessionToken, userId)

    res.setHeader('Set-Cookie', `session=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`)
    return res.status(200).json({ 
      success: true, 
      userId,
      name: name || email.split('@')[0],
      plan: plan || 'starter'
    })
  }

  if (path === 'check') {
    const cookie = req.headers.cookie
    if (!cookie) {
      return res.status(401).json({ error: 'Not logged in', loggedIn: false })
    }
    const match = cookie.match(/session=([^;]+)/)
    if (!match) {
      return res.status(401).json({ error: 'No session', loggedIn: false })
    }
    const userId = sessions.get(match[1])
    if (!userId) {
      return res.status(401).json({ error: 'Invalid session', loggedIn: false })
    }
    const user = users.get(userId)
    if (!user) {
      return res.status(401).json({ error: 'User not found', loggedIn: false })
    }
    return res.status(200).json({ loggedIn: true, userId, ...user })
  }

  if (path === 'upgrade') {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' })
    }
    const cookie = req.headers.cookie
    const match = cookie?.match(/session=([^;]+)/)
    const userId = match ? sessions.get(match[1]) : null
    if (!userId) {
      return res.status(401).json({ error: 'Not logged in' })
    }

    const user = users.get(userId)
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    const { plan } = req.body
    if (plan === 'pro' && !user.paid) {
      if (!STRIPE_SECRET_KEY) {
        return res.status(500).json({ error: 'Stripe not configured' })
      }
      const customerRes = await fetch('https://api.stripe.com/v1/customers', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          email: user.email,
          name: user.name,
        }),
      })
      const customer = await customerRes.json()
      const priceId = 'price_pro_monthly'
      const subRes = await fetch('https://api.stripe.com/v1/subscriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          customer: customer.id,
          'items[0][price]': priceId,
        }),
      })
      const subscription = await subRes.json()
      
      user.stripeCustomerId = customer.id
      user.paid = true
      user.plan = 'pro'
      users.set(userId, user)

      return res.status(200).json({ success: true, plan: 'pro', customerId: customer.id })
    }

    user.plan = plan || 'starter'
    users.set(userId, user)
    return res.status(200).json({ success: true, plan: user.plan })
  }

  if (path === 'logout') {
    const cookie = req.headers.cookie
    const match = cookie?.match(/session=([^;]+)/)
    if (match) {
      sessions.delete(match[1])
    }
    res.setHeader('Set-Cookie', 'session=; Path=/; Max-Age=0')
    return res.redirect('/')
  }

  return res.status(404).json({ error: 'Not found' })
}