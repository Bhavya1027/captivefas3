import { NextResponse } from 'next/server';

export function middleware(request) {
    // openNDS sends authmon polling requests to `faspath` (configured as '/login')
    // Next.js cannot handle both a page and a POST route at the same path, 
    // so we rewrite POST requests targeting /login to our API route.
    if (request.nextUrl.pathname.startsWith('/login/') && request.method === 'POST') {
        const hotelId = request.nextUrl.pathname.split('/')[2];
        return NextResponse.rewrite(new URL(`/api/login/${hotelId}`, request.url));
    }
    return NextResponse.next();
}

export const config = {
    matcher: '/login/:hotelId',
};
