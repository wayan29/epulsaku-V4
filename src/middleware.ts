import { NextRequest, NextResponse } from "next/server";

const APP_ROUTE_PREFIXES = [
  "/account",
  "/admin-settings",
  "/dashboard",
  "/layanan",
  "/management",
  "/order",
  "/price-settings",
  "/profit-report",
  "/shift-handover",
  "/tokovoucher-price-settings",
  "/tools",
  "/transactions",
];

const AUTH_ROUTES = new Set(["/login", "/signup", "/two-factor"]);
const SESSION_COOKIE_NAMES = [
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
  "__Host-better-auth.session_token",
];

function hasSessionCookie(request: NextRequest) {
  return SESSION_COOKIE_NAMES.some((name) => Boolean(request.cookies.get(name)?.value));
}

function isAppRoute(pathname: string) {
  return APP_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = hasSessionCookie(request);

  if (isAppRoute(pathname) && !hasSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (AUTH_ROUTES.has(pathname) && hasSession) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/account/:path*",
    "/admin-settings/:path*",
    "/dashboard/:path*",
    "/layanan/:path*",
    "/management/:path*",
    "/order/:path*",
    "/price-settings/:path*",
    "/profit-report/:path*",
    "/shift-handover/:path*",
    "/tokovoucher-price-settings/:path*",
    "/tools/:path*",
    "/transactions/:path*",
    "/login",
    "/signup",
    "/two-factor",
  ],
};
