import { emptyRivalryBook, parseRivalryBook, type RivalryBook } from '@/lib/rivalry';

const STORAGE_KEY = 'kickfeed.rivalry.v1';

let book: RivalryBook = emptyRivalryBook();
let gate: Promise<void> | null = null;
const listeners = new Set<() => void>();

async function readStorage(): Promise<typeof import('@react-native-async-storage/async-storage').default | null> {
  try {
    return (await import('@react-native-async-storage/async-storage')).default;
  } catch {
    return null;
  }
}

function notify(): void {
  for (const listener of listeners) listener();
}

async function persist(next: RivalryBook): Promise<void> {
  try {
    const storage = await readStorage();
    if (!storage) return;
    await storage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* demo bond still lives in memory for this session */
  }
}

export function getRivalryDemoBook(): RivalryBook {
  return book;
}

export function subscribeRivalryDemo(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function loadRivalryDemo(): Promise<void> {
  if (!gate) {
    gate = (async () => {
      try {
        const storage = await readStorage();
        const raw = storage ? await storage.getItem(STORAGE_KEY) : null;
        if (raw) book = parseRivalryBook(JSON.parse(raw));
      } catch {
        book = emptyRivalryBook();
      }
      notify();
    })();
  }
  return gate;
}

export async function mutateRivalryDemo(recipe: (current: RivalryBook) => RivalryBook): Promise<RivalryBook> {
  await loadRivalryDemo();
  book = recipe(book);
  notify();
  void persist(book);
  return book;
}

export function resetRivalryDemoForTests(): void {
  book = emptyRivalryBook();
  gate = Promise.resolve();
  listeners.clear();
}
