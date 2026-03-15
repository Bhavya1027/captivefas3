import { NextResponse } from 'next/server';

export function middleware(request) {
    // openNDS sends authmon polling requests to `faspath` (configured as '/login')
    // Next.js cannot handle both a page and a POST route at the same path, 
    // so we rewrite POST requests targeting /login to our API route.
    if (request.nextUrl.pathname === '/login' && request.method === 'POST') {
        return NextResponse.rewrite(new URL('/api/login', request.url));
    }
    return NextResponse.next();
}

export const config = {
    matcher: '/login',
};
