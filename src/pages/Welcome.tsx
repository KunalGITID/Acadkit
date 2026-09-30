import { useState } from "react";
import Landing, { type AuthMode } from "@/pages/Landing";
import SignIn from "@/pages/SignIn";

/** Signed out: the landing page, or the sign-in form once they've chosen. */
export default function Welcome({ initialAuth = null }: { initialAuth?: AuthMode | null }) {
  const [auth, setAuth] = useState<AuthMode | null>(initialAuth);
  if (auth) return <SignIn initialMode={auth} onBack={() => setAuth(null)} />;
  return <Landing onAuth={setAuth} />;
}
