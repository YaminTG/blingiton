// IndexNow ownership proof: search engines fetch this to confirm the key used in pings is ours.
export function GET() {
  const key = process.env.INDEXNOW_KEY
  if (!key) return new Response('Not configured', { status: 404 })
  return new Response(key, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
