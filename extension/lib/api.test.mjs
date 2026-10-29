import { describe, it, expect } from "vitest";
import {
  BOOK_URL,
  KEYLESS_LIMIT,
  ApiError,
  fetchBook,
  fetchPointValue,
  POINT_VALUE_URL,
  fetchSales,
  fetchMyEmployees,
  fetchCountries,
  fetchHistoryPage,
  fetchInputAverages,
  salesUrl,
  holdUntil,
} from "./api.mjs";

// The API, probed 2026-09-03: a request with a WRONG key is not refused, it is
// answered from the keyless bucket (ratelimit-limit 100); an accepted key gets
// a bigger bucket (500). So "was the key accepted" is read off that header.
const order = (type, price, quantity) => ({
  _id: "x",
  user: "u",
  itemCode: "scraps",
  quantity,
  price,
  offerAt: "2026-09-03T10:00:00.000Z",
  type,
  __v: 0,
});
const BODY = {
  result: {
    data: {
      buyOrders: [order("buy", 0.225, 100)],
      sellOrders: [order("sell", 0.226, 50)],
    },
  },
};

const fake = ({
  status = 200,
  limit = 500,
  remaining = 499,
  reset = 60,
  body = BODY,
} = {}) => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, opts });
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers({
        "ratelimit-limit": String(limit),
        "ratelimit-remaining": String(remaining),
        "ratelimit-reset": String(reset),
      }),
      json: async () => body,
    };
  };
  return { fetchImpl, calls };
};

describe("fetchCountries", () => {
  it("reads the public list keyless and keeps only id, code and name", async () => {
    const { fetchImpl, calls } = fake({
      limit: KEYLESS_LIMIT,
      body: {
        result: {
          data: [
            {
              _id: "6873d0ea1758b40e712b5ee9",
              code: "ml",
              name: "Mali",
              population: 123,
              government: { ignored: true },
            },
          ],
        },
      },
    });
    expect(await fetchCountries(fetchImpl)).toEqual([
      { id: "6873d0ea1758b40e712b5ee9", code: "ml", name: "Mali" },
    ]);
    const url = new URL(calls[0].url);
    expect(url.origin).toBe("https://api2.warera.io");
    expect(url.pathname).toBe("/trpc/country.getAllCountries");
    expect(url.searchParams.get("input")).toBe("{}");
    expect(calls[0].opts.headers).toEqual({});
    expect(calls[0].opts.credentials).toBe("omit");
  });

  it.each(
    [
      null,
      {},
      [{ _id: "invalid", code: "ml", name: "Mali" }],
      [{ _id: "6873d0ea1758b40e712b5ee9", name: "Mali" }],
      [{ _id: "6873d0ea1758b40e712b5ee9", code: "ml", name: "" }],
      [{ _id: ["6873d0ea1758b40e712b5ee9"], code: "ml", name: "Mali" }],
      [{ _id: "6873d0ea1758b40e712b5ee9", code: ["ml"], name: "Mali" }],
      [{ _id: "6873d0ea1758b40e712b5ee9", code: "ml", name: ["Mali"] }],
    ].map((data) => [data]),
  )("rejects a country list with nothing usable: %j", async (data) => {
    const { fetchImpl } = fake({ body: { result: { data } } });
    await expect(fetchCountries(fetchImpl)).rejects.toMatchObject({
      code: "schema",
    });
  });

  it("leaves out a malformed country and keeps the rest", async () => {
    const { fetchImpl } = fake({
      body: {
        result: {
          data: [
            { _id: "6873d0ea1758b40e712b5ee9", code: "ml", name: "Mali" },
            { _id: "6873d0ea1758b40e712b5ee8", code: "XKX", name: "Kosovo" },
            { _id: ["111111111111111111111111"], code: "co", name: "Colombia" },
            { _id: "222222222222222222222222", code: ["bw"], name: "Botswana" },
            { _id: "333333333333333333333333", code: "st", name: ["São Tomé"] },
          ],
        },
      },
    });
    expect(await fetchCountries(fetchImpl)).toEqual([
      { id: "6873d0ea1758b40e712b5ee9", code: "ml", name: "Mali" },
    ]);
  });
});

describe("fetchMyEmployees", () => {
  it("reads the array without input, with the player's key", async () => {
    const employees = [{ _id: "employee", company: "company" }];
    const { fetchImpl, calls } = fake({
      body: { result: { data: employees } },
    });
    expect(await fetchMyEmployees(fetchImpl, " test-key ")).toEqual(employees);
    expect(calls[0].url).toBe(
      "https://api2.warera.io/trpc/employee.getMyEmployees",
    );
    expect(calls[0].opts.headers["x-api-key"]).toBe("test-key");
    expect(calls[0].opts.credentials).toBe("omit");
  });

  it("requires a key before fetching and rejects a non-array schema", async () => {
    const { fetchImpl, calls } = fake({ body: { result: { data: {} } } });
    await expect(fetchMyEmployees(fetchImpl, "")).rejects.toMatchObject({
      code: "needs-key",
    });
    expect(calls).toHaveLength(0);
    await expect(fetchMyEmployees(fetchImpl, "test-key")).rejects.toMatchObject(
      { code: "schema" },
    );
  });

  it.each([
    [401, 500, "key-rejected"],
    [200, 100, "key-rejected"],
    [429, 500, "rate-limited"],
  ])(
    "preserves the shared API error for status %i, bucket %i",
    async (status, limit, code) => {
      const { fetchImpl } = fake({ status, limit });
      await expect(
        fetchMyEmployees(fetchImpl, "test-key"),
      ).rejects.toMatchObject({ code });
    },
  );
});

describe("fetchBook", () => {
  it("sends the key as x-api-key and returns the summarised book with its rate bucket", async () => {
    const { fetchImpl, calls } = fake();
    const r = await fetchBook(fetchImpl, "my-key");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(BOOK_URL);
    expect(calls[0].opts.headers["x-api-key"]).toBe("my-key");
    expect(r.book.bid).toBe(0.225);
    expect(r.book.ask).toBe(0.226);
    expect(r.limit).toBe(500);
    expect(r.remaining).toBe(499);
  });

  // Probed 2026-10-11: the book, the averages and the players answer without a key, from a bucket of 100 a minute.
  it("reads without a key from the keyless bucket, sending no key header", async () => {
    const { fetchImpl, calls } = fake({ limit: KEYLESS_LIMIT, remaining: 99 });
    const r = await fetchBook(fetchImpl, "   ");
    expect(calls).toHaveLength(1);
    expect(calls[0].opts.headers?.["x-api-key"]).toBeUndefined();
    expect(r.book.bid).toBe(0.225);
    expect(r.limit).toBe(KEYLESS_LIMIT);
  });

  it("reads without a key when the rate-limit header is missing", async () => {
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      headers: new Headers({}),
      json: async () => BODY,
    });
    const r = await fetchBook(fetchImpl, "");
    expect(r.book.ask).toBe(0.226);
  });

  it("keeps a keyless error message readable", async () => {
    const { fetchImpl } = fake({ status: 503, body: {} });
    const err = await fetchBook(fetchImpl, "").catch((e) => e);
    expect(err.code).toBe("http");
    expect(err.message).toBe("the API answered 503");
  });

  // Probed 2026-10-11: transaction.getPaginatedTransactions answers 401 "API token required" without a key.
  it("does not ask for sales or the player's history without a key", async () => {
    const { fetchImpl, calls } = fake();
    await expect(fetchSales(fetchImpl, "", "jet")).rejects.toMatchObject({
      code: "needs-key",
    });
    await expect(
      fetchHistoryPage(fetchImpl, " ", "0123456789abcdef01234567"),
    ).rejects.toMatchObject({ code: "needs-key" });
    expect(calls).toHaveLength(0);
  });

  it("treats an answer from the keyless bucket as a rejected key and discards the data", async () => {
    const { fetchImpl } = fake({ limit: KEYLESS_LIMIT, remaining: 99 });
    const err = await fetchBook(fetchImpl, "wrong-key").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("key-rejected");
    expect(err.book).toBeUndefined();
  });

  it("reports a rate limit with the seconds until reset", async () => {
    const { fetchImpl } = fake({ status: 429, reset: 37, body: {} });
    await expect(fetchBook(fetchImpl, "k")).rejects.toMatchObject({
      code: "rate-limited",
      retryAfter: 37,
      status: 429,
    });
  });

  it("surfaces an error envelope from the API", async () => {
    const { fetchImpl } = fake({ body: { error: { message: "boom" } } });
    const err = await fetchBook(fetchImpl, "k").catch((e) => e);
    expect(err.code).toBe("api");
    expect(err.message).toContain("boom");
  });

  it("marks a procedure the game removed as gone, with the reason it gives", async () => {
    const { fetchImpl } = fake({
      status: 404,
      body: {
        error: {
          message: 'No procedure found on path "tradingOrder.getTopOrders"',
          code: -32004,
        },
      },
    });
    const err = await fetchBook(fetchImpl, "k").catch((e) => e);
    expect(err).toMatchObject({ code: "http", status: 404, gone: true });
    expect(err.message).toContain(
      "the game no longer serves tradingOrder.getTopOrders",
    );
    const other = fake({
      status: 404,
      body: { error: { message: "Itemtradings not found." } },
    });
    await expect(fetchBook(other.fetchImpl, "k")).rejects.toMatchObject({
      code: "http",
      status: 404,
      gone: false,
    });
  });

  it("surfaces other HTTP failures with their status", async () => {
    const { fetchImpl } = fake({ status: 503, body: {} });
    await expect(fetchBook(fetchImpl, "k")).rejects.toMatchObject({
      code: "http",
      status: 503,
    });
  });
});

describe("fetchInputAverages", () => {
  // dev 2026-10-17: itemTrading.getItemTrading answers 404 "Itemtradings not found." for a code it keeps no
  // history for (the non-tradable toolbox a wooden case drops since v0.27)
  it("skips a code the game keeps no price history for, and reads the rest", async () => {
    const fetchImpl = async (url) => {
      const code = JSON.parse(new URL(url).searchParams.get("input")).itemCode;
      if (code === "toolbox")
        return {
          ok: false,
          status: 404,
          headers: new Headers({ "ratelimit-limit": "500" }),
          json: async () => ({ error: { message: "Itemtradings not found." } }),
        };
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "ratelimit-limit": "500" }),
        json: async () => ({
          result: {
            data: { values: [{ valueAt: "2026-10-17", avgValue: 0.25 }] },
          },
        }),
      };
    };
    const { averages } = await fetchInputAverages(fetchImpl, "k", [
      "scraps",
      "toolbox",
    ]);
    expect(averages).toEqual({ scraps: { "2026-10-17": 0.25 } });
  });
});

describe("fetchPointValue", () => {
  it("reads the positive point value with no input parameter", async () => {
    const { fetchImpl, calls } = fake({ body: { result: { data: 0.1012 } } });
    await expect(fetchPointValue(fetchImpl, " my-key ")).resolves.toBe(0.1012);
    expect(POINT_VALUE_URL).toBe(
      "https://api2.warera.io/trpc/gameStat.getPpMoneyValue",
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(POINT_VALUE_URL);
    expect(new URL(calls[0].url).searchParams.has("input")).toBe(false);
    expect(calls[0].opts).toMatchObject({
      headers: { "x-api-key": "my-key" },
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      signal: expect.any(globalThis.AbortSignal),
    });
  });

  it("allows keyless reads and rejects a keyless-bucket answer to a key", async () => {
    const { fetchImpl, calls } = fake({
      limit: KEYLESS_LIMIT,
      body: { result: { data: 0.1012 } },
    });
    await expect(fetchPointValue(fetchImpl, " ")).resolves.toBe(0.1012);
    expect(calls[0].opts.headers["x-api-key"]).toBeUndefined();
    await expect(fetchPointValue(fetchImpl, "wrong")).rejects.toMatchObject({
      code: "key-rejected",
    });
  });

  it.each(
    [
      0,
      -1,
      NaN,
      Infinity,
      -Infinity,
      null,
      undefined,
      true,
      false,
      "",
      "0.1012",
      {},
      [],
    ].map((data) => [data]),
  )(
    "rejects a point value that is not a finite positive number: %s",
    async (data) => {
      const { fetchImpl } = fake({ body: { result: { data } } });
      await expect(fetchPointValue(fetchImpl, "")).rejects.toMatchObject({
        code: "schema",
      });
    },
  );

  it("uses the request timeout and redacts a key echoed by a network error", async () => {
    const hanging = (url, opts) =>
      new Promise((_, reject) =>
        opts.signal.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        ),
      );
    await expect(
      fetchPointValue(hanging, "k", { timeoutMs: 20 }),
    ).rejects.toMatchObject({ code: "timeout" });
    const down = async () => {
      throw new Error("failed my-key");
    };
    await expect(fetchPointValue(down, "my-key")).rejects.toMatchObject({
      code: "network",
      message: "could not reach the API: failed [redacted]",
    });
  });
});

// transaction.getPaginatedTransactions with itemCode (documented in openapi.json)
// and no userId is the global feed of one item's market fills, newest first,
// 100 per page with a cursor. Probed 2026-09-03: 100 jet fills spanned ~30 h.
const NOW = Date.parse("2026-09-03T20:00:00.000Z");
const fill = (hoursAgo, money, code = "jet") => ({
  _id: `${hoursAgo}:${money}:${code}`,
  money,
  itemCode: code,
  quantity: 1,
  transactionType: "itemMarket",
  item: { code, state: 100, skills: {} },
  createdAt: new Date(NOW - hoursAgo * 3600e3).toISOString(),
});
const pagedFake = (pages, { limit = 500 } = {}) => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, opts });
    const cursor = new URL(url).searchParams.get("input");
    const idx = Math.min(calls.length - 1, pages.length - 1);
    const page = pages[idx];
    return {
      ok: true,
      status: 200,
      headers: new Headers({
        "ratelimit-limit": String(limit),
        "ratelimit-remaining": "400",
        "ratelimit-reset": "60",
      }),
      json: async () => ({
        result: { data: { items: page.items, nextCursor: page.next ?? null } },
      }),
      _cursorInput: cursor,
    };
  };
  return { fetchImpl, calls };
};

describe("fetchSales", () => {
  it("asks for the item code with the key and stops once the window is covered", async () => {
    const { fetchImpl, calls } = pagedFake([
      { items: [fill(1, 383.8), fill(20, 390), fill(60, 379.2)], next: "c2" },
      { items: [fill(71, 401), fill(80, 350), fill(90, 340)], next: "c3" },
    ]);
    const r = await fetchSales(fetchImpl, "my-key", "jet", {
      hours: 72,
      now: NOW,
      maxPages: 5,
    });
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe(salesUrl("jet"));
    expect(calls[0].opts.headers["x-api-key"]).toBe("my-key");
    expect(calls[1].url).toBe(salesUrl("jet", "c2"));
    expect(r.fills.map((f) => f.price)).toEqual([383.8, 390, 379.2, 401]);
    expect(r.fills[0]).toMatchObject({ price: 383.8, state: 100, code: "jet" });
    expect(r.pages).toBe(2);
    expect(r.complete).toBe(true);
  });

  it("stops at the last page even when the window is not yet covered", async () => {
    const { fetchImpl, calls } = pagedFake([
      { items: [fill(1, 100, "knife"), fill(2, 101, "knife")], next: null },
    ]);
    const r = await fetchSales(fetchImpl, "k", "knife", {
      hours: 72,
      now: NOW,
    });
    expect(calls).toHaveLength(1);
    expect(r.fills).toHaveLength(2);
    expect(r.complete).toBe(true);
  });

  it("caps the pages it will walk and says the window is incomplete", async () => {
    const pages = [0, 1, 2].map((p) => ({
      items: Array.from({ length: 100 }, (_, i) =>
        fill(p + i / 100, 10, "gloves4"),
      ),
      next: `page-${p + 1}`,
    }));
    const { fetchImpl, calls } = pagedFake(pages);
    const r = await fetchSales(fetchImpl, "k", "gloves4", {
      hours: 72,
      now: NOW,
      maxPages: 2,
    });
    expect(calls).toHaveLength(2);
    expect(r.fills).toHaveLength(200);
    expect(r.pages).toBe(2);
    expect(r.complete).toBe(false);
  });

  it("reads only what is newer than a last read: it stops at the first fill it holds", async () => {
    const { fetchImpl, calls } = pagedFake([
      { items: [fill(0.5, 401), fill(1, 383.8), fill(20, 390)], next: "c2" },
      { items: [fill(60, 379.2)], next: "c3" },
    ]);
    const r = await fetchSales(fetchImpl, "k", "jet", {
      hours: 168,
      now: NOW,
      maxPages: 10,
      known: new Set([fill(1, 383.8)._id]),
    });
    expect(calls).toHaveLength(1);
    expect(r.met).toBe(true);
    expect(r.fills.map((f) => [f.id, f.price])).toEqual([
      [fill(0.5, 401)._id, 401],
    ]);
    // without one, the whole window as before, each fill with its id
    const full = await fetchSales(
      pagedFake([{ items: [fill(1, 2)] }]).fetchImpl,
      "k",
      "jet",
      { now: NOW },
    );
    expect(full).toMatchObject({ met: false, complete: true });
    expect(full.fills[0].id).toBe(fill(1, 2)._id);
  });
  it("needs a key, and rejects a keyless-bucket answer to a wrong one", async () => {
    const { fetchImpl, calls } = pagedFake([
      { items: [fill(1, 1)], next: null },
    ]);
    await expect(
      fetchSales(fetchImpl, "", "jet", { now: NOW }),
    ).rejects.toMatchObject({ code: "needs-key" });
    expect(calls).toHaveLength(0);
    const keyless = pagedFake([{ items: [fill(1, 1)], next: null }], {
      limit: KEYLESS_LIMIT,
    });
    await expect(
      fetchSales(keyless.fetchImpl, "wrong", "jet", { now: NOW }),
    ).rejects.toMatchObject({ code: "key-rejected" });
  });
});

// A malformed row must not end the walk: only a VALID timestamp older than the
// cutoff says the window is covered.
describe("fetchSales row hygiene", () => {
  it("skips a fill with an unreadable date instead of ending the walk there", async () => {
    const bad = { ...fill(2, 200), createdAt: undefined };
    const { fetchImpl, calls } = pagedFake([
      { items: [fill(1, 383.8), bad, fill(3, 390)], next: "c2" },
      { items: [fill(80, 350)], next: "c3" },
    ]);
    const r = await fetchSales(fetchImpl, "k", "jet", { hours: 72, now: NOW });
    expect(r.fills.map((f) => f.price)).toEqual([383.8, 390]);
    expect(calls).toHaveLength(2); // the walk went on to the page that really ends the window
    expect(r.complete).toBe(true);
  });

  it("skips a fill whose price is not a number", async () => {
    const { fetchImpl } = pagedFake([
      { items: [fill(1, "abc"), fill(2, 5)], next: null },
    ]);
    const r = await fetchSales(fetchImpl, "k", "jet", { hours: 72, now: NOW });
    expect(r.fills.map((f) => f.price)).toEqual([5]);
  });
});

describe("timeouts and network failures", () => {
  const hanging = (url, opts) =>
    new Promise((_, reject) =>
      opts.signal.addEventListener("abort", () =>
        reject(new DOMException("aborted", "AbortError")),
      ),
    );

  it("gives up on a call that does not answer in time", async () => {
    await expect(
      fetchBook(hanging, "k", { timeoutMs: 20 }),
    ).rejects.toMatchObject({ code: "timeout" });
    await expect(
      fetchSales(hanging, "k", "jet", { now: NOW, timeoutMs: 20 }),
    ).rejects.toMatchObject({ code: "timeout" });
  });

  it("reports an unreachable API as a network error, not an internal one", async () => {
    const down = async () => {
      throw new TypeError("Failed to fetch");
    };
    await expect(fetchBook(down, "k")).rejects.toMatchObject({
      code: "network",
    });
  });
});

describe("holdUntil", () => {
  it("holds for the reset the API asked for, within sane bounds", () => {
    expect(holdUntil(37, 1000)).toBe(1000 + 37_000);
    expect(holdUntil(1, 1000)).toBe(1000 + 5_000); // never hammer
    expect(holdUntil(9999, 1000)).toBe(1000 + 9_999_000); // honor long server cooldowns
    expect(holdUntil(undefined, 1000)).toBe(1000 + 60_000);
  });
});

// Cases and trips: tRPC GET batching (?batch=1), the transport the game's own client uses.
import {
  batchUrls,
  booksUrl,
  fetchBooks,
  fetchEquipmentAvg,
  BATCH_URL_BUDGET,
  BOOK_DEPTH,
} from "./api.mjs";

const top = (code, bid, ask) => ({
  buyOrders:
    bid == null
      ? []
      : [
          {
            _id: "b",
            user: "u",
            itemCode: code,
            quantity: 40,
            price: bid,
            type: "buy",
          },
        ],
  sellOrders:
    ask == null
      ? []
      : [
          {
            _id: "s",
            user: "u",
            itemCode: code,
            quantity: 7,
            price: ask,
            type: "sell",
          },
        ],
});

describe("batchUrls", () => {
  it("builds one tRPC batch URL with positional inputs", () => {
    const urls = batchUrls("gameStat.getEquipmentAvgByCode", [
      { itemCode: "jet" },
      { itemCode: "knife" },
    ]);
    expect(urls).toHaveLength(1);
    expect(urls[0].url).toBe(
      "https://api2.warera.io/trpc/gameStat.getEquipmentAvgByCode,gameStat.getEquipmentAvgByCode?batch=1&input=" +
        encodeURIComponent(
          JSON.stringify({ 0: { itemCode: "jet" }, 1: { itemCode: "knife" } }),
        ),
    );
    expect(urls[0].count).toBe(2);
  });

  it("splits by URL length, never by a fixed count, and keeps the order", () => {
    const inputs = Array.from({ length: 36 }, (_, i) => ({
      itemCode: `helmet${i}`,
    }));
    const urls = batchUrls("gameStat.getEquipmentAvgByCode", inputs);
    expect(urls.length).toBeGreaterThan(1);
    for (const u of urls)
      expect(u.url.length).toBeLessThanOrEqual(BATCH_URL_BUDGET);
    expect(urls.reduce((s, u) => s + u.count, 0)).toBe(36);
    expect(batchUrls("x.y", [])).toEqual([]);
  });
});

describe("fetchBooks", () => {
  it("tries the multi-code procedure first and flattens each book", async () => {
    const { fetchImpl, calls } = fake({
      body: {
        result: {
          data: {
            woodenCase: top("woodenCase", 7.5, 7.647),
            oil: top("oil", 0.226, 0.242),
            scraps: top("scraps", null, 0.223),
          },
        },
      },
    });
    const r = await fetchBooks(fetchImpl, "my-key", [
      "woodenCase",
      "oil",
      "scraps",
      "oil",
    ]);
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.pathname).toBe("/trpc/tradingOrder.getTopOrdersPerItemCode");
    expect(calls[0].url).toBe(booksUrl(["woodenCase", "oil", "scraps"]));
    expect(url.searchParams.has("batch")).toBe(false);
    expect(JSON.parse(url.searchParams.get("input"))).toEqual({
      itemCodes: ["woodenCase", "oil", "scraps"],
      limit: BOOK_DEPTH,
    });
    expect(calls[0].opts.headers["x-api-key"]).toBe("my-key");
    expect(r.books.woodenCase).toMatchObject({
      bid: 7.5,
      ask: 7.647,
      bidQty: 40,
      askQty: 7,
    });
    expect(r.books.scraps).toMatchObject({
      bid: null,
      ask: 0.223,
      bidQty: 0,
      askQty: 7,
    });
    expect(r.source).toBe("getTopOrdersPerItemCode");
    expect(r.limit).toBe(500);
  });

  it.each(["api", 404, 405])(
    "falls back to getTopOrders batches after %s",
    async (failure) => {
      const first = fake({
        status: failure === "api" ? 200 : failure,
        body: { error: { message: "procedure unavailable" } },
      });
      const fallback = fake({
        body: [
          { result: { data: top("oil", 1, 2) } },
          { result: { data: top("scraps", 3, 4) } },
        ],
      });
      const calls = [];
      const fetchImpl = (url, opts) => {
        calls.push(url);
        return (calls.length === 1 ? first : fallback).fetchImpl(url, opts);
      };
      const r = await fetchBooks(fetchImpl, "my-key", ["oil", "scraps", "oil"]);
      expect(calls).toHaveLength(2);
      expect(calls[0]).toBe(booksUrl(["oil", "scraps"]));
      const url = new URL(calls[1]);
      expect(url.pathname).toBe(
        "/trpc/tradingOrder.getTopOrders,tradingOrder.getTopOrders",
      );
      expect(url.searchParams.get("batch")).toBe("1");
      expect(JSON.parse(url.searchParams.get("input"))).toEqual({
        0: { itemCode: "oil", limit: BOOK_DEPTH },
        1: { itemCode: "scraps", limit: BOOK_DEPTH },
      });
      expect(fallback.calls[0].opts.headers["x-api-key"]).toBe("my-key");
      expect(r.source).toBe("getTopOrders");
      expect(r.books.oil).toMatchObject({ bid: 1, ask: 2 });
      expect(r.books.scraps).toMatchObject({ bid: 3, ask: 4 });
    },
  );

  it("reads every book when one holds an order that trades nothing (dev 2026-10-17: bread bought at 0, 999,999 of it)", async () => {
    const bread = top("bread", 0.31, 0.33);
    bread.buyOrders.push({ ...bread.buyOrders[0], price: 0, quantity: 999999 });
    const { fetchImpl } = fake({
      body: {
        result: { data: { woodenCase: top("woodenCase", 7.5, 7.647), bread } },
      },
    });
    const r = await fetchBooks(fetchImpl, "", ["woodenCase", "bread"]);
    expect(r.books.woodenCase).toMatchObject({ bid: 7.5, ask: 7.647 });
    expect(r.books.bread).toMatchObject({
      bid: 0.31,
      bidQty: 40,
      bids: [{ price: 0.31, quantity: 40 }],
    });
  });

  it("reads without a key, and rejects a keyless-bucket answer to a wrong one", async () => {
    const free = fake({
      limit: KEYLESS_LIMIT,
      body: { result: { data: { oil: top("oil", 1, 2) } } },
    });
    const r = await fetchBooks(free.fetchImpl, "", ["oil"]);
    expect(free.calls[0].opts.headers?.["x-api-key"]).toBeUndefined();
    expect(r.books.oil.bid).toBe(1);
    const keyless = fake({
      limit: KEYLESS_LIMIT,
      body: { result: { data: { oil: top("oil", 1, 2) } } },
    });
    await expect(
      fetchBooks(keyless.fetchImpl, "wrong", ["oil"]),
    ).rejects.toMatchObject({ code: "key-rejected" });
  });

  it.each([401, 403, 429, 500])(
    "propagates HTTP %s without another path",
    async (status) => {
      const { fetchImpl, calls } = fake({ status });
      await expect(fetchBooks(fetchImpl, "", ["oil"])).rejects.toMatchObject({
        code:
          status === 429
            ? "rate-limited"
            : [401, 403].includes(status)
              ? "needs-key"
              : "http",
      });
      expect(calls).toHaveLength(1);
    },
  );

  it("rejects failed slots, malformed envelopes and malformed books", async () => {
    for (const [body, code] of [
      [[{ error: { message: "failed" } }], "api"],
      [[{}], "api"],
      [[], "schema"],
      [[{ result: { data: {} } }], "schema"],
    ]) {
      const missing = fake({ body: { error: { message: "missing" } } });
      const fallback = fake({ body });
      const fetchImpl = (url, opts) =>
        (new URL(url).searchParams.has("batch") ? fallback : missing).fetchImpl(
          url,
          opts,
        );
      await expect(fetchBooks(fetchImpl, "", ["oil"])).rejects.toMatchObject({
        code,
      });
    }
  });

  it("propagates a malformed multi-code book without a fallback", async () => {
    const { fetchImpl, calls } = fake({
      body: { result: { data: { oil: {} } } },
    });
    await expect(fetchBooks(fetchImpl, "", ["oil"])).rejects.toMatchObject({
      code: "schema",
    });
    expect(calls).toHaveLength(1);
  });

  it("does not request an empty list", async () => {
    const { fetchImpl, calls } = fake();
    expect(await fetchBooks(fetchImpl, "", [])).toMatchObject({
      books: {},
      source: "getTopOrders",
    });
    expect(calls).toHaveLength(0);
  });
});

describe("fetchEquipmentAvg", () => {
  it("reads the average price per code through batches and keys the numbers by code", async () => {
    const calls = [];
    const fetchImpl = async (url, opts) => {
      calls.push({ url, opts });
      const input = JSON.parse(new URL(url).searchParams.get("input"));
      const out = Object.values(input).map((i) =>
        i.itemCode === "broken"
          ? { error: { message: "nope" } }
          : { result: { data: i.itemCode.length * 10 } },
      );
      return {
        ok: true,
        status: 200,
        headers: new Headers({
          "ratelimit-limit": "500",
          "ratelimit-remaining": "400",
          "ratelimit-reset": "60",
        }),
        json: async () => out,
      };
    };
    const r = await fetchEquipmentAvg(fetchImpl, "k", [
      "jet",
      "knife",
      "broken",
      "helmet3",
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0].opts.headers["x-api-key"]).toBe("k");
    expect(r.avg).toEqual({ jet: 30, knife: 50, broken: null, helmet3: 70 });
    expect(r.missing).toEqual(["broken"]);
  });

  it("reads without a key", async () => {
    const { fetchImpl, calls } = fake({
      limit: KEYLESS_LIMIT,
      body: [{ result: { data: 487.34 } }],
    });
    const r = await fetchEquipmentAvg(fetchImpl, " ", ["jet"]);
    expect(calls).toHaveLength(1);
    expect(calls[0].opts.headers?.["x-api-key"]).toBeUndefined();
    expect(r.avg).toEqual({ jet: 487.34 });
  });
});

// The game's tile prints `value || 0`: a code with no sales answers 0, which is
// no data, never a price of zero.
describe("fetchEquipmentAvg treats zero as missing", () => {
  it("drops a 0 and names it, keeps real prices", async () => {
    const fetchImpl = async (url) => {
      const input = JSON.parse(new URL(url).searchParams.get("input"));
      const out = Object.values(input).map((i) => ({
        result: { data: i.itemCode === "helmet6" ? 0 : 12.5 },
      }));
      return {
        ok: true,
        status: 200,
        headers: new Headers({
          "ratelimit-limit": "500",
          "ratelimit-remaining": "400",
          "ratelimit-reset": "60",
        }),
        json: async () => out,
      };
    };
    const r = await fetchEquipmentAvg(fetchImpl, "k", ["jet", "helmet6"]);
    expect(r.avg).toEqual({ jet: 12.5, helmet6: null });
    expect(r.missing).toEqual(["helmet6"]);
  });
});
