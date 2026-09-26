/**
 * Just enough of Deno for `tsc` to type-check the edge functions
 * (tsconfig.functions.json, part of `npm run build`).
 *
 * The functions run on Deno, which nothing in this repo installs, and
 * deploying them doesn't type-check. Unchecked, a name used outside the
 * block that declares it ships fine and throws on every invocation —
 * which is how send-reminders came to send nothing at all.
 */
declare namespace Deno {
  function serve(handler: (req: Request) => Response | Promise<Response>): unknown;
  const env: { get(key: string): string | undefined };
}

declare module "npm:@supabase/supabase-js@2" {
  export * from "@supabase/supabase-js";
}

declare module "npm:web-push@3.6.7" {
  interface PushTarget {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  }
  const webpush: {
    setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
    sendNotification(target: PushTarget, payload: string): Promise<unknown>;
  };
  export default webpush;
}
