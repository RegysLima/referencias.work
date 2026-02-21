import { unstable_cache } from "next/cache";
import type { ReferenceDB } from "./types";
import { readReferencesDb, REFERENCES_CACHE_TAG } from "./referencesDb";

const loadReferencesCached = unstable_cache(
  async (): Promise<ReferenceDB> => readReferencesDb(),
  ["references:public:v1"],
  {
    revalidate: 300,
    tags: [REFERENCES_CACHE_TAG],
  }
);

export async function loadReferences(): Promise<ReferenceDB> {
  return loadReferencesCached();
}
