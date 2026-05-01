import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
    // Check if the request is for the API
    if (request.nextUrl.pathname.startsWith('/api/')) {
        // Get the API URL from environment variables, defaulting to localhost for dev
        const apiUrl = process.env.API_URL || 'http://localhost:3001';

        // Construct the new URL
        const newUrl = new URL(request.nextUrl.pathname, apiUrl);
        newUrl.search = request.nextUrl.search;

        console.log(`[Proxy] Rewriting ${request.nextUrl.pathname} to ${newUrl.toString()}`);

        // Rewrite the request
        return NextResponse.rewrite(newUrl);
    }

    return NextResponse.next();
}

export const config = {
    matcher: '/api/:path*',
};
