import { NextRequest } from 'next/server'

const TILE_HOST = 'https://tile.openstreetmap.org'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: { z: string; x: string; y: string } },
) {
  const { z, x, y } = params
  const upstreamUrl = `${TILE_HOST}/${z}/${x}/${y}.png`

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: {
        'user-agent': 'Bill-Manager/1.0',
        accept: 'image/png,image/*;q=0.8,*/*;q=0.5',
      },
    })

    if (!upstream.ok || !upstream.body) {
      return new Response('Tile unavailable', { status: 502 })
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') ?? 'image/png',
        'cache-control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
        'access-control-allow-origin': '*',
      },
    })
  } catch {
    return new Response('Tile fetch failed', { status: 502 })
  }
}