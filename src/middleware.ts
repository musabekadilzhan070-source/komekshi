import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const HOME: Record<string, string> = { student: '/student', curator: '/curator', organizer: '/organizer' };
const PROTECTED = ['/student', '/curator', '/organizer'];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const section = PROTECTED.find((p) => path === p || path.startsWith(p + '/'));
  const isAuthPage = path === '/login' || path === '/register';
  const isPending = path === '/pending';

  const redirect = (to: string) => {
    const url = request.nextUrl.clone();
    url.pathname = to;
    url.search = '';
    const res = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  };

  if (!user) {
    if (section || isPending) {
      const res = redirect('/login');
      return res;
    }
    return response;
  }

  if (section || isAuthPage || isPending) {
    const { data: profile } = await supabase.from('profiles').select('role,status').eq('id', user.id).maybeSingle();
    if (!profile) {
      return isPending ? response : redirect('/pending');
    }
    const home = HOME[profile.role];
    if (profile.status !== 'active') {
      return isPending ? response : redirect('/pending');
    }
    if (isAuthPage || isPending) return redirect(home);
    if (section && section !== home) return redirect(home);
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|jpg|svg|webp|ico)$).*)'],
};
