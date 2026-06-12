import { SignJWT, jwtVerify } from "jose";
import { compare, hash } from "bcryptjs";
import { cookies } from "next/headers";

const COOKIE_NAME = "study1_token";

// Encoded as a Uint8Array for jose.
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "study1-local-dev-secret-change-in-production",
);

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@study1.local";
// Pre-hashed: "zxzx123456". Generated on first run if not set.
let ADMIN_PASSWORD_HASH = "";

async function getAdminPasswordHash(): Promise<string> {
  if (!ADMIN_PASSWORD_HASH) {
    ADMIN_PASSWORD_HASH = await hash(
      process.env.ADMIN_PASSWORD || "zxzx123456",
      10,
    );
  }
  return ADMIN_PASSWORD_HASH;
}

/** Sign a JWT for the given email. */
export async function signToken(email: string): Promise<string> {
  return new SignJWT({ email, role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(JWT_SECRET);
}

/** Verify a JWT token string. Returns the payload or null. */
export async function verifyToken(
  token: string,
): Promise<{ email: string; role: string } | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as { email: string; role: string };
  } catch {
    return null;
  }
}

/** Validate email + password against the admin account. */
export async function validateAdmin(
  email: string,
  password: string,
): Promise<boolean> {
  if (email !== ADMIN_EMAIL) return false;
  const storedHash = await getAdminPasswordHash();
  return compare(password, storedHash);
}

/** Read the auth cookie from the request and return the verified payload. */
export async function getSession(): Promise<{
  email: string;
  role: string;
} | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

/** Set the auth cookie (call in a Server Function or Route Handler). */
export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24, // 24 hours
  });
}

/** Delete the auth cookie (logout). */
export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export { COOKIE_NAME };
