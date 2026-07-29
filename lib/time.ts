// lib/time.ts
//
// Czysta logika porównywania zakresów czasu — używana przez UI do
// natychmiastowej walidacji (UX). Ostateczne zabezpieczenie przed
// nakładającymi się rezerwacjami żyje w bazie danych jako
// EXCLUDE CONSTRAINT (patrz migrations/0001_ride_type_and_time_ranges.sql),
// więc nawet gdyby ta funkcja miała błąd albo ktoś ominął UI,
// baza i tak odrzuci konflikt.

export function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function rangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  return toMinutes(aStart) < toMinutes(bEnd) && toMinutes(bStart) < toMinutes(aEnd);
}

export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// "Dzisiaj" liczone WYŁĄCZNIE po stronie klienta (patrz page.tsx —
// wywoływane z useEffect, nigdy podczas renderu), żeby uniknąć
// niespójności serwer/klient, która była źródłem błędu z Zmiany 2.
export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
