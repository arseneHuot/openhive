import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
  // Public routes that don't need auth
  const publicPaths = ['/auth', '/setup', '/api/setup', '/api/provision', '/_next', '/favicon.ico']
  const path = request.nextUrl.pathname

  if (publicPaths.some(p => path.startsWith(p)) || path === '/') {
    return NextResponse.next()
  }

  // Create a response to potentially modify cookies
  let response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(new URL('/setup', request.url))
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value)
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set(name, value, options)
        })
      },
    },
  })

  const { data: { user } } = await supabase.auth.getUser()

  if (!user && path.startsWith('/workspace')) {
    return NextResponse.redirect(new URL('/auth', request.url))
  }

  if (!user && path.startsWith('/api/') && !path.startsWith('/api/setup') && !path.startsWith('/api/webhook')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sounds/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
