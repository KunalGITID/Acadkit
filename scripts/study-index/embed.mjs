/**
 * Embeddings from the study-search edge function.
 *
 * The function runs gte-small, the model built into Supabase's edge
 * runtime, so the vectors for your files and the vectors for a search
 * come from the same model — and nothing extra runs or installs here.
 * Only the service role may use it this way (the sync script's key).
 *
 * The function has a CPU budget per request, so a batch it can't finish
 * is split in half and tried again; a single passage that still fails is
 * retried with a pause before giving up.
 */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function embedTexts(texts, { url, key, batch = 12, concurrency = 2 }) {
  const out = new Array(texts.length);
  const endpoint = `${String(url).replace(/\/$/, "")}/functions/v1/study-search`;

  async function call(lo, hi, attempt = 0) {
    let res;
    try {
      res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, apikey: key },
        body: JSON.stringify({ texts: texts.slice(lo, hi) }),
      });
    } catch (err) {
      if (attempt < 3) {
        await sleep(2000 * (attempt + 1));
        return call(lo, hi, attempt + 1);
      }
      throw new Error(`couldn't reach the embedder: ${err.message}`);
    }
    if (res.ok) {
      const { vectors } = await res.json();
      if (!Array.isArray(vectors) || vectors.length !== hi - lo) {
        throw new Error("the embedder returned the wrong number of vectors");
      }
      vectors.forEach((v, j) => (out[lo + j] = v));
      return;
    }
    const body = await res.text();
    if (res.status === 404) {
      throw new Error("the study-search function isn't deployed: supabase functions deploy study-search");
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error(`the embedder refused the service key (${res.status})`);
    }
    if (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      await call(lo, mid);
      await call(mid, hi);
      return;
    }
    if (attempt < 3) {
      await sleep(2000 * (attempt + 1));
      return call(lo, hi, attempt + 1);
    }
    throw new Error(`embedding failed (${res.status}): ${body.slice(0, 200)}`);
  }

  const jobs = [];
  for (let i = 0; i < texts.length; i += batch) jobs.push([i, Math.min(i + batch, texts.length)]);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
      while (next < jobs.length) {
        const [lo, hi] = jobs[next++];
        await call(lo, hi);
      }
    })
  );
  return out;
}
