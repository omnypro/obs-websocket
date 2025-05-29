export async function generateAuth(
  password: string,
  salt: string,
  challenge: string
): Promise<string> {
  const encoder = new TextEncoder()

  // Generate base64 secret: SHA256(password + salt)
  const secretHash = await crypto.subtle.digest('SHA-256', encoder.encode(password + salt))
  const base64Secret = btoa(String.fromCharCode(...new Uint8Array(secretHash)))

  // Generate auth response: SHA256(base64Secret + challenge)
  const authHash = await crypto.subtle.digest('SHA-256', encoder.encode(base64Secret + challenge))

  return btoa(String.fromCharCode(...new Uint8Array(authHash)))
}
